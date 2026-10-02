import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoseEngine } from '../src/vision/PoseEngine.js';

const flush = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };
function environment(t) {
  const workers = [];
  class FakeWorker {
    messages = [];
    terminated = false;
    constructor() { workers.push(this); }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    emit(data) { this.onmessage?.({ data }); }
  }
  t.mock.method(globalThis, 'setTimeout', () => 1);
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const originals = new Map();
  const install = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  install('Worker', FakeWorker);
  install('OffscreenCanvas', class {});
  install('location', { href: 'http://localhost:5173/' });
  const captures = [];
  install('createImageBitmap', async (video, options) => { const bitmap = { closed: false, close() { this.closed = true; } }; captures.push({ video, options, bitmap }); return bitmap; });
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return { workers, captures };
}
const video = () => ({ readyState: 4, videoWidth: 1280, videoHeight: 720, currentTime: 1 });

test('engine allows one capture/inference in flight, downsizes preserving aspect, skips duplicate frames', async t => {
  const { workers, captures } = environment(t);
  const results = [];
  const engine = createPoseEngine({ onResult: value => results.push(value) });
  const started = engine.start();
  const worker = workers[0];
  assert.equal(worker.messages[0].type, 'init');
  worker.emit({ type: 'ready' });
  await started;
  const preview = video();
  const timestamp = performance.now();
  engine.process(preview, timestamp);
  preview.currentTime = 2;
  engine.process(preview, timestamp + 1);
  await flush();
  assert.equal(captures.length, 1);
  assert.deepEqual(captures[0].options, { resizeWidth: 640, resizeHeight: 360 });
  const result = { type: 'result', timestampMs: timestamp, landmarks: [], worldLandmarks: [], inferenceMs: 10 };
  worker.emit(result);
  assert.equal(results.length, 1);
  preview.currentTime = 1;
  engine.process(preview, timestamp + 2);
  await flush();
  assert.equal(captures.length, 1);
  preview.currentTime = 2;
  engine.process(preview, timestamp + 3);
  await flush();
  assert.equal(captures.length, 2);
  engine.close();
  worker.emit({ type: 'closed' });
  assert.equal(worker.terminated, true);
});

test('mismatched and stale results are rejected without drawing old skeletons', async t => {
  const { workers } = environment(t);
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  const results = [];
  const statuses = [];
  const engine = createPoseEngine({ onResult: value => results.push(value), onStatus: value => statuses.push(value) });
  const started = engine.start();
  const worker = workers[0];
  worker.emit({ type: 'ready' });
  await started;
  engine.process(video(), now);
  await flush();
  worker.emit({ type: 'result', timestampMs: 99, landmarks: [] });
  assert.equal(results.length, 0);
  now = 700;
  worker.emit({ type: 'result', timestampMs: 100, landmarks: [] });
  assert.equal(results.length, 0);
  assert.equal(statuses.at(-1).state, 'stale');
  engine.close();
  worker.emit({ type: 'closed' });
});

test('closing during capture closes late bitmap and never posts a frame', async t => {
  const { workers } = environment(t);
  let resolveCapture;
  globalThis.createImageBitmap = () => new Promise(resolve => { resolveCapture = resolve; });
  const engine = createPoseEngine();
  const started = engine.start();
  const worker = workers[0];
  worker.emit({ type: 'ready' });
  await started;
  engine.process(video(), performance.now());
  await flush();
  engine.close();
  const bitmap = { closed: false, close() { this.closed = true; } };
  resolveCapture(bitmap);
  await flush();
  assert.equal(bitmap.closed, true);
  assert.equal(worker.messages.filter(message => message.type === 'frame').length, 0);
  worker.emit({ type: 'closed' });
});

test('closing model initialization rejects startup and worker errors are visible', async t => {
  const { workers } = environment(t);
  const first = createPoseEngine();
  const started = first.start();
  first.close();
  await assert.rejects(started, { name: 'AbortError' });
  workers[0].emit({ type: 'closed' });
  const errors = [];
  const second = createPoseEngine({ onError: error => errors.push(error) });
  const secondStart = second.start();
  workers[1].emit({ type: 'error', message: 'Model unavailable' });
  await assert.rejects(secondStart, /Model unavailable/);
  assert.match(errors[0].message, /Model unavailable/);
  workers[1].emit({ type: 'closed' });
});

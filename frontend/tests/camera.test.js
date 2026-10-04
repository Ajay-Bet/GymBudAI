import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraManager, cameraErrorMessage } from '../src/vision/CameraManager.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function media() {
  const tracks = [new EventTarget(), new EventTarget()];
  tracks.forEach(track => { track.stops = 0; track.readyState = 'live'; track.muted = false; track.stop = () => { track.stops += 1; track.readyState = 'ended'; }; });
  return { getTracks: () => tracks, getVideoTracks: () => tracks };
}
const video = () => ({ srcObject: null, play: async () => {}, pause: () => {} });

test('rapid repeated Start shares one request; Stop releases every acquired track', async () => {
  const pending = deferred();
  let requests = 0;
  const preview = video();
  const manager = createCameraManager({ video: preview, getUserMedia: () => { requests++; return pending.promise; } });
  const first = manager.start();
  assert.equal(manager.start(), first);
  await Promise.resolve();
  assert.equal(requests, 1);
  const stream = media();
  pending.resolve(stream);
  assert.equal(await first, stream);
  assert.equal(preview.srcObject, stream);
  assert.equal(await manager.start(), stream);
  assert.equal(requests, 1);
  manager.stop();
  assert.equal(preview.srcObject, null);
  assert.deepEqual(stream.getTracks().map(track => track.stops), [1, 1]);
  manager.stop();
  assert.deepEqual(stream.getTracks().map(track => track.stops), [1, 1]);
});

test('Stop/unmount during permission request releases late stream without attachment', async () => {
  const pending = deferred();
  const preview = video();
  const manager = createCameraManager({ video: preview, getUserMedia: () => pending.promise });
  const started = manager.start();
  await Promise.resolve();
  manager.stop();
  const late = media();
  pending.resolve(late);
  assert.equal(await started, null);
  assert.equal(preview.srcObject, null);
  assert.deepEqual(late.getTracks().map(track => track.stops), [1, 1]);
});

test('restart waits for prior permission answer and owns only the new stream', async () => {
  const oldRequest = deferred();
  const oldStream = media();
  const newStream = media();
  let requests = 0;
  const preview = video();
  const manager = createCameraManager({ video: preview, getUserMedia: () => ++requests === 1 ? oldRequest.promise : Promise.resolve(newStream) });
  const oldStart = manager.start();
  await Promise.resolve();
  manager.stop();
  const restarted = manager.start();
  await Promise.resolve();
  assert.equal(requests, 1);
  oldRequest.resolve(oldStream);
  assert.equal(await oldStart, null);
  assert.equal(await restarted, newStream);
  assert.equal(preview.srcObject, newStream);
  assert.deepEqual(oldStream.getTracks().map(track => track.stops), [1, 1]);
  manager.stop();
  assert.deepEqual(newStream.getTracks().map(track => track.stops), [1, 1]);
});

test('canceling a queued restart never requests another stream', async () => {
  const pending = deferred();
  let requests = 0;
  const manager = createCameraManager({ video: video(), getUserMedia: () => { requests++; return pending.promise; } });
  const first = manager.start();
  await Promise.resolve();
  manager.stop();
  const restart = manager.start();
  manager.stop();
  const stream = media();
  pending.resolve(stream);
  assert.equal(await first, null);
  assert.equal(await restart, null);
  assert.equal(requests, 1);
  assert.deepEqual(stream.getTracks().map(track => track.stops), [1, 1]);
});

test('denial is retryable and playback failure releases the stream', async () => {
  const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const stream = media();
  let requests = 0;
  const preview = video();
  const manager = createCameraManager({ video: preview, getUserMedia: async () => { if (++requests === 1) throw denied; return stream; } });
  await assert.rejects(manager.start(), { name: 'NotAllowedError' });
  assert.match(cameraErrorMessage(denied), /permission was denied/);
  preview.play = async () => { throw new Error('play failed'); };
  await assert.rejects(manager.start(), /play failed/);
  assert.equal(preview.srcObject, null);
  assert.deepEqual(stream.getTracks().map(track => track.stops), [1, 1]);
});

test('ended stream stops tracks and removes mute/end listeners', async () => {
  const stream = media();
  let ended = 0;
  const muted = [];
  const manager = createCameraManager({ video: video(), getUserMedia: async () => stream, onEnded: () => ended++, onMuted: value => muted.push(value) });
  await manager.start();
  stream.getTracks()[0].dispatchEvent(new Event('mute'));
  stream.getTracks()[0].dispatchEvent(new Event('unmute'));
  stream.getTracks()[0].dispatchEvent(new Event('ended'));
  stream.getTracks()[0].dispatchEvent(new Event('ended'));
  stream.getTracks()[0].dispatchEvent(new Event('mute'));
  assert.equal(ended, 1);
  assert.deepEqual(muted, [false, true, false]);
  assert.deepEqual(stream.getTracks().map(track => track.stops), [1, 1]);
});

test('Stop during pending playback cannot detach or stop a restarted session', async () => {
  const playback = deferred();
  const oldStream = media();
  const newStream = media();
  const preview = video();
  let requests = 0;
  let plays = 0;
  preview.play = () => ++plays === 1 ? playback.promise : Promise.resolve();
  const manager = createCameraManager({ video: preview, getUserMedia: async () => ++requests === 1 ? oldStream : newStream });
  const first = manager.start();
  for (let index = 0; index < 4; index++) await Promise.resolve();
  assert.equal(preview.srcObject, oldStream);
  manager.stop();
  assert.equal(await manager.start(), newStream);
  playback.reject(new Error('obsolete playback interrupted'));
  assert.equal(await first, null);
  assert.equal(preview.srcObject, newStream);
  assert.deepEqual(oldStream.getTracks().map(track => track.stops), [1, 1]);
  assert.deepEqual(newStream.getTracks().map(track => track.stops), [0, 0]);
  manager.stop();
});

test('a stream already disconnected before attachment is released and startup fails', async () => {
  const stream = media();
  stream.getTracks().forEach(track => { track.readyState = 'ended'; });
  const preview = video();
  const manager = createCameraManager({ video: preview, getUserMedia: async () => stream });
  await assert.rejects(manager.start(), { name: 'NotReadableError' });
  assert.equal(preview.srcObject, null);
  assert.deepEqual(stream.getTracks().map(track => track.stops), [1, 1]);
});

test('startFile plays a local object URL, reports the end, and Stop revokes it', async () => {
  const listeners = {};
  const preview = { srcObject: 'old', src: '', play: async () => {}, pause: () => {}, load: () => {},
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; } };
  const revoked = [];
  let ended = 0;
  const manager = createCameraManager({ video: preview, getUserMedia: () => { throw new Error('camera must not be used'); },
    onFileEnded: () => { ended += 1; }, createObjectURL: () => 'blob:clip', revokeObjectURL: (url) => revoked.push(url) });
  const file = { name: 'clip.mp4' };
  assert.equal(await manager.startFile(file), file);
  assert.equal(preview.src, 'blob:clip');
  assert.equal(preview.srcObject, null);
  listeners.ended();
  assert.equal(ended, 1);
  manager.stop();
  assert.deepEqual(revoked, ['blob:clip']);
  assert.equal(preview.src, '');
  assert.equal(listeners.ended, undefined);
  await assert.rejects(manager.startFile(null), /Choose a video file/);
});

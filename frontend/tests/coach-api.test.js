import test from 'node:test';
import assert from 'node:assert/strict';
import { getCoachStatus, fetchTts, fetchWording } from '../src/api/coach.js';

function mockFetch(t, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => { globalThis.fetch = original; });
}

test('coaching status is same-origin and only boolean availability accepted', async (t) => {
  mockFetch(t, async (url, init) => {
    assert.equal(url, '/api/coach/status');
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    return Response.json({ tts: false, wording: false });
  });
  assert.deepEqual(await getCoachStatus(), { tts: false, wording: false });
  globalThis.fetch = async () => Response.json({ tts: 'key', wording: true });
  await assert.rejects(getCoachStatus(), /invalid-status/);
});

test('TTS sends bounded text and returns only audio Blob', async (t) => {
  mockFetch(t, async (url, init) => {
    assert.equal(url, '/api/coach/tts');
    assert.deepEqual(JSON.parse(init.body), { text: 'Chest tall and still', purpose: 'cue' });
    assert.equal(init.headers['Content-Type'], 'application/json');
    return new Response('ID3', { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  const blob = await fetchTts('Chest tall and still', 'cue');
  assert.equal(await blob.text(), 'ID3');
  for (const args of [['', 'cue'], ['x'.repeat(301), 'cue'], ['Hi', 'other']]) await assert.rejects(fetchTts(...args), /invalid-request/);
});

test('TTS fails safely for provider errors and nonaudio responses', async (t) => {
  mockFetch(t, async () => new Response('not configured', { status: 503 }));
  await assert.rejects(fetchTts('Hello', 'cue'), /coach-503/);
  globalThis.fetch = async () => Response.json({ detail: 'bad' });
  await assert.rejects(fetchTts('Hello', 'cue'), /invalid-audio/);
  globalThis.fetch = async () => new Response('', { headers: { 'Content-Type': 'audio/mpeg' } });
  await assert.rejects(fetchTts('Hello', 'cue'), /invalid-audio/);
});

test('wording sends structured facts unchanged and forwards cancellation', async (t) => {
  const facts = { findings: { strengths: [], improvements: [], focus: null } };
  let called = 0;
  mockFetch(t, async (url, init) => {
    called++;
    assert.equal(url, '/api/coach/wording');
    assert.deepEqual(JSON.parse(init.body), facts);
    return Response.json({ headline: 'Summary ready.' });
  });
  assert.equal((await fetchWording(facts)).headline, 'Summary ready.');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchWording(facts, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(called, 1);
});

test('transport bounds non-cooperative fetch and body reads and aborts in-flight', async (t) => {
  let signal;
  mockFetch(t, (_url, init) => { signal = init.signal; return new Promise(() => {}); });
  await assert.rejects(fetchWording({}, { timeoutMs: 5 }), { name: 'AbortError' });
  assert.equal(signal.aborted, true);
  globalThis.fetch = async (_url, init) => {
    signal = init.signal;
    return { ok: true, json: () => new Promise(() => {}) };
  };
  await assert.rejects(fetchWording({}, { timeoutMs: 5 }), { name: 'AbortError' });
  assert.equal(signal.aborted, true);
  const controller = new AbortController();
  const pending = fetchWording({}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

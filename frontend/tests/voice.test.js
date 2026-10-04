// Synthetic engines prove ordering and cancellation, not browser audio behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice, createTtsCache } from '../src/feedback/voice.js';
import { createSpeechAdapter } from '../src/feedback/speech.js';
import { createFakeSynthesis, FakeUtterance } from './fixtures/coaching-speech-fake.js';
const tick = () => new Promise((r) => setTimeout(r, 0));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function setup(options = {}) {
  const synth = createFakeSynthesis();
  const speech = createSpeechAdapter({ synthesis: synth, Utterance: FakeUtterance });
  const audio = { src: '', volume: 1, plays: 0, play() { this.plays++; return Promise.resolve(); }, pause() {}, removeAttribute() { this.src = ''; } };
  const urls = { made: [], revoked: [], createObjectURL(blob) { this.made.push(blob); return `blob:${this.made.length}`; }, revokeObjectURL(url) { this.revoked.push(url); } };
  const voice = createVoice({ speech, createAudio: () => audio, urls, ...options });
  return { voice, synth, audio, urls };
}
test('Text mode generates/plays no audio even with AI enabled', async () => {
  let requests = 0;
  const { voice, synth, audio } = setup({ aiVoiceEnabled: true, aiTts: async () => { requests++; return new Blob(['mp3']); } });
  assert.equal(voice.speakCue({ id: 'c', text: 'Keep still' }), false);
  assert.equal(await voice.prefetchCues(['Keep still']), 0);
  assert.equal((await voice.speakNarration('Set ready.')).reason, 'text-only');
  assert.equal(requests, 0); assert.equal(audio.plays, 0); assert.equal(synth.spoken().length, 0); voice.dispose();
});
test('Live cue is immediate device speech; late AI audio is cached without stale playback', async () => {
  const pending = deferred(); let requests = 0;
  const { voice, synth, audio, urls } = setup({ outputMode: 'audio-text', aiVoiceEnabled: true, aiTts: () => { requests++; return pending.promise; } });
  assert.equal(voice.speakCue({ id: 'a', text: 'Keep still' }), true);
  await tick(); assert.equal(synth.spoken()[0].text, 'Keep still');
  pending.resolve(new Blob(['mp3'])); await tick(); assert.equal(audio.plays, 0);
  synth.finish(); voice.speakCue({ id: 'b', text: 'Keep still' });
  assert.equal(requests, 1); assert.equal(audio.plays, 1); assert.match(voice.disclosure, /AI-generated/);
  audio.onended(); assert.equal(urls.revoked.length, 1); voice.dispose();
});
for (const action of ['stop', 'mute', 'text', 'disable-ai', 'dispose']) {
  test(`${action} aborts narration and ignores late response`, async () => {
    const pending = deferred(); let signal;
    const { voice, synth, audio } = setup({ outputMode: 'audio-text', aiVoiceEnabled: true, aiTts: (_t, _p, o) => { signal = o.signal; return pending.promise; } });
    const result = voice.speakNarration('Summary ready.'); await tick();
    if (action === 'mute') voice.setMuted(true);
    else if (action === 'text') voice.setOutputMode('text');
    else if (action === 'disable-ai') voice.setAiVoiceEnabled(false);
    else voice[action]();
    assert.equal((await result).reason, 'cancelled'); assert.equal(signal.aborted, true);
    pending.resolve(new Blob(['mp3'])); await tick();
    assert.equal(audio.plays, 0); assert.equal(synth.spoken().length, 0); voice.dispose();
  });
}
test('Narration waits for cue, one channel, then can replay and stop', async () => {
  const { voice, synth } = setup({ outputMode: 'audio-text' });
  voice.speakCue({ id: 'a', text: 'Keep still' });
  const result = voice.speakNarration('Set ready.'); await tick();
  assert.equal(synth.spoken().length, 1); synth.finish(); await tick();
  assert.equal(synth.spoken()[1].text, 'Set ready.'); assert.equal(synth.maxOutstanding, 1);
  synth.finish(); assert.equal((await result).reason, 'ended');
  const replay = voice.speakNarration('Set ready.'); await tick(); voice.stop();
  assert.equal((await replay).reason, 'cancelled'); voice.dispose();
});
test('API error, timeout and autoplay rejection fall back to matching device speech', async () => {
  for (const kind of ['failure', 'timeout', 'playback']) {
    const { voice, synth, audio } = setup({ outputMode: 'audio-text', aiVoiceEnabled: true, config: { narrationTimeoutMs: 5 },
      aiTts: () => kind === 'failure' ? Promise.reject(new Error('offline')) : kind === 'timeout' ? new Promise(() => {}) : Promise.resolve(new Blob(['mp3'])) });
    if (kind === 'playback') audio.play = () => Promise.reject(new Error('blocked'));
    const result = voice.speakNarration('Summary ready.'); await new Promise((r) => setTimeout(r, 15));
    assert.equal(synth.spoken().at(-1).text, 'Summary ready.'); synth.finish();
    assert.equal((await result).via, 'browser'); voice.dispose();
  }
});
test('No voice engine degrades to text', async () => {
  const voice = createVoice({ outputMode: 'audio-text' });
  assert.equal(voice.available, false); assert.equal((await voice.speakNarration('Summary ready.')).via, 'text'); voice.dispose();
});
test('Mute/volume affect cached audio; stale end does not stop replacement', () => {
  const cache = createTtsCache(); cache.set('Keep still', 'cue', new Blob(['mp3']));
  const { voice, synth, audio, urls } = setup({ outputMode: 'audio-text', aiVoiceEnabled: true, aiTts: async () => null, cache });
  voice.setVolume(0.4); voice.speakCue({ id: 'a', text: 'Keep still' });
  assert.equal(audio.volume, 0.4); const lateEnd = audio.onended;
  voice.setMuted(true); assert.equal(voice.speaking(), false); assert.equal(urls.revoked.length, 1);
  voice.setMuted(false); voice.setAiVoiceEnabled(false); voice.speakCue({ id: 'b', text: 'Device cue' });
  lateEnd(); assert.equal(voice.speaking(), true); assert.equal(synth.spoken().at(-1).volume, 0.4); voice.dispose();
});
test('LRU cache bounds entries and bytes', () => {
  const cache = createTtsCache({ maxEntries: 2, maxBytes: 5 });
  cache.set('a', 'cue', new Blob(['aa'])); cache.set('b', 'cue', new Blob(['bb'])); cache.get('a', 'cue');
  cache.set('c', 'cue', new Blob(['cc'])); assert.equal(cache.has('b', 'cue'), false);
  cache.set('large', 'cue', new Blob(['123456'])); assert.equal(cache.has('large', 'cue'), false);
  cache.set('d', 'cue', new Blob(['dddd'])); assert.equal(cache.size, 1);
});
test('Watchdog settles narration when browser never reports end', async () => {
  const { voice, synth } = setup({ outputMode: 'audio-text', config: { maxAudioMs: 5 } });
  assert.equal((await voice.speakNarration('Summary ready.')).reason, 'error');
  assert.equal(voice.speaking(), false); assert.equal(synth.outstanding, 0); voice.dispose();
});
test('Stop aborts a cue-prefetch batch and never starts its remaining requests', async () => {
  let calls = 0; let signal; let resolveLate;
  const { voice } = setup({ outputMode: 'audio-text', aiVoiceEnabled: true, aiTts: (_t, _p, options) => {
    calls++; signal = options.signal; return new Promise((r) => { resolveLate = r; });
  } });
  const pending = voice.prefetchCues(['One cue', 'Another cue', 'Third cue']);
  await tick(); voice.stop();
  assert.equal(await pending, 0); assert.equal(signal.aborted, true);
  resolveLate(new Blob(['mp3'])); await tick(); assert.equal(calls, 1); voice.dispose();
});

// Sprint 4 independent validation of the speech adapter (frontend/src/feedback/speech.js) against
// the "Agreed coaching contract" in docs/sprints/sprint-4-STATUS.md. Uses a SYNTHETIC fake Web
// Speech API (tests/fixtures/coaching-speech-fake.js); it proves adapter logic only, not real
// browser audio, voices, autoplay policy or user-gesture behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechAdapter } from '../src/feedback/speech.js';
import { createFakeSynthesis, FakeUtterance } from './fixtures/coaching-speech-fake.js';

const make = (options) => {
  const synthesis = createFakeSynthesis(options);
  return { synthesis, speech: createSpeechAdapter({ synthesis, Utterance: FakeUtterance }) };
};

test('unavailable speech: available false, speak returns false, other methods are safe no-ops', () => {
  for (const options of [{ synthesis: null, Utterance: null }, { synthesis: undefined, Utterance: undefined },
    { synthesis: {}, Utterance: FakeUtterance }, { synthesis: createFakeSynthesis(), Utterance: null }]) {
    const speech = createSpeechAdapter(options);
    assert.equal(speech.available, false);
    assert.equal(speech.prime(), false);
    assert.equal(speech.speak({ id: 'c1', text: 'Keep your torso still' }), false);
    assert.doesNotThrow(() => { speech.cancel(); speech.setMuted(true); speech.setMuted(false); speech.setVolume(0.5); });
    assert.equal(speech.speaking(), false);
    assert.equal(typeof speech.onEnd(() => {}), 'function');
  }
  // In node there is no global speechSynthesis: the default construction must also be unavailable.
  assert.equal(createSpeechAdapter().available, false);
});

test('available speech: speak hands one utterance with the text and current volume to the browser', () => {
  const { synthesis, speech } = make();
  assert.equal(speech.available, true);
  assert.equal(speech.speak({ id: 'c1', text: 'Keep your torso still' }), true);
  assert.equal(synthesis.spoken().length, 1);
  assert.equal(synthesis.spoken()[0].text, 'Keep your torso still');
  assert.equal(synthesis.spoken()[0].volume, 1);
  assert.equal(speech.speaking(), true);
  assert.equal(speech.speak({ id: 'c2', text: '   ' }), false, 'empty text is not spoken');
});

test('prime issues a silent utterance and does not block or count as a spoken cue', () => {
  const { synthesis, speech } = make();
  assert.equal(speech.prime(), true);
  assert.equal(synthesis.spoken().length, 0, 'prime must be silent (volume 0 / blank)');
  assert.equal(speech.speaking(), false, 'prime is not a cue');
  assert.equal(speech.speak({ id: 'c1', text: 'Curl all the way up' }), true);
  assert.equal(synthesis.spoken().length, 1);
  assert.ok(synthesis.outstanding <= 1, 'prime utterance must not stay queued ahead of a cue');
});

test('mute cancels current speech, blocks speak while muted, unmute allows speech again', () => {
  const { synthesis, speech } = make();
  speech.speak({ id: 'c1', text: 'Keep your torso still' });
  const ends = [];
  speech.onEnd((info) => ends.push(info));
  speech.setMuted(true);
  assert.equal(speech.muted, true);
  assert.equal(synthesis.outstanding, 0, 'mute must cancel the browser queue');
  assert.equal(speech.speaking(), false);
  assert.deepEqual(ends.map((e) => [e.id, e.reason]), [['c1', 'cancelled']]);
  assert.equal(speech.speak({ id: 'c2', text: 'Curl all the way up' }), false);
  assert.equal(synthesis.spoken().length, 1);
  speech.setMuted(false);
  assert.equal(speech.speak({ id: 'c3', text: 'Curl all the way up' }), true);
});

test('volume is clamped to 0..1, non-finite ignored, applied to the next utterance', () => {
  const { synthesis, speech } = make();
  speech.setVolume(1.7); assert.equal(speech.volume, 1);
  speech.setVolume(-3); assert.equal(speech.volume, 0);
  speech.setVolume(0.4); assert.equal(speech.volume, 0.4);
  speech.setVolume(Number.NaN); assert.equal(speech.volume, 0.4);
  speech.setVolume(Infinity); assert.equal(speech.volume, 0.4);
  speech.setVolume('0.9'); assert.equal(speech.volume, 0.4);
  speech.speak({ id: 'c1', text: 'Keep your torso still' });
  assert.equal(synthesis.log.at(-1).volume, 0.4);
});

test('onEnd reports natural end once with the cue id; unsubscribe works', () => {
  const { synthesis, speech } = make();
  const ends = [];
  const off = speech.onEnd((info) => ends.push(info));
  speech.speak({ id: 'cue-a', text: 'Keep your torso still' });
  synthesis.finish();
  assert.deepEqual(ends, [{ id: 'cue-a', reason: 'ended', error: null }]);
  assert.equal(speech.speaking(), false);
  off();
  speech.speak({ id: 'cue-b', text: 'Curl all the way up' });
  synthesis.finish();
  assert.equal(ends.length, 1);
});

for (const cancelEvent of ['end', 'error', 'none']) {
  test(`cancel settles the utterance exactly once as 'cancelled' when the browser fires ${cancelEvent} on cancel`, () => {
    const { synthesis, speech } = make({ cancelEvent });
    const ends = [];
    speech.onEnd((info) => ends.push(info));
    speech.speak({ id: 'c1', text: 'Keep your torso still' });
    speech.cancel();
    assert.equal(speech.speaking(), false);
    assert.equal(synthesis.outstanding, 0);
    assert.deepEqual(ends.map((e) => [e.id, e.reason]), [['c1', 'cancelled']]);
    // A late event from the cancelled utterance is ignored.
    const u = synthesis.log.find((e) => e.type === 'speak').utterance;
    u.onend?.({});
    assert.equal(ends.length, 1);
  });
}

test('a new speak while speaking cancels the old utterance first, so the browser never holds a backlog', () => {
  const { synthesis, speech } = make();
  const ends = [];
  speech.onEnd((info) => ends.push(info));
  speech.speak({ id: 'c1', text: 'Keep your torso still' });
  speech.speak({ id: 'c2', text: 'Curl all the way up' });
  assert.equal(synthesis.outstanding, 1);
  assert.equal(synthesis.maxOutstanding, 1);
  assert.deepEqual(ends.map((e) => [e.id, e.reason]), [['c1', 'cancelled']]);
  synthesis.finish();
  assert.deepEqual(ends.map((e) => [e.id, e.reason]), [['c1', 'cancelled'], ['c2', 'ended']]);
});

test('a throwing listener or a throwing browser does not break the adapter', () => {
  const { synthesis, speech } = make();
  speech.onEnd(() => { throw new Error('listener'); });
  speech.speak({ id: 'c1', text: 'Keep your torso still' });
  assert.doesNotThrow(() => synthesis.finish());
  synthesis.speak = () => { throw new Error('not-allowed'); };
  assert.equal(speech.speak({ id: 'c2', text: 'Curl all the way up' }), false);
  assert.equal(speech.speaking(), false);
});

test("cancel settles once when the browser fires onerror 'interrupted' (Chrome) on cancel", () => {
  const { synthesis, speech } = make({ cancelEvent: 'none' });
  const ends = [];
  speech.onEnd((info) => ends.push(info));
  speech.speak({ id: 'c1', text: 'Keep your torso still' });
  const u = synthesis.log.find((e) => e.type === 'speak').utterance;
  speech.cancel();
  u.onerror({ error: 'interrupted' });
  assert.deepEqual(ends.map((e) => [e.id, e.reason]), [['c1', 'cancelled']]);
  // Without a cancel, 'interrupted' from the browser is still reported as cancelled, not as an error.
  speech.speak({ id: 'c2', text: 'Curl all the way up' });
  synthesis.log.filter((e) => e.type === 'speak').at(-1).utterance.onerror({ error: 'interrupted' });
  assert.deepEqual(ends.at(-1), { id: 'c2', reason: 'cancelled', error: 'interrupted' });
});

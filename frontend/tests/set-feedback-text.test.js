// Sprint 4 extension: independent validation of the deterministic end-of-set text
// (frontend/src/feedback/setFeedbackText.js) and the output preference (outputPreference.js) against the
// "Extension contract" in docs/sprints/sprint-4-STATUS.md. Inputs are SYNTHETIC hand-built summaries.
// They check wording rules (grounding, order, forbidden terms, length), not whether the advice helps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSetFeedback, SCORE_UNAVAILABLE_TEXT } from '../src/feedback/setFeedbackText.js';
import { OUTPUT_MODES, DEFAULT_OUTPUT_MODE, loadOutputMode, saveOutputMode } from '../src/feedback/outputPreference.js';
import { buildSetFindings } from '../src/exercises/setFindings.js';
import { scoreSet } from '../src/exercises/setScore.js';
import { EXT, summary, ep, repWindow, coverOnly, numbersIn, numbersInObject, sentenceCount } from './fixtures/set-fixtures.js';

const mid = (i) => [repWindow(i).startMs + 300, repWindow(i).startMs + 900];
const forbidden = new RegExp(`\\b(${EXT.forbidden.map((w) => w.replace(' ', '\\s+')).join('|')})\\b`, 'i');

function describe(s) {
  const score = scoreSet(s);
  const findings = buildSetFindings(s, score);
  return { s, score, findings, text: describeSetFeedback(findings, score, s) };
}
const userTexts = (t) => [t.headline, ...t.strengths, ...t.improvements, t.focus, t.narration, t.scoreText].filter(Boolean);

const SWEEP = [
  summary(), summary({ mode: 'validated-only' }), summary({ mode: 'validated-only', enabledRuleTypes: ['torso-swing'], episodes: [ep('torso-swing', ...mid(1))] }),
  summary({ reps: 0, partial: 2 }), summary({ reps: 1 }), summary({ reps: 2, partial: 1, trackingLoss: 1 }),
  summary({ reps: 7, intervals: coverOnly([0, 1, 2]) }), summary({ intervals: [{ startMs: 0, endMs: 18000 }] }),
  summary({ reps: 5, partial: 3, trackingLoss: 2, episodes: [ep('torso-swing', ...mid(0)), ep('upper-arm-drift', ...mid(0)), ep('upper-arm-drift', ...mid(3))] }),
  summary({ reps: 3, episodes: [0, 1, 2].flatMap((i) => [ep('torso-swing', ...mid(i)), ep('upper-arm-drift', ...mid(i))]) }),
];

test('no forbidden terms, narration <= 3 sentences, numbers grounded in findings/score (sweep of synthetic sets)', () => {
  for (const s of SWEEP) {
    const { score, findings, text } = describe(s);
    for (const line of userTexts(text)) assert.doesNotMatch(line, forbidden, `forbidden term in "${line}"`);
    assert.ok(sentenceCount(text.narration) <= 3, `narration too long: ${text.narration}`);
    assert.ok(text.narration.length <= 400);
    const allowed = numbersInObject({ findings, score: { value: score.value } });
    for (const v of [...allowed]) if (v > 0 && v < 1) allowed.add(Math.round(v * 100));
    allowed.add(100); // "out of 100"
    for (const line of userTexts(text)) for (const v of numbersIn(line)) assert.ok(allowed.has(v), `number ${v} in "${line}" is not in the findings or score`);
  }
});

test('strengths first, then improvements, then exactly one focus; narration starts with completion and ends with the focus', () => {
  const { text, findings } = describe(SWEEP[8]);
  assert.ok(text.strengths.length > 0 && text.improvements.length > 0);
  assert.equal(text.strengths.length, findings.strengths.length);
  assert.equal(text.improvements.length, findings.improvements.length);
  assert.equal(typeof text.focus, 'string');
  assert.match(text.narration, /You finished 5 reps\./);
  assert.match(text.narration, /^Experimental review with unvalidated rules:/);
  assert.ok(text.narration.endsWith(text.focus), `${text.narration} | ${text.focus}`);
  // Torso swing is the focus (priority policy) and the focus is one of the improvements' actions.
  assert.match(text.focus, /chest tall/i);
  // Key order of the result object puts strengths before improvements before focus.
  const keys = Object.keys(text);
  assert.ok(keys.indexOf('strengths') < keys.indexOf('improvements') && keys.indexOf('improvements') < keys.indexOf('focus'));
});

test('unavailable score: "Form score unavailable" with a plain reason for every reason code', () => {
  const cases = { 'no-validated-rules': summary({ mode: 'validated-only' }), 'no-completed-reps': summary({ reps: 0 }),
    'too-few-analyzed-reps': summary({ reps: 2 }), 'low-coverage': summary({ reps: 7, intervals: coverOnly([0, 1, 2]) }) };
  for (const [reason, s] of Object.entries(cases)) {
    const { score, text } = describe(s);
    assert.equal(score.reason, reason, 'synthetic setup');
    assert.equal(text.scoreAvailable, false);
    assert.match(text.scoreText, /^Form score unavailable/);
    assert.ok(text.scoreText.includes(SCORE_UNAVAILABLE_TEXT[reason]));
    assert.doesNotMatch(text.narration, /form score is/i, 'no score spoken when unavailable');
  }
  const ok = describe(summary());
  assert.equal(ok.text.scoreAvailable, true);
  assert.match(ok.text.scoreText, /100/);
});

test('no praise from absent rules: an injected clean-reps finding for an unassessed rule is dropped', () => {
  const s = summary({ mode: 'validated-only' });
  const score = scoreSet(s);
  const injected = { strengths: [{ code: 'clean-reps-torso-swing', values: { type: 'torso-swing', cleanReps: 4, analyzedReps: 4 } }], improvements: [], focus: null };
  const text = describeSetFeedback(injected, score, s);
  assert.deepEqual([...text.strengths], []);
  assert.doesNotMatch(text.narration, /chest|torso|elbow/i);
  // Unknown codes are not worded either.
  const unknown = describeSetFeedback({ strengths: [{ code: 'great-grip', values: {} }], improvements: [{ code: 'heavy-weight', values: {} }], focus: null }, score, s);
  assert.deepEqual([...unknown.strengths], []);
  assert.deepEqual([...unknown.improvements], []);
});

test('completion is worded as completion, not form praise; experimental label only in review mode', () => {
  const v = describe(summary({ mode: 'validated-only' })).text;
  assert.match(v.headline, /4 reps/);
  assert.doesNotMatch([v.headline, ...v.strengths].join(' '), /good form|great form|clean form/i);
  assert.equal(v.experimentalLabel, null);
  const r = describe(summary({ mode: 'review' })).text;
  assert.ok(r.experimentalLabel && /experimental/i.test(r.experimentalLabel));
});

test('deterministic: same input gives identical text', () => {
  for (const s of SWEEP) assert.deepEqual(describe(s).text, describe(s).text);
});

test('output preference: modes, default text, storage failures fall back safely', () => {
  assert.deepEqual([...OUTPUT_MODES], EXT.outputModes);
  assert.equal(DEFAULT_OUTPUT_MODE, 'text');
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadOutputMode({ storage }), 'text');
  assert.equal(saveOutputMode('audio-text', { storage }), true);
  assert.equal(loadOutputMode({ storage }), 'audio-text');
  mem.set([...mem.keys()][0], 'speaker-blast');
  assert.equal(loadOutputMode({ storage }), 'text', 'unknown stored value -> default');
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadOutputMode({ storage: throwing }), 'text');
  assert.equal(saveOutputMode('audio-text', { storage: throwing }), false);
  assert.equal(loadOutputMode({ storage: null }), 'text');
  assert.throws(() => saveOutputMode('loud', { storage }));
});

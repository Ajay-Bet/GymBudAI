// Sprint 4 extension: independent validation of the set score (frontend/src/exercises/setScore.js,
// curl-score-1.0.0) against the "Extension contract" in docs/sprints/sprint-4-STATUS.md.
// Inputs are SYNTHETIC hand-built summaries (tests/fixtures/set-fixtures.js) with known
// denominators. They prove the formula and availability rules only; the score is a detector-based
// summary of unvalidated rules, not a measured form quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as scoreModule from '../src/exercises/setScore.js';
import { EXT, summary, ep, repWindow, coverOnly } from './fixtures/set-fixtures.js';

const { scoreSet } = scoreModule;
const mid = (i, a = 300, b = 900) => [repWindow(i).startMs + a, repWindow(i).startMs + b];

function assertUnavailable(score, reason) {
  assert.equal(score.available, false, `expected unavailable (${reason}), got ${JSON.stringify(score)}`);
  assert.equal(score.reason, reason);
  assert.ok(score.value === undefined || score.value === null, 'an unavailable score carries no value');
  assert.equal(score.label, EXT.scoreLabel);
}

test('version, label, formula and inputs are carried on every score', () => {
  const s = scoreSet(summary());
  assert.equal(s.version, EXT.scoreVersion);
  assert.equal(s.label, EXT.scoreLabel);
  assert.equal(typeof s.formula, 'string');
  assert.ok(s.formula.length > 0);
  assert.equal(typeof s.inputs, 'object');
  const u = scoreSet(summary({ mode: 'validated-only' }));
  assert.equal(u.version, EXT.scoreVersion);
  assert.equal(u.label, EXT.scoreLabel);
});

test('worked example 1: 4 analyzed reps, no issues -> 100', () => {
  const s = scoreSet(summary());
  assert.equal(s.available, true);
  assert.equal(s.value, 100);
});

test('worked example 2: torso+drift on rep 1 (0), torso twice on rep 2 (50), reps 3-4 clean (100) -> round(62.5) = 63', () => {
  const episodes = [ep('torso-swing', ...mid(0)), ep('upper-arm-drift', ...mid(0, 500, 1500)),
    ep('torso-swing', ...mid(1, 100, 400)), ep('torso-swing', ...mid(1, 900, 1500))];
  const sm = summary({ episodes });
  assert.deepEqual(sm.reps.map((r) => r.issueTypes.length), [2, 1, 0, 0], 'synthetic setup');
  const s = scoreSet(sm);
  assert.equal(s.available, true);
  assert.equal(s.value, 63);
  assert.deepEqual(s.inputs.perRep.map((r) => r.repScore), [0, 50, 100, 100]);
  assert.equal(s.inputs.analyzedReps, 4);
  assert.equal(s.inputs.completedReps, 4);
});

test('worked example 3: each type counts once per rep however many episodes overlap; floor at 0', () => {
  // Five torso episodes on rep 1 are one type -> 50, not 0 or negative.
  const many = [100, 400, 700, 1000, 1300].map((a) => ep('torso-swing', repWindow(0).startMs + a, repWindow(0).startMs + a + 200));
  const s = scoreSet(summary({ reps: 3, episodes: many }));
  assert.equal(s.value, Math.round((50 + 100 + 100) / 3));
  // Overlapping episodes of both types on every rep -> each rep 0, set 0 (never negative).
  const all = [0, 1, 2].flatMap((i) => [ep('torso-swing', ...mid(i)), ep('torso-swing', ...mid(i, 500, 1200)), ep('upper-arm-drift', ...mid(i, 200, 1600))]);
  assert.equal(scoreSet(summary({ reps: 3, episodes: all })).value, 0);
});

test('one long episode spanning two reps penalises each rep once (not double-penalised per rep)', () => {
  const long = ep('torso-swing', repWindow(0).startMs + 500, repWindow(1).startMs + 500);
  const s = scoreSet(summary({ reps: 4, episodes: [long] }));
  assert.equal(s.value, Math.round((50 + 50 + 100 + 100) / 4));
});

test('incomplete-rom episodes and partial attempts never enter the score', () => {
  const base = scoreSet(summary({ reps: 4 }));
  const withPartials = summary({ reps: 4, partial: 3, episodes: [ep('incomplete-rom', 13500, 13500), ep('incomplete-rom', 14100, 14100)] });
  const s = scoreSet(withPartials);
  assert.equal(s.available, true);
  assert.equal(s.value, base.value);
  assert.equal(s.value, 100);
  // incomplete-rom overlapping a completed rep window (synthetic edge) still carries no penalty.
  const overlapping = scoreSet(summary({ reps: 3, episodes: [ep('incomplete-rom', repWindow(0).startMs + 500, repWindow(0).startMs + 500)] }));
  assert.equal(overlapping.value, 100);
});

test('completion counts never feed the score', () => {
  const a = scoreSet(summary({ reps: 4, episodes: [ep('torso-swing', ...mid(0))] }));
  const b = scoreSet(summary({ reps: 4, partial: 5, trackingLoss: 2, episodes: [ep('torso-swing', ...mid(0))] }));
  assert.equal(a.value, b.value);
});

test('unavailable: no-validated-rules (default validated-only mode, every rule disabled)', () => {
  assertUnavailable(scoreSet(summary({ mode: 'validated-only', enabledRuleTypes: [] })), 'no-validated-rules');
  // Even with lots of reps and an issue-free detector run.
  assertUnavailable(scoreSet(summary({ reps: 10, mode: 'validated-only' })), 'no-validated-rules');
});

test('unavailable: no-completed-reps', () => {
  assertUnavailable(scoreSet(summary({ reps: 0, partial: 2 })), 'no-completed-reps');
});

test('unavailable: fewer than 3 analyzed reps', () => {
  assertUnavailable(scoreSet(summary({ reps: 2 })), 'too-few-analyzed-reps');
  // 4 completed but only 2 covered -> 2 analyzed (< 3).
  assertUnavailable(scoreSet(summary({ reps: 4, intervals: coverOnly([0, 1]) })), 'too-few-analyzed-reps');
  // Exactly 3 analyzed is enough.
  assert.equal(scoreSet(summary({ reps: 3 })).available, true);
});

test('unavailable: analyzed fraction below 0.5; exactly 0.5 is available', () => {
  // 7 completed, 3 analyzed -> 0.43 < 0.5.
  const low = summary({ reps: 7, intervals: coverOnly([0, 1, 2]) });
  assert.equal(low.analyzedReps, 3);
  assertUnavailable(scoreSet(low), 'low-coverage');
  // 6 completed, 3 analyzed -> exactly 0.5.
  const half = summary({ reps: 6, intervals: coverOnly([0, 1, 2]) });
  assert.equal(half.analyzedReps, 3);
  assert.equal(scoreSet(half).available, true);
});

test('missing observations are not good form: unanalyzed reps do not raise the score', () => {
  // 3 analyzed reps each with torso swing (50 each); 2 more reps were not observed.
  const episodes = [0, 1, 2].map((i) => ep('torso-swing', ...mid(i)));
  const s = scoreSet(summary({ reps: 5, intervals: coverOnly([0, 1, 2]), episodes }));
  assert.equal(s.available, true);
  assert.equal(s.value, 50, 'unobserved reps must not be counted as 100');
});

test('review mode scores carry experimental: true; validated-only scores do not', () => {
  const r = scoreSet(summary({ mode: 'review' }));
  assert.equal(r.experimental, true);
  const v = scoreSet(summary({ mode: 'validated-only', enabledRuleTypes: ['torso-swing'] }));
  assert.equal(v.available, true);
  assert.notEqual(v.experimental, true);
});

test('validated-only with one enabled rule: only that rule is penalised', () => {
  const episodes = [ep('upper-arm-drift', ...mid(0)), ep('torso-swing', ...mid(1))];
  const s = scoreSet(summary({ reps: 4, mode: 'validated-only', enabledRuleTypes: ['torso-swing'], episodes }));
  assert.equal(s.value, Math.round((100 + 50 + 100 + 100) / 4));
});

test('pure: scoreSet does not mutate the summary and is deterministic', () => {
  const sm = summary({ episodes: [ep('torso-swing', ...mid(0))] });
  const before = JSON.stringify(sm);
  const a = scoreSet(sm), b = scoreSet(sm);
  assert.equal(JSON.stringify(sm), before);
  assert.deepEqual(a, b);
});

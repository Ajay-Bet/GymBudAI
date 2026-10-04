// Sprint 4 extension: independent validation of end-of-set findings (frontend/src/exercises/setFindings.js)
// against the "Extension contract" in docs/sprints/sprint-4-STATUS.md (Findings). Inputs are SYNTHETIC
// hand-built summaries. They check that every finding is grounded in the summary (no invented
// observations, no praise from absent rules or missing tracking), not that the detector is accurate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetFindings } from '../src/exercises/setFindings.js';
import { scoreSet } from '../src/exercises/setScore.js';
import { summary, ep, repWindow, coverOnly, numbersInObject } from './fixtures/set-fixtures.js';

const mid = (i) => [repWindow(i).startMs + 300, repWindow(i).startMs + 900];
const codes = (list) => list.map((f) => f.code);
const findingsFor = (s) => buildSetFindings(s, scoreSet(s));

/** Numbers a finding may state: values in the summary or score, their percentages, and differences of counts. */
function groundedNumbers(s, score) {
  const base = numbersInObject({ s, score });
  const out = new Set(base);
  for (const v of base) { out.add(Math.round(v * 100)); out.add(Math.round(v * 1000) / 10); }
  for (const r of [s.completedReps, s.analyzedReps]) for (let k = 0; k <= r; k += 1) out.add(k);
  return out;
}
function assertGrounded(s) {
  const score = scoreSet(s);
  const f = buildSetFindings(s, score);
  const ok = groundedNumbers(s, score);
  for (const item of [...f.strengths, ...f.improvements, ...(f.focus ? [f.focus] : [])]) {
    assert.equal(typeof item.code, 'string');
    for (const v of numbersInObject(item.values ?? {})) assert.ok(ok.has(v), `${item.code}: value ${v} not grounded in the summary`);
  }
  return f;
}

test('no praise from absent rules: validated-only with no enabled rule yields no clean-reps strength', () => {
  const f = assertGrounded(summary({ mode: 'validated-only', enabledRuleTypes: [], episodes: [ep('torso-swing', ...mid(0))] }));
  assert.ok(!codes(f.strengths).some((c) => c.startsWith('clean-reps')), codes(f.strengths).join());
  assert.ok(!codes(f.improvements).some((c) => c.startsWith('issue-')), 'unassessed episodes must not be reported as issues');
  assert.ok(codes(f.strengths).includes('completed-reps'), 'completion fact still allowed');
});

test('one enabled rule: clean-reps only for that rule, counting the reps without it', () => {
  const s = summary({ mode: 'validated-only', enabledRuleTypes: ['torso-swing'], episodes: [ep('torso-swing', ...mid(0)), ep('upper-arm-drift', ...mid(1))] });
  const f = assertGrounded(s);
  assert.ok(codes(f.strengths).includes('clean-reps-torso-swing'));
  assert.ok(!codes(f.strengths).includes('clean-reps-upper-arm-drift'));
  assert.ok(!codes(f.improvements).includes('issue-upper-arm-drift'));
  const clean = f.strengths.find((x) => x.code === 'clean-reps-torso-swing');
  assert.ok(numbersInObject(clean.values).has(3), `3 of 4 reps without torso swing: ${JSON.stringify(clean.values)}`);
});

test('no strength from missing tracking: steady-tracking needs coverage >= 0.9; low-tracking below 0.8', () => {
  const good = findingsFor(summary());
  assert.equal(summary().trackingCoverage.fraction, 1);
  assert.ok(codes(good.strengths).includes('steady-tracking'));
  // Coverage 0.5: no steady-tracking strength, low-tracking improvement.
  const low = summary({ intervals: [{ startMs: 0, endMs: 20000 }] });
  assert.ok(low.trackingCoverage.fraction < 0.8);
  const f = assertGrounded(low);
  assert.ok(!codes(f.strengths).includes('steady-tracking'));
  assert.ok(codes(f.improvements).includes('low-tracking'));
  // Unknown coverage (no issue session intervals): never praised.
  const none = findingsFor(summary({ intervals: [] }));
  assert.ok(!codes(none.strengths).includes('steady-tracking'));
});

test('no reps: no completed-reps or full-range strength', () => {
  const f = assertGrounded(summary({ reps: 0, partial: 2 }));
  assert.ok(!codes(f.strengths).includes('completed-reps'));
  assert.ok(!codes(f.strengths).includes('full-range-completed'));
  assert.ok(codes(f.improvements).includes('partial-attempts'));
});

test('issue improvements carry the rep count; partial attempts and tracking interruptions are counted', () => {
  const s = summary({ reps: 4, partial: 2, trackingLoss: 1, episodes: [ep('torso-swing', ...mid(0)), ep('torso-swing', ...mid(2)), ep('upper-arm-drift', ...mid(2))] });
  const f = assertGrounded(s);
  const torso = f.improvements.find((x) => x.code === 'issue-torso-swing');
  const drift = f.improvements.find((x) => x.code === 'issue-upper-arm-drift');
  assert.ok(torso && numbersInObject(torso.values).has(2), JSON.stringify(torso));
  assert.ok(drift && numbersInObject(drift.values).has(1), JSON.stringify(drift));
  const partial = f.improvements.find((x) => x.code === 'partial-attempts');
  assert.ok(partial && numbersInObject(partial.values).has(2));
  const interruptions = f.improvements.find((x) => x.code === 'tracking-interruptions');
  assert.ok(interruptions && numbersInObject(interruptions.values).has(1));
});

test('exactly one focus: priority torso > drift > partial attempts > tracking; null when nothing to improve', () => {
  const both = findingsFor(summary({ partial: 1, episodes: [ep('upper-arm-drift', ...mid(0)), ep('torso-swing', ...mid(1))] }));
  assert.ok(both.focus && !Array.isArray(both.focus));
  assert.equal(both.focus.code, 'issue-torso-swing');
  const drift = findingsFor(summary({ partial: 1, episodes: [ep('upper-arm-drift', ...mid(0))] }));
  assert.equal(drift.focus.code, 'issue-upper-arm-drift');
  const partial = findingsFor(summary({ partial: 1, intervals: [{ startMs: 0, endMs: 20000 }] }));
  assert.equal(partial.focus.code, 'partial-attempts');
  const tracking = findingsFor(summary({ intervals: [{ startMs: 0, endMs: 20000 }] }));
  assert.ok(['low-tracking', 'tracking-interruptions'].includes(tracking.focus.code));
  const clean = findingsFor(summary());
  assert.deepEqual(clean.improvements, []);
  assert.equal(clean.focus, null);
  // The focus is always one of the improvements.
  for (const f of [both, drift, partial, tracking]) assert.ok(codes(f.improvements).includes(f.focus.code));
});

test('full-range-completed is a counting fact for completed reps only', () => {
  const f = findingsFor(summary({ reps: 3, intervals: coverOnly([0]) }));
  assert.ok(codes(f.strengths).includes('full-range-completed'));
  const fr = f.strengths.find((x) => x.code === 'full-range-completed');
  for (const v of numbersInObject(fr.values ?? {})) assert.ok(v <= 3);
});

test('every finding is grounded across a sweep of synthetic summaries', () => {
  const variants = [summary(), summary({ mode: 'validated-only' }), summary({ reps: 1 }), summary({ reps: 7, intervals: coverOnly([0, 1, 2]) }),
    summary({ reps: 5, partial: 3, trackingLoss: 2, episodes: [ep('torso-swing', ...mid(0)), ep('upper-arm-drift', ...mid(4))] })];
  for (const s of variants) {
    const f = assertGrounded(s);
    assert.ok(Array.isArray(f.strengths) && Array.isArray(f.improvements));
    // Strength and improvement codes never overlap.
    for (const c of codes(f.strengths)) assert.ok(!codes(f.improvements).includes(c));
  }
});

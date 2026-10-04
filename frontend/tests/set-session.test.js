// Sprint 4 extension: independent validation of the set lifecycle (frontend/src/exercises/setSession.js)
// against the "Extension contract" in docs/sprints/sprint-4-STATUS.md (Set lifecycle).
// Frames are labelled SYNTHETIC FeatureFrame fixtures (tests/fixtures/coaching-fixtures.js). They prove
// lifecycle bookkeeping only (states, finalize-once, counters), not counting accuracy on a person.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurlSet } from '../src/exercises/setSession.js';
import { createCurlAnalyzer } from '../src/exercises/curl.js';
import { createCurlIssueTracker } from '../src/exercises/curlRules.js';
import { curlsWithIssues, render, makeFrame } from './fixtures/coaching-fixtures.js';
import { EXT } from './fixtures/set-fixtures.js';

const extras = { cueLog: [], mode: 'review', enabledRuleTypes: [], feedbackVersion: EXT.feedbackVersion };

/** Real analyzer and tracker wrapped with call counters (spies keep the real behaviour). */
function instrumented() {
  const analyzer = createCurlAnalyzer();
  const tracker = createCurlIssueTracker();
  const calls = { analyzerUpdate: 0, trackerUpdate: 0, trackerEnd: 0, analyzerReset: [], trackerReset: [], analyzerInterrupt: [] };
  const a = { ...analyzer,
    update: (f) => { calls.analyzerUpdate += 1; return analyzer.update(f); },
    reset: (r) => { calls.analyzerReset.push(r); return analyzer.reset(r); },
    interrupt: (r, t) => { calls.analyzerInterrupt.push(r); return analyzer.interrupt(r, t); },
    getSession: () => analyzer.getSession() };
  const tr = { ...tracker,
    update: (f, o) => { calls.trackerUpdate += 1; return tracker.update(f, o); },
    end: (...args) => { calls.trackerEnd += 1; return tracker.end(...args); },
    reset: (r) => { calls.trackerReset.push(r); return tracker.reset(r); },
    interrupt: (...args) => tracker.interrupt(...args),
    getSession: () => tracker.getSession() };
  return { analyzer: a, tracker: tr, calls };
}

const fourReps = () => curlsWithIssues({ seed: 11, reps: [{ torso: 20, durationMs: 3000 }, {}, {}, {}] });
const notReady = (t0, n = 10) => Array.from({ length: n }, (_, i) => makeFrame({ timestampMs: t0 + i * 33, flexionDeg: 10, tracking: 'calibrating' }));
const shift = (frames, dt) => frames.map((f) => ({ ...f, timestampMs: f.timestampMs + dt }));

test('states: calibrating until a ready frame, then active; update returns state + outputs', () => {
  const { analyzer, tracker } = instrumented();
  const set = createCurlSet({ analyzer, tracker });
  assert.equal(set.getState().state ?? set.getState(), 'calibrating');
  let out;
  for (const f of notReady(500)) out = set.update(f);
  assert.equal(out.state, 'calibrating', 'not-ready frames keep calibrating');
  const frames = fourReps();
  out = set.update(frames[0]);
  assert.equal(out.state, 'active');
  assert.ok('analyzerOutput' in out && 'issueOutput' in out);
});

test('finish builds summary, score and findings exactly once; later calls return the same objects with alreadyFinished', () => {
  const { analyzer, tracker, calls } = instrumented();
  const set = createCurlSet({ analyzer, tracker });
  const frames = fourReps();
  for (const f of frames) set.update(f);
  const t = frames.at(-1).timestampMs;
  const first = set.finish(t, extras);
  assert.equal(first.alreadyFinished, false);
  assert.ok(first.summary && first.score && first.findings);
  assert.equal(first.summary.completedReps, 4);
  assert.equal(calls.trackerEnd, 1);
  const second = set.finish(t + 100, extras);
  const third = set.finish(t + 200, { ...extras, mode: 'validated-only' });
  for (const again of [second, third]) {
    assert.equal(again.alreadyFinished, true);
    assert.equal(again.summary, first.summary, 'same summary object');
    assert.equal(again.score, first.score, 'same score object');
    assert.equal(again.findings, first.findings, 'same findings object');
  }
  assert.equal(calls.trackerEnd, 1, 'tracker ended once');
  const state = set.getState();
  assert.equal(state.state ?? state, 'finished');
});

test('frames after finish are ignored (counters frozen, analyzer/tracker not called)', () => {
  const { analyzer, tracker, calls } = instrumented();
  const set = createCurlSet({ analyzer, tracker });
  const frames = fourReps();
  const half = Math.floor(frames.length / 2);
  for (const f of frames.slice(0, half)) set.update(f);
  const done = set.finish(frames[half - 1].timestampMs, extras);
  const reps = analyzer.getSession().completedReps.length;
  const before = { a: calls.analyzerUpdate, t: calls.trackerUpdate };
  for (const f of frames.slice(half)) {
    const out = set.update(f);
    assert.equal(out.state, 'finished');
  }
  assert.equal(calls.analyzerUpdate, before.a);
  assert.equal(calls.trackerUpdate, before.t);
  assert.equal(analyzer.getSession().completedReps.length, reps);
  assert.equal(done.summary.completedReps, reps);
});

test('pause keeps counters; ready frames resume the set', () => {
  const { analyzer, tracker } = instrumented();
  const set = createCurlSet({ analyzer, tracker });
  const frames = fourReps();
  const cut = Math.floor(frames.length * 0.6);
  for (const f of frames.slice(0, cut)) set.update(f);
  const repsBefore = analyzer.getSession().completedReps.length;
  assert.ok(repsBefore >= 1, 'synthetic setup: some reps before the pause');
  set.pause('camera-off', frames[cut - 1].timestampMs);
  const paused = set.getState();
  assert.equal(paused.state ?? paused, 'paused');
  assert.equal(analyzer.getSession().completedReps.length, repsBefore, 'pause keeps reps');
  // Resume later (the camera restarted): reps continue to accumulate on top of the earlier ones.
  const rest = shift(frames.slice(cut), 2000);
  let out;
  for (const f of rest) out = set.update(f);
  assert.equal(out.state, 'active');
  assert.ok(analyzer.getSession().completedReps.length >= repsBefore);
  const r = set.finish(rest.at(-1).timestampMs, extras);
  assert.ok(r.summary.completedReps >= repsBefore);
});

test('startNext: fresh counters through reset("next-set"), unique set ids, incrementing index', () => {
  const { analyzer, tracker, calls } = instrumented();
  const set = createCurlSet({ analyzer, tracker });
  const frames = fourReps();
  for (const f of frames) set.update(f);
  const s1 = set.getState();
  const first = set.finish(frames.at(-1).timestampMs, extras);
  set.startNext();
  assert.ok(calls.analyzerReset.includes('next-set'));
  assert.ok(calls.trackerReset.includes('next-set'));
  assert.equal(analyzer.getSession().completedReps.length, 0, 'fresh counters');
  const s2 = set.getState();
  assert.notEqual(s2.state ?? s2, 'finished');
  const next = shift(frames, frames.at(-1).timestampMs + 1000);
  for (const f of next) set.update(f);
  const second = set.finish(next.at(-1).timestampMs, extras);
  assert.equal(second.alreadyFinished, false, 'a new set finalizes again');
  assert.notEqual(second.summary, first.summary);
  assert.equal(second.summary.completedReps, 4, 'second set counts only its own reps');
  const ids = [s1.setId, s2.setId];
  if (ids.every(Boolean)) {
    assert.match(ids[0], /^set-/);
    assert.notEqual(ids[0], ids[1]);
    assert.ok(s2.index > s1.index);
  }
  // Ten sets in a row: all set ids unique.
  const seen = new Set([s1.setId, s2.setId]);
  for (let i = 0; i < 10; i += 1) { set.finish(0, extras); set.startNext(); seen.add(set.getState().setId); }
  assert.equal(seen.size, 12);
});

test('finish closes the in-progress attempt (mid-curl), so it appears as interrupted, not lost', () => {
  const { analyzer, tracker } = instrumented();
  const set = createCurlSet({ analyzer, tracker });
  // SYNTHETIC: settle at the bottom, one full curl, then lift to 110 deg and stop (no frames after).
  const frames = render({ seed: 5, fps: 30, baseline: 10, dropFrameProb: 0, script: [{ ms: 800 }, { ms: 1000, to: 130 }, { ms: 200 }, { ms: 1000, to: 10 }, { ms: 600 }, { ms: 700, to: 110 }] });
  for (const f of frames) set.update(f);
  const { summary } = set.finish(frames.at(-1).timestampMs, extras);
  assert.equal(summary.completedReps, 1);
  assert.equal(summary.interruptedAttempts.total, 1, 'the open attempt was closed and reported once');
});

test('finish on a set with no frames still returns a summary with unavailable score (no throw)', () => {
  const { analyzer, tracker } = instrumented();
  const set = createCurlSet({ analyzer, tracker });
  const r = set.finish(1000, extras);
  assert.equal(r.alreadyFinished, false);
  assert.equal(r.summary.completedReps, 0);
  assert.equal(r.score.available, false);
});

test('missing live-rule measurements never earn analyzed reps, clean findings or a score', () => {
  for (const missing of ['null', 'invalid-flag']) {
    const { analyzer, tracker } = instrumented();
    const set = createCurlSet({ analyzer, tracker });
    const frames = fourReps();
    for (const f of frames) {
      f.validity.torsoDeviationDeg = false;
      if (missing === 'null') f.values.torsoDeviationDeg = null;
      set.update(f);
    }
    const r = set.finish(frames.at(-1).timestampMs, extras);
    assert.equal(r.summary.completedReps, 4, 'counting remains independent of unavailable form feature');
    assert.equal(r.summary.analyzedReps, 0);
    assert.equal(r.summary.trackingCoverage.assessableMs, 0);
    assert.equal(r.score.available, false); assert.equal(r.score.value, null);
    assert.equal(r.findings.strengths.some((x) => x.code.startsWith('clean-reps-')), false);
    assert.equal(r.findings.strengths.some((x) => x.code === 'steady-tracking'), false);
  }
});

test('pausing a committed lift cannot complete it with stale lowering frames after resume', () => {
  const { analyzer, tracker } = instrumented(); const set = createCurlSet({ analyzer, tracker });
  const lift = render({ seed: 5, fps: 30, baseline: 10, dropFrameProb: 0,
    script: [{ ms: 800 }, { ms: 1000, to: 130 }, { ms: 200 }] });
  for (const f of lift) set.update(f);
  assert.ok(analyzer.getSession().completedReps.length === 0);
  set.pause('camera-stopped', lift.at(-1).timestampMs);
  const lower = render({ seed: 6, fps: 30, baseline: 10, dropFrameProb: 0,
    script: [{ ms: 1000, to: 10 }, { ms: 600 }] });
  for (const f of shift(lower, lift.at(-1).timestampMs + 2000)) set.update(f);
  assert.equal(analyzer.getSession().completedReps.length, 0);
  assert.equal(analyzer.getSession().interruptedAttempts.filter((x) => x.reason === 'tracking-loss').length, 1);
});

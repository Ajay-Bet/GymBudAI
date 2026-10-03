// Sprint 3 independent validation of the curl analyzer against the "Agreed analyzer contract"
// in docs/sprints/sprint-3-STATUS.md. All inputs are labeled SYNTHETIC FeatureFrames from
// tests/fixtures/curl-fixtures.js; passing results prove logic only, not physical accuracy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CURL_CONFIG, createCurlAnalyzer } from '../src/exercises/curl.js';
import { buildFixtures, corruptTimestamps, render, curl, makeFrame, FIXTURE_FEATURE_VERSION, EXCURSION } from './fixtures/curl-fixtures.js';

const PHASES = new Set(['idle', 'bottom', 'lifting', 'top', 'lowering']);
// 'recalibration' added by the contract change of 2026-10-03 (interrupt(reason, timestampMs)).
const REASONS = new Set(['partial', 'tracking-loss', 'pause-timeout', 'low-coverage', 'reset', 'recalibration']);
const ISSUES = new Set(['torso-swing', 'upper-arm-drift', 'incomplete-rom']);
const FIXTURES = buildFixtures(CURL_CONFIG);
const fixture = (name) => FIXTURES.find((f) => f.name === name);

const SUMMARY_FIELDS = ['id', 'index', 'status', 'side', 'view', 'startMs', 'topMs', 'endMs', 'durationMs', 'minFlexionDeg',
  'maxFlexionDeg', 'romDeg', 'validObservedMs', 'coverage', 'maxAbsUpperArmDriftDeg', 'maxElbowDisplacement',
  'maxAbsTorsoDeviationDeg', 'candidateIssues', 'configVersion', 'featureVersion', 'units'];
const INTERRUPTED_FIELDS = ['id', 'status', 'reason', 'startMs', 'endMs', 'maxFlexionDeg', 'romDeg', 'coverage', 'candidateIssues', 'configVersion'];
const OUTPUT_FIELDS = ['exerciseId', 'configVersion', 'timestampMs', 'phase', 'paused', 'pauseReason', 'repCount', 'attempt', 'events', 'live', 'candidateIssues'];

/** Feed frames; return outputs, all events, and every invariant violation found per frame. */
function run(frames, analyzer = createCurlAnalyzer()) {
  const outputs = [], events = [];
  let previous = null, lastProcessed = -Infinity;
  for (const frame of frames) {
    const out = analyzer.update(frame);
    for (const key of OUTPUT_FIELDS) assert.ok(key in out, `output field ${key} missing`);
    assert.ok(PHASES.has(out.phase), `unknown phase ${out.phase}`);
    assert.equal(typeof out.paused, 'boolean');
    assert.ok(Array.isArray(out.events));
    const stale = Number.isFinite(frame.timestampMs) && frame.timestampMs <= lastProcessed;
    if (stale) {
      assert.equal(out.events.length, 0, `stale timestamp ${frame.timestampMs} produced events`);
      if (previous) {
        assert.equal(out.phase, previous.phase, `stale timestamp ${frame.timestampMs} changed phase`);
        assert.equal(out.repCount, previous.repCount, 'stale timestamp changed count');
      }
    } else {
      if (Number.isFinite(frame.timestampMs)) lastProcessed = frame.timestampMs;
      if (!frame.ready) {
        assert.ok(!out.events.some((e) => e.type === 'rep-completed'), `rep completed on not-ready frame ${frame.timestampMs}`);
        if (previous) assert.ok(out.phase === previous.phase || out.phase === 'idle',
          `phase advanced ${previous.phase} -> ${out.phase} on not-ready frame ${frame.timestampMs}`);
        assert.equal(out.paused, true, `not-ready frame ${frame.timestampMs} did not pause analysis`);
        assert.equal(out.live.elbowFlexionDeg, null, 'live flexion reported for an unobserved frame');
      }
    }
    events.push(...out.events);
    outputs.push(out);
    previous = out;
  }
  const completed = events.filter((e) => e.type === 'rep-completed');
  const interrupted = events.filter((e) => e.type === 'attempt-interrupted');
  return { analyzer, outputs, events, completed, interrupted, last: outputs.at(-1) };
}

function assertUniqueIds(events, label = '') {
  const ids = events.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate event ids ${label}`);
  for (const e of events) {
    const inner = e.type === 'rep-completed' ? e.rep : e.attempt;
    assert.equal(inner.id, e.id, 'event id differs from its payload id');
  }
}

function assertIssue(issue) {
  assert.ok(ISSUES.has(issue.type), `unknown issue type ${issue.type}`);
  for (const key of ['startMs', 'endMs', 'peak', 'unit', 'configVersion']) assert.ok(key in issue, `issue field ${key} missing`);
  assert.equal(issue.configVersion, CURL_CONFIG.version);
}

function assertSummary(rep, frames) {
  for (const key of SUMMARY_FIELDS) {
    assert.ok(key in rep, `rep summary field ${key} missing`);
    assert.notEqual(rep[key], undefined, `rep summary field ${key} undefined`);
  }
  assert.equal(rep.status, 'completed');
  assert.equal(rep.configVersion, CURL_CONFIG.version);
  assert.equal(rep.featureVersion, FIXTURE_FEATURE_VERSION);
  assert.equal(rep.side, frames[0].side);
  assert.equal(rep.view, frames[0].view);
  assert.ok(rep.startMs < rep.topMs && rep.topMs < rep.endMs, 'start < top < end');
  assert.ok(Math.abs(rep.durationMs - (rep.endMs - rep.startMs)) < 1e-6, 'duration = end - start');
  assert.ok(rep.coverage >= 0 && rep.coverage <= 1, 'coverage within 0..1');
  assert.ok(rep.validObservedMs >= 0 && rep.validObservedMs <= rep.durationMs + 1e-6, 'valid time within duration');
  assert.ok(Math.abs(rep.coverage - rep.validObservedMs / rep.durationMs) < 0.05, 'coverage ~= validObservedMs / durationMs');
  assert.ok(Math.abs(rep.romDeg - (rep.maxFlexionDeg - rep.minFlexionDeg)) < 1e-6, 'ROM = max - min flexion');
  assert.ok(rep.romDeg > 0);
  assert.ok(Array.isArray(rep.candidateIssues));
  rep.candidateIssues.forEach(assertIssue);
  assert.equal(typeof rep.units, 'object');
  // Extrema must be values that were actually observed on ready frames in [start, end].
  const window = frames.filter((f) => f.ready && f.timestampMs >= rep.startMs && f.timestampMs <= rep.endMs)
    .map((f) => f.values.elbowFlexionDeg);
  assert.ok(window.length > 0);
  assert.ok(rep.maxFlexionDeg <= Math.max(...window) + 1e-6, 'max flexion not invented');
  assert.ok(rep.minFlexionDeg >= Math.min(...window) - 1e-6, 'min flexion not invented');
}

function assertInterrupted(attempt) {
  for (const key of INTERRUPTED_FIELDS) assert.ok(key in attempt, `interrupted field ${key} missing`);
  assert.equal(attempt.status, 'interrupted');
  assert.ok(REASONS.has(attempt.reason), `unknown reason ${attempt.reason}`);
  assert.equal(attempt.configVersion, CURL_CONFIG.version);
  assert.ok(attempt.coverage === null || (attempt.coverage >= 0 && attempt.coverage <= 1));
  attempt.candidateIssues.forEach(assertIssue);
}

test('CURL_CONFIG is frozen and versioned', () => {
  assert.equal(CURL_CONFIG.version, 'curl-1.1.0'); // bumped after live run 1 (top zone B+95/B+80, minRomDeg 80)
  assert.ok(Object.isFrozen(CURL_CONFIG));
});

for (const f of FIXTURES) {
  test(`synthetic fixture ${f.name}: ${f.description}`, () => {
    const { completed, interrupted, events, last, analyzer, outputs } = run(f.frames);
    assertUniqueIds(events, f.name);
    if (f.expected.noAttempts) assert.ok(outputs.every((o) => o.attempt === null), `${f.name} opened a committed attempt`);
    if (f.expected.completed !== undefined) assert.equal(completed.length, f.expected.completed, `${f.name} completed count`);
    else assert.ok(completed.length <= 1, `${f.name} at most one completion`);
    assert.equal(last.repCount, completed.length, 'repCount equals emitted completions');
    if (f.expected.interrupted !== undefined) {
      assert.deepEqual(interrupted.map((e) => e.attempt.reason).sort(), [...f.expected.interrupted].sort(), `${f.name} interrupted reasons`);
    }
    completed.forEach((e, i) => { assertSummary(e.rep, f.frames); assert.equal(e.rep.index, i + 1, 'rep index is 1-based and sequential'); });
    interrupted.forEach((e) => assertInterrupted(e.attempt));
    const session = analyzer.getSession();
    assert.equal(session.configVersion, CURL_CONFIG.version);
    assert.equal(session.featureVersion, FIXTURE_FEATURE_VERSION);
    assert.equal(session.exerciseId, 'dumbbell-curl');
    assert.deepEqual(session.completedReps.map((r) => r.id), completed.map((e) => e.id));
    assert.deepEqual(session.interruptedAttempts.map((a) => a.id), interrupted.map((e) => e.id));
  });
}

test('synthetic: completed reps in clean fixtures carry no torso-swing or upper-arm-drift candidate', () => {
  for (const name of ['full-30fps', 'full-60fps', 'slow']) {
    const { completed } = run(fixture(name).frames);
    for (const e of completed) {
      assert.ok(!e.rep.candidateIssues.some((i) => i.type === 'torso-swing' || i.type === 'upper-arm-drift'), `${name} false issue`);
    }
  }
});

test('synthetic: torso swing and upper-arm drift become candidate issues on a completed rep', () => {
  for (const name of ['torso-swing', 'upper-arm-drift']) {
    const f = fixture(name);
    const { completed } = run(f.frames);
    assert.equal(completed.length, 1);
    assert.ok(completed[0].rep.candidateIssues.some((i) => i.type === f.expected.issue), `${name} issue missing`);
    if (name === 'torso-swing') assert.ok(completed[0].rep.maxAbsTorsoDeviationDeg > 10);
    if (name === 'upper-arm-drift') {
      assert.ok(completed[0].rep.maxAbsUpperArmDriftDeg > 20);
      assert.ok(completed[0].rep.maxElbowDisplacement > 0.2);
    }
  }
});

test('synthetic, shaped from live run 1 peaks: 101 deg half curls are partial with max flexion ~101, 132 deg curls complete', () => {
  for (const name of ['live-run-1-baseline-13', 'live-run-1-baseline-21']) {
    const { completed, interrupted } = run(fixture(name).frames);
    assert.equal(completed.length, 3, name);
    for (const e of interrupted) {
      assert.equal(e.attempt.reason, 'partial');
      assert.ok(Math.abs(e.attempt.maxFlexionDeg - 101) < 3, `${name} partial max ${e.attempt.maxFlexionDeg}`);
      assert.ok(e.attempt.candidateIssues.some((i) => i.type === 'incomplete-rom'));
    }
    for (const e of completed) assert.ok(Math.abs(e.rep.maxFlexionDeg - 132) < 3, `${name} rep max ${e.rep.maxFlexionDeg}`);
  }
});

test('synthetic: missing torso observations give null, never 0, in the rep summary', () => {
  const { completed } = run(fixture('missing-torso').frames);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].rep.maxAbsTorsoDeviationDeg, null);
  assert.ok(Number.isFinite(completed[0].rep.maxAbsUpperArmDriftDeg));
});

test('synthetic: grace-window dropout keeps the attempt and lowers coverage by the dropout time', () => {
  const f = fixture('dropout-short');
  const { completed, outputs } = run(f.frames);
  assert.equal(completed.length, 1);
  const rep = completed[0].rep;
  assert.ok(rep.coverage < 1, 'coverage reflects dropout');
  const missingMs = rep.durationMs - rep.validObservedMs;
  assert.ok(missingMs >= f.expected.dropoutMs * 0.7 && missingMs <= f.expected.dropoutMs * 1.6, `uncovered ${missingMs} ms vs dropout ${f.expected.dropoutMs} ms`);
  const dropoutOutputs = outputs.filter((_, i) => f.frames[i].dropout);
  assert.ok(dropoutOutputs.length > 0 && dropoutOutputs.every((o) => o.paused && o.attempt !== null), 'attempt kept and paused during dropout');
});

test('synthetic: duplicate and out-of-order timestamps do not change the count', () => {
  for (const name of ['full-30fps', 'full-60fps', 'partial', 'bottom-jitter']) {
    const clean = run(fixture(name).frames).completed.length;
    const corrupted = corruptTimestamps(fixture(name).frames);
    const { completed, events } = run(corrupted);
    assertUniqueIds(events, name);
    assert.equal(completed.length, clean, `${name} count changed with corrupted timestamps`);
  }
});

test('synthetic: replaying the same sequence twice (and each frame twice) emits nothing new', () => {
  const frames = fixture('full-30fps').frames;
  const analyzer = createCurlAnalyzer();
  const first = run(frames, analyzer);
  const again = frames.map((frame) => analyzer.update(frame));
  assert.ok(again.every((o) => o.events.length === 0), 'replay produced events');
  assert.equal(again.at(-1).repCount, first.completed.length);
  // Re-render style: the same frame object processed twice in a row.
  const fresh = createCurlAnalyzer();
  let count = 0;
  for (const frame of frames) for (let k = 0; k < 2; k++) count += fresh.update(frame).events.filter((e) => e.type === 'rep-completed').length;
  assert.equal(count, first.completed.length);
  assert.equal(fresh.getSession().completedReps.length, first.completed.length);
});

test('synthetic: not-ready frames carrying values cannot advance a phase', () => {
  const B = 10;
  const frames = render({ seed: 5, noiseDeg: 0, dropFrameProb: 0, script: [{ ms: 800 }, { ms: 400, to: B + 40 }] });
  const analyzer = createCurlAnalyzer();
  const before = run(frames, analyzer).last;
  assert.ok(['bottom', 'lifting'].includes(before.phase));
  let t = frames.at(-1).timestampMs;
  // Inside the grace window, but with a top-like angle injected: phase must not move.
  for (let k = 0; k < 6; k++) {
    const f = makeFrame({ timestampMs: (t += 33), flexionDeg: B + EXCURSION, tracking: 'dropout' });
    f.values.elbowFlexionDeg = B + EXCURSION; f.validity.elbowFlexionDeg = true; // adversarial: value present on a not-ready frame
    const out = analyzer.update(f);
    assert.equal(out.phase, before.phase, 'dropout frame advanced the phase');
    assert.equal(out.paused, true);
    assert.equal(out.events.length, 0);
  }
  // Beyond grace (ready false, dropout false), even with a value: attempt interrupted, phase idle.
  const lost = makeFrame({ timestampMs: (t += 33), flexionDeg: B + EXCURSION, tracking: 'calibrating' });
  const out = analyzer.update(lost);
  assert.equal(out.phase, 'idle');
  assert.equal(out.attempt, null);
  if (before.attempt) assert.ok(out.events.some((e) => e.type === 'attempt-interrupted' && e.attempt.reason === 'tracking-loss'));
});

test('synthetic: ready frame with a null elbow angle does not advance the phase', () => {
  const frames = render({ seed: 6, noiseDeg: 0, dropFrameProb: 0, script: [{ ms: 800 }] });
  const analyzer = createCurlAnalyzer();
  const before = run(frames, analyzer).last;
  const f = makeFrame({ timestampMs: frames.at(-1).timestampMs + 33, flexionDeg: 130, missing: ['elbowFlexionDeg', 'elbowInteriorDeg'] });
  const out = analyzer.update(f);
  assert.ok(out.phase === before.phase || out.phase === 'idle');
  assert.equal(out.events.filter((e) => e.type === 'rep-completed').length, 0);
});

test('synthetic: reset (side change / session restart) clears state and ids are never reused', () => {
  const analyzer = createCurlAnalyzer();
  const left = render({ seed: 81, script: [{ ms: 800 }, ...curl(), ...curl()] });
  const a = run(left, analyzer);
  assert.equal(a.completed.length, 2);
  const resetOut = analyzer.reset('side-change');
  assert.equal(resetOut.phase, 'idle');
  assert.equal(resetOut.repCount, 0);
  assert.equal(resetOut.attempt, null);
  assert.equal(analyzer.getSession().completedReps.length, 0);
  assert.equal(analyzer.getSession().interruptedAttempts.length, 0);
  const startMs = left.at(-1).timestampMs + 100;
  const right = render({ seed: 82, side: 'right', startMs, script: [{ ms: 800 }, ...curl(), ...curl()] });
  const b = run(right, analyzer);
  assert.equal(b.completed.length, 2);
  assert.equal(b.last.repCount, 2);
  assert.deepEqual(b.completed.map((e) => e.rep.index), [1, 2]);
  assert.equal(b.completed[0].rep.side, 'right');
  assertUniqueIds([...a.events, ...resetOut.events, ...b.events], 'across reset');
  analyzer.reset('session-restart');
  const c = run(render({ seed: 83, startMs: right.at(-1).timestampMs + 100, script: [{ ms: 800 }, ...curl()] }), analyzer);
  assert.equal(c.completed.length, 1);
  assertUniqueIds([...a.events, ...b.events, ...c.events], 'across two resets');
});

test('synthetic: reset mid-attempt discards the attempt; lowering afterwards cannot complete it', () => {
  const B = 10;
  const analyzer = createCurlAnalyzer();
  const up = render({ seed: 84, script: [{ ms: 800 }, { ms: 900, to: B + EXCURSION }, { ms: 300 }] });
  const a = run(up, analyzer);
  assert.ok(a.last.attempt !== null, 'attempt open at the top');
  const resetOut = analyzer.reset('exercise-change');
  assert.equal(resetOut.attempt, null);
  for (const e of resetOut.events) { assert.equal(e.type, 'attempt-interrupted'); assert.equal(e.attempt.reason, 'reset'); }
  const down = render({ seed: 85, startMs: up.at(-1).timestampMs + 33, baseline: B, startAngle: B + EXCURSION, script: [{ ms: 200 }, { ms: 900, to: B }, { ms: 600 }] });
  const b = run(down, analyzer);
  assert.equal(b.completed.length, 0);
});

test('synthetic: getSession returns copies', () => {
  const analyzer = createCurlAnalyzer();
  run(fixture('full-30fps').frames, analyzer);
  const s = analyzer.getSession();
  const n = s.completedReps.length;
  s.completedReps.length = 0;
  if (n) s.interruptedAttempts.push({});
  assert.equal(analyzer.getSession().completedReps.length, n);
});

test('synthetic: the same fixture is deterministic across analyzer instances', () => {
  const f = fixture('partial-then-full');
  const a = run(f.frames), b = run(f.frames);
  assert.deepEqual(a.events.map((e) => [e.type, e.type === 'rep-completed' ? e.rep.endMs : e.attempt.reason]),
    b.events.map((e) => [e.type, e.type === 'rep-completed' ? e.rep.endMs : e.attempt.reason]));
});

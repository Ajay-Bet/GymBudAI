// Sprint 3 re-validation of the D1-D6 fixes (2026-10-03): analyzer.interrupt(), slow tempo,
// coverageGapMs. Labeled SYNTHETIC FeatureFrames only; proves logic, not physical accuracy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CURL_CONFIG, createCurlAnalyzer } from '../src/exercises/curl.js';
import { render, curl } from './fixtures/curl-fixtures.js';

const B = 10;
function feed(analyzer, frames) {
  const events = [], outputs = [];
  for (const f of frames) { const o = analyzer.update(f); outputs.push(o); events.push(...o.events); }
  return { events, outputs, last: outputs.at(-1),
    completed: events.filter((e) => e.type === 'rep-completed'), interrupted: events.filter((e) => e.type === 'attempt-interrupted') };
}

test('config documents coverageGapMs 150 and keeps pause timeout 4 s', () => {
  assert.equal(CURL_CONFIG.coverageGapMs, 150);
  assert.equal(CURL_CONFIG.pauseTimeoutMs, 4000);
});

test('synthetic: interrupt mid-attempt ends it once, keeps completed reps, idles and pauses; next rep counts', () => {
  const a = createCurlAnalyzer();
  const first = render({ seed: 201, script: [{ ms: 800 }, ...curl(), { ms: 600, to: B + 90 }] });
  const r1 = feed(a, first);
  assert.equal(r1.completed.length, 1);
  assert.ok(r1.last.attempt, 'attempt open before interrupt');
  const openId = r1.last.attempt.id;
  const lastT = first.at(-1).timestampMs;
  const out = a.interrupt('tracking-loss', lastT - 500); // earlier timestamp is clamped
  assert.equal(out.phase, 'idle');
  assert.equal(out.paused, true);
  assert.equal(out.pauseReason, 'tracking-loss');
  assert.equal(out.attempt, null);
  assert.equal(out.repCount, 1);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].type, 'attempt-interrupted');
  assert.equal(out.events[0].id, openId);
  assert.equal(out.events[0].attempt.reason, 'tracking-loss');
  assert.equal(out.events[0].attempt.endMs, lastT, 'end time clamped to the last processed timestamp');
  assert.equal(a.getSession().completedReps.length, 1);
  // Second interrupt: nothing left to end.
  assert.equal(a.interrupt('recalibration').events.length, 0);
  // Duplicate timestamp afterwards: ignored, no events, stays idle.
  const dup = structuredClone(first.at(-1));
  dup.values.elbowFlexionDeg = B;
  const d = a.update(dup);
  assert.equal(d.events.length, 0);
  assert.equal(d.phase, 'idle');
  assert.equal(d.repCount, 1);
  // Resuming at the top and lowering must not complete the interrupted attempt.
  const down = render({ seed: 202, startMs: lastT + 40, startAngle: B + 90, script: [{ ms: 200 }, { ms: 900, to: B }, { ms: 600 }] });
  assert.equal(feed(a, down).completed.length, 0);
  // A fresh rep from a valid bottom counts as rep 2 with a new id.
  const next = feed(a, render({ seed: 203, startMs: down.at(-1).timestampMs + 40, script: [{ ms: 400 }, ...curl()] }));
  assert.equal(next.completed.length, 1);
  assert.equal(next.completed[0].rep.index, 2);
  const ids = [...r1.events, ...out.events, ...next.events].map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('synthetic: interrupt while idle or before any frame emits nothing; invalid reasons throw', () => {
  const a = createCurlAnalyzer();
  const blank = a.interrupt('recalibration');
  assert.equal(blank.events.length, 0);
  assert.equal(blank.phase, 'idle');
  assert.equal(blank.paused, true);
  assert.equal(blank.pauseReason, 'recalibration');
  feed(a, render({ seed: 204, script: [{ ms: 600 }] }));
  const idle = a.interrupt('recalibration', Number.NaN);
  assert.equal(idle.events.length, 0);
  assert.equal(idle.repCount, 0);
  for (const bad of ['reset', 'partial', 'pause-timeout', '', undefined, 'TRACKING-LOSS']) {
    assert.throws(() => a.interrupt(bad), /Unsupported interrupt reason/);
  }
});

test('synthetic: recalibration interrupt mid-lift is recorded with reason recalibration', () => {
  const a = createCurlAnalyzer();
  const r = feed(a, render({ seed: 205, script: [{ ms: 800 }, { ms: 500, to: B + 70 }] }));
  assert.ok(r.last.attempt);
  const out = a.interrupt('recalibration', r.last.timestampMs + 10);
  assert.equal(out.events[0].attempt.reason, 'recalibration');
  assert.equal(a.getSession().interruptedAttempts[0].reason, 'recalibration');
});

test('synthetic slow tempo: a steady 15 deg/s lift (under 4 s past the commit angle) with a normal lowering counts', () => {
  // 0 -> B+95 at 15 deg/s (~6.3 s total; ~2.3 s between commit B+45 and top entry B+80).
  const frames = render({ seed: 211, dropFrameProb: 0, script: [{ ms: 800 }, { ms: 95 / 15 * 1000, to: B + 95, linear: true }, { ms: 200 }, { ms: 1000, to: B }, { ms: 600 }] });
  const r = feed(createCurlAnalyzer(), frames);
  assert.equal(r.completed.length, 1, `events: ${r.events.map((e) => e.attempt?.reason ?? 'completed')}`);
  assert.equal(r.interrupted.length, 0);
  const phases = r.outputs.map((o) => o.phase).filter((p, i, all) => p !== all[i - 1]);
  assert.deepEqual(phases, ['bottom', 'lifting', 'top', 'lowering', 'bottom']);
});

test('synthetic slow tempo: a slow lowering after a normal lift leaves the top by position alone', () => {
  // 2 s at 15 deg/s from the top, then a normal lowering.
  const frames = render({ seed: 212, dropFrameProb: 0, script: [{ ms: 800 }, { ms: 900, to: B + 120 }, { ms: 100 },
    { ms: 2000, to: B + 90, linear: true }, { ms: 800, to: B }, { ms: 600 }] });
  const r = feed(createCurlAnalyzer(), frames);
  assert.equal(r.completed.length, 1);
});

test('synthetic slow tempo: a steady 15 deg/s 120 deg curl (8 s up, 8 s down) completes one rep', () => {
  for (const noiseDeg of [0, 0.6, 2]) {
    const frames = render({ seed: 213, noiseDeg, dropFrameProb: 0, script: [{ ms: 800 }, { ms: 8000, to: B + 120, linear: true },
      { ms: 8000, to: B, linear: true }, { ms: 600 }] });
    const r = feed(createCurlAnalyzer(), frames);
    assert.equal(r.completed.length, 1, `noise ${noiseDeg}: ${r.events.map((e) => e.attempt?.reason ?? 'completed')}`);
    assert.equal(r.interrupted.length, 0);
    assert.ok(r.completed[0].rep.durationMs > 12000);
  }
});

test('synthetic: creeping under stallProgressDeg (8 deg) per pauseTimeoutMs (4 s) mid-rep ends as pause-timeout', () => {
  assert.equal(CURL_CONFIG.stallProgressDeg, 8);
  for (const [seed, noiseDeg] of [[214, 0], [215, 1]]) { // +-2 deg noise plus creep: see review finding (single-frame anchor)
    // Halfway down, creep 0.75 deg/s for 6 s (3 deg per 4 s, well under 8 deg even counting the
    // tail of the descent before the anchor), then lower.
    const frames = render({ seed, noiseDeg, script: [{ ms: 800 }, { ms: 900, to: B + 120 }, { ms: 200 }, { ms: 500, to: B + 60 },
      { ms: 6000, to: B + 55.5, linear: true }, { ms: 500, to: B }, { ms: 600 }] });
    const r = feed(createCurlAnalyzer(), frames);
    assert.equal(r.completed.length, 0, `seed ${seed}`);
    assert.deepEqual(r.interrupted.map((e) => e.attempt.reason), ['pause-timeout'], `seed ${seed}`);
  }
  // Creeping while lifting (0.5 deg/s for 8 s, below the top) is also a stall.
  const up = render({ seed: 217, script: [{ ms: 800 }, { ms: 500, to: B + 55 }, { ms: 8000, to: B + 59, linear: true }, { ms: 500, to: B + 120 }, { ms: 200 }, { ms: 900, to: B }, { ms: 600 }] });
  const r = feed(createCurlAnalyzer(), up);
  assert.equal(r.completed.length, 0);
  assert.deepEqual(r.interrupted.map((e) => e.attempt.reason), ['pause-timeout']);
});

test('synthetic coverageGapMs: a 400 ms frame stall mid-rep is uncovered time, not observed time', () => {
  const frames = render({ seed: 221, dropFrameProb: 0, spacingJitter: 0.1, script: [{ ms: 800 }, { ms: 700, to: B + 60 },
    { ms: 400, to: B + 90, stall: true }, { ms: 700, to: B + 120 }, { ms: 200 }, { ms: 1500, to: B }, { ms: 600 }] });
  const r = feed(createCurlAnalyzer(), frames);
  assert.equal(r.completed.length, 1);
  const rep = r.completed[0].rep;
  const uncovered = rep.durationMs - rep.validObservedMs;
  assert.ok(uncovered >= 380 && uncovered <= 600, `uncovered ${uncovered} ms`);
  assert.ok(rep.coverage < 0.9 && rep.coverage >= CURL_CONFIG.minCoverage, `coverage ${rep.coverage}`);
  // Same rep with no stall has full coverage.
  const clean = feed(createCurlAnalyzer(), render({ seed: 221, dropFrameProb: 0, spacingJitter: 0.1, script: [{ ms: 800 }, { ms: 700, to: B + 60 },
    { ms: 400, to: B + 90 }, { ms: 700, to: B + 120 }, { ms: 200 }, { ms: 1500, to: B }, { ms: 600 }] }));
  assert.equal(clean.completed[0].rep.coverage, 1);
});

test('synthetic coverageGapMs: repeated 300 ms stalls drop coverage below minCoverage -> low-coverage, not completed', () => {
  const script = [{ ms: 800 }];
  for (const to of [30, 50, 70, 90, 110, 120]) script.push({ ms: 150, to: B + to - 10 }, { ms: 200, to: B + to, stall: true });
  script.push({ ms: 200 });
  for (const to of [100, 80, 60, 40, 20, 0]) script.push({ ms: 150, to: B + to + 10 }, { ms: 200, to: B + to, stall: true });
  script.push({ ms: 600 });
  const r = feed(createCurlAnalyzer(), render({ seed: 222, dropFrameProb: 0, spacingJitter: 0, script }));
  assert.equal(r.completed.length, 0);
  assert.deepEqual(r.interrupted.map((e) => e.attempt.reason), ['low-coverage']);
});

test('synthetic: a long pause halfway down still times out with +-2 deg frame noise (noise must not reset the stall timer)', () => {
  for (const seed of [231, 232, 233]) {
    const frames = render({ seed, noiseDeg: 2, script: [{ ms: 800 }, { ms: 900, to: B + 120 }, { ms: 200 }, { ms: 500, to: B + 60 },
      { ms: 8000 }, { ms: 500, to: B }, { ms: 600 }] });
    const r = feed(createCurlAnalyzer(), frames);
    assert.equal(r.completed.length, 0, `seed ${seed}: an 8 s pause mid-rep completed a rep`);
    assert.deepEqual(r.interrupted.map((e) => e.attempt.reason), ['pause-timeout'], `seed ${seed}`);
  }
});

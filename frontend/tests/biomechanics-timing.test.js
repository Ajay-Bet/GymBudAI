// Sprint 2 independent validation: timing, smoothing, gap, schema and stability evidence.
// All inputs are synthetic landmark fixtures. Numbers printed here are synthetic arithmetic
// results, not physical measurements on a person or camera.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBiomechanicsEngine, DEFAULT_CONFIG, FEATURE_SCHEMA } from '../src/biomechanics/engine.js';
import { createStabilityTracker, measureStepDelay } from '../src/biomechanics/stability.js';
import { createTrackingValidator } from '../src/vision/tracking.js';

const ASPECT_INV = 720 / 1280;
const point = (x, y, visibility = 1) => ({ x, y, visibility, presence: 1 });
// Side-on synthetic pose; the selected arm bends by `flexion` degrees at the elbow.
function pose(flexion = 0, { side = 'left', visibility = 1, jitter = null } = {}) {
  const p = Array(33).fill(null);
  const j = () => (jitter ? jitter() : 0);
  p[11] = point(.45 + j(), .25 + j(), visibility); p[12] = point(.48 + j(), .25 + j(), visibility);
  p[23] = point(.45 + j(), .65 + j(), visibility); p[24] = point(.48 + j(), .65 + j(), visibility);
  for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) {
    const a = (s === (side === 'left' ? 11 : 12) ? flexion : 0) * Math.PI / 180;
    const ex = p[s].x + j(), ey = .45 + j();
    p[e] = point(ex, ey, visibility);
    // Horizontal offset is divided by the 1280/720 source aspect so the pixel-space angle equals `flexion`.
    p[w] = point(ex + .18 * Math.sin(a) * ASPECT_INV + j(), ey + .18 * Math.cos(a) + j(), visibility);
  }
  return p;
}
const sample = (timestampMs, landmarks) => ({ timestampMs, landmarks, sourceWidth: 1280, sourceHeight: 720 });
// Deterministic PRNG (mulberry32) so jitter fixtures are reproducible.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const stats = (values) => {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return { range: Math.max(...values) - Math.min(...values), sd: Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) };
};
// Flexion trajectory: hold 0 deg for 300 ms, ramp to 90 deg over 1000 ms, then hold.
const ramp = (t) => (t < 300 ? 0 : t < 1300 ? 90 * (t - 300) / 1000 : 90);
function replay(times, angleAt = ramp) {
  const engine = createBiomechanicsEngine({ side: 'left' });
  return times.map((t) => engine.update(sample(t, pose(angleAt(t)))));
}
const regular = (fps, endMs) => Array.from({ length: Math.floor(endMs * fps / 1000) + 1 }, (_, i) => i * 1000 / fps);
function irregular(seed, endMs) {
  const random = seeded(seed), times = [0];
  while (times.at(-1) < endMs) times.push(times.at(-1) + 8 + random() * 42); // 8-50 ms intervals
  return times;
}
// Linear interpolation of a frame series at time t.
function at(frames, t, read) {
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].timestampMs >= t) {
      const a = frames[i - 1], b = frames[i];
      const k = (t - a.timestampMs) / (b.timestampMs - a.timestampMs);
      return read(a) + k * (read(b) - read(a));
    }
  }
  return null;
}

test('same movement at 30 fps, 60 fps and irregular intervals gives agreeing smoothed velocity once settled', () => {
  const series = { '30fps': replay(regular(30, 1600)), '60fps': replay(regular(60, 1600)), irregular: replay(irregular(7, 1600)) };
  const velocity = (f) => f.values.elbowAngularVelocityDegS;
  const flexion = (f) => f.values.elbowFlexionDeg;
  const report = {};
  for (const [name, frames] of Object.entries(series)) {
    // Every frame after the first is valid and finite in this uninterrupted replay.
    frames.slice(1).forEach((f) => assert.equal(f.validity.elbowAngularVelocityDegS, true, `${name} @${f.timestampMs}`));
    report[name] = { v800: velocity(frames.find((f) => f.timestampMs >= 800)), v1100: at(frames, 1100, velocity), flex800: at(frames, 800, flexion) };
    // Settled window (>= 5 time constants after ramp start, before ramp end): true slope is 90 deg/s.
    const settled = frames.filter((x) => x.timestampMs >= 800 && x.timestampMs <= 1300);
    report[name].maxFrameErr = Math.max(...settled.map((f) => Math.abs(velocity(f) - 90)));
    report[name].meanV = settled.reduce((s, f) => s + velocity(f) * 1, 0) / settled.length;
    // Velocity over a 200 ms window of the smoothed output (rate independent).
    report[name].window = (at(frames, 1200, flexion) - at(frames, 1000, flexion)) / .2;
    assert.ok(Math.abs(report[name].window - 90) <= 3, `${name} windowed velocity ${report[name].window}`);
    if (name !== 'irregular') assert.ok(report[name].maxFrameErr <= 3, `${name} per-frame velocity error ${report[name].maxFrameErr}`);
  }
  const names = Object.keys(report);
  assert.ok(Math.abs(report['30fps'].v1100 - report['60fps'].v1100) <= 3, 'per-frame velocity 30 vs 60 fps');
  // Irregular intervals: per-frame velocity is noisier (filter lag depends on each dt); bound it loosely and report it.
  assert.ok(report.irregular.maxFrameErr <= 25, `irregular per-frame velocity error ${report.irregular.maxFrameErr}`);
  for (const a of names) for (const b of names) {
    assert.ok(Math.abs(report[a].window - report[b].window) <= 3, `windowed velocity ${a} vs ${b}: ${report[a].window} vs ${report[b].window}`);
    assert.ok(Math.abs(report[a].meanV - report[b].meanV) <= 3, `mean settled velocity ${a} vs ${b}: ${report[a].meanV} vs ${report[b].meanV}`);
    assert.ok(Math.abs(report[a].flex800 - report[b].flex800) <= 2, `smoothed flexion ${a} vs ${b}: ${report[a].flex800} vs ${report[b].flex800}`);
  }
  console.log('[synthetic] ramp 0->90 deg over 1 s; smoothed velocity (deg/s) and flexion (deg):', JSON.stringify(report, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
});

test('zero and backward intervals give null velocity, and the next valid frame does not reuse the old history', () => {
  for (const bad of [500, 400]) {
    const engine = createBiomechanicsEngine();
    for (let t = 0; t <= 500; t += 33) engine.update(sample(t, pose(ramp(t))));
    engine.update(sample(500, pose(10)));
    const frame = engine.update(sample(bad, pose(30)));
    assert.equal(frame.values.elbowAngularVelocityDegS, null);
    assert.equal(frame.validity.elbowAngularVelocityDegS, false);
    assert.ok(frame.reasons.includes('invalid-timestamp'));
    const next = engine.update(sample(520, pose(30)));
    assert.equal(next.values.elbowAngularVelocityDegS, null, 'velocity must not span an invalid interval');
  }
});

test('stationary seeded landmark jitter: smoothed flexion SD and range are lower than raw', () => {
  const random = seeded(2026);
  const jitter = () => (random() - .5) * .01; // +/-0.005 normalized units per coordinate
  const engine = createBiomechanicsEngine();
  const tracker = createStabilityTracker({ windowMs: 2000 });
  const raw = [], smoothed = [];
  let summary;
  for (let t = 0; t <= 3000; t += 1000 / 30) {
    const frame = engine.update(sample(t, pose(20, { jitter })));
    assert.ok(Number.isFinite(frame.raw.elbowFlexionDeg), `frame at ${t} should be valid`);
    summary = tracker.update(frame);
    if (t >= 1000) { raw.push(frame.raw.elbowFlexionDeg); smoothed.push(frame.smoothed.elbowFlexionDeg); }
  }
  const r = stats(raw), s = stats(smoothed);
  assert.ok(s.sd < r.sd && s.range < r.range, JSON.stringify({ r, s }));
  assert.ok(summary.smoothed.sd < summary.raw.sd && summary.smoothed.range < summary.raw.range);
  // Independent computation and the tracker's 2 s window cover the same frames (1000-3000 ms).
  assert.ok(Math.abs(summary.raw.sd - r.sd) < 1e-9 && Math.abs(summary.smoothed.range - s.range) < 1e-9);
  console.log('[synthetic] stationary jitter flexion (deg):', JSON.stringify({ raw: r, smoothed: s, sdReduction: 1 - s.sd / r.sd }, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
});

test('step response 0 -> 60 deg at 30 fps: synthetic 50% delay is finite and below 150 ms', () => {
  const engine = createBiomechanicsEngine();
  const series = [];
  for (let i = 0; i <= 45; i += 1) {
    const t = i * 1000 / 30;
    const f = engine.update(sample(t, pose(t >= 500 ? 60 : 0)));
    series.push({ timestampMs: t, raw: f.raw.elbowFlexionDeg, smoothed: f.smoothed.elbowFlexionDeg });
  }
  const delay = measureStepDelay(series);
  assert.ok(Number.isFinite(delay) && delay > 0 && delay < 150, `delay ${delay}`);
  const delay90 = measureStepDelay(series, { threshold: .9 });
  console.log(`[synthetic, not a physical measurement] step 0->60 deg @30 fps, smoothingMs=${DEFAULT_CONFIG.smoothingMs}: 50% delay ${delay.toFixed(1)} ms; 90% delay ${delay90.toFixed(1)} ms (quantized to frame times)`);
  // Lower (but still accepted) confidence slows the time-aware filter: confidence-aware smoothing.
  const low = createBiomechanicsEngine();
  const lowSeries = [];
  for (let i = 0; i <= 45; i += 1) {
    const t = i * 1000 / 30;
    const f = low.update(sample(t, pose(t >= 500 ? 60 : 0, { visibility: .6 })));
    lowSeries.push({ timestampMs: t, raw: f.raw.elbowFlexionDeg, smoothed: f.smoothed.elbowFlexionDeg });
  }
  assert.ok(measureStepDelay(lowSeries) >= delay);
  console.log(`[synthetic] same step with visibility 0.6: 50% delay ${measureStepDelay(lowSeries).toFixed(1)} ms`);
});

test('measureStepDelay rejects invalid inputs', () => {
  const good = [{ timestampMs: 0, raw: 0, smoothed: 0 }, { timestampMs: 10, raw: 1, smoothed: 1 }];
  assert.equal(measureStepDelay(good), 0);
  assert.equal(measureStepDelay([]), null);
  assert.equal(measureStepDelay(null), null);
  assert.equal(measureStepDelay([good[0], { ...good[1], timestampMs: 0 }]), null);
  assert.equal(measureStepDelay([good[0], { ...good[1], smoothed: NaN }]), null);
  assert.equal(measureStepDelay([good[0], { ...good[1], raw: 0 }]), null);
  assert.equal(measureStepDelay(good, { threshold: 0 }), null);
});

function assertNoZeroSubstitution(frame) {
  for (const key of Object.keys(FEATURE_SCHEMA.units)) {
    assert.equal(frame.validity[key], Number.isFinite(frame.values[key]), key);
    if (!frame.validity[key]) assert.equal(frame.values[key], null, `${key} must be null, not ${frame.values[key]}`);
  }
}
function calibratedEngine() {
  const engine = createBiomechanicsEngine();
  engine.calibrate();
  let frame;
  for (let t = 0; t <= 1200; t += 33) frame = engine.update(sample(t, pose(0)));
  assert.equal(frame.ready, true);
  return engine;
}

test('tracking gap beyond maxGapMs: history-dependent features null, readiness lost, never zero', () => {
  const engine = calibratedEngine();
  const frame = engine.update(sample(1188 + DEFAULT_CONFIG.maxGapMs + 1, pose(0)));
  assert.equal(frame.ready, false);
  for (const key of ['elbowAngularVelocityDegS', 'elbowVelocityPerS', 'elbowDisplacement', 'upperArmDriftDeg', 'torsoDeviationDeg']) {
    assert.equal(frame.values[key], null, key);
    assert.equal(frame.validity[key], false, key);
  }
  assertNoZeroSubstitution(frame);
  // Recovery does not reuse the old baseline.
  const later = engine.update(sample(1800, pose(0)));
  assert.equal(later.values.elbowDisplacement, null);
  assert.equal(later.calibration.status, 'uncalibrated');
});

test('integrated validator + engine: gap and confidence drop make every value null and invalid', () => {
  const validator = createTrackingValidator({ side: 'left' });
  const engine = createBiomechanicsEngine();
  const step = (t, landmarks) => engine.update(sample(t, landmarks), validator.update(landmarks, t));
  let frame;
  for (let t = 0; t <= 600; t += 33) frame = step(t, pose(10));
  assert.equal(frame.validity.elbowFlexionDeg, true);
  frame = step(1200, pose(10)); // 606 ms gap: validator demands re-settling
  assert.notEqual(frame.trackingState, 'active');
  assert.ok(Object.values(frame.values).every((v) => v === null));
  assert.ok(Object.values(frame.validity).every((v) => v === false));
  for (let t = 1233; t <= 1700; t += 33) frame = step(t, pose(10));
  assert.equal(frame.validity.elbowFlexionDeg, true);
  const low = pose(10); low[13].visibility = DEFAULT_CONFIG.releaseConfidence - .01;
  frame = step(1733, low);
  assert.ok(Object.values(frame.values).every((v) => v === null));
  assert.ok(Object.values(frame.validity).every((v) => v === false));
  // Engine alone (tracking supplied as active) also rejects the low-confidence joint.
  const solo = createBiomechanicsEngine();
  solo.update(sample(0, pose(10)));
  frame = solo.update(sample(33, low));
  assert.ok(frame.reasons.includes('tracking-unreliable'));
  assertNoZeroSubstitution(frame);
  assert.ok(Object.values(frame.values).every((v) => v === null));
});

test('FEATURE_SCHEMA units cover every frame value key and frame.units matches', () => {
  assert.equal(typeof FEATURE_SCHEMA.version, 'string');
  assert.equal(typeof FEATURE_SCHEMA.coordinateSpace, 'string');
  assert.equal(FEATURE_SCHEMA.units.elbowDisplacement, 'torso-lengths');
  const engine = calibratedEngine();
  const valid = engine.update(sample(1221, pose(5)));
  const invalid = createBiomechanicsEngine().update(sample(NaN, pose(5)));
  for (const frame of [valid, invalid]) {
    assert.deepEqual(Object.keys(frame.values).sort(), Object.keys(FEATURE_SCHEMA.units).sort());
    assert.deepEqual(Object.keys(frame.validity).sort(), Object.keys(FEATURE_SCHEMA.units).sort());
    assert.deepEqual(frame.units, FEATURE_SCHEMA.units);
    assert.equal(frame.version, FEATURE_SCHEMA.version);
    assert.equal(frame.coordinateSpace, FEATURE_SCHEMA.coordinateSpace);
    for (const unit of Object.values(frame.units)) assert.ok(typeof unit === 'string' && unit.length > 0);
  }
  assert.ok(Object.values(valid.validity).every(Boolean), 'calibrated steady frame has every feature');
});

test('stability tracker: null with <2 samples, window pruning, reset on invalid frames', () => {
  const tracker = createStabilityTracker({ windowMs: 100 });
  const f = (timestampMs, raw, smoothed = raw) => ({ timestampMs, raw: { elbowFlexionDeg: raw }, smoothed: { elbowFlexionDeg: smoothed } });
  let r = tracker.update(f(0, 10));
  assert.deepEqual([r.samples, r.spanMs, r.raw.sd, r.raw.range, r.smoothed.sd, r.smoothed.range], [1, null, null, null, null, null]);
  r = tracker.update(f(50, 20, 12));
  assert.equal(r.samples, 2); assert.equal(r.spanMs, 50);
  assert.equal(r.raw.range, 10); assert.equal(r.raw.sd, 5); assert.equal(r.smoothed.range, 2);
  r = tracker.update(f(150, 30));
  assert.equal(r.samples, 2, 'sample at 0 ms is older than the 100 ms window');
  assert.equal(r.spanMs, 100);
  for (const bad of [null, f(120, 1), f(110, 1), f(NaN, 1), f(400, null), { timestampMs: 500, raw: {}, smoothed: {} }]) {
    const t = createStabilityTracker({ windowMs: 1000 });
    t.update(f(100, 1)); t.update(f(120, 2));
    r = t.update(bad);
    assert.equal(r.samples, 0); assert.equal(r.raw.sd, null);
  }
  assert.equal(tracker.reset().samples, 0);
  assert.throws(() => createStabilityTracker({ windowMs: 0 }));
});

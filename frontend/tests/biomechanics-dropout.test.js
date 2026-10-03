// Sprint 2 independent validation: short-dropout hysteresis and grace window.
// Inputs are synthetic landmark fixtures fed through the same path CameraView uses
// (tracking validator result passed to biomechanics engine.update). Numbers are synthetic
// arithmetic results, not physical measurements on a person or camera.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBiomechanicsEngine, DEFAULT_CONFIG, FEATURE_SCHEMA } from '../src/biomechanics/engine.js';
import { createTrackingValidator } from '../src/vision/tracking.js';

const STEP = 33; // ~30 fps
const KEYS = Object.keys(FEATURE_SCHEMA.units);
const SELECTED = [11, 13, 15, 23];
const ASPECT_INV = 720 / 1280;
const point = (x, y, visibility = 1) => ({ x, y, visibility, presence: 1 });

// Side-on synthetic pose; `selectedVisibility` applies to the selected (left) side's required joints.
function pose(selectedVisibility = 1, flexion = 0) {
  const p = Array(33).fill(null);
  p[11] = point(.45, .25); p[12] = point(.48, .25);
  p[23] = point(.45, .65); p[24] = point(.48, .65);
  for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) {
    const a = (s === 11 ? flexion : 0) * Math.PI / 180;
    p[e] = point(p[s].x, .45);
    p[w] = point(p[e].x + .18 * Math.sin(a) * ASPECT_INV, .45 + .18 * Math.cos(a));
  }
  for (const index of SELECTED) p[index].visibility = selectedVisibility;
  return p;
}

// Every frame produced in this file is checked against the null/validity invariant.
const allFrames = [];
function checkInvariant(frame) {
  for (const key of KEYS) {
    const value = frame.values[key];
    assert.equal(frame.validity[key], Number.isFinite(value), `${key} validity must match value ${value}`);
    if (!frame.validity[key]) assert.equal(value, null, `${key} must be null (never 0) when invalid`);
  }
  if (!frame.ready) return;
  assert.equal(frame.trackingState, 'active');
  assert.equal(frame.calibration.status, 'ready');
}

// Integrated pipeline mirroring CameraView.onResult: validator.update -> engine.update(result, tracking).
function pipeline() {
  const validator = createTrackingValidator({ side: 'left' });
  const engine = createBiomechanicsEngine({ side: 'left' });
  let t = 0;
  const step = (landmarks, timestampMs = t) => {
    t = timestampMs;
    const tracking = validator.update(landmarks, t);
    const frame = engine.update({ timestampMs: t, landmarks, sourceWidth: 1280, sourceHeight: 720 }, tracking);
    checkInvariant(frame);
    allFrames.push(frame);
    t += STEP;
    return { tracking, frame };
  };
  return { validator, engine, step, now: () => t };
}

// Acquire tracking and complete calibration; returns the last ready frame.
function calibratedPipeline() {
  const p = pipeline();
  p.engine.calibrate();
  let last;
  for (let i = 0; i < 60; i += 1) {
    last = p.step(pose());
    if (last.frame.ready) break;
  }
  assert.equal(last.frame.ready, true, last.frame.calibration.message);
  // Settle a few more frames so velocity and displacement are well defined.
  for (let i = 0; i < 5; i += 1) last = p.step(pose());
  assert.equal(last.frame.ready, true);
  return { ...p, before: last.frame };
}

test('new config defaults are present and documented as tunable', () => {
  assert.equal(DEFAULT_CONFIG.releaseConfidence, 0.3);
  assert.equal(DEFAULT_CONFIG.dropoutGraceMs, 250);
  assert.ok(DEFAULT_CONFIG.releaseConfidence < DEFAULT_CONFIG.confidence);
});

test('validator: visibility dip to 0.4 after active stays active (release hysteresis)', () => {
  const validator = createTrackingValidator();
  validator.update(pose(), 0);
  assert.equal(validator.update(pose(), 300).state, 'active');
  for (let t = 333; t <= 1000; t += STEP) {
    const r = validator.update(pose(0.4), t);
    assert.equal(r.state, 'active', `t=${t}`);
    assert.equal(r.dropout, false);
  }
});

test('integrated: dip to 0.4 after calibration keeps every value valid and ready', () => {
  const p = calibratedPipeline();
  for (let i = 0; i < 15; i += 1) {
    const { tracking, frame } = p.step(pose(0.4));
    assert.equal(tracking.state, 'active');
    assert.equal(frame.ready, true, frame.reasons.join());
    for (const key of KEYS) assert.equal(frame.validity[key], true, key);
    assert.ok(Math.abs(frame.values.elbowDisplacement - p.before.values.elbowDisplacement) < 1e-6);
  }
});

test('engine alone: release threshold applies only once a valid filtered frame exists', () => {
  const cold = createBiomechanicsEngine();
  const frame = cold.update({ timestampMs: 0, landmarks: pose(0.4), sourceWidth: 1280, sourceHeight: 720 }, { state: 'active' });
  checkInvariant(frame);
  assert.ok(frame.reasons.includes('tracking-unreliable'));
  assert.equal(frame.values.elbowInteriorDeg, null);
  const warm = createBiomechanicsEngine();
  warm.update({ timestampMs: 0, landmarks: pose(), sourceWidth: 1280, sourceHeight: 720 }, { state: 'active' });
  const held = warm.update({ timestampMs: 33, landmarks: pose(0.4), sourceWidth: 1280, sourceHeight: 720 }, { state: 'active' });
  checkInvariant(held);
  assert.equal(held.validity.elbowInteriorDeg, true, held.reasons.join());
});

for (const [label, dipFrames] of [['one frame (33 ms)', 1], ['200 ms', 6]]) {
  test(`integrated: dip to 0.2 for ${label} → null during dip, ready immediately after, same baseline`, () => {
    const p = calibratedPipeline();
    const baselineDisplacement = p.before.values.elbowDisplacement;
    assert.ok(Number.isFinite(baselineDisplacement));
    for (let i = 0; i < dipFrames; i += 1) {
      const { tracking, frame } = p.step(pose(0.2));
      assert.notEqual(tracking.state, 'active');
      assert.equal(tracking.dropout, true, 'validator marks dropout within grace');
      assert.equal(frame.dropout, true, 'engine marks dropout within grace');
      assert.equal(frame.ready, false);
      for (const key of KEYS) {
        assert.equal(frame.values[key], null, `${key} must be null during dip`);
        assert.equal(frame.validity[key], false);
      }
      assert.equal(frame.calibration.status, 'ready', 'calibration kept within grace');
    }
    const recovered = p.step(pose());
    assert.equal(recovered.tracking.state, 'active', 'no new stableMs wait within grace');
    assert.equal(recovered.tracking.dropout, false);
    assert.equal(recovered.frame.ready, true, recovered.frame.reasons.join());
    assert.equal(recovered.frame.dropout, false);
    assert.equal(recovered.frame.calibration.status, 'ready');
    assert.ok(Number.isFinite(recovered.frame.values.elbowDisplacement));
    assert.ok(Math.abs(recovered.frame.values.elbowDisplacement - baselineDisplacement) < 1e-6,
      `displacement ${recovered.frame.values.elbowDisplacement} vs ${baselineDisplacement}`);
    assert.equal(recovered.frame.values.elbowAngularVelocityDegS, null, 'no velocity across the gap');
    assert.equal(recovered.frame.values.elbowVelocityPerS, null);
    const next = p.step(pose());
    assert.equal(next.frame.ready, true);
    assert.ok(Number.isFinite(next.frame.values.elbowAngularVelocityDegS));
    assert.ok(Math.abs(next.frame.values.elbowAngularVelocityDegS) < 1e-6, 'static pose → ~0 deg/s, finite');
  });
}

test('integrated: no-landmark frame while active is a graced dropout', () => {
  const p = calibratedPipeline();
  const { tracking, frame } = p.step([]);
  assert.equal(tracking.state, 'partial');
  assert.equal(tracking.dropout, true);
  assert.equal(frame.ready, false);
  assert.equal(frame.values.elbowDisplacement, null);
  const recovered = p.step(pose());
  assert.equal(recovered.tracking.state, 'active');
  assert.equal(recovered.frame.ready, true);
});

test('integrated: dip lasting 400 ms clears the baseline and requires recalibration', () => {
  const p = calibratedPipeline();
  const start = p.now();
  let sawGraceEnd = false;
  while (p.now() - start < 400) {
    const { tracking, frame } = p.step(pose(0.2));
    assert.notEqual(tracking.state, 'active');
    assert.equal(frame.ready, false);
    assert.equal(frame.values.elbowDisplacement, null);
    if (!frame.dropout) sawGraceEnd = true;
  }
  assert.ok(sawGraceEnd, 'dropout flag ends after the grace window');
  // Recovery at the acquire threshold needs stableMs again.
  const first = p.step(pose());
  assert.equal(first.tracking.state, 'partial');
  assert.equal(first.tracking.dropout, false);
  assert.equal(first.frame.ready, false);
  let active;
  for (let i = 0; i < 20 && !active; i += 1) {
    const r = p.step(pose());
    if (r.tracking.state === 'active') active = r;
    else assert.equal(r.frame.ready, false);
  }
  assert.ok(active, 'tracking re-acquires after stableMs');
  assert.ok(active.frame.timestampMs - first.frame.timestampMs >= 300, 'stableMs wait applied again');
  // Tracking active again, but the baseline is gone.
  assert.notEqual(active.frame.calibration.status, 'ready');
  assert.equal(active.frame.ready, false);
  assert.equal(active.frame.values.elbowDisplacement, null);
  assert.equal(active.frame.values.upperArmDriftDeg, null);
  assert.ok(Number.isFinite(active.frame.values.elbowInteriorDeg), 'unbaselined geometry still published');
  for (let i = 0; i < 10; i += 1) assert.equal(p.step(pose()).frame.ready, false, 'stays not ready without recalibration');
  p.engine.calibrate();
  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) ready = p.step(pose()).frame.ready;
  assert.equal(ready, true, 'recalibration restores readiness');
});

test('after a dropout beyond grace, 0.4 visibility does not re-acquire', () => {
  const validator = createTrackingValidator();
  validator.update(pose(), 0);
  assert.equal(validator.update(pose(), 300).state, 'active');
  let t = 300;
  for (let i = 0; i < 12; i += 1) validator.update(pose(0.2), (t += STEP));
  for (let i = 0; i < 30; i += 1) assert.notEqual(validator.update(pose(0.4), (t += STEP)).state, 'active');
});

test('cold acquisition still needs confidence 0.5 sustained for stableMs', () => {
  const low = createTrackingValidator();
  for (let t = 0; t <= 1000; t += STEP) {
    const r = low.update(pose(0.4), t);
    assert.equal(r.state, 'partial', `t=${t}`);
    assert.equal(r.dropout, false);
  }
  const p = pipeline();
  p.engine.calibrate();
  for (let t = 0; t <= 1000; t += STEP) {
    const { frame } = p.step(pose(0.4), t);
    assert.equal(frame.values.elbowInteriorDeg, null);
    assert.equal(frame.calibration.status, 'collecting');
    assert.equal(frame.calibration.progress, 0);
  }
  const ok = createTrackingValidator();
  assert.equal(ok.update(pose(0.5), 0).state, 'partial');
  assert.equal(ok.update(pose(0.5), 267).state, 'partial');
  assert.equal(ok.update(pose(0.5), 300).state, 'active');
});

test('invalid timestamp and >500 ms gap reset hysteresis', () => {
  const v = createTrackingValidator();
  v.update(pose(), 0);
  assert.equal(v.update(pose(), 300).state, 'active');
  const bad = v.update(pose(), 300);
  assert.equal(bad.state, 'lost');
  assert.equal(bad.dropout, false);
  assert.equal(v.update(pose(0.4), 333).state, 'partial', 'reset requires acquire threshold');
  const g = createTrackingValidator();
  g.update(pose(), 0);
  assert.equal(g.update(pose(), 300).state, 'active');
  assert.notEqual(g.update(pose(0.4), 900).state, 'active', 'gap clears release hysteresis');
  assert.notEqual(g.update(pose(), 933).state, 'active', 'gap restarts stableMs');
});

test('collecting calibration restarts samples on any dropout', () => {
  const p = pipeline();
  for (let i = 0; i < 12; i += 1) p.step(pose()); // acquire tracking (>300 ms)
  p.engine.calibrate();
  let frame;
  for (let i = 0; i < 10; i += 1) frame = p.step(pose()).frame;
  assert.equal(frame.calibration.status, 'collecting');
  assert.ok(frame.calibration.progress > 0);
  const dip = p.step(pose(0.2)).frame;
  assert.equal(dip.calibration.status, 'collecting');
  assert.equal(dip.calibration.progress, 0);
  frame = p.step(pose()).frame;
  assert.ok(frame.calibration.progress < 0.2, `samples restarted, progress ${frame.calibration.progress}`);
});

test('invariant: no invalid feature was ever published as 0 across all scenarios', () => {
  assert.ok(allFrames.length > 200);
  let invalidSeen = 0;
  for (const frame of allFrames) {
    for (const key of KEYS) if (!frame.validity[key]) { invalidSeen += 1; assert.equal(frame.values[key], null); }
  }
  assert.ok(invalidSeen > 0);
});

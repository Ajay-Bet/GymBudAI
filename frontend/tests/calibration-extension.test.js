import test from 'node:test';
import assert from 'node:assert/strict';
import { createBiomechanicsEngine, FEATURE_SCHEMA } from '../src/biomechanics/engine.js';
import { calibrationPose, measureCalibration } from './fixtures/calibration-extension.js';

// Recorded before engine edits, using this exact fixture and seed. Reset count is the number
// of "Movement detected" observations; no recording, camera or human labeling is involved.
const before = { 15: { readyMs: 1333.333, resets: 1 }, 30: { readyMs: 1166.667, resets: 1 }, 60: { readyMs: 8633.333, resets: 40 } };
test('seeded noisy calibration reduces discarded evidence without lowering time or frame gates', () => {
  const report = [];
  for (const fps of [15, 30, 60]) for (const seed of [2026, 7, 42]) {
    const after = measureCalibration(createBiomechanicsEngine, { fps, seed });
    assert.ok(after.readyMs >= 1000 && after.readyMs <= 1100, JSON.stringify(after));
    assert.equal(after.progressRegressions, 0);
    if (seed === 7) assert.ok(after.readyMs < before[fps].readyMs);
    report.push({ ...after, beforeReadyMs: seed === 7 ? before[fps].readyMs : 1000,
      beforeMovingResets: seed === 7 ? before[fps].resets : 0 });
  }
  console.log('[synthetic calibration before/after]', JSON.stringify(report));
});
test('sparse observations require eight frames as well as 1000 ms', () => {
  const engine = createBiomechanicsEngine(); engine.calibrate();
  for (let i = 0; i < 7; i += 1) assert.equal(engine.update(calibrationPose(i * 200)).ready, false);
  assert.equal(engine.update(calibrationPose(1400)).ready, true);
});
test('a tracking gap truly resets progress and never bridges missing observations', () => {
  const engine = createBiomechanicsEngine(); engine.calibrate();
  for (let i = 0; i <= 8; i += 1) engine.update(calibrationPose(i * 100));
  assert.ok(engine.getCalibration().progress > .7);
  const missing = engine.update(calibrationPose(900, { visibility: .1 }));
  assert.equal(missing.calibration.progress, 0);
  assert.equal(missing.calibration.blockedReason, 'joints-not-visible:shoulder');
  for (let i = 10; i < 20; i += 1) assert.equal(engine.update(calibrationPose(i * 100)).ready, false);
  assert.equal(engine.update(calibrationPose(2000)).ready, true);
});
test('continuous large movement cannot calibrate even after a high-water progress display', () => {
  const engine = createBiomechanicsEngine(); engine.calibrate();
  for (let i = 0; i < 9; i += 1) engine.update(calibrationPose(i * 100));
  let prior = engine.getCalibration().progress;
  for (let i = 9; i < 40; i += 1) {
    const frame = engine.update(calibrationPose(i * 100, { shift: i % 2 ? .04 : -.04 }));
    assert.equal(frame.ready, false);
    assert.ok(frame.calibration.progress >= prior);
    assert.ok(frame.calibration.progress < 1);
    prior = frame.calibration.progress;
  }
});
test('specific arm and side-on blockers withhold readiness; reset and reposition discard baseline', () => {
  const engine = createBiomechanicsEngine(); engine.calibrate();
  for (let t = 0; t <= 1200; t += 100) {
    const bent = engine.update(calibrationPose(t, { flexion: 80 }));
    assert.equal(bent.ready, false);
    assert.equal(bent.calibration.blockedReason, 'arm-not-relaxed');
  }
  const front = calibrationPose(1300); front.landmarks[12].x = .7;
  assert.equal(engine.update(front).calibration.blockedReason, 'not-side-on');
  engine.calibrate();
  for (let t = 1400; t <= 2400; t += 100) engine.update(calibrationPose(t));
  assert.equal(engine.getCalibration().status, 'ready');
  const moved = engine.update(calibrationPose(2500, { shift: .2 }));
  assert.equal(moved.ready, false);
  assert.equal(moved.calibration.baselineElbowFlexionDeg, null);
  assert.equal(engine.reset().progress, 0);
  assert.equal(engine.getCalibration().blockedReason, null);
  assert.equal(FEATURE_SCHEMA.version, '1.2.0');
});
test('source timing, not frame count, controls readiness; duplicate timestamp resets evidence', () => {
  const engine = createBiomechanicsEngine(); engine.calibrate();
  const times = [0, 41, 105, 159, 267, 331, 489, 620, 781, 919, 999];
  for (const t of times) assert.equal(engine.update(calibrationPose(t)).ready, false);
  assert.equal(engine.update(calibrationPose(1000)).ready, true);
  const duplicate = engine.update(calibrationPose(1000));
  assert.equal(duplicate.ready, false);
  assert.equal(duplicate.calibration.progress, 0);
  assert.equal(duplicate.calibration.blockedReason, 'tracking-gap');
});

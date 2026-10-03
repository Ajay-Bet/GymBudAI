import test from 'node:test';
import assert from 'node:assert/strict';
import { angleDegrees, distance, toAspectPoint } from '../src/biomechanics/geometry.js';
import { createBiomechanicsEngine } from '../src/biomechanics/engine.js';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} should be ${expected} ± ${tolerance}`);
const point = (x, y) => ({ x, y, visibility: 1, presence: 1 });
function pose(side = 'left', flexion = 0) {
  const p = Array(33).fill(null);
  p[11] = point(.45, .25); p[12] = point(.48, .25);
  p[23] = point(.45, .65); p[24] = point(.48, .65);
  for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) {
    const a = (s === (side === 'left' ? 11 : 12) ? flexion : 0) * Math.PI / 180;
    p[e] = point(p[s].x, .45);
    p[w] = point(p[e].x + .18 * Math.sin(a), .45 + .18 * Math.cos(a));
  }
  return p;
}
const sample = (timestampMs, landmarks = pose(), dimensions = {}) => ({ timestampMs, landmarks, sourceWidth: 1000, sourceHeight: 1000, ...dimensions });
function calibrated(options = {}, landmarks = pose()) {
  const engine = createBiomechanicsEngine(options);
  engine.calibrate();
  let frame;
  for (let t = 0; t <= 1200; t += 50) frame = engine.update(sample(t, landmarks));
  assert.equal(frame.ready, true, frame.calibration.message);
  return engine;
}

test('known interior angles, invalid vectors and nonfinite inputs', () => {
  near(angleDegrees({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }), 0);
  near(angleDegrees({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }), 90);
  near(angleDegrees({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 0 }), 180);
  for (const invalid of [null, { x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: 0, y: 0 }]) assert.equal(angleDegrees(invalid, { x: 0, y: 0 }, { x: 1, y: 0 }), null);
  assert.equal(distance(null, { x: 0, y: 1 }), null);
});

test('aspect correction preserves pixel geometry for a nonsquare image', () => {
  const a = toAspectPoint(point(.5, .25), 1600, 800);
  const b = toAspectPoint(point(.25, .25), 1600, 800);
  const c = toAspectPoint(point(.5, .75), 1600, 800);
  near(angleDegrees(a, b, c), 45);
  assert.equal(toAspectPoint(point(.5, .5), 0, 800), null);
});

test('both anatomical selections retain flexion independent of preview metadata', () => {
  for (const side of ['left', 'right']) {
    const engine = createBiomechanicsEngine({ side });
    const frame = engine.update({ ...sample(0, pose(side, 60)), mirrored: true });
    near(frame.raw.elbowInteriorDeg, 120);
    near(frame.raw.elbowFlexionDeg, 60);
    assert.equal(frame.side, side);
    const other = createBiomechanicsEngine({ side }).update({ ...sample(0, pose(side, 60)), mirrored: false });
    assert.deepEqual(frame.raw, other.raw);
  }
});

test('stable posture calibrates, recalibration immediately discards earlier baseline', () => {
  const engine = calibrated();
  engine.calibrate();
  const frame = engine.update(sample(1250));
  assert.equal(frame.ready, false);
  assert.equal(frame.values.elbowDisplacement, null);
});

test('missing joint and front orientation block readiness and erase stale baselines', () => {
  for (const breakPose of [p => { p[13] = null; }, p => { p[12].x = .8; p[24].x = .8; }]) {
    const engine = calibrated();
    const p = pose(); breakPose(p);
    let frame = engine.update(sample(1250, p));
    assert.equal(frame.ready, false);
    assert.equal(frame.values.elbowDisplacement, null);
    // A missing joint is a short dropout first; keep it past dropoutGraceMs (250 ms) so the baseline is erased.
    for (let t = 1300; t <= 1550; t += 50) frame = engine.update(sample(t, p));
    assert.equal(frame.ready, false);
    assert.equal(engine.update(sample(1600)).ready, false);
  }
});

test('unstable raw posture cannot calibrate even when smoothing hides movement', () => {
  const engine = createBiomechanicsEngine(); engine.calibrate();
  let frame;
  for (let t = 0; t <= 2000; t += 50) frame = engine.update(sample(t, pose('left', t % 100 ? 25 : 0)));
  assert.equal(frame.ready, false);
});

test('duplicate, backward, nonfinite and long-gap times clear readiness and velocity', () => {
  for (const timestamp of [1200, 1100, NaN, 1900]) {
    const engine = calibrated();
    const frame = engine.update(sample(timestamp));
    assert.equal(frame.ready, false);
    assert.equal(frame.values.elbowAngularVelocityDegS, null);
  }
});

test('side, aspect ratio and explicit reset require fresh calibration', () => {
  for (const change of [e => e.setSide('right'), e => e.setView('front'), e => e.reset('Camera interrupted')]) {
    const e = calibrated(); change(e);
    assert.equal(e.update(sample(1250)).ready, false);
  }
  const e = calibrated();
  assert.equal(e.update(sample(1250, pose(), { sourceWidth: 1600 })).ready, false);
});

test('movement out of position and recovery never reuse a stale calibration', () => {
  const e = calibrated();
  const moved = pose().map(p => p && ({ ...p, x: p.x + .2 }));
  assert.equal(e.update(sample(1250, moved)).ready, false);
  const recovered = e.update(sample(1300));
  assert.equal(recovered.ready, false);
  assert.equal(recovered.values.elbowDisplacement, null);
});

// Sprint 3 independent validation: registry behaviour and an end-to-end SYNTHETIC pipeline
// (synthetic landmarks -> tracking validator -> biomechanics engine 1.1.0 -> curl analyzer),
// mirroring CameraView.onResult. Synthetic geometry only; not a physical measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createExerciseRegistry, defaultExerciseRegistry } from '../src/exercises/analyzer.js';
import { CURL_CONFIG, createCurlAnalyzer } from '../src/exercises/curl.js';
import { createBiomechanicsEngine, FEATURE_SCHEMA } from '../src/biomechanics/engine.js';
import { createTrackingValidator } from '../src/vision/tracking.js';

test('default registry lists and creates the dumbbell curl analyzer', () => {
  assert.deepEqual(defaultExerciseRegistry.list(), ['dumbbell-curl']);
  const analyzer = defaultExerciseRegistry.create('dumbbell-curl');
  assert.equal(typeof analyzer.update, 'function');
  assert.equal(typeof analyzer.reset, 'function');
  assert.equal(typeof analyzer.getSession, 'function');
  assert.equal(analyzer.getSession().configVersion, CURL_CONFIG.version);
  assert.throws(() => defaultExerciseRegistry.create('squat'), /Unknown exercise/);
});

test('registry register/create/list, rejects duplicates and bad input, and instances are independent', () => {
  const registry = createExerciseRegistry();
  assert.deepEqual(registry.list(), []);
  registry.register('dumbbell-curl', createCurlAnalyzer);
  assert.throws(() => registry.register('dumbbell-curl', createCurlAnalyzer));
  assert.throws(() => registry.register('', createCurlAnalyzer));
  assert.throws(() => registry.register('x', null));
  assert.deepEqual(registry.list(), ['dumbbell-curl']);
  const a = registry.create('dumbbell-curl'), b = registry.create('dumbbell-curl');
  assert.notEqual(a, b);
  const custom = registry.create('dumbbell-curl', { config: { pauseTimeoutMs: 1234 } });
  assert.equal(custom.config.pauseTimeoutMs, 1234);
  assert.throws(() => registry.create('dumbbell-curl', { config: { topEnterOffsetDeg: 10 } }), /Invalid curl config/);
  assert.throws(() => registry.create('dumbbell-curl', { config: { minCoverage: 0 } }), /Invalid curl config/);
});

test('engine 1.1.0 publishes baselineElbowFlexionDeg only while calibration is ready', () => {
  assert.equal(FEATURE_SCHEMA.version, '1.1.0');
  const engine = createBiomechanicsEngine({ side: 'left' });
  assert.equal(engine.getCalibration().baselineElbowFlexionDeg, null);
  assert.equal(engine.calibrate().baselineElbowFlexionDeg, null);
});

// Synthetic side-on pose; left arm flexed by `flexion` degrees (0 = arm straight down).
const ASPECT_INV = 720 / 1280;
const point = (x, y, visibility = 1) => ({ x, y, visibility, presence: 1 });
function pose(flexion = 0, selectedVisibility = 1) {
  const p = Array(33).fill(null);
  p[11] = point(.45, .25); p[12] = point(.48, .25); p[23] = point(.45, .65); p[24] = point(.48, .65);
  for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) {
    const a = (s === 11 ? flexion : 0) * Math.PI / 180;
    p[e] = point(p[s].x, .45);
    p[w] = point(p[e].x + .18 * Math.sin(a) * ASPECT_INV, .45 + .18 * Math.cos(a));
  }
  for (const index of [11, 13, 15, 23]) p[index].visibility = selectedVisibility;
  return p;
}

function pipeline() {
  const validator = createTrackingValidator({ side: 'left' });
  const engine = createBiomechanicsEngine({ side: 'left' });
  const analyzer = createCurlAnalyzer();
  let t = 1000;
  const events = [], frames = [], outputs = [];
  const step = (landmarks, dt = 33) => {
    t += dt;
    const tracking = validator.update(landmarks, t);
    const frame = engine.update({ timestampMs: t, landmarks, sourceWidth: 1280, sourceHeight: 720 }, tracking);
    const out = analyzer.update(frame);
    frames.push(frame); outputs.push(out); events.push(...out.events);
    return { frame, out };
  };
  const calibrate = () => {
    engine.calibrate();
    let last;
    for (let i = 0; i < 80 && !last?.frame.ready; i += 1) last = step(pose(0));
    assert.equal(last.frame.ready, true, last.frame.calibration.message);
    assert.ok(Number.isFinite(last.frame.calibration.baselineElbowFlexionDeg));
    assert.ok(Math.abs(last.frame.calibration.baselineElbowFlexionDeg) < 1, 'baseline ~0 deg for a straight synthetic arm');
    for (let i = 0; i < 10; i += 1) step(pose(0));
  };
  // Cosine-eased movement between angles over ms; visibility(t) lets a test inject a dropout.
  const move = (from, to, ms, visibility = () => 1) => {
    const n = Math.round(ms / 33);
    for (let i = 1; i <= n; i += 1) step(pose(from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * i / n)), visibility(i * 33)));
  };
  const hold = (angle, ms) => move(angle, angle, ms);
  return { step, calibrate, move, hold, events, frames, outputs };
}

const completedOf = (events) => events.filter((e) => e.type === 'rep-completed');
const interruptedOf = (events) => events.filter((e) => e.type === 'attempt-interrupted');

test('synthetic pipeline: three curls through the real engine count three, with summaries', () => {
  const p = pipeline();
  p.calibrate();
  for (let i = 0; i < 3; i += 1) { p.move(0, 120, 900); p.hold(120, 200); p.move(120, 0, 900); p.hold(0, 500); }
  const completed = completedOf(p.events);
  assert.equal(completed.length, 3);
  for (const { rep } of completed) {
    assert.equal(rep.featureVersion, '1.1.0');
    assert.ok(rep.romDeg > 100 && rep.romDeg < 125, `ROM ${rep.romDeg}`);
    assert.equal(rep.coverage, 1);
    assert.equal(rep.side, 'left');
  }
  assert.equal(interruptedOf(p.events).length, 0);
});

test('synthetic pipeline: grace-window dropout mid-lift keeps the rep; long loss interrupts and needs recalibration', () => {
  const p = pipeline();
  p.calibrate();
  // 132 ms of low selected-side visibility while lifting (inside the 250 ms engine grace window).
  p.move(0, 120, 900, (ms) => (ms > 330 && ms <= 462 ? 0.1 : 1)); p.hold(120, 200); p.move(120, 0, 900); p.hold(0, 500);
  let completed = completedOf(p.events);
  assert.equal(completed.length, 1);
  assert.ok(completed[0].rep.coverage < 1 && completed[0].rep.coverage >= CURL_CONFIG.minCoverage);
  assert.ok(p.frames.some((f) => f.dropout));
  // Long loss mid-lift: 600 ms invisible.
  p.move(0, 60, 400);
  for (let i = 0; i < 18; i += 1) p.step(pose(80, 0.1));
  const interrupted = interruptedOf(p.events);
  assert.equal(interrupted.length, 1);
  assert.equal(interrupted[0].attempt.reason, 'tracking-loss');
  // Visible again at the top and lowering without recalibration: nothing completes.
  p.move(120, 0, 900); p.hold(0, 500);
  completed = completedOf(p.events);
  assert.equal(completed.length, 1, 'completed reps survive tracking loss and no rep completes across it');
  assert.equal(p.outputs.at(-1).repCount, 1);
  assert.equal(p.outputs.at(-1).paused, true);
  assert.equal(p.outputs.at(-1).pauseReason, 'calibration-required');
  // Recalibrate and curl again.
  p.calibrate();
  p.move(0, 120, 900); p.hold(120, 200); p.move(120, 0, 900); p.hold(0, 500);
  assert.equal(completedOf(p.events).length, 2);
  assert.deepEqual(completedOf(p.events).map((e) => e.rep.index), [1, 2]);
});

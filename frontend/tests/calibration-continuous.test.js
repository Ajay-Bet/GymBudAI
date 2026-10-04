// Continuous calibration mode (Ajay, 2026-10-04). Seeded synthetic landmarks only; these check the
// rolling-baseline logic and that counting no longer waits for a hold, not accuracy on people.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBiomechanicsEngine, CALIBRATION_MODES } from '../src/biomechanics/engine.js';
import { createCurlAnalyzer } from '../src/exercises/curl.js';
import { calibrationPose, seeded } from './fixtures/calibration-extension.js';

const engine = () => createBiomechanicsEngine({ side: 'left', view: 'side', calibrationMode: 'continuous' });

test('modes are explicit and the hold mode stays the engine default', () => {
  assert.deepEqual(CALIBRATION_MODES, ['hold', 'continuous']);
  assert.equal(createBiomechanicsEngine().calibrationMode, 'hold');
  assert.throws(() => createBiomechanicsEngine({ calibrationMode: 'auto' }), /Invalid calibration mode/);
});

test('continuous mode is ready on the first relaxed frame, with no hold', () => {
  const e = engine();
  const frame = e.update(calibrationPose(0, { flexion: 20 }));
  assert.equal(frame.ready, true);
  assert.equal(frame.calibration.mode, 'continuous');
  assert.ok(Math.abs(frame.calibration.baselineElbowFlexionDeg - 20) < 0.5);
});

test('starting mid-curl waits only until the arm is lowered once', () => {
  const e = engine();
  const bent = e.update(calibrationPose(0, { flexion: 110 }));
  assert.equal(bent.ready, false);
  assert.equal(bent.calibration.blockedReason, 'arm-not-relaxed');
  const lowered = e.update(calibrationPose(33, { flexion: 15 }));
  assert.equal(lowered.ready, true);
  // A later curl keeps the bottom reference instead of moving it up.
  const curled = e.update(calibrationPose(66, { flexion: 120 }));
  assert.ok(Math.abs(curled.calibration.baselineElbowFlexionDeg - 15) < 0.5);
});

test('baseline follows the rolling window and forgets bottoms older than 6 s', () => {
  const e = engine();
  let frame;
  for (let t = 0; t <= 1000; t += 33) frame = e.update(calibrationPose(t, { flexion: 10 }));
  assert.ok(Math.abs(frame.calibration.baselineElbowFlexionDeg - 10) < 0.5);
  for (let t = 1033; t <= 8000; t += 33) frame = e.update(calibrationPose(t, { flexion: 30 }));
  assert.ok(Math.abs(frame.calibration.baselineElbowFlexionDeg - 30) < 0.5);
});

test('a reposition clears the window and recalibrates on the next frame instead of blocking', () => {
  const e = engine();
  e.update(calibrationPose(0, { flexion: 20 }));
  const moved = e.update(calibrationPose(33, { flexion: 25, shift: 0.3 }));
  assert.equal(moved.ready, true);
  assert.ok(Math.abs(moved.calibration.baselineElbowFlexionDeg - 25) < 0.5);
});

test('reps count from the first curl with no still hold before it', () => {
  const random = seeded(11), e = engine(), analyzer = createCurlAnalyzer();
  let t = 0, last;
  const jitter = () => (random() - 0.5) * 0.0008;
  for (let rep = 0; rep < 4; rep += 1) {
    const start = t;
    while (t < start + 2000) { // 2 s curl from 20° to 140° and back, then straight into the next
      last = analyzer.update(e.update(calibrationPose(t, { flexion: 20 + 120 * Math.sin(Math.PI * (t - start) / 2000), jitter })));
      t += 33;
    }
  }
  for (const stop = t + 400; t < stop; t += 33) last = analyzer.update(e.update(calibrationPose(t, { flexion: 20, jitter })));
  assert.equal(last.repCount, 4);
});

import { isReliableLandmark } from '../vision/tracking.js';
import { angleDegrees, distance, signedTiltDegrees, toAspectPoint } from './geometry.js';

/**
 * Unvalidated engineering defaults. Every value is a tunable parameter that requires
 * reviewed human-camera examples before any detector-quality or coaching claim.
 * Times are milliseconds; confidence is MediaPipe visibility/presence (0-1); ratios are
 * torso-length fractions; angle ranges are degrees.
 * confidence is the acquire threshold; once a valid tracked frame exists the selected-side
 * joints only need releaseConfidence (hysteresis). A tracking dropout lasting no longer than
 * dropoutGraceMs keeps the calibration baseline (frame values stay null); a longer dropout
 * clears it. releaseConfidence and dropoutGraceMs are also unvalidated.
 */
export const DEFAULT_CONFIG = Object.freeze({ confidence: 0.5, releaseConfidence: 0.3, dropoutGraceMs: 250,
  smoothingMs: 100, maxGapMs: 500,
  calibrationMs: 1000, calibrationMinFrames: 8, maxCalibrationFlexionDeg: 45, maxOrientationRatio: 0.45,
  stableAngleRangeDeg: 8, stablePositionRange: 0.06, repositionRatio: 0.3,
  continuousWindowMs: 6000, continuousBottomPercentile: 0.1, continuousBottomBandDeg: 10 });
/**
 * Calibration modes. 'hold' (Sprint 2): collect calibrationMs of a still, relaxed arm before any
 * measurement. 'continuous' (Ajay, 2026-10-04): no waiting; every valid frame updates a rolling
 * baseline from the last continuousWindowMs of tracked, side-on frames. The elbow baseline is the
 * continuousBottomPercentile of relaxed-eligible flexion (<= maxCalibrationFlexionDeg); torso,
 * upper-arm and elbow-position references are means over frames within continuousBottomBandDeg of
 * that bottom. Ready as soon as one relaxed-eligible frame is in the window. A shoulder jump over
 * repositionRatio clears the window instead of asking for recalibration. Unvalidated defaults.
 * Known limits: the bottom follows the user's lowest recent position, so habitual partial lowering
 * shifts it, and torso/arm references move with the user.
 */
export const CALIBRATION_MODES = Object.freeze(['hold', 'continuous']);
/**
 * Feature contract shared with UI and validation. Displacement and velocity of the elbow
 * relative to the shoulder are divided by the current smoothed shoulder-hip (torso) segment length of
 * the selected anatomical side, measured in aspect-corrected unmirrored image coordinates.
 */
export const FEATURE_SCHEMA = Object.freeze({
  version: '1.2.0',
  coordinateSpace: 'unmirrored-image-height',
  units: Object.freeze({ elbowInteriorDeg: 'deg', elbowFlexionDeg: 'deg', torsoTiltDeg: 'deg',
    upperArmTiltDeg: 'deg', elbowDisplacement: 'torso-lengths', upperArmDriftDeg: 'deg',
    torsoDeviationDeg: 'deg', elbowAngularVelocityDegS: 'deg/s', elbowVelocityPerS: 'torso-lengths/s' }),
  // 1.2.0 (Sprint 4, additive): blockedReason and monotonic collection progress.
  normalization: 'elbowDisplacement and elbowVelocityPerS use the elbow position relative to the shoulder divided by the current smoothed shoulder-hip (torso) segment length for the selected side; angles are unnormalized degrees.',
});

/**
 * @typedef {Object} CalibrationSnapshot
 * @property {'uncalibrated'|'collecting'|'ready'} status
 * @property {number} progress 0-1; highest collection progress since a hard reset.
 *   Trimming movement evidence does not lower this display value; readiness always uses the
 *   actual contiguous retained observation window (1000 ms and at least 8 frames by default).
 * @property {string|null} blockedReason Specific positioning or stability blocker.
 * @property {string} message User-facing guidance.
 * @property {'hold'|'continuous'} mode Calibration mode (additive, 2026-10-04).
 * @property {number|null} baselineElbowFlexionDeg Mean raw (unsmoothed) elbow flexion in degrees over
 *   the accepted calibration samples (relaxed arm). A number only while status is 'ready'; otherwise
 *   null. Added in feature schema 1.1.0 for analyzer thresholds relative to the calibrated bottom.
 */

/**
 * @typedef {Object} FeatureFrame
 * @property {string} version FEATURE_SCHEMA.version.
 * @property {number|null} timestampMs Source frame timestamp; null when invalid.
 * @property {'left'|'right'} side Selected anatomical side (unaffected by preview mirroring).
 * @property {string} view Selected camera view.
 * @property {string} coordinateSpace FEATURE_SCHEMA.coordinateSpace.
 * @property {Object<string,string>} units FEATURE_SCHEMA.units.
 * @property {boolean} ready Calibration ready, orientation valid and tracking active.
 * @property {string} trackingState Tracking state supplied by vision.
 * @property {CalibrationSnapshot} calibration
 * @property {{valid: boolean, ratio: number|null, farSideReliable: boolean}} orientation Approximate
 *   side-on check; far-side shoulder/hip may be low-visibility estimates (farSideReliable false).
 * @property {Object<string,number|null>} raw Unsmoothed geometry (degrees).
 * @property {Object<string,number|null>} smoothed Smoothed geometry (degrees).
 * @property {Object<string,number|null>} values Published features keyed as FEATURE_SCHEMA.units.
 * @property {Object<string,boolean>} validity Per-feature flag. A feature that was not observed
 *   has value null and validity false; missing evidence is never replaced by zero.
 * @property {string[]} reasons Machine-readable reasons a frame is not fully valid.
 * @property {boolean} dropout True while tracking is unreliable but within dropoutGraceMs of the
 *   first unreliable frame after valid tracking; values are still null/invalid and ready false, but
 *   the calibration baseline is kept. False otherwise.
 */

const GEOMETRY_KEYS = ['elbowInteriorDeg', 'elbowFlexionDeg', 'torsoTiltDeg', 'upperArmTiltDeg'];
const KEYS = [...GEOMETRY_KEYS, 'elbowDisplacement', 'upperArmDriftDeg', 'torsoDeviationDeg', 'elbowAngularVelocityDegS', 'elbowVelocityPerS'];
const empty = (keys) => Object.fromEntries(keys.map((key) => [key, null]));
const angularDifference = (a, b) => ((a - b + 540) % 360) - 180;
function geometry(points) {
  const [shoulder, elbow, wrist, hip] = points;
  const interior = angleDegrees(shoulder, elbow, wrist);
  return { elbowInteriorDeg: interior, elbowFlexionDeg: interior === null ? null : 180 - interior,
    torsoTiltDeg: signedTiltDegrees(shoulder, hip), upperArmTiltDeg: signedTiltDegrees(shoulder, elbow) };
}
export function createBiomechanicsEngine({ side = 'left', view = 'side', config = {}, calibrationMode = 'hold' } = {}) {
  const settings = { ...DEFAULT_CONFIG, ...config };
  if (!['left', 'right'].includes(side)) throw new Error('Choose left or right anatomical side.');
  if (!CALIBRATION_MODES.includes(calibrationMode)) throw new Error(`Invalid calibration mode: ${calibrationMode}`);
  const continuous = calibrationMode === 'continuous';
  for (const [key, value] of Object.entries(settings)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid biomechanics config: ${key}`);
  }
  let lastTimestamp = null, dimensions = null, filtered = null, previous = null, baseline = null, samples = [];
  let dropoutSince = null, history = [];
  const releaseConfidence = Math.min(settings.releaseConfidence, settings.confidence);
  const WAITING_CONTINUOUS = 'Stand side-on with your selected arm in view; calibration updates automatically.';
  let calibration = { status: 'uncalibrated', progress: 0, message: continuous ? WAITING_CONTINUOUS : 'Choose your side, stand sideways and calibrate with your arm relaxed.' };
  const snapshot = () => ({ blockedReason: null, ...calibration, mode: calibrationMode,
    baselineElbowFlexionDeg: calibration.status === 'ready' && baseline ? baseline.elbowFlexion : null });
  function reset(reason = 'Calibration cleared. Hold still and calibrate again.') {
    lastTimestamp = null; dimensions = null; filtered = null; previous = null; baseline = null; samples = [];
    dropoutSince = null; history = [];
    calibration = { status: 'uncalibrated', progress: 0, message: continuous ? WAITING_CONTINUOUS : reason };
    return snapshot();
  }
  function invalidate(reason, blockedReason = null) {
    filtered = null; previous = null; baseline = null; samples = []; dropoutSince = null; history = [];
    if (continuous) { calibration = { status: 'uncalibrated', progress: 0, message: reason, blockedReason }; return; }
    if (calibration.status === 'collecting') calibration = { status: 'collecting', progress: 0, message: reason, blockedReason };
    else calibration = { status: 'uncalibrated', progress: 0, message: reason, blockedReason };
  }
  function update(result, tracking = { state: 'active' }) {
    const timestamp = result?.timestampMs;
    const frame = { version: FEATURE_SCHEMA.version, timestampMs: Number.isFinite(timestamp) ? timestamp : null, side, view,
      coordinateSpace: FEATURE_SCHEMA.coordinateSpace, units: FEATURE_SCHEMA.units, ready: false, trackingState: tracking?.state ?? 'lost',
      calibration: snapshot(), orientation: { valid: false, ratio: null, farSideReliable: false }, raw: empty(GEOMETRY_KEYS),
      smoothed: empty(GEOMETRY_KEYS), values: empty(KEYS), validity: Object.fromEntries(KEYS.map((k) => [k, false])), reasons: [],
      dropout: false };
    function finish(reason) {
      if (reason) frame.reasons.push(reason);
      frame.calibration = snapshot();
      frame.ready = calibration.status === 'ready' && frame.orientation.valid && tracking?.state === 'active';
      frame.validity = Object.fromEntries(KEYS.map((key) => [key, Number.isFinite(frame.values[key])]));
      return frame;
    }
    if (!Number.isFinite(timestamp) || timestamp < 0 || (lastTimestamp !== null && timestamp <= lastTimestamp)) {
      invalidate('Invalid or out-of-order timestamp. Calibrate again.', 'tracking-gap');
      return finish('invalid-timestamp');
    }
    const dt = lastTimestamp === null ? null : timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    if (dt !== null && dt > settings.maxGapMs) invalidate('Tracking gap. Calibrate again.', 'tracking-gap');
    const width = result?.sourceWidth, height = result?.sourceHeight;
    if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      invalidate('Invalid camera dimensions.'); return finish('invalid-dimensions');
    }
    const nextDimensions = `${width}:${height}`;
    if (dimensions !== null && dimensions !== nextDimensions) invalidate('Camera dimensions changed. Calibrate again.');
    dimensions = nextDimensions;
    const indices = side === 'left' ? [11, 13, 15, 23] : [12, 14, 16, 24];
    const landmarks = result?.landmarks ?? [];
    const reliableAt = (threshold) => (index) => isReliableLandmark(landmarks[index], threshold)
      && (landmarks[index].presence === undefined || Number.isFinite(landmarks[index].presence));
    const reliable = reliableAt(settings.confidence);
    // Hysteresis: after a valid tracked frame, selected-side joints only need releaseConfidence.
    const selectedReliable = reliableAt(filtered ? releaseConfidence : settings.confidence);
    if (tracking?.state !== 'active' || !indices.every(selectedReliable)) {
      // Short dropout after valid tracking: keep baseline/calibration and the smoothing state, but
      // publish nothing for this frame and drop `previous` so velocity never spans the gap.
      if (filtered && calibration.status !== 'collecting') {
        dropoutSince ??= timestamp;
        if (timestamp - dropoutSince <= settings.dropoutGraceMs) {
          previous = null;
          frame.dropout = true;
          calibration.blockedReason = tracking?.state !== 'active' ? 'tracking-gap'
            : `joints-not-visible:${['shoulder', 'elbow', 'wrist', 'hip'][indices.findIndex((i) => !selectedReliable(i))]}`;
          return finish('tracking-unreliable');
        }
      }
      const missing = indices.findIndex((i) => !selectedReliable(i));
      invalidate('Keep your selected shoulder, elbow, wrist and hip visible and wait for stable tracking.',
        missing >= 0 ? `joints-not-visible:${['shoulder', 'elbow', 'wrist', 'hip'][missing]}` : 'tracking-gap');
      return finish('tracking-unreliable');
    }
    // First reliable frame after a grace-window dropout: restart smoothing from the current raw
    // points so the filter does not lag through movement made during the gap. Baseline and
    // calibration are kept; `previous` is already null, so velocity resumes on the next frame.
    if (dropoutSince !== null) filtered = null;
    dropoutSince = null;
    calibration.blockedReason = null;
    const points = indices.map((i) => toAspectPoint(landmarks[i], width, height));
    frame.raw = geometry(points);
    const torso = distance(points[0], points[3]);
    if (torso < 1e-6 || Object.values(frame.raw).some((value) => value === null)) {
      invalidate('Body reference or joint geometry is degenerate.'); return finish('degenerate-geometry');
    }
    // Selected-side shoulder/hip are already reliable. In a true side view the far-side joints are
    // often occluded, so any finite estimated coordinate is accepted for the width ratio.
    const farIndices = side === 'left' ? [12, 24] : [11, 23];
    frame.orientation.farSideReliable = farIndices.every(reliable);
    const far = farIndices.map((i) => toAspectPoint(landmarks[i], width, height));
    if (far.every((p) => p !== null)) {
      frame.orientation.ratio = Math.max(distance(points[0], far[0]), distance(points[3], far[1])) / torso;
      frame.orientation.valid = view === 'side' && frame.orientation.ratio <= settings.maxOrientationRatio;
    }
    if (!frame.orientation.valid) {
      invalidate('Use a side-on view with your selected shoulder and hip visible; far-side joints may be hidden. This is an approximate orientation check.', 'not-side-on');
      return finish('unsupported-or-unreliable-view');
    }
    if (continuous) {
      const latest = history.at(-1);
      if (latest && (distance(points[0], latest.shoulder) / latest.torso > settings.repositionRatio
        || Math.abs(torso / latest.torso - 1) > settings.repositionRatio)) history = [];
    } else if (baseline && (distance(points[0], baseline.shoulder) / baseline.torso > settings.repositionRatio
      || Math.abs(torso / baseline.torso - 1) > settings.repositionRatio)) {
      invalidate('Position or camera scale changed. Calibrate again.');
    }
    if (!filtered) filtered = points.map((p) => ({ ...p }));
    else filtered = points.map((p, i) => {
      const source = landmarks[indices[i]];
      const confidence = Math.min(1, source.visibility, source.presence ?? 1);
      const alpha = 1 - Math.exp(-dt * confidence / settings.smoothingMs);
      return { x: filtered[i].x + alpha * (p.x - filtered[i].x), y: filtered[i].y + alpha * (p.y - filtered[i].y) };
    });
    frame.smoothed = geometry(filtered);
    Object.assign(frame.values, frame.smoothed);
    // Smoothed vector uses the smoothed torso length so raw torso jitter does not leak in.
    const smoothedTorso = distance(filtered[0], filtered[3]);
    const relative = smoothedTorso === null || smoothedTorso < 1e-6 ? null
      : { x: (filtered[1].x - filtered[0].x) / smoothedTorso, y: (filtered[1].y - filtered[0].y) / smoothedTorso };
    const rawRelative = { x: (points[1].x - points[0].x) / torso, y: (points[1].y - points[0].y) / torso };
    if (previous && dt > 0 && dt <= settings.maxGapMs) {
      frame.values.elbowAngularVelocityDegS = (frame.smoothed.elbowFlexionDeg - previous.flexion) / (dt / 1000);
      if (relative && previous.relative) frame.values.elbowVelocityPerS = distance(relative, previous.relative) / (dt / 1000);
    }
    previous = { flexion: frame.smoothed.elbowFlexionDeg, relative };
    if (calibration.status === 'collecting') {
      const sample = { timestamp, geometry: frame.raw, relative: rawRelative, shoulder: points[0], torso };
      // A bent arm is not a relaxed-bottom reference. This is an unvalidated engineering
      // eligibility bound, not a physical assessment or an exercise form rule.
      if (frame.raw.elbowFlexionDeg > settings.maxCalibrationFlexionDeg) {
        samples = [];
        calibration.progress = 0;
        calibration.blockedReason = 'arm-not-relaxed';
        calibration.message = 'Relax and lower your selected arm before calibrating.';
        return finish();
      }
      samples.push(sample);
      const consistent = (reference, s) => !GEOMETRY_KEYS.some((key) =>
        Math.abs(angularDifference(s.geometry[key], reference.geometry[key])) > settings.stableAngleRangeDeg)
        && distance(s.relative, reference.relative) <= settings.stablePositionRange
        && distance(s.shoulder, reference.shoulder) / reference.torso <= settings.stablePositionRange
        && Math.abs(s.torso / reference.torso - 1) <= settings.stablePositionRange;
      // Keep the longest contiguous valid suffix instead of throwing away every observation.
      // Each retained observation passes precisely the original first-reference gates. No
      // median/outlier exclusion, invalid gap bridging, or widened stability tolerance is used.
      let trim = 0;
      while (trim < samples.length - 1 && !samples.slice(trim).every((s) => consistent(samples[trim], s))) trim += 1;
      const unstable = trim > 0;
      if (unstable) samples = samples.slice(trim);
      const elapsed = timestamp - samples[0].timestamp;
      calibration.progress = Math.max(calibration.progress,
        Math.min(0.99, elapsed / settings.calibrationMs, samples.length / settings.calibrationMinFrames));
      calibration.blockedReason = unstable ? 'moving' : null;
      calibration.message = unstable ? 'Movement detected. Hold your relaxed arm and torso still.' : 'Hold still while the baseline is collected.';
      if (elapsed >= settings.calibrationMs && samples.length >= settings.calibrationMinFrames) {
        const mean = (fn) => samples.reduce((sum, s) => sum + fn(s), 0) / samples.length;
        baseline = { torso: mean((s) => s.torso), shoulder: { x: mean((s) => s.shoulder.x), y: mean((s) => s.shoulder.y) },
          relative: { x: mean((s) => s.relative.x), y: mean((s) => s.relative.y) },
          upperArm: mean((s) => s.geometry.upperArmTiltDeg), torsoTilt: mean((s) => s.geometry.torsoTiltDeg),
          elbowFlexion: mean((s) => s.geometry.elbowFlexionDeg) };
        samples = [];
        calibration = { status: 'ready', progress: 1, message: 'Calibration ready for local feature measurements.' };
      }
    }
    if (continuous) {
      history.push({ timestamp, geometry: frame.raw, relative: rawRelative, shoulder: points[0], torso });
      while (history.length && timestamp - history[0].timestamp > settings.continuousWindowMs) history.shift();
      const eligible = history.filter((s) => s.geometry.elbowFlexionDeg <= settings.maxCalibrationFlexionDeg);
      if (!eligible.length) {
        baseline = null;
        calibration = { status: 'uncalibrated', progress: 0, blockedReason: 'arm-not-relaxed',
          message: 'Lower your selected arm fully once; counting starts from your lowest position.' };
      } else {
        const sorted = eligible.map((s) => s.geometry.elbowFlexionDeg).sort((a, b) => a - b);
        const bottom = sorted[Math.min(sorted.length - 1, Math.floor(settings.continuousBottomPercentile * sorted.length))];
        const near = eligible.filter((s) => s.geometry.elbowFlexionDeg <= bottom + settings.continuousBottomBandDeg);
        const mean = (fn) => near.reduce((sum, s) => sum + fn(s), 0) / near.length;
        baseline = { torso: mean((s) => s.torso), shoulder: { x: mean((s) => s.shoulder.x), y: mean((s) => s.shoulder.y) },
          relative: { x: mean((s) => s.relative.x), y: mean((s) => s.relative.y) },
          upperArm: mean((s) => s.geometry.upperArmTiltDeg), torsoTilt: mean((s) => s.geometry.torsoTiltDeg), elbowFlexion: bottom };
        calibration = { status: 'ready', progress: 1, message: 'Calibrating continuously from your lowest arm position.' };
      }
    }
    if (baseline) {
      if (relative) frame.values.elbowDisplacement = distance(relative, baseline.relative);
      frame.values.upperArmDriftDeg = angularDifference(frame.smoothed.upperArmTiltDeg, baseline.upperArm);
      frame.values.torsoDeviationDeg = angularDifference(frame.smoothed.torsoTiltDeg, baseline.torsoTilt);
    }
    return finish();
  }
  return { update, reset, getCalibration: snapshot,
    calibrationMode,
    calibrate() { reset(); if (continuous) return snapshot(); calibration = { status: 'collecting', progress: 0, message: 'Hold still with your arm relaxed at your side.' }; return snapshot(); },
    setSide(next) { if (!['left', 'right'].includes(next)) throw new Error('Choose left or right anatomical side.'); side = next; return reset('Side changed. Calibrate the selected arm.'); },
    setView(next) { view = next; return reset('View changed. Side-on view and calibration are required.'); } };
}

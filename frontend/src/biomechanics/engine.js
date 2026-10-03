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
  calibrationMs: 1000, calibrationMinFrames: 8, maxOrientationRatio: 0.45,
  stableAngleRangeDeg: 8, stablePositionRange: 0.06, repositionRatio: 0.3 });
/**
 * Feature contract shared with UI and validation. Displacement and velocity of the elbow
 * relative to the shoulder are divided by the current smoothed shoulder-hip (torso) segment length of
 * the selected anatomical side, measured in aspect-corrected unmirrored image coordinates.
 */
export const FEATURE_SCHEMA = Object.freeze({
  version: '1.0.0',
  coordinateSpace: 'unmirrored-image-height',
  units: Object.freeze({ elbowInteriorDeg: 'deg', elbowFlexionDeg: 'deg', torsoTiltDeg: 'deg',
    upperArmTiltDeg: 'deg', elbowDisplacement: 'torso-lengths', upperArmDriftDeg: 'deg',
    torsoDeviationDeg: 'deg', elbowAngularVelocityDegS: 'deg/s', elbowVelocityPerS: 'torso-lengths/s' }),
  normalization: 'elbowDisplacement and elbowVelocityPerS use the elbow position relative to the shoulder divided by the current smoothed shoulder-hip (torso) segment length for the selected side; angles are unnormalized degrees.',
});

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
 * @property {{status: string, progress: number, message: string}} calibration
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
export function createBiomechanicsEngine({ side = 'left', view = 'side', config = {} } = {}) {
  const settings = { ...DEFAULT_CONFIG, ...config };
  if (!['left', 'right'].includes(side)) throw new Error('Choose left or right anatomical side.');
  for (const [key, value] of Object.entries(settings)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid biomechanics config: ${key}`);
  }
  let lastTimestamp = null, dimensions = null, filtered = null, previous = null, baseline = null, samples = [];
  let dropoutSince = null;
  const releaseConfidence = Math.min(settings.releaseConfidence, settings.confidence);
  let calibration = { status: 'uncalibrated', progress: 0, message: 'Choose your side, stand sideways and calibrate with your arm relaxed.' };
  const snapshot = () => ({ ...calibration });
  function reset(reason = 'Calibration cleared. Hold still and calibrate again.') {
    lastTimestamp = null; dimensions = null; filtered = null; previous = null; baseline = null; samples = [];
    dropoutSince = null;
    calibration = { status: 'uncalibrated', progress: 0, message: reason };
    return snapshot();
  }
  function invalidate(reason) {
    filtered = null; previous = null; baseline = null; samples = []; dropoutSince = null;
    if (calibration.status === 'collecting') calibration = { status: 'collecting', progress: 0, message: reason };
    else calibration = { status: 'uncalibrated', progress: 0, message: reason };
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
      invalidate('Invalid or out-of-order timestamp. Calibrate again.');
      return finish('invalid-timestamp');
    }
    const dt = lastTimestamp === null ? null : timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    if (dt !== null && dt > settings.maxGapMs) invalidate('Tracking gap. Calibrate again.');
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
          return finish('tracking-unreliable');
        }
      }
      invalidate('Keep your selected shoulder, elbow, wrist and hip visible and wait for stable tracking.');
      return finish('tracking-unreliable');
    }
    // First reliable frame after a grace-window dropout: restart smoothing from the current raw
    // points so the filter does not lag through movement made during the gap. Baseline and
    // calibration are kept; `previous` is already null, so velocity resumes on the next frame.
    if (dropoutSince !== null) filtered = null;
    dropoutSince = null;
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
      invalidate('Use a side-on view with your selected shoulder and hip visible; far-side joints may be hidden. This is an approximate orientation check.');
      return finish('unsupported-or-unreliable-view');
    }
    if (baseline && (distance(points[0], baseline.shoulder) / baseline.torso > settings.repositionRatio
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
      samples.push(sample);
      const first = samples[0];
      const unstable = samples.some((s) => GEOMETRY_KEYS.some((key) => Math.abs(angularDifference(s.geometry[key], first.geometry[key])) > settings.stableAngleRangeDeg)
        || distance(s.relative, first.relative) > settings.stablePositionRange
        || distance(s.shoulder, first.shoulder) / first.torso > settings.stablePositionRange
        || Math.abs(s.torso / first.torso - 1) > settings.stablePositionRange);
      if (unstable) samples = [sample];
      const elapsed = timestamp - samples[0].timestamp;
      calibration.progress = Math.min(1, elapsed / settings.calibrationMs, samples.length / settings.calibrationMinFrames);
      calibration.message = unstable ? 'Movement detected. Hold your relaxed arm and torso still.' : 'Hold still while the baseline is collected.';
      if (elapsed >= settings.calibrationMs && samples.length >= settings.calibrationMinFrames) {
        const mean = (fn) => samples.reduce((sum, s) => sum + fn(s), 0) / samples.length;
        baseline = { torso: mean((s) => s.torso), shoulder: { x: mean((s) => s.shoulder.x), y: mean((s) => s.shoulder.y) },
          relative: { x: mean((s) => s.relative.x), y: mean((s) => s.relative.y) },
          upperArm: mean((s) => s.geometry.upperArmTiltDeg), torsoTilt: mean((s) => s.geometry.torsoTiltDeg) };
        samples = [];
        calibration = { status: 'ready', progress: 1, message: 'Calibration ready for local feature measurements.' };
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
    calibrate() { reset(); calibration = { status: 'collecting', progress: 0, message: 'Hold still with your arm relaxed at your side.' }; return snapshot(); },
    setSide(next) { if (!['left', 'right'].includes(next)) throw new Error('Choose left or right anatomical side.'); side = next; return reset('Side changed. Calibrate the selected arm.'); },
    setView(next) { view = next; return reset('View changed. Side-on view and calibration are required.'); } };
}

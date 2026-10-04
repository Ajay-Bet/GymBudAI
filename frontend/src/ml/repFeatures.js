/** Shared offline/browser rep-end measurements. Never use this vector within a rep. */
export const FEATURE_ORDER = Object.freeze(['durationMs', 'minFlexionDeg', 'maxFlexionDeg', 'romDeg',
  'maxAbsTorsoDeg', 'maxAbsDriftDeg', 'medianAbsVelocityDegS', 'formCoverage']);
export const REP_FEATURE_SCHEMA = Object.freeze({ version: 'rep-end-v1', featureOrder: FEATURE_ORDER,
  units: ['ms', 'deg', 'deg', 'deg', 'deg', 'deg', 'deg/s', 'fraction'],
  missing: null, bounds: 'inclusive source timestamps; rep completion only', coverageGapMs: 150,
  biomechanicsVersion: '1.2.0' });
const median = (xs) => { const sorted = [...xs].sort((a, b) => a - b), n = sorted.length;
  return n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null; };
export function aggregateRepFeatures(frames, { startMs, endMs } = {}) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error('Invalid rep bounds');
  // Reject duplicates/out-of-order observations; sorting would hide broken source continuity.
  let previous = -Infinity;
  const selected = frames.filter((frame) => {
    const t = frame?.timestampMs;
    if (!Number.isFinite(t) || t < startMs || t > endMs || t <= previous) return false;
    previous = t; return true;
  });
  for (const key of ['side', 'view', 'version']) {
    if (new Set(selected.map((f) => f[key]).filter((v) => v !== undefined)).size > 1) throw new Error(`Mixed rep ${key}`);
  }
  const ready = (f) => f.ready === true && f.trackingState === 'active';
  const observed = (key) => selected.filter((f) => ready(f) && f.validity?.[key] === true && Number.isFinite(f.values?.[key])).map((f) => f.values[key]);
  const flex = observed('elbowFlexionDeg'), torso = observed('torsoDeviationDeg').map(Math.abs), drift = observed('upperArmDriftDeg').map(Math.abs);
  let covered = 0;
  for (let i = 1; i < selected.length; i += 1) {
    const a = selected[i - 1], b = selected[i], dt = b.timestampMs - a.timestampMs;
    if (ready(a) && ready(b) && ['elbowFlexionDeg', 'torsoDeviationDeg', 'upperArmDriftDeg'].every((k) =>
      a.validity?.[k] === true && b.validity?.[k] === true && Number.isFinite(a.values?.[k]) && Number.isFinite(b.values?.[k]))
      && dt <= REP_FEATURE_SCHEMA.coverageGapMs) covered += dt;
  }
  const min = flex.length ? Math.min(...flex) : null, max = flex.length ? Math.max(...flex) : null;
  const values = { durationMs: endMs - startMs, minFlexionDeg: min, maxFlexionDeg: max,
    romDeg: min === null ? null : max - min, maxAbsTorsoDeg: torso.length ? Math.max(...torso) : null,
    maxAbsDriftDeg: drift.length ? Math.max(...drift) : null,
    medianAbsVelocityDegS: median(observed('elbowAngularVelocityDegS').map(Math.abs)),
    formCoverage: selected.length ? covered / (endMs - startMs) : null };
  return { schemaVersion: REP_FEATURE_SCHEMA.version, featureOrder: FEATURE_ORDER, values,
    vector: FEATURE_ORDER.map((key) => values[key]), startMs, endMs,
    frameCount: selected.length, validFrameCount: selected.filter(ready).length };
}

/** Rep-end ranges from side-on tracked geometry. Calibration baselines are not inputs. */
export const WINDOW_FEATURE_ORDER = Object.freeze(['durationMs', 'minFlexionDeg', 'maxFlexionDeg', 'romDeg',
  'torsoRangeDeg', 'upperArmRangeDeg', 'medianAbsVelocityDegS', 'geometryCoverage']);
export const WINDOW_FEATURE_SCHEMA = Object.freeze({ version: 'rep-end-v2', featureOrder: WINDOW_FEATURE_ORDER,
  units: ['ms', 'deg', 'deg', 'deg', 'deg', 'deg', 'deg/s', 'fraction'],
  missing: null, bounds: 'annotation intervals are half-open; analyzer rep end is inclusive',
  coverageGapMs: 150, minCoverage: 0.8, biomechanicsVersion: '1.2.0', predictionTiming: 'rep-end',
  eligibility: 'active tracking, side view, valid orientation, finite smoothed elbow/torso/upper-arm angles' });

const angleOf = (frame, key) => {
  const smoothed = frame?.smoothed?.[key];
  if (Number.isFinite(smoothed)) return smoothed;
  const value = frame?.values?.[key];
  return Number.isFinite(value) ? value : null;
};
export function windowFrameEligible(frame) {
  return frame?.trackingState === 'active' && frame?.dropout !== true && frame?.view === 'side'
    && frame?.orientation?.valid === true
    && ['elbowFlexionDeg', 'torsoTiltDeg', 'upperArmTiltDeg'].every((key) => angleOf(frame, key) !== null);
}
const rangeOrAbstain = (values) => {
  if (!values.length) return null;
  const span = Math.max(...values) - Math.min(...values);
  return span <= 180 ? span : null;
};
export function aggregateWindowFeatures(frames, { startMs, endMs, endExclusive = false } = {}) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error('Invalid rep bounds');
  let previous = -Infinity;
  const selected = [];
  for (const frame of frames) {
    const t = frame?.timestampMs;
    const inside = Number.isFinite(t) && t >= startMs && (endExclusive ? t < endMs : t <= endMs);
    if (!inside || t <= previous) continue;
    previous = t;
    selected.push(frame);
  }
  for (const key of ['side', 'view', 'version']) {
    if (new Set(selected.map((frame) => frame[key]).filter((value) => value !== undefined)).size > 1) throw new Error(`Mixed rep ${key}`);
  }
  const eligible = selected.filter(windowFrameEligible);
  const flex = eligible.map((frame) => angleOf(frame, 'elbowFlexionDeg'));
  const torso = eligible.map((frame) => angleOf(frame, 'torsoTiltDeg'));
  const upper = eligible.map((frame) => angleOf(frame, 'upperArmTiltDeg'));
  const velocity = eligible.map((frame) => frame.values?.elbowAngularVelocityDegS).filter(Number.isFinite).map(Math.abs);
  let covered = 0;
  for (let index = 1; index < selected.length; index += 1) {
    const before = selected[index - 1], after = selected[index], dt = after.timestampMs - before.timestampMs;
    if (windowFrameEligible(before) && windowFrameEligible(after) && dt > 0 && dt <= WINDOW_FEATURE_SCHEMA.coverageGapMs) covered += dt;
  }
  const min = flex.length ? Math.min(...flex) : null, max = flex.length ? Math.max(...flex) : null;
  const values = { durationMs: endMs - startMs, minFlexionDeg: min, maxFlexionDeg: max,
    romDeg: min === null ? null : max - min, torsoRangeDeg: rangeOrAbstain(torso), upperArmRangeDeg: rangeOrAbstain(upper),
    medianAbsVelocityDegS: median(velocity), geometryCoverage: selected.length ? covered / (endMs - startMs) : 0 };
  return { schemaVersion: WINDOW_FEATURE_SCHEMA.version, featureOrder: WINDOW_FEATURE_ORDER, values,
    vector: WINDOW_FEATURE_ORDER.map((key) => values[key]), startMs, endMs, endExclusive,
    frameCount: selected.length, eligibleFrameCount: eligible.length };
}

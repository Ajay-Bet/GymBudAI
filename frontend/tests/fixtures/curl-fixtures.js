// Sprint 3 labeled SYNTHETIC FeatureFrame fixtures for the dumbbell curl analyzer.
// Frames are shaped like biomechanics/engine.js FeatureFrame 1.1.0 but are generated from a
// scripted elbow-flexion profile with a seeded PRNG. They prove analyzer logic and arithmetic
// only; they are not recordings of a person and carry no physical-accuracy claim.
//
// Each fixture: { name, description, synthetic: true, frames, expected }.
// expected.completed      exact number of completed reps.
// expected.interrupted    exact multiset of interrupted reasons (array), or undefined when the
//                         contract does not pin it down (see expected.note).
// expected.interruptedAtLeast  reasons that must appear at least once (when exact is undefined).

export const FIXTURE_FEATURE_VERSION = '1.1.0';
const UNITS = Object.freeze({ elbowInteriorDeg: 'deg', elbowFlexionDeg: 'deg', torsoTiltDeg: 'deg',
  upperArmTiltDeg: 'deg', elbowDisplacement: 'torso-lengths', upperArmDriftDeg: 'deg',
  torsoDeviationDeg: 'deg', elbowAngularVelocityDegS: 'deg/s', elbowVelocityPerS: 'torso-lengths/s' });
const KEYS = Object.keys(UNITS);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  const u = Math.max(rng(), 1e-12), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const ease = (p) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)));

/**
 * Build one FeatureFrame-shaped object.
 * tracking: 'valid' | 'dropout' (inside engine grace window) | 'lost' (beyond grace, baseline cleared)
 *           | 'calibrating' (recalibration after a long loss; values present, not ready).
 */
export function makeFrame({ timestampMs, flexionDeg, torsoDeg = 0, driftDeg = 0, displacement = 0,
  tracking = 'valid', baselineElbowFlexionDeg = 10, side = 'left', view = 'side', missing = [] }) {
  const values = Object.fromEntries(KEYS.map((k) => [k, null]));
  const observed = tracking === 'valid' || tracking === 'calibrating';
  if (observed) {
    values.elbowFlexionDeg = flexionDeg;
    values.elbowInteriorDeg = 180 - flexionDeg;
    values.upperArmTiltDeg = driftDeg;
    values.torsoTiltDeg = torsoDeg;
    if (tracking === 'valid') {
      values.upperArmDriftDeg = driftDeg;
      values.torsoDeviationDeg = torsoDeg;
      values.elbowDisplacement = displacement;
    }
    for (const key of missing) values[key] = null;
  }
  const calibrationReady = tracking === 'valid' || tracking === 'dropout';
  const calibration = calibrationReady
    ? { status: 'ready', progress: 1, message: 'Calibration ready for local feature measurements.', baselineElbowFlexionDeg }
    : tracking === 'calibrating'
      ? { status: 'collecting', progress: 0.5, message: 'Hold still while the baseline is collected.', baselineElbowFlexionDeg: null }
      : { status: 'uncalibrated', progress: 0, message: 'Keep your selected shoulder, elbow, wrist and hip visible.', baselineElbowFlexionDeg: null };
  const reasons = tracking === 'dropout' || tracking === 'lost' ? ['tracking-unreliable'] : [];
  return {
    version: FIXTURE_FEATURE_VERSION, timestampMs, side, view, coordinateSpace: 'unmirrored-image-height', units: UNITS,
    ready: tracking === 'valid', trackingState: tracking === 'lost' ? 'lost' : 'active', calibration,
    orientation: { valid: observed, ratio: observed ? 0.1 : null, farSideReliable: false },
    raw: {}, smoothed: {}, values,
    validity: Object.fromEntries(KEYS.map((k) => [k, Number.isFinite(values[k])])),
    reasons, dropout: tracking === 'dropout',
  };
}

/**
 * Render a script of segments into frames.
 * Segment: { ms, to?, linear?, tracking?, torso?, drift?, displacement?, osc?: {amp, hz}, stall? }
 *  - `linear: true` moves at constant angular speed instead of the cosine ease.
 *  - `stall: true` emits no frames at all for the segment (worker/inference stall, not a dropout).
 *  - `to` moves the true elbow flexion to that angle with a cosine ease over `ms`; omitted = hold.
 *  - torso/drift/displacement linearly ramp to the given target within the segment.
 *  - The angle keeps evolving during dropout/lost segments (the person keeps moving).
 */
export function render({ seed = 1, fps = 30, baseline = 10, side = 'left', view = 'side', startMs = 1000,
  noiseDeg = 0.6, spacingJitter = 0.25, dropFrameProb = 0.03, missing = [], startAngle, script }) {
  const rng = mulberry32(seed);
  const step = 1000 / fps;
  const frames = [];
  let t = startMs, angle = startAngle ?? baseline, torso = 0, drift = 0, disp = 0;
  for (const seg of script) {
    const from = { angle, torso, drift, disp };
    const end = t + seg.ms;
    const target = { angle: seg.to ?? angle, torso: seg.torso ?? torso, drift: seg.drift ?? drift, disp: seg.displacement ?? disp };
    while (t < end) {
      const p = seg.ms > 0 ? (t - (end - seg.ms)) / seg.ms : 1;
      const lin = Math.min(1, Math.max(0, p));
      angle = from.angle + (target.angle - from.angle) * (seg.linear ? lin : ease(p));
      torso = from.torso + (target.torso - from.torso) * lin;
      drift = from.drift + (target.drift - from.drift) * lin;
      disp = from.disp + (target.disp - from.disp) * lin;
      const osc = seg.osc ? seg.osc.amp * Math.sin(2 * Math.PI * seg.osc.hz * (t - (end - seg.ms)) / 1000) : 0;
      if (!seg.stall && rng() >= dropFrameProb) {
        frames.push(makeFrame({ timestampMs: Math.round(t * 1000) / 1000, flexionDeg: angle + osc + gaussian(rng) * noiseDeg,
          torsoDeg: torso + gaussian(rng) * 0.3, driftDeg: drift + gaussian(rng) * 0.3, displacement: Math.max(0, disp + gaussian(rng) * 0.003),
          tracking: seg.tracking ?? 'valid', baselineElbowFlexionDeg: baseline, side, view, missing }));
      }
      t += step * (1 + (rng() * 2 - 1) * spacingJitter);
    }
    angle = target.angle; torso = target.torso; drift = target.drift; disp = target.disp;
  }
  return frames;
}

// Typical comfortable top: ~120 degrees of excursion above the relaxed bottom.
export const EXCURSION = 120;

/** One full curl: lift, short top hold, lower, then a bottom hold. */
export function curl({ baseline = 10, durationMs = 2000, excursion = EXCURSION, topHoldMs, bottomHoldMs = 500, torso, drift, displacement } = {}) {
  const hold = topHoldMs ?? Math.round(durationMs * 0.1);
  const move = (durationMs - hold) / 2;
  const top = baseline + excursion;
  const extra = { ...(torso !== undefined ? { torso } : {}), ...(drift !== undefined ? { drift } : {}), ...(displacement !== undefined ? { displacement } : {}) };
  return [
    { ms: move, to: top, ...extra },
    { ms: hold },
    { ms: move, to: baseline, ...(torso !== undefined ? { torso: 0 } : {}), ...(drift !== undefined ? { drift: 0 } : {}), ...(displacement !== undefined ? { displacement: 0 } : {}) },
    { ms: bottomHoldMs },
  ];
}
const settle = (ms = 800) => [{ ms }];
const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).flat();

/** Build all labeled fixtures. `config` is the analyzer CURL_CONFIG (used only to size pauses). */
export function buildFixtures(config = {}) {
  const pauseTimeoutMs = Number.isFinite(config.pauseTimeoutMs) ? config.pauseTimeoutMs : 3000;
  const shortPause = Math.round(pauseTimeoutMs * 0.4);
  const longPause = Math.round(pauseTimeoutMs * 1.8);
  const B = 10;
  const fixtures = [];
  const add = (name, description, renderOptions, expected) => fixtures.push({ name, description, synthetic: true,
    frames: render(renderOptions), expected });

  // Full curls at realistic speeds, 30 and 60 fps, irregular spacing and noise.
  const durations = [1500, 2200, 3000, 1800, 2600];
  add('full-30fps', 'five full curls 1.5-3 s at ~30 fps, irregular spacing, ~0.6 deg noise',
    { seed: 11, fps: 30, script: [...settle(), ...durations.flatMap((d) => curl({ durationMs: d }))] }, { completed: 5, interrupted: [] });
  add('full-60fps', 'five full curls 1.5-3 s at ~60 fps, irregular spacing, ~1 deg noise',
    { seed: 12, fps: 60, noiseDeg: 1, script: [...settle(), ...durations.flatMap((d) => curl({ durationMs: d }))] }, { completed: 5, interrupted: [] });
  add('slow', 'three slow ~6 s curls at 30 fps', { seed: 13, script: [...settle(), ...repeat(3, () => curl({ durationMs: 6000, topHoldMs: 400 }))] },
    { completed: 3, interrupted: [] });
  add('fast', 'four fast ~0.8 s curls at 60 fps', { seed: 14, fps: 60, script: [...settle(), ...repeat(4, () => curl({ durationMs: 800, topHoldMs: 80, bottomHoldMs: 300 }))] },
    { completed: 4, interrupted: [] });

  // Partial curls: reach 40-50% of the excursion and return.
  add('partial', 'three partial attempts reaching 40-50% of the excursion, then return',
    { seed: 21, script: [...settle(), ...[0.4, 0.45, 0.5].flatMap((f) => curl({ durationMs: 1600, excursion: EXCURSION * f }))] },
    { completed: 0, interrupted: ['partial', 'partial', 'partial'] });
  add('partial-then-full', 'two partials then two full curls', { seed: 22,
    script: [...settle(), ...curl({ durationMs: 1500, excursion: 55 }), ...curl({ durationMs: 1500, excursion: 50 }), ...curl({ durationMs: 2000 }), ...curl({ durationMs: 2000 })] },
    { completed: 2, interrupted: ['partial', 'partial'] });

  // Bottom jitter: noise of several degrees plus small oscillations near the bottom.
  add('bottom-jitter', '8 s at the bottom with +-4 deg noise and 6 deg oscillations at 1-2 Hz',
    { seed: 31, noiseDeg: 4, script: [...settle(), { ms: 3000, osc: { amp: 6, hz: 1.5 } }, { ms: 3000, osc: { amp: 8, hz: 1 } }, { ms: 2000, osc: { amp: 5, hz: 2 } }] },
    { completed: 0, interrupted: [], noAttempts: true });
  add('bottom-jitter-60fps', 'bottom jitter at 60 fps with +-5 deg noise', { seed: 32, fps: 60, noiseDeg: 5, script: [...settle(), { ms: 6000, osc: { amp: 7, hz: 1.2 } }] },
    { completed: 0, interrupted: [], noAttempts: true });

  // Pauses.
  add('pause-top-short', 'curl with a short pause at the top then lowers', { seed: 41,
    script: [...settle(), ...curl({ durationMs: 2000, topHoldMs: shortPause })] }, { completed: 1, interrupted: [] });
  add('pause-halfway-down-short', 'short pause halfway down, then resumes lowering', { seed: 42,
    script: [...settle(), { ms: 900, to: B + EXCURSION }, { ms: 200 }, { ms: 500, to: B + EXCURSION / 2 }, { ms: shortPause }, { ms: 500, to: B }, { ms: 600 }] },
    { completed: 1, interrupted: [] });
  add('pause-halfway-down-long', 'pause halfway down beyond the timeout, then lowers; the stalled attempt must not complete',
    { seed: 43, script: [...settle(), { ms: 900, to: B + EXCURSION }, { ms: 200 }, { ms: 500, to: B + EXCURSION / 2 }, { ms: longPause }, { ms: 500, to: B }, { ms: 600 }] },
    { completed: 0, interrupted: ['pause-timeout'] });
  add('pause-halfway-up-long', 'pause halfway up beyond the timeout, then completes the motion; the stalled attempt must not complete',
    { seed: 44, script: [...settle(), { ms: 500, to: B + EXCURSION / 2 }, { ms: longPause }, { ms: 500, to: B + EXCURSION }, { ms: 200 }, { ms: 900, to: B }, { ms: 600 }] },
    { completed: 0, interrupted: ['pause-timeout'] });
  add('pause-long-then-full', 'long mid-rep pause (interrupted) then a fresh full curl counts', { seed: 45,
    script: [...settle(), { ms: 500, to: B + EXCURSION / 2 }, { ms: longPause }, { ms: 600, to: B }, { ms: 800 }, ...curl({ durationMs: 2000 })] },
    { completed: 1, interrupted: ['pause-timeout'] });
  add('pause-top-long', 'long hold at the top beyond the pause timeout, then lowers', { seed: 46,
    script: [...settle(), ...curl({ durationMs: 2000 + longPause, topHoldMs: longPause })] },
    { completed: undefined, interrupted: undefined, note: 'contract defines timeout for stalls between bottom and top; a top hold is not pinned down' });

  // Tracking loss mid-rep.
  add('dropout-short', 'curl with a 200 ms grace-window dropout while lifting', { seed: 51,
    script: [...settle(), { ms: 500, to: B + 50 }, { ms: 200, to: B + 85, tracking: 'dropout' }, { ms: 400, to: B + EXCURSION }, { ms: 200 }, { ms: 900, to: B }, { ms: 600 }] },
    { completed: 1, interrupted: [], dropoutMs: 200 });
  add('loss-long', 'long loss mid-rep (grace then lost), recalibrate, then one full curl', { seed: 52,
    script: [...settle(), { ms: 500, to: B + 60 }, { ms: 240, to: B + 90, tracking: 'dropout' }, { ms: 1500, to: B + EXCURSION, tracking: 'lost' },
      { ms: 900, to: B, tracking: 'lost' }, { ms: 1200, tracking: 'calibrating' }, ...settle(600), ...curl({ durationMs: 2000 })] },
    { completed: 1, interrupted: ['tracking-loss'] });
  add('loss-reacquire-at-top', 'loss mid-lift, reacquired already near the top, then lowers; must not complete without a fresh bottom start',
    { seed: 53, script: [...settle(), { ms: 500, to: B + 60 }, { ms: 240, to: B + 90, tracking: 'dropout' }, { ms: 600, to: B + EXCURSION, tracking: 'lost' },
      { ms: 500, to: B + EXCURSION }, { ms: 900, to: B }, { ms: 600 }] },
    { completed: 0, interrupted: ['tracking-loss'] });

  // Torso swing and upper-arm drift during an otherwise complete curl.
  add('torso-swing', 'full curl with ~15 deg torso deviation during the lift', { seed: 61,
    script: [...settle(), ...curl({ durationMs: 2200, torso: 15 })] }, { completed: 1, interrupted: [], issue: 'torso-swing' });
  add('upper-arm-drift', 'full curl with ~30 deg upper-arm drift and 0.3 torso-length elbow displacement', { seed: 62,
    script: [...settle(), ...curl({ durationMs: 2200, drift: 30, displacement: 0.3 })] }, { completed: 1, interrupted: [], issue: 'upper-arm-drift' });
  add('missing-torso', 'full curls where torso deviation is never observed (null) but elbow flexion is', { seed: 63,
    missing: ['torsoDeviationDeg', 'torsoTiltDeg'], script: [...settle(), ...curl({ durationMs: 2000 })] }, { completed: 1, interrupted: [] });

  // Baseline variation.
  for (const [i, baseline] of [[0, 0], [1, 25], [2, 40]]) {
    add(`baseline-${baseline}`, `three full curls from a calibrated baseline of ${baseline} deg (excursion 110 deg)`,
      { seed: 70 + i, baseline, script: [{ ms: 800 }, ...repeat(3, () => curl({ baseline, durationMs: 2000, excursion: 110 }))] },
      { completed: 3, interrupted: [] });
  }
  add('baseline-40-partial', 'baseline 40 deg; motion of 50 deg absolute range is partial relative to calibration', { seed: 75,
    baseline: 40, script: [{ ms: 800 }, ...repeat(2, () => curl({ baseline: 40, durationMs: 1600, excursion: 50 }))] },
    { completed: 0, interrupted: ['partial', 'partial'] });
  // Regression from Ajay's live run 1 (curl-1.0.0 counted a real half curl peaking at 100.8 deg with a
  // calibrated baseline of about 13-21 deg). SYNTHETIC frames shaped from those live peak numbers only;
  // not a replay of the recording.
  for (const [i, baseline] of [[0, 13], [1, 21]]) {
    add(`live-run-1-baseline-${baseline}`, `synthetic, shaped from live run 1 peaks: baseline ${baseline} deg; two half curls peaking at 101 deg (partial), then three full curls peaking at 132 deg`,
      { seed: 90 + i, baseline, script: [{ ms: 800 },
        ...repeat(2, () => curl({ baseline, durationMs: 1800, excursion: 101 - baseline })),
        ...repeat(3, () => curl({ baseline, durationMs: 2200, excursion: 132 - baseline }))] },
      { completed: 3, interrupted: ['partial', 'partial'], liveDerived: true });
  }
  for (const [i, baseline] of [[0, 10], [1, 25]]) {
    add(`half-curl-B+85-baseline-${baseline}`, `three half curls peaking at B+85 (below topEnter B+95), baseline ${baseline} deg`,
      { seed: 95 + i, baseline, script: [{ ms: 800 }, ...repeat(3, () => curl({ baseline, durationMs: 1800, excursion: 85 }))] },
      { completed: 0, interrupted: ['partial', 'partial', 'partial'] });
  }
  return fixtures;
}

/** Frames with every 5th frame duplicated (same timestamp, perturbed values) and adjacent swaps. */
export function corruptTimestamps(frames, seed = 99) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < frames.length; i++) {
    out.push(frames[i]);
    if (i % 5 === 0) {
      const dup = structuredClone(frames[i]);
      if (Number.isFinite(dup.values.elbowFlexionDeg)) dup.values.elbowFlexionDeg += 40 * (rng() - 0.5);
      out.push(dup);
    }
  }
  for (let i = 3; i < out.length - 1; i += 7) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  return out;
}

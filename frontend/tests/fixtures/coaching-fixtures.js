// Sprint 4 labelled SYNTHETIC FeatureFrame fixtures for coaching (issue tracker, feedback
// scheduler, set summary). Frames are built with makeFrame() from curl-fixtures.js (FeatureFrame
// 1.1.0 shape) from scripted torso-deviation / upper-arm-drift / tracking profiles with a seeded
// PRNG, irregular frame spacing and gaussian noise. They prove timing logic and arithmetic only.
// They are NOT recordings of a person, were NOT reviewed or annotated from video, and carry no
// claim about detection accuracy or false-cue rates on real movement.
//
// Each fixture: { name, description, synthetic: true, fps, seed, frames, expected }.
// expected.episodes: [{ type, onsetMs, offMs?, endReason? }] where onsetMs is the scripted time the
//   feature first crosses the onset threshold with continuous valid observation (the episode must
//   start persistMs after it, within one frame interval) and offMs the scripted time the release
//   condition starts holding with valid observation (the episode must end releaseMs after it).
// expected.noEpisodes: true when no episode of any type may be opened.
import { makeFrame, mulberry32, render, curl } from './curl-fixtures.js';

export { makeFrame, mulberry32, render, curl };

// Contract numbers (docs/sprints/sprint-4-STATUS.md, "Agreed coaching contract", 2026-10-03).
export const CONTRACT = Object.freeze({
  rulesVersion: 'curl-rules-1.0.0',
  feedbackVersion: 'feedback-1.1.0',
  summarySchema: 'set-summary-1.0.0',
  maxSuspendMs: 500,
  rules: Object.freeze({
    'torso-swing': Object.freeze({ onsetDeg: 10, persistMs: 400, releaseDeg: 7, releaseMs: 500, text: 'Keep your torso still' }),
    'upper-arm-drift': Object.freeze({ onsetDeg: 20, persistMs: 400, releaseDeg: 15, releaseMs: 500, text: 'Keep your upper arm still at your side' }),
    'incomplete-rom': Object.freeze({ text: 'Curl all the way up' }),
  }),
  cueTexts: Object.freeze({ 'torso-swing': 'Keep your chest tall and still', 'upper-arm-drift': 'Keep your elbow tucked by your side', 'incomplete-rom': 'Curl all the way up to count the rep' }),
  feedback: Object.freeze({ priority: ['torso-swing', 'upper-arm-drift', 'incomplete-rom'], globalCooldownMs: 4000,
    perIssueCooldownMs: 10000, maxQueueAgeMs: 1500, minCueDisplayMs: 1500, attemptEndCueDisplayMs: 3000 }),
});

export function gaussian(rng) {
  const u = Math.max(rng(), 1e-12), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Piecewise-constant profile: [[fromMs, value], ...] sorted by fromMs; value before the first
 * entry is the first value. Times are relative to the stream start.
 */
export function steps(points) {
  return (t) => {
    let v = points[0][1];
    for (const [from, value] of points) if (t >= from) v = value;
    return v;
  };
}

/**
 * Render a stream of FeatureFrames. All profile functions take ms relative to startMs.
 * torso/drift: deg (baseline-relative). tracking: 'valid'|'dropout'|'lost'|'calibrating'.
 * view: 'side'|'front'. flexion: deg absolute (default the calibrated baseline, i.e. arm relaxed).
 * Noise is added to torso/drift only on valid frames. spacingJitter is the +- fraction of the
 * nominal frame interval. dropFrameProb drops frames (missing frames, not dropouts).
 */
export function stream({ seed = 1, fps = 30, startMs = 1000, durationMs, noiseDeg = 1, spacingJitter = 0.2,
  dropFrameProb = 0, baseline = 10, side = 'left', torso = () => 0, drift = () => 0, flexion = null,
  tracking = () => 'valid', view = () => 'side', spikes = [] }) {
  const rng = mulberry32(seed);
  const step = 1000 / fps;
  const frames = [];
  for (let rel = 0; rel < durationMs;) {
    const spike = spikes.find((s) => rel >= s.atMs && rel < s.atMs + s.ms);
    const tr = tracking(rel);
    if (rng() >= dropFrameProb) {
      const torsoDeg = torso(rel) + (spike?.type === 'torso-swing' ? spike.deg : 0) + gaussian(rng) * noiseDeg;
      const driftDeg = drift(rel) + (spike?.type === 'upper-arm-drift' ? spike.deg : 0) + gaussian(rng) * noiseDeg;
      frames.push(makeFrame({ timestampMs: Math.round((startMs + rel) * 1000) / 1000,
        flexionDeg: (flexion ? flexion(rel) : baseline) + gaussian(rng) * 0.5, torsoDeg, driftDeg,
        tracking: tr, baselineElbowFlexionDeg: baseline, side, view: view(rel) }));
    }
    rel += step * (1 + (rng() * 2 - 1) * spacingJitter);
  }
  return frames;
}

/** Random short spikes (shorter than persistMs) of one feature over the stream. */
export function randomSpikes({ seed, durationMs, type, deg, minMs = 60, maxMs = 300, everyMs = 1200, startMs = 500 }) {
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const out = [];
  for (let at = startMs; at < durationMs - maxMs; at += everyMs * (0.7 + 0.6 * rng())) {
    out.push({ atMs: Math.round(at), ms: Math.round(minMs + (maxMs - minMs) * rng()), type, deg: deg * (rng() < 0.5 ? -1 : 1) });
  }
  return out;
}

const track = (segments) => (t) => {
  for (const [from, to, state] of segments) if (t >= from && t < to) return state;
  return 'valid';
};

/** Labelled synthetic fixtures for one frame rate. Times in `expected` are relative to startMs (1000). */
export function buildCoachingFixtures({ fps = 30, seed = 1 } = {}) {
  const fixtures = [];
  const add = (name, description, options, expected) => fixtures.push({ name, description, synthetic: true, fps, seed,
    startMs: 1000, frames: stream({ seed, fps, ...options }), expected });

  add('spikes-torso', 'SYNTHETIC: 20 s at rest, 1 deg noise, torso spikes of +-25 deg lasting 60-300 ms (< 400 ms persistence)',
    { durationMs: 20000, spikes: randomSpikes({ seed, durationMs: 20000, type: 'torso-swing', deg: 25 }) }, { noEpisodes: true });
  add('spikes-drift', 'SYNTHETIC: 20 s at rest, 1 deg noise, upper-arm spikes of +-35 deg lasting 60-300 ms',
    { durationMs: 20000, spikes: randomSpikes({ seed, durationMs: 20000, type: 'upper-arm-drift', deg: 35 }) }, { noEpisodes: true });
  add('sustained-torso', 'SYNTHETIC: torso deviation steps to 15 deg at 2.0 s, back to 0 at 4.0 s',
    { durationMs: 6000, torso: steps([[0, 0], [2000, 15], [4000, 0]]) },
    { episodes: [{ type: 'torso-swing', onsetMs: 2000, offMs: 4000, endReason: 'resolved' }] });
  add('sustained-torso-negative', 'SYNTHETIC: torso deviation steps to -15 deg (absolute value is used)',
    { durationMs: 6000, torso: steps([[0, 0], [2000, -15], [4000, 0]]) },
    { episodes: [{ type: 'torso-swing', onsetMs: 2000, offMs: 4000, endReason: 'resolved' }] });
  add('sustained-drift', 'SYNTHETIC: upper-arm drift steps to 30 deg at 2.0 s, back to 0 at 4.0 s',
    { durationMs: 6000, drift: steps([[0, 0], [2000, 30], [4000, 0]]) },
    { episodes: [{ type: 'upper-arm-drift', onsetMs: 2000, offMs: 4000, endReason: 'resolved' }] });
  add('overlap-both', 'SYNTHETIC: torso 15 deg and drift 30 deg together from 2.0 s to 4.5 s',
    { durationMs: 7000, torso: steps([[0, 0], [2000, 15], [4500, 0]]), drift: steps([[0, 0], [2000, 30], [4500, 0]]) },
    { episodes: [{ type: 'torso-swing', onsetMs: 2000, offMs: 4500, endReason: 'resolved' },
      { type: 'upper-arm-drift', onsetMs: 2000, offMs: 4500, endReason: 'resolved' }] });
  add('hysteresis-band', 'SYNTHETIC: torso 15 deg at 2.0 s, 8.5 deg (between release 7 and onset 10) 3.5-6.0 s, 0 after',
    { durationMs: 8000, noiseDeg: 0.3, torso: steps([[0, 0], [2000, 15], [3500, 8.5], [6000, 0]]) },
    { episodes: [{ type: 'torso-swing', onsetMs: 2000, offMs: 6000, endReason: 'resolved' }] });
  add('dropout-during-onset', 'SYNTHETIC: torso 15 deg from 2.0 s; engine dropout frames 2.25-2.45 s restart onset evidence',
    { durationMs: 6000, torso: steps([[0, 0], [2000, 15], [4500, 0]]), tracking: track([[2250, 2450, 'dropout']]) },
    { episodes: [{ type: 'torso-swing', onsetMs: 2450, offMs: 4500, endReason: 'resolved' }] });
  add('dropout-during-episode', 'SYNTHETIC: torso 15 deg 2.0-5.0 s; 300 ms dropout at 3.0 s (< maxSuspendMs) suspends, does not end',
    { durationMs: 7000, torso: steps([[0, 0], [2000, 15], [5000, 0]]), tracking: track([[3000, 3300, 'dropout']]) },
    { episodes: [{ type: 'torso-swing', onsetMs: 2000, offMs: 5000, endReason: 'resolved' }], suspendedDuring: [3000, 3300] });
  add('dropout-during-release', 'SYNTHETIC: torso 15 deg 2.0-4.0 s then 0; 300 ms dropout at 4.3 s discards release evidence',
    { durationMs: 7000, torso: steps([[0, 0], [2000, 15], [4000, 0]]), tracking: track([[4300, 4600, 'dropout']]) },
    { episodes: [{ type: 'torso-swing', onsetMs: 2000, offMs: 4600, endReason: 'resolved' }] });
  add('loss-during-episode', 'SYNTHETIC: torso 15 deg 2.0-6.0 s; dropout 3.0-3.2 s then lost 3.2-4.0 s (> maxSuspendMs); new episode after return',
    { durationMs: 8000, torso: steps([[0, 0], [2000, 15], [6000, 0]]), tracking: track([[3000, 3200, 'dropout'], [3200, 4000, 'lost']]) },
    { episodes: [{ type: 'torso-swing', onsetMs: 2000, endReason: 'tracking-lost', lostFromMs: 3000 },
      { type: 'torso-swing', onsetMs: 4000, offMs: 6000, endReason: 'resolved', lenientOnset: true }] });
  add('unsupported-view', 'SYNTHETIC: front view throughout with torso 15 deg and drift 30 deg', {
    durationMs: 4000, torso: () => 15, drift: () => 30, view: () => 'front' }, { noEpisodes: true, unavailableReason: 'unsupported-view' });
  add('not-ready-calibrating', 'SYNTHETIC: calibrating (not ready) frames throughout with torso 15 deg', {
    durationMs: 4000, torso: () => 15, tracking: () => 'calibrating' }, { noEpisodes: true });
  add('dropout-chatter', 'SYNTHETIC: torso 15 deg 1-6 s with a one-frame dropout every 300 ms; evidence never reaches 400 ms',
    { durationMs: 7000, torso: steps([[0, 0], [1000, 15], [6000, 0]]),
      tracking: (t) => (t >= 1000 && t < 6000 && (t % 300) < 1300 / fps ? 'dropout' : 'valid') }, { noEpisodes: true });
  return fixtures;
}

/**
 * Real curls (curl-fixtures render/curl) with torso deviation during reps, for attemptId / summary
 * tests. Returns frames only.
 */
export function curlsWithIssues({ seed = 7, fps = 30, reps = [], baseline = 10 } = {}) {
  const script = [{ ms: 800 }];
  for (const r of reps) script.push(...curl({ baseline, durationMs: r.durationMs ?? 2400, excursion: r.excursion ?? 120,
    torso: r.torso, drift: r.drift, bottomHoldMs: r.bottomHoldMs ?? 900 }));
  script.push({ ms: 1200 });
  return render({ seed, fps, baseline, noiseDeg: 0.6, dropFrameProb: 0, spacingJitter: 0.15, script });
}

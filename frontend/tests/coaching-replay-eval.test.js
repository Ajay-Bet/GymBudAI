// Sprint 4 exit-criterion replay tool (ml/coaching_eval.mjs). Synthetic landmark streams only:
// these check the measurement arithmetic and pipeline wiring, not detector accuracy on people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayCoaching, evaluateCoaching, createReplaySpeech } from '../../ml/coaching_eval.mjs';
import { seeded } from './fixtures/calibration-extension.js';

const ASPECT = 720 / 1280;
const rad = (deg) => (deg * Math.PI) / 180;

/** Side-on pose: the whole upper body leans `leanDeg` about the hip; elbow flexion `flexion`. */
function pose(timestampMs, { flexion = 20, leanDeg = 0, jitter = () => 0 } = {}) {
  const landmarks = Array(33).fill(null);
  const point = (x, y) => ({ x: x + jitter(), y: y + jitter(), visibility: 1, presence: 1 });
  const lean = rad(leanDeg), flex = rad(flexion);
  for (const [s, e, w, h, x] of [[11, 13, 15, 23, 0.45], [12, 14, 16, 24, 0.48]]) {
    const hip = { x, y: 0.65 };
    const shoulder = { x: hip.x + 0.4 * Math.sin(lean) * ASPECT, y: hip.y - 0.4 * Math.cos(lean) };
    const elbow = { x: shoulder.x + 0.2 * Math.sin(lean) * ASPECT, y: shoulder.y + 0.2 * Math.cos(lean) };
    const wrist = { x: elbow.x + 0.18 * Math.sin(lean + flex) * ASPECT, y: elbow.y + 0.18 * Math.cos(lean + flex) };
    landmarks[h] = point(hip.x, hip.y); landmarks[s] = point(shoulder.x, shoulder.y);
    landmarks[e] = point(elbow.x, elbow.y); landmarks[w] = point(wrist.x, wrist.y);
  }
  return { timestampMs, landmarks, sourceWidth: 1280, sourceHeight: 720 };
}

/** Relaxed hold, then reps; each rep { leanDeg?, durationMs?, spikeMs? } becomes a labelled window. */
function recording({ reps, fps = 30, seed = 4, holdMs = 2500, restMs = 600 }) {
  const random = seeded(seed), jitter = () => (random() - 0.5) * 0.0008;
  const poses = [], windows = [];
  let t = 0;
  const push = (flexion, leanDeg) => { poses.push(pose(t, { flexion, leanDeg, jitter })); t += 1000 / fps; };
  while (t < holdMs) push(20, 0);
  for (const rep of reps) {
    const durationMs = rep.durationMs ?? 2000, startMs = t;
    while (t < startMs + durationMs) {
      const phase = (t - startMs) / durationMs;
      const spike = rep.spikeMs && t - startMs >= durationMs / 2 && t - startMs < durationMs / 2 + rep.spikeMs;
      push(20 + 120 * Math.sin(Math.PI * phase), rep.leanDeg ? rep.leanDeg * Math.sin(Math.PI * phase) : spike ? 25 : 0);
    }
    // A labeller marks when the lean becomes visible; here, when it first exceeds the 10° onset.
    const issueStartMs = rep.leanDeg ? startMs + (durationMs * Math.asin(10 / rep.leanDeg)) / Math.PI : undefined;
    windows.push({ startMs, endMs: t, label: rep.label, ...(issueStartMs === undefined ? {} : { issueStartMs }) });
    const restEnd = t + restMs;
    while (t < restEnd) push(20, 0);
  }
  return { poses, windows };
}

test('replay speech ends utterances on the frame clock and reports cancellation', () => {
  const speech = createReplaySpeech({ baseMs: 300, msPerWord: 100 });
  const ends = [];
  speech.onEnd((info) => ends.push(info));
  speech.advance(0);
  assert.equal(speech.speak({ id: 'a', text: 'one two' }), true);
  speech.advance(400);
  assert.equal(speech.speaking(), true);
  speech.advance(500);
  assert.deepEqual(ends, [{ id: 'a', reason: 'ended' }]);
  speech.speak({ id: 'b', text: 'x' });
  speech.cancel();
  assert.deepEqual(ends.at(-1), { id: 'b', reason: 'cancelled' });
});

test('sustained swinging is cued within persistence plus allowance and clean reps get no spoken correction', () => {
  const { poses, windows } = recording({ reps: [
    { label: 'no-issue' }, { label: 'no-issue' }, { label: 'no-issue' },
    { label: 'swinging', leanDeg: 15 }, { label: 'swinging', leanDeg: 15 },
  ] });
  const replay = replayCoaching(poses, { side: 'left' });
  assert.ok(replay.calibrationReadyFrames > 0, 'synthetic hold calibrates');
  assert.equal(replay.summary.completedReps, 5);
  const result = evaluateCoaching(replay, windows);
  assert.equal(result.falseSpokenCues, 0);
  assert.equal(result.falseCuesInAcceptedForm, 0);
  assert.equal(result.falseCuesPerMinuteAcceptedForm, 0);
  // Both swings show the intended cue in time; the second falls inside the 10 s per-issue cooldown,
  // so it is shown as text and not spoken again (by design).
  const [firstSwing, secondSwing] = result.issueWindows;
  assert.equal(firstSwing.cueWithinDeadline, true, JSON.stringify(firstSwing));
  assert.equal(firstSwing.spokenWithinDeadline, true);
  assert.ok(firstSwing.spokenDelayMs >= 400 && firstSwing.spokenDelayMs <= 900, `delay ${firstSwing.spokenDelayMs}`);
  assert.equal(secondSwing.cueWithinDeadline, true, JSON.stringify(secondSwing));
  assert.equal(secondSwing.firstSpokenMs, null);
  assert.equal(secondSwing.speechSuppressed, 'cooldown-issue');
  assert.equal(result.sustainedIssuesCued, 2);
  assert.ok((result.episodeCountsByType['torso-swing'] ?? 0) + (result.episodeCountsByType['upper-arm-drift'] ?? 0) >= 2);
});

test('an isolated 200 ms lean spike inside a clean rep produces no spoken correction', () => {
  const { poses, windows } = recording({ reps: [{ label: 'no-issue' }, { label: 'no-issue', spikeMs: 200 }, { label: 'no-issue' }] });
  const result = evaluateCoaching(replayCoaching(poses, { side: 'left' }), windows);
  assert.equal(result.spokenCues, 0);
  assert.equal(result.falseCuesPerMinuteAcceptedForm, 0);
});

test('evaluation counts a spoken cue outside matching windows as false, per minute of coachable accepted form', () => {
  const replay = {
    assessableMs: 60000, episodes: [],
    coachableIntervals: [{ startMs: 0, endMs: 5000 }, { startMs: 6000, endMs: 60000 }],
    cueLog: [
      { issueType: 'torso-swing', shownMs: 1500, spokenMs: 1500 }, // false: inside a no-issue window
      { issueType: 'torso-swing', shownMs: 10600, spokenMs: 10600 }, // matches the swing window in time
      { issueType: 'incomplete-rom', shownMs: 20900, spokenMs: 20900 }, // attempt-end cue after the window
      { issueType: 'upper-arm-drift', shownMs: 40000, spokenMs: null }, // shown only, never spoken
    ],
  };
  const windows = [
    { startMs: 0, endMs: 10000, label: 'no-issue' }, // 9 s coachable (5000–6000 not ready)
    { startMs: 10000, endMs: 12000, label: 'swinging' },
    { startMs: 18000, endMs: 20500, label: 'incomplete-rom' },
    { startMs: 25000, endMs: 27000, label: 'torso-swing' },
  ];
  const result = evaluateCoaching(replay, windows, { processingAllowanceMs: 500 });
  assert.equal(result.spokenCues, 3);
  assert.equal(result.falseSpokenCues, 1);
  assert.equal(result.falseCuesInAcceptedForm, 1);
  assert.equal(result.acceptedFormMs, 9000);
  assert.ok(Math.abs(result.falseCuesPerMinuteAcceptedForm - 60 / 9) < 1e-9);
  assert.equal(result.falseCuesPerMinuteAssessable, 1);
  assert.ok(Math.abs(result.labelledCoachableFraction - 15500 / 59000) < 1e-9);
  const [swing, rom, torso] = result.issueWindows;
  assert.equal(swing.spokenDelayMs, 600);
  assert.equal(swing.deadlineMs, 10900); // fired torso-swing: 10000 + 400 + 500
  assert.equal(swing.cueWithinDeadline, true);
  assert.equal(rom.spokenDelayMs, 400); // measured from the attempt end
  assert.equal(rom.cueWithinDeadline, true);
  assert.equal(torso.firstSpokenMs, null);
  assert.equal(torso.cueWithinDeadline, false);
  assert.equal(result.sustainedIssuesCued, 2);
  assert.throws(() => evaluateCoaching(replay, [{ startMs: 0, endMs: 1, label: 'grip' }]), /Unknown label/);
  assert.throws(() => evaluateCoaching(replay, [{ startMs: 0, endMs: 5000, label: 'no-issue' },
    { startMs: 4000, endMs: 6000, label: 'torso-swing' }]), /overlaps/);
  assert.throws(() => evaluateCoaching(replay, windows, { processingAllowanceMs: Number.NaN }), /allowance/);
});

test('known limit: a lean of about 25° moves the shoulder past the reposition check, so calibration resets instead of cueing', () => {
  // Shoulder travel over 0.3 torso lengths (about 17° of lean about the hip) invalidates the baseline.
  // The torso rule (onset 10°) therefore only cues in roughly the 10–17° band on this geometry.
  const { poses, windows } = recording({ reps: [{ label: 'no-issue' }, { label: 'swinging', leanDeg: 25 }] });
  const replay = replayCoaching(poses, { side: 'left' });
  const result = evaluateCoaching(replay, windows);
  assert.equal(result.issueWindows[0].cueWithinDeadline, false);
  assert.equal(result.spokenCues, 0);
  assert.equal(replay.summary.completedReps, 1);
});

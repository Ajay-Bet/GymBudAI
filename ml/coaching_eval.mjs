/**
 * Sprint 4 exit-criterion replay: run the production tracking, biomechanics, curl analyzer, issue
 * tracker and feedback scheduler over an extracted pose cache, then compare spoken cues with
 * human-labelled windows.
 *
 * It measures, per recording: delay from an annotated sustained issue to its spoken cue (against
 * the rule's persistence plus a processing allowance), spoken corrections outside any matching
 * issue window (false cues, per minute of accepted-form time and of assessable time), and detected
 * issue episodes. Speech is simulated on the frame clock (no audio); rules run in the scheduler's
 * developer 'review' mode so disabled rules can be evaluated without enabling them for users.
 * Results count as acceptance evidence only for windows whose recording is independently reviewed.
 * Not simulated: the pose engine's stale-frame drop and pose-error resets in CameraView, and the
 * experimental rep-end model session.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTrackingValidator } from '../frontend/src/vision/tracking.js';
import { createBiomechanicsEngine } from '../frontend/src/biomechanics/engine.js';
import { createCurlAnalyzer, CURL_CONFIG } from '../frontend/src/exercises/curl.js';
import { createCurlIssueTracker, CURL_RULES_CONFIG } from '../frontend/src/exercises/curlRules.js';
import { createCurlSet } from '../frontend/src/exercises/setSession.js';
import { createFeedbackScheduler } from '../frontend/src/feedback/scheduler.js';
import { FEEDBACK_CONFIG } from '../frontend/src/feedback/cues.js';
import { readPoseCache } from './measure.mjs';

export const COACHING_EVAL_VERSION = 'coaching-eval-1.0.0';
// Same auto-calibration defaults as CameraView (relaxed arm, one retry per second).
const AUTO_CALIBRATE_MAX_FLEXION_DEG = 40;
const AUTO_CALIBRATE_MIN_INTERVAL_MS = 1000;
/** Default processing allowance on top of rule persistence: frame interval, smoothing lag and speech start. */
export const DEFAULT_PROCESSING_ALLOWANCE_MS = 500;
/** Label → cue issue types that count as the intended cue. 'swinging' is the user's composite label. */
export const LABEL_CUE_TYPES = Object.freeze({
  'torso-swing': ['torso-swing'],
  'upper-arm-drift': ['upper-arm-drift'],
  swinging: ['torso-swing', 'upper-arm-drift'],
  'incomplete-rom': ['incomplete-rom'],
});
export const ACCEPTED_FORM_LABEL = 'no-issue';

/**
 * Speech adapter on the replay clock: an utterance lasts baseMs + msPerWord per word, then ends.
 * Call advance(timestampMs) before each scheduler update.
 */
export function createReplaySpeech({ baseMs = 300, msPerWord = 350 } = {}) {
  let now = 0, current = null;
  const listeners = new Set();
  const settle = (reason) => {
    if (!current) return;
    const { id } = current; current = null;
    for (const fn of listeners) fn({ id, reason });
  };
  return {
    available: true, muted: false, volume: 1,
    prime() {},
    speak({ id, text }) {
      settle('cancelled');
      current = { id, endsMs: now + baseMs + msPerWord * String(text).trim().split(/\s+/).length };
      return true;
    },
    cancel() { settle('cancelled'); },
    setMuted() {}, setVolume() {},
    speaking: () => current !== null,
    onEnd(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    advance(timestampMs) {
      now = timestampMs;
      if (current && now >= current.endsMs) settle('ended');
    },
  };
}

/**
 * Replay one recording through the live coaching pipeline.
 * @param {Object[]} poses pose cache rows ({ landmarks, worldLandmarks?, timestampMs, ... })
 * @param {{side: 'left'|'right', view?: string, mode?: 'review'|'validated-only'}} options
 */
export function replayCoaching(poses, { side, view = 'side', mode = 'review' } = {}) {
  if (!['left', 'right'].includes(side)) throw new Error('Explicit side required');
  const validator = createTrackingValidator({ side });
  const biomechanics = createBiomechanicsEngine({ side, view });
  const analyzer = createCurlAnalyzer();
  const tracker = createCurlIssueTracker();
  const set = createCurlSet({ analyzer, tracker });
  const speech = createReplaySpeech();
  const enabledRuleTypes = Object.values(CURL_RULES_CONFIG.rules).filter((r) => r.enabled).map((r) => r.type);
  const scheduler = createFeedbackScheduler({ speech, mode, enabledRuleTypes });
  let lastAuto = null, firstMs = null, lastMs = null, readyFrames = 0, calibrationReadyFrames = 0, previousReadyMs = null;
  // Ready (tracked, side-on, calibrated) time: the only time a cue can be spoken. Gaps over 150 ms split intervals.
  const coachableIntervals = [];
  for (const pose of poses) {
    const tracking = validator.update(pose.landmarks, pose.timestampMs);
    const frame = biomechanics.update(pose, tracking);
    if (frame.calibration.status === 'uncalibrated' && frame.trackingState === 'active' && frame.orientation.valid
      && Number.isFinite(frame.raw?.elbowFlexionDeg) && frame.raw.elbowFlexionDeg <= AUTO_CALIBRATE_MAX_FLEXION_DEG
      && (lastAuto === null || frame.timestampMs - lastAuto >= AUTO_CALIBRATE_MIN_INTERVAL_MS)) {
      lastAuto = frame.timestampMs;
      const interrupted = set.interrupt('recalibration', frame.timestampMs);
      if (interrupted.issueOutput) scheduler.update({ timestampMs: frame.timestampMs, issueOutput: interrupted.issueOutput });
      biomechanics.calibrate();
    }
    const output = set.update(frame);
    if (Number.isFinite(frame.timestampMs)) { firstMs ??= frame.timestampMs; lastMs = frame.timestampMs; }
    if (frame.ready && Number.isFinite(frame.timestampMs)) {
      readyFrames += 1;
      const lastInterval = coachableIntervals.at(-1);
      if (lastInterval && previousReadyMs !== null && frame.timestampMs - previousReadyMs <= CURL_RULES_CONFIG.maxEvidenceGapMs) lastInterval.endMs = frame.timestampMs;
      else coachableIntervals.push({ startMs: frame.timestampMs, endMs: frame.timestampMs });
      previousReadyMs = frame.timestampMs;
    } else previousReadyMs = null;
    if (frame.calibration.status === 'ready') calibrationReadyFrames += 1;
    speech.advance(frame.timestampMs);
    if (!frame.ready) speech.cancel(); // CameraView stops speech on every non-ready frame
    if (output.issueOutput) scheduler.update({ timestampMs: frame.timestampMs, issueOutput: output.issueOutput });
  }
  scheduler.stop();
  const cueLog = scheduler.getCueLog();
  const result = set.finish(lastMs ?? undefined, { cueLog, mode, enabledRuleTypes, feedbackVersion: scheduler.config.version });
  return {
    side, view, mode, firstMs, lastMs, readyFrames, calibrationReadyFrames, frameCount: poses.length, coachableIntervals,
    cueLog, episodes: result.summary.episodes, summary: result.summary,
    assessableMs: result.summary.trackingCoverage?.assessableMs ?? 0,
  };
}

const overlaps = (a, b) => a.startMs < b.endMs && b.startMs < a.endMs;
const intersectMs = (window, intervals) => intervals.reduce((sum, i) => sum + Math.max(0, Math.min(window.endMs, i.endMs) - Math.max(window.startMs, i.startMs)), 0);

/**
 * Compare a replay with labelled windows.
 * @param {ReturnType<typeof replayCoaching>} replay
 * @param {{startMs: number, endMs: number, label: string}[]} windows times on the pose-cache clock
 * @param {{processingAllowanceMs?: number}} [options]
 */
export function evaluateCoaching(replay, windows, { processingAllowanceMs = DEFAULT_PROCESSING_ALLOWANCE_MS } = {}) {
  if (!Number.isFinite(processingAllowanceMs) || processingAllowanceMs < 0) throw new Error(`Invalid processing allowance ${processingAllowanceMs}`);
  if (!Array.isArray(replay.coachableIntervals)) throw new Error('Replay needs coachableIntervals');
  for (const w of windows) {
    if (!Number.isFinite(w.startMs) || !Number.isFinite(w.endMs) || w.endMs <= w.startMs) throw new Error(`Invalid window ${JSON.stringify(w)}`);
    if (w.label !== ACCEPTED_FORM_LABEL && !LABEL_CUE_TYPES[w.label]) throw new Error(`Unknown label ${w.label}`);
    if (w.issueStartMs != null && !(w.issueStartMs >= w.startMs && w.issueStartMs < w.endMs)) throw new Error(`issueStartMs outside window ${JSON.stringify(w)}`);
  }
  const spoken = replay.cueLog.filter((c) => Number.isFinite(c.spokenMs));
  const issueWindows = windows.filter((w) => w.label !== ACCEPTED_FORM_LABEL);
  const acceptedWindows = windows.filter((w) => w.label === ACCEPTED_FORM_LABEL);
  for (const a of acceptedWindows) {
    const clash = windows.find((w) => w !== a && overlaps(a, w));
    if (clash) throw new Error(`no-issue window overlaps another window: ${JSON.stringify(a)} / ${JSON.stringify(clash)}`);
  }
  // Delay is measured from the annotated onset of the sustained issue (issueStartMs, default startMs);
  // incomplete ROM is evaluated when the attempt ends, so it is measured from the window end.
  const referenceFor = (w) => (w.label === 'incomplete-rom' ? w.endMs : w.issueStartMs ?? w.startMs);
  // Deadline uses the persistence of the cue type that fired (the shortest when none fired).
  const deadlineFor = (w, firedType) => {
    if (w.label === 'incomplete-rom') return w.endMs + processingAllowanceMs;
    const persist = firedType ? CURL_RULES_CONFIG.rules[firedType].onsetPersistMs
      : Math.min(...LABEL_CUE_TYPES[w.label].map((t) => CURL_RULES_CONFIG.rules[t].onsetPersistMs));
    return referenceFor(w) + persist + processingAllowanceMs;
  };
  const matchesWindow = (cue, w) => LABEL_CUE_TYPES[w.label]?.includes(cue.issueType)
    && cue.spokenMs >= w.startMs && cue.spokenMs <= w.endMs + processingAllowanceMs;

  const issueResults = issueWindows.map((w) => {
    const types = LABEL_CUE_TYPES[w.label];
    const inWindow = (ms) => Number.isFinite(ms) && ms >= w.startMs && ms <= w.endMs + processingAllowanceMs;
    const firstBy = (key) => replay.cueLog.filter((c) => types.includes(c.issueType) && inWindow(c[key]))
      .sort((a, b) => a[key] - b[key])[0] ?? null;
    const shown = firstBy('shownMs'), spokenCue = firstBy('spokenMs');
    const episodes = replay.episodes.filter((e) => types.includes(e.type)
      && overlaps({ startMs: e.startMs, endMs: e.endMs ?? e.startMs + 1 }, w));
    const deadlineMs = deadlineFor(w, shown?.issueType);
    const spokenDeadlineMs = deadlineFor(w, spokenCue?.issueType);
    const reference = referenceFor(w);
    return {
      ...w, referenceMs: reference, deadlineMs, episodeCount: episodes.length,
      firstShownMs: shown?.shownMs ?? null,
      shownDelayMs: shown ? shown.shownMs - reference : null,
      // The intended cue is the displayed one; speech for it may be held back by design (cooldown, mute).
      cueWithinDeadline: shown !== null && shown.shownMs <= deadlineMs,
      speechSuppressed: shown?.spokenMs == null ? shown?.suppressed ?? null : null,
      firstSpokenMs: spokenCue?.spokenMs ?? null,
      spokenDelayMs: spokenCue ? spokenCue.spokenMs - reference : null,
      spokenWithinDeadline: spokenCue !== null && spokenCue.spokenMs <= spokenDeadlineMs,
    };
  });

  const falseCues = spoken.filter((c) => !issueWindows.some((w) => matchesWindow(c, w)));
  // Accepted-form time counts only while a cue could be spoken (ready, calibrated frames).
  const acceptedMs = acceptedWindows.reduce((sum, w) => sum + intersectMs(w, replay.coachableIntervals), 0);
  const falseInAccepted = falseCues.filter((c) => acceptedWindows.some((w) => c.spokenMs >= w.startMs && c.spokenMs < w.endMs));
  const coachableMs = replay.coachableIntervals.reduce((sum, i) => sum + (i.endMs - i.startMs), 0);
  const labelledCoachableMs = replay.coachableIntervals.reduce((sum, i) => sum
    + windows.reduce((inner, w) => inner + Math.max(0, Math.min(w.endMs, i.endMs) - Math.max(w.startMs, i.startMs)), 0), 0);
  const perMinute = (count, ms) => (ms > 0 ? count / (ms / 60000) : null);
  const episodeCountsByType = {};
  for (const e of replay.episodes) episodeCountsByType[e.type] = (episodeCountsByType[e.type] ?? 0) + 1;

  return {
    processingAllowanceMs,
    issueWindows: issueResults,
    sustainedIssuesCued: issueResults.filter((r) => r.cueWithinDeadline).length,
    sustainedIssuesTotal: issueResults.length,
    sustainedIssuesSpokenInTime: issueResults.filter((r) => r.spokenWithinDeadline).length,
    spokenCues: spoken.length,
    falseSpokenCues: falseCues.length,
    falseSpokenCueTimesMs: falseCues.map((c) => c.spokenMs),
    acceptedFormMs: acceptedMs,
    acceptedWindowCount: acceptedWindows.length,
    coachableMs,
    labelledCoachableFraction: coachableMs > 0 ? Math.min(1, labelledCoachableMs / coachableMs) : null,
    falseCuesInAcceptedForm: falseInAccepted.length,
    falseCuesPerMinuteAcceptedForm: perMinute(falseInAccepted.length, acceptedMs),
    assessableMs: replay.assessableMs,
    falseCuesPerMinuteAssessable: perMinute(falseCues.length, replay.assessableMs),
    episodeCountsByType,
  };
}

function main() {
  const args = process.argv.slice(2);
  const arg = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const input = arg('--input', 'ml/outputs/extraction');
  const labelsPath = arg('--labels', null);
  const output = arg('--output', 'ml/outputs/coaching-eval');
  const allowance = Number(arg('--processing-allowance-ms', DEFAULT_PROCESSING_ALLOWANCE_MS));
  const target = arg('--false-cue-target-per-min', null);
  if (!Number.isFinite(allowance) || allowance < 0) throw new Error('--processing-allowance-ms must be a non-negative number');
  if (target !== null && !(Number.isFinite(Number(target)) && Number(target) >= 0)) throw new Error('--false-cue-target-per-min must be a non-negative number');
  if (!labelsPath) throw new Error('Supply --labels <json>: { "recordings": { "<id>": { "side", "view", "reviewStatus", "reviewer", "windows": [{ "startMs", "endMs", "issueStartMs"?, "label" }] } } }');
  const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  const recordings = [];
  for (const [recordingId, meta] of Object.entries(labels.recordings ?? {})) {
    const { poses } = readPoseCache(path.join(input, recordingId));
    const replay = replayCoaching(poses, { side: meta.side, view: meta.view ?? 'side' });
    const evaluation = evaluateCoaching(replay, meta.windows ?? [], { processingAllowanceMs: allowance });
    recordings.push({
      recordingId, side: meta.side, view: meta.view ?? 'side', reviewStatus: meta.reviewStatus ?? 'unreviewed', reviewer: meta.reviewer ?? null,
      // Eligible only with a named reviewer, a side view, calibrated time, and both issue and accepted-form windows.
      acceptanceEligible: meta.reviewStatus === 'independently-reviewed' && typeof meta.reviewer === 'string' && meta.reviewer.trim() !== ''
        && (meta.view ?? 'side') === 'side' && evaluation.coachableMs > 0
        && evaluation.sustainedIssuesTotal > 0 && evaluation.acceptedWindowCount > 0,
      frameCount: replay.frameCount, readyFrames: replay.readyFrames, calibrationReadyFrames: replay.calibrationReadyFrames,
      summary: { completedReps: replay.summary.completedReps, trackingCoverage: replay.summary.trackingCoverage },
      cueLog: replay.cueLog, evaluation,
    });
  }
  const eligible = recordings.filter((r) => r.acceptanceEligible);
  const sum = (key) => eligible.reduce((s, r) => s + r.evaluation[key], 0);
  const acceptedMs = sum('acceptedFormMs');
  const falsePerMin = acceptedMs > 0 ? sum('falseCuesInAcceptedForm') / (acceptedMs / 60000) : null;
  const assessableMs = sum('assessableMs');
  const falsePerMinAssessable = assessableMs > 0 ? sum('falseSpokenCues') / (assessableMs / 60000) : null;
  const totalIssues = sum('sustainedIssuesTotal');
  const report = {
    version: COACHING_EVAL_VERSION, generatedAt: new Date().toISOString(),
    analyzerVersion: CURL_CONFIG.version, rulesVersion: CURL_RULES_CONFIG.version, feedbackVersion: FEEDBACK_CONFIG.version,
    mode: 'review', speech: 'simulated on the frame clock; not audio evidence',
    processingAllowanceMs: allowance,
    falseCueTargetPerMinute: target === null ? null : Number(target),
    eligibleRecordings: eligible.length,
    exitCriterion: {
      threeReviewedRecordings: eligible.length >= 3,
      sustainedIssuesCued: `${sum('sustainedIssuesCued')}/${totalIssues}`,
      sustainedIssuesSpokenInTime: `${sum('sustainedIssuesSpokenInTime')}/${totalIssues}`,
      allSustainedIssuesCued: totalIssues > 0 && sum('sustainedIssuesCued') === totalIssues,
      falseCuesPerMinuteAcceptedForm: falsePerMin,
      falseCuesPerMinuteAssessable: falsePerMinAssessable,
      meetsFalseCueTarget: target === null || falsePerMin === null || falsePerMinAssessable === null ? null
        : falsePerMin <= Number(target) && falsePerMinAssessable <= Number(target),
    },
    recordings,
  };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, recordings: recordings.map((r) => ({ recordingId: r.recordingId, acceptanceEligible: r.acceptanceEligible,
    calibrationReadyFrames: r.calibrationReadyFrames, labelledCoachableFraction: r.evaluation.labelledCoachableFraction, cued: `${r.evaluation.sustainedIssuesCued}/${r.evaluation.sustainedIssuesTotal}`,
    falseCuesInAcceptedForm: r.evaluation.falseCuesInAcceptedForm, episodes: r.evaluation.episodeCountsByType })) }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

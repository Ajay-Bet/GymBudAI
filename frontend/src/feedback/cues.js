/**
 * Feedback configuration, priority policy and cue catalog (Sprint 4). Pure JavaScript, independent
 * of React. Implements the "Agreed coaching contract" and the Sprint 4 extension
 * ("Feedback wording and output", feedback-1.1.0) in docs/sprints/sprint-4-STATUS.md.
 *
 * Every number below is an unvalidated engineering default. Times are milliseconds of frame
 * timestamps (the FeatureFrame.timestampMs clock), never frame counts, so behaviour is the same at
 * any frame rate. Cue wording is coaching guidance only: it makes no clinical or injury claim.
 */

/**
 * Explicit cue priority policy. This is NOT a clinical severity ranking.
 *  1. Cues about the movement in progress come before cues about a finished attempt
 *     (torso-swing and upper-arm-drift before incomplete-rom).
 *  2. torso-swing comes before upper-arm-drift because torso movement also shifts the measured
 *     upper-arm angle, so correcting the torso first makes the arm cue more meaningful.
 * Ties between episodes of the same type: the earlier episode (startMs), then the episode ID.
 *
 * Accepted scheduling design (lead review, Sprint 4):
 *  - A shown cue stays at least minCueDisplayMs; a higher-priority cue waits until then before
 *    replacing it (anti-flicker). Non-assessable frames withdraw the text at once.
 *  - Speech is decided once per cue, when it first becomes primary. A cue held back by a cooldown
 *    is shown as text only and is not retried. One episode keeps one cue ID and log entry; a
 *    reshown episode is not spoken again.
 */
export const PRIORITY_POLICY = Object.freeze({
  order: Object.freeze(['torso-swing', 'upper-arm-drift', 'incomplete-rom']),
  basis: 'explicit-policy-not-severity',
  rationale: Object.freeze([
    'Cues about the movement in progress come before cues about a finished attempt.',
    'Torso swing comes before upper-arm drift because torso movement also shifts the measured upper-arm angle.',
  ]),
});

/**
 * Scheduler configuration (contract values).
 * maxSpeechMs is a proposed addition: a watchdog that cancels an utterance whose end event never
 * arrives (some browsers drop onend), so one lost event cannot block speech for the whole session.
 */
export const FEEDBACK_CONFIG = Object.freeze({
  version: 'feedback-1.1.0',
  priority: PRIORITY_POLICY.order,
  globalCooldownMs: 4000,
  perIssueCooldownMs: 10000,
  maxQueueAgeMs: 1500,
  minCueDisplayMs: 1500,
  attemptEndCueDisplayMs: 3000,
  maxSpeechMs: 8000,
});

/** Issue types judged at the end of an attempt (instant episodes); shown for attemptEndCueDisplayMs. */
export const ATTEMPT_END_ISSUE_TYPES = Object.freeze(['incomplete-rom']);

/** Label shown with every cue from a rule that has no reviewed evidence (review mode). */
export const UNVALIDATED_LABEL = 'unvalidated rule';

/** Length limits for live cues (feedback-1.1.0): on-screen text and spoken words. */
export const CUE_LIMITS = Object.freeze({ maxTextChars: 60, maxSpeechWords: 6 });

/**
 * Cue catalog (feedback-1.1.0): on-screen text and spoken text for each issue type. Friendly,
 * actionable and short: each cue says what to do, not what went wrong. Wording describes only
 * the measured movement (torso tilt change, upper-arm movement away from the calibrated position,
 * an attempt that did not reach the calibrated top). No grip, wrist, load, muscle or injury claims.
 *  - torso-swing: |torsoDeviationDeg| from the calibrated torso tilt -> keep the chest tall and still.
 *  - upper-arm-drift: unsigned upper-arm movement from the calibrated tilt -> keep the elbow by
 *    the side (forward and backward drift are not distinguished, so no direction is named).
 *  - incomplete-rom: a committed attempt that ended partial was not counted -> curl all the way up.
 * Sprint 4 (feedback-1.0.0) texts were "Keep your torso still", "Keep your upper arm still at your
 * side" / "Keep your upper arm at your side" and "Curl all the way up".
 * @type {Readonly<Record<string, Readonly<{text: string, speechText: string}>>>}
 */
export const CUE_CATALOG = Object.freeze({
  swinging: Object.freeze({ text: 'Review upper-arm and torso movement after this attempt', speechText: 'Review arm and torso movement' }),
  'torso-swing': Object.freeze({ text: 'Keep your chest tall and still', speechText: 'Chest tall and still' }),
  'upper-arm-drift': Object.freeze({ text: 'Keep your elbow tucked by your side', speechText: 'Elbow by your side' }),
  'incomplete-rom': Object.freeze({ text: 'Curl all the way up to count the rep', speechText: 'All the way up' }),
});

/**
 * Tracking / positioning texts, keyed by IssueOutput.unavailableReason, plus 'no-validated-rules'
 * (form coaching off), 'stopped' (session ended) and 'tracking-ok'. Shown separately from form cues.
 * @type {Readonly<Record<string, string>>}
 */
export const TRACKING_TEXT = Object.freeze({
  'tracking-ok': 'Your arm is in view. Tracking your curl.',
  'tracking-dropout': 'Lost you for a moment. Hold steady in view.',
  'tracking-loss': "I can't see you. Step back into the camera view.",
  'calibration-required': 'To calibrate, stand side-on with your arm relaxed.',
  'unsupported-view': 'Turn side-on to the camera so I can see your arm.',
  recalibration: 'Recalibrating. Let your arm hang relaxed at your side.',
  'no-validated-rules': 'Form coaching off: no rule has been validated yet',
  'low-frame-rate': 'Camera too slow for form checks. Close other apps or tabs.',
  stopped: 'Session stopped',
});

/** Shown when speech synthesis is unavailable. */
export const SPEECH_UNAVAILABLE_TEXT = 'Voice unavailable; cues are shown as text';

/**
 * @param {string} issueType
 * @returns {{text: string, speechText: string}|null}
 */
export function getCueText(issueType) {
  return Object.hasOwn(CUE_CATALOG, issueType) ? CUE_CATALOG[issueType] : null;
}

/**
 * Text for a tracking state; unknown reasons fall back to the tracking-loss guidance.
 * @param {string|null} reason null means tracking is fine.
 * @returns {string}
 */
export function getTrackingText(reason) {
  if (reason === null || reason === undefined) return TRACKING_TEXT['tracking-ok'];
  return Object.hasOwn(TRACKING_TEXT, reason) ? TRACKING_TEXT[reason] : TRACKING_TEXT['tracking-loss'];
}

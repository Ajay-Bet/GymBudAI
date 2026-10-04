/**
 * Curl set lifecycle (Sprint 4 extension). Pure JavaScript, independent of React; no clock, no I/O.
 * Wraps one curl analyzer and one issue tracker so a set is calibrated, active, paused, finished
 * exactly once, and followed by a fresh set. See "Extension contract" → Set lifecycle in
 * docs/sprints/sprint-4-STATUS.md. Counting and rule thresholds are not changed here.
 *
 * States:
 * - 'calibrating': no ready frame (frame.ready === true) in this set yet.
 * - 'active': a ready frame arrived.
 * - 'paused': after pause(reason, t) (camera stopped). Counters are kept; the next ready frame
 *   resumes 'active'. A set that never became active stays 'calibrating' (nothing to pause).
 * - 'finished': after finish(). Frames, interrupt() and pause() are ignored until startNext().
 *
 * finish(t, extras) runs once: analyzer.interrupt('tracking-loss', t) closes a committed attempt in
 * progress (the analyzer has no 'set-ended' interrupt reason; such an attempt is recorded as
 * 'tracking-loss' and listed in summary.interruptedAttempts.closedAtFinish), its events go to
 * tracker.end(t, events) so open episodes end 'set-ended', then buildSetSummary, scoreSet and
 * buildSetFindings. Later calls return the same objects with alreadyFinished: true.
 *
 * startNext() resets analyzer and tracker with reason 'next-set' (new session UIDs, zero counters).
 * Calibration lives in the biomechanics engine and arrives on every FeatureFrame, so it is kept.
 * Calling startNext() before finish() discards the unfinished set (nothing persists in Sprint 4).
 *
 * @typedef {import('./analyzer.js').ExerciseAnalyzer} ExerciseAnalyzer
 * @typedef {import('./analyzer.js').AnalyzerOutput} AnalyzerOutput
 * @typedef {import('./analyzer.js').IssueOutput} IssueOutput
 * @typedef {'calibrating'|'active'|'paused'|'finished'} SetState
 *
 * @typedef {Object} SetResult
 * @property {Object} summary buildSetSummary() output, plus setId and setIndex.
 * @property {import('./setScore.js').SetScore} score
 * @property {import('./setFindings.js').SetFindings} findings
 * @property {boolean} alreadyFinished
 *
 * @typedef {Object} SetSnapshot
 * @property {SetState} state
 * @property {string} setId `set-<uid>`, unique across reloads.
 * @property {number} index 1-based set number within this lifecycle (startNext() adds 1).
 * @property {string|null} pauseReason Reason given to pause(); null unless 'paused'.
 * @property {number|null} startedMs Timestamp of the first ready frame of this set.
 * @property {number|null} finishedMs Timestamp finish() used (the tracker's session end).
 * @property {number} completedReps
 * @property {number} interruptedAttempts
 * @property {boolean} hasActivity Any completed rep or interrupted attempt in this set.
 */
import { createSessionUid } from './ids.js';
import { buildSetSummary } from './setSummary.js';
import { scoreSet } from './setScore.js';
import { buildSetFindings } from './setFindings.js';

const ANALYZER_INTERRUPT_REASONS = ['tracking-loss', 'recalibration'];

/**
 * Create a set lifecycle around existing analyzer and tracker instances.
 * @param {{analyzer: ExerciseAnalyzer, tracker: ReturnType<typeof import('./curlRules.js').createCurlIssueTracker>}} options
 */
export function createCurlSet({ analyzer, tracker } = {}) {
  if (!analyzer || !tracker) throw new Error('createCurlSet needs an analyzer and an issue tracker.');
  let index = 0, setId, state, pauseReason, startedMs, finishedMs, result;

  function beginSet() {
    index += 1;
    setId = `set-${createSessionUid()}`;
    state = 'calibrating'; pauseReason = null; startedMs = null; finishedMs = null; result = null;
  }

  /** Forward an interrupt to the analyzer and pass its events to the tracker. */
  function forwardInterrupt(reason, timestampMs) {
    const analyzerOutput = analyzer.interrupt(reason, timestampMs);
    const issueOutput = tracker.interrupt(reason, timestampMs, analyzerOutput.events);
    return { analyzerOutput, issueOutput };
  }

  /**
   * Process one FeatureFrame: analyzer.update, then tracker.update. Ignored once finished.
   * @param {Object} frame
   * @returns {{state: SetState, analyzerOutput: AnalyzerOutput|null, issueOutput: IssueOutput|null}}
   */
  function update(frame) {
    if (state === 'finished') return { state, analyzerOutput: null, issueOutput: null };
    const analyzerOutput = analyzer.update(frame);
    const issueOutput = tracker.update(frame, analyzerOutput);
    if (frame?.ready === true && state !== 'active') {
      state = 'active'; pauseReason = null;
      if (startedMs === null && Number.isFinite(frame.timestampMs)) startedMs = frame.timestampMs;
    }
    return { state, analyzerOutput, issueOutput };
  }

  /**
   * Tracking loss or recalibration from the UI: ends a committed attempt and the open episodes.
   * The set state does not change. Ignored once finished.
   * @param {'tracking-loss'|'recalibration'} reason
   * @param {number} [timestampMs]
   */
  function interrupt(reason, timestampMs) {
    if (state === 'finished') return { state, analyzerOutput: null, issueOutput: null };
    return { state, ...forwardInterrupt(reason, timestampMs) };
  }

  /**
   * Pause the set (camera stopped). Interrupts the analyzer and tracker ('recalibration' when that is
   * the reason, otherwise 'tracking-loss'); counters are kept. Ignored once finished.
   * @param {string} [reason] Free label, e.g. 'camera-stopped'.
   * @param {number} [timestampMs]
   */
  function pause(reason = 'camera-stopped', timestampMs) {
    if (state === 'finished') return { state, analyzerOutput: null, issueOutput: null };
    const interruptReason = ANALYZER_INTERRUPT_REASONS.includes(reason) ? reason : 'tracking-loss';
    const outputs = forwardInterrupt(interruptReason, timestampMs);
    if (state === 'active') { state = 'paused'; pauseReason = String(reason); }
    return { state, ...outputs };
  }

  /**
   * Finish the set exactly once.
   * @param {number} [timestampMs] Set end; the last processed timestamp when not finite or earlier.
   * @param {{cueLog?: Object[], mode?: 'validated-only'|'review', enabledRuleTypes?: string[], feedbackVersion?: string|null}} [extras]
   * @returns {SetResult}
   */
  function finish(timestampMs, { cueLog = [], mode = 'validated-only', enabledRuleTypes, feedbackVersion = null } = {}) {
    if (result) return { ...result, alreadyFinished: true };
    const closing = analyzer.interrupt('tracking-loss', timestampMs);
    const events = closing.events ?? [];
    const issueOutput = tracker.end(timestampMs, events);
    const closedAtFinishAttemptIds = events.filter((event) => event?.type === 'attempt-interrupted').map((event) => event.id);
    const summary = buildSetSummary({ analyzerSession: analyzer.getSession(), issueSession: tracker.getSession(), cueLog, mode,
      enabledRuleTypes, feedbackVersion, setId, setIndex: index, closedAtFinishAttemptIds });
    const score = scoreSet(summary);
    const findings = buildSetFindings(summary, score);
    result = { summary, score, findings };
    state = 'finished'; pauseReason = null;
    finishedMs = Number.isFinite(issueOutput?.timestampMs) ? issueOutput.timestampMs : null;
    return { ...result, alreadyFinished: false };
  }

  /**
   * Start a fresh set: analyzer.reset('next-set') and tracker.reset('next-set'); new setId, index + 1.
   * @returns {SetSnapshot}
   */
  function startNext() {
    analyzer.reset('next-set');
    tracker.reset('next-set');
    beginSet();
    return getState();
  }

  /** @returns {SetSnapshot} */
  function getState() {
    const session = analyzer.getSession();
    const completedReps = session.completedReps?.length ?? 0;
    const interruptedAttempts = session.interruptedAttempts?.length ?? 0;
    return { state, setId, index, pauseReason, startedMs, finishedMs, completedReps, interruptedAttempts,
      hasActivity: completedReps + interruptedAttempts > 0 };
  }

  beginSet();
  return { update, interrupt, pause, finish, startNext, getState };
}

/**
 * Shared exercise analyzer contract and registry (Sprint 3). Pure JavaScript, independent of React.
 * Every analyzer consumes timestamped biomechanics FeatureFrames (with their tracking readiness)
 * and returns phase, unique rep events, metrics and candidate issues. Candidate issues are detector
 * outputs for Sprint 4 coaching; they are not shown or spoken as corrections in Sprint 3.
 * Missing measurements are null, never 0. See docs/curl-analyzer-sprint-03.md.
 */
import { CURL_EXERCISE_ID, createCurlAnalyzer } from './curl.js';

/**
 * @typedef {'idle'|'bottom'|'lifting'|'top'|'lowering'} Phase
 *
 * @typedef {Object} CandidateIssue
 * @property {'torso-swing'|'upper-arm-drift'|'incomplete-rom'} type
 * @property {number} startMs First timestamp of the continuous episode.
 * @property {number|null} endMs Last timestamp above threshold; null while the episode is still open.
 * @property {number|null} peak Largest absolute value in the episode (incomplete-rom: achieved ROM).
 * @property {string} unit 'deg'.
 * @property {string} configVersion
 *
 * @typedef {Object} RepSummary
 * @property {string} id Globally unique (`curl-<sessionUid>-<n>`, new UUID per analyzer/reset); equals the
 *   RepEvent id and the attempt id the analyzer reported while this rep was in progress.
 * @property {number} index 1-based completed-rep number in the session.
 * @property {'completed'} status
 * @property {'left'|'right'} side Anatomical side.
 * @property {string} view
 * @property {number} startMs Last bottom frame before lift-off.
 * @property {number|null} topMs First frame in the top zone.
 * @property {number} endMs First frame back in the bottom zone.
 * @property {number} durationMs endMs - startMs.
 * @property {number|null} minFlexionDeg
 * @property {number|null} maxFlexionDeg
 * @property {number|null} romDeg maxFlexionDeg - minFlexionDeg (observed angular span).
 * @property {number} validObservedMs Time between consecutive ready frames inside the rep.
 * @property {number|null} coverage validObservedMs / durationMs (0-1).
 * @property {number|null} maxAbsUpperArmDriftDeg
 * @property {number|null} maxElbowDisplacement Torso lengths.
 * @property {number|null} maxAbsTorsoDeviationDeg
 * @property {CandidateIssue[]} candidateIssues
 * @property {string} configVersion
 * @property {string|null} featureVersion
 * @property {Object<string,string>} units
 *
 * @typedef {Object} InterruptedAttempt
 * @property {string} id
 * @property {'interrupted'} status
 * @property {'partial'|'tracking-loss'|'pause-timeout'|'low-coverage'|'reset'|'recalibration'} reason
 * @property {number} startMs
 * @property {number} endMs
 * @property {number|null} maxFlexionDeg
 * @property {number|null} romDeg
 * @property {number|null} coverage
 * @property {CandidateIssue[]} candidateIssues
 * @property {string} configVersion
 *
 * @typedef {{type: 'rep-completed', id: string, rep: RepSummary}
 *   | {type: 'attempt-interrupted', id: string, attempt: InterruptedAttempt}} RepEvent
 *
 * @typedef {Object} AnalyzerOutput
 * @property {string} exerciseId
 * @property {string} configVersion
 * @property {number|null} timestampMs Timestamp of the processed frame (null before any frame / after reset).
 * @property {Phase} phase
 * @property {boolean} paused True while tracking/calibration does not allow analysis.
 * @property {string|null} pauseReason 'tracking-dropout' | 'tracking-loss' | 'recalibration' | 'calibration-required' |
 *   'unsupported-view' | null.
 * @property {number} repCount Completed reps in the session.
 * @property {{id: string, startMs: number, phase: Phase}|null} attempt Current committed attempt.
 * @property {RepEvent[]} events Events produced by this frame only; each id is emitted once and never repeats
 *   across sessions or reloads.
 * @property {{elbowFlexionDeg: number|null, directionDegS: number|null}} live
 * @property {CandidateIssue[]} candidateIssues Confirmed episodes on the current attempt.
 *
 * @typedef {Object} ExerciseAnalyzer
 * @property {string} exerciseId
 * @property {Object} config Frozen detector configuration (includes version).
 * @property {(frame: Object) => AnalyzerOutput} update
 * @property {(reason: 'tracking-loss'|'recalibration', timestampMs?: number) => AnalyzerOutput} interrupt Ends a
 *   committed attempt with that reason (event in the output), drops a pending one, sets phase 'idle',
 *   paused true and pauseReason = reason. Keeps completed reps and the count. A non-finite timestamp
 *   uses the last processed one. Does not change update()'s timestamp ordering.
 * @property {(reason?: string) => AnalyzerOutput} reset
 * @property {() => AnalyzerSession} getSession
 *
 * @typedef {Object} AnalyzerSession
 * @property {string} sessionId Session UID used in rep/attempt IDs (new per analyzer instance and reset).
 * @property {string} exerciseId
 * @property {string} configVersion
 * @property {string|null} featureVersion
 * @property {string|null} side
 * @property {string|null} view
 * @property {RepSummary[]} completedReps
 * @property {InterruptedAttempt[]} interruptedAttempts
 */

/**
 * Sprint 4 coaching types (curlRules.js, setSummary.js). See "Agreed coaching contract" in
 * docs/sprints/sprint-4-STATUS.md. Times are FeatureFrame.timestampMs (ms).
 *
 * @typedef {'torso-swing'|'upper-arm-drift'|'incomplete-rom'} IssueType
 *
 * @typedef {Object} IssueEpisode One continuous issue episode (one event however many frames it spans).
 * @property {string} id `issue-<sessionUid>-<n>`, globally unique.
 * @property {IssueType} type
 * @property {number} startMs First frame of the onset evidence (incomplete-rom: attempt end).
 * @property {number|null} endMs null while open. 'resolved': first frame of the release run; other
 *   reasons: last assessable frame of the episode; incomplete-rom: attempt end.
 * @property {number|null} peak Largest |value| observed in the episode (incomplete-rom: achieved ROM).
 * @property {'deg'} unit
 * @property {'resolved'|'tracking-lost'|'recalibration'|'set-ended'|'reset'|'evaluated-at-attempt-end'|null} endReason
 * @property {string[]} attemptIds Committed analyzer attempts (attempt.id / rep id) overlapping the episode.
 * @property {string} rulesVersion
 * @property {string|null} analyzerVersion
 * @property {boolean} enabled Rule may coach users (false for every rule until validated).
 * @property {'unvalidated'|'validated'} validation
 *
 * @typedef {{type: 'issue-started'|'issue-ended', episode: IssueEpisode}} IssueEvent
 *
 * @typedef {Object} ActiveIssue An open continuous episode.
 * @property {IssueType} type
 * @property {string} episodeId
 * @property {number} startMs
 * @property {number|null} peak
 * @property {'deg'} unit
 * @property {'active'|'suspended'} state 'suspended' while the rule is not assessable (not released).
 * @property {boolean} enabled
 * @property {'unvalidated'|'validated'} validation
 *
 * @typedef {Object} IssueOutput
 * @property {number|null} timestampMs
 * @property {boolean} assessable Frame passed the validity gate.
 * @property {null|'tracking-dropout'|'tracking-loss'|'calibration-required'|'unsupported-view'|'recalibration'|'low-frame-rate'} unavailableReason
 * @property {ActiveIssue[]} active
 * @property {IssueEvent[]} events New this frame only; an episode starts and ends at most once.
 *
 * @typedef {Object} IssueSession
 * @property {string} sessionId Session UID used in episode IDs.
 * @property {string} rulesVersion
 * @property {IssueEpisode[]} episodes
 * @property {{startMs: number, endMs: number}[]} assessableIntervals Runs of consecutive assessable frames.
 * @property {number|null} startedMs First processed frame.
 * @property {number|null} lastMs Last processed frame.
 * @property {number|null} endedMs Set by end(); null before.
 */

/** Create an empty exercise registry. */
export function createExerciseRegistry() {
  const factories = new Map();
  return {
    /** @param {string} id @param {(options?: Object) => ExerciseAnalyzer} factory */
    register(id, factory) {
      if (typeof id !== 'string' || !id) throw new Error('Exercise id must be a non-empty string.');
      if (typeof factory !== 'function') throw new Error(`Analyzer factory for ${id} must be a function.`);
      if (factories.has(id)) throw new Error(`Exercise already registered: ${id}`);
      factories.set(id, factory);
    },
    /** @param {string} id @param {Object} [options] @returns {ExerciseAnalyzer} */
    create(id, options = {}) {
      const factory = factories.get(id);
      if (!factory) throw new Error(`Unknown exercise: ${id}`);
      return factory(options);
    },
    /** @returns {string[]} */
    list() { return [...factories.keys()]; },
  };
}

/** Default registry with the supported exercises. */
export const defaultExerciseRegistry = createExerciseRegistry();
defaultExerciseRegistry.register(CURL_EXERCISE_ID, createCurlAnalyzer);

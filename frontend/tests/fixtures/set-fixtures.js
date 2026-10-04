// Sprint 4 extension: labelled SYNTHETIC set-summary inputs for the set score, findings and
// end-of-set text tests. Sessions are hand-built with known denominators (rep windows, assessable
// intervals and episode windows chosen by hand). They prove arithmetic and wording rules only; they
// are NOT recordings of a person and carry no claim about detection accuracy.
import { buildSetSummary } from '../../src/exercises/setSummary.js';

export const SYNTHETIC = true;

/** Extension contract values (docs/sprints/sprint-4-STATUS.md, "Extension contract", 2026-10-04). */
export const EXT = Object.freeze({
  scoreVersion: 'curl-score-1.0.0',
  scoreLabel: 'GymBud detector-based summary, not a clinical or injury-risk assessment',
  penalties: Object.freeze({ 'torso-swing': 50, 'upper-arm-drift': 50 }),
  minAnalyzedReps: 3,
  minAnalyzedFraction: 0.5,
  unavailableReasons: Object.freeze(['no-validated-rules', 'no-completed-reps', 'too-few-analyzed-reps', 'low-coverage']),
  forbidden: Object.freeze(['grip', 'wrist', 'muscle', 'activation', 'load', 'weight', 'heavy', 'injury', 'pain', 'risk',
    'clinical', 'posture score', 'perfect', 'flawless']),
  aiDisclosure: 'Voice is AI-generated (OpenAI)',
  outputModes: Object.freeze(['text', 'audio-text']),
  featureSchema: '1.2.0',
  feedbackVersion: 'feedback-1.1.0',
  blockedReasons: Object.freeze(['not-side-on', 'moving', 'arm-not-relaxed', 'tracking-gap']),
});

/** Reps are 2 s long, 3 s apart: rep i spans [1000 + 3000 i, 3000 + 3000 i]. */
export const repWindow = (i) => ({ startMs: 1000 + 3000 * i, endMs: 3000 + 3000 * i });

export function analyzerSession({ reps = 4, partial = 0, trackingLoss = 0 } = {}) {
  const completedReps = Array.from({ length: reps }, (_, i) => ({ id: `curl-syn-a-${i + 1}`, index: i + 1, status: 'completed', side: 'left', view: 'side',
    ...repWindow(i), durationMs: 2000, candidateIssues: [], configVersion: 'curl-1.1.0', featureVersion: '1.1.0' }));
  const end = 3000 + 3000 * Math.max(0, reps - 1);
  const interruptedAttempts = [];
  for (let k = 0; k < partial; k += 1) interruptedAttempts.push({ id: `curl-syn-a-p${k}`, status: 'interrupted', reason: 'partial', startMs: end + 200 + k * 600, endMs: end + 600 + k * 600, romDeg: 50 });
  for (let k = 0; k < trackingLoss; k += 1) interruptedAttempts.push({ id: `curl-syn-a-l${k}`, status: 'interrupted', reason: 'tracking-loss', startMs: end + 5000 + k * 600, endMs: end + 5400 + k * 600, romDeg: null });
  return { sessionId: 'syn-a', exerciseId: 'dumbbell-curl', configVersion: 'curl-1.1.0', featureVersion: '1.1.0', side: 'left', view: 'side',
    completedReps, interruptedAttempts };
}

let n = 0;
/** One continuous episode (SYNTHETIC). */
export const ep = (type, startMs, endMs, extra = {}) => ({ id: `issue-syn-b-${++n}`, type, startMs, endMs, peak: 15, unit: 'deg',
  endReason: type === 'incomplete-rom' ? 'evaluated-at-attempt-end' : 'resolved', attemptIds: [], rulesVersion: 'curl-rules-1.0.0',
  analyzerVersion: 'curl-1.1.0', enabled: false, validation: 'unvalidated', ...extra });

export function issueSession({ episodes = [], intervals = [{ startMs: 0, endMs: 40000 }], endMs = 40000 } = {}) {
  return { sessionId: 'syn-b', rulesVersion: 'curl-rules-1.0.0', episodes, assessableIntervals: intervals, startedMs: 0, lastMs: endMs, endedMs: endMs };
}

/** Assessable intervals covering only the listed rep indices (other reps get 0 coverage). */
export const coverOnly = (indices) => indices.map((i) => ({ startMs: repWindow(i).startMs - 100, endMs: repWindow(i).endMs + 100 }));

/** Build a summary with set-summary-1.0.0. Defaults: review mode, 4 reps fully covered, no episodes. */
export function summary({ reps = 4, partial = 0, trackingLoss = 0, episodes = [], intervals, mode = 'review', enabledRuleTypes = [], endMs = 40000 } = {}) {
  return buildSetSummary({ analyzerSession: analyzerSession({ reps, partial, trackingLoss }),
    issueSession: issueSession({ episodes, endMs, ...(intervals ? { intervals } : {}) }), cueLog: [], mode, enabledRuleTypes,
    startedMs: 0, endedMs: endMs, feedbackVersion: 'feedback-1.1.0' });
}

/** Every number (integers and decimals) in a text. */
export const numbersIn = (text) => (String(text).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

/** Sentence count (., ! or ? followed by space or end). */
export const sentenceCount = (text) => String(text).split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim().length > 0).length;

/** Collect every primitive number inside an object tree. */
export function numbersInObject(value, out = new Set()) {
  if (typeof value === 'number' && Number.isFinite(value)) out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => numbersInObject(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => numbersInObject(v, out));
  return out;
}

/**
 * Set summary builder (Sprint 4, GB 404). Pure JavaScript, independent of React; no clock, no I/O.
 * The result (`set-summary-1.0.0`) is the Sprint 5 workout payload candidate. See "Agreed coaching
 * contract" in docs/sprints/sprint-4-STATUS.md.
 *
 * Definitions (all times are FeatureFrame.timestampMs, ms):
 * - Completed rep: a `rep-completed` event of the analyzer (analyzerSession.completedReps).
 * - Interrupted attempt: a committed attempt the analyzer ended without completing it, counted by reason.
 * - Assessed rule types: the rules this summary judges form with. 'validated-only' mode: the enabled
 *   rules (enabledRuleTypes). 'review' mode (developer opt-in): every rule (ruleTypes).
 * - Form coverage of a rep: assessable time (issue tracker assessableIntervals) inside
 *   [rep.startMs, rep.endMs] divided by rep.durationMs (fraction 0-1); null when it cannot be measured.
 * - Analyzed rep: a completed rep with form coverage >= minFormCoverage (0.8) AND at least one
 *   assessed rule type.
 * - notAnalyzedReason (why analyzedReps is 0; first match wins): 'no-validated-rules' (no assessed
 *   rule type), 'no-completed-reps', 'low-coverage' (completed reps exist but none reaches
 *   minFormCoverage); otherwise null.
 * - episodeCountsByType counts episodes of assessed rule types; unassessedEpisodeCountsByType counts
 *   episodes the tracker detected for rules not assessed in this mode (not form claims).
 * - An episode overlaps a rep when its attemptIds contain the rep id, or, for a continuous episode
 *   (not incomplete-rom), when its [startMs, endMs] overlaps [rep.startMs, rep.endMs] with positive
 *   length (an open episode extends to the end of the session). incomplete-rom episodes belong to
 *   interrupted attempts, so they never mark a completed rep.
 * - Issue-bearing rep: an analyzed rep overlapped by at least one episode of an assessed rule type.
 *   Each rep counts once however many issue types or episodes overlap it.
 * - noIssueReps = analyzedReps - issueBearingReps; noIssueFraction = noIssueReps / analyzedReps, or null
 *   when analyzedReps is 0. It is a detector summary, not a validated form score.
 * - Tracking coverage: assessable time inside [startedMs, endedMs] divided by endedMs - startedMs.
 * - interruptedAttempts.closedAtFinish (extension, additive): how many of the interrupted attempts were
 *   closed only because the set was finished mid-attempt (setSession.js finish()). They keep their
 *   analyzer reason ('tracking-loss') in byReason; findings subtract them from tracking interruptions.
 * - setId / setIndex (extension, additive): the set lifecycle's `set-<uid>` id and 1-based index, null
 *   when the summary is built outside setSession.js.
 * Missing values are null, never 0. Counts are numbers (0 is a real count).
 *
 * @typedef {import('./analyzer.js').AnalyzerSession} AnalyzerSession
 * @typedef {import('./analyzer.js').IssueSession} IssueSession
 * @typedef {import('./analyzer.js').IssueEpisode} IssueEpisode
 */
import { CURL_ISSUE_TYPES, CURL_RULES_CONFIG } from './curlRules.js';

export const SET_SUMMARY_CONFIG = Object.freeze({
  schemaVersion: 'set-summary-1.0.0',
  // Minimum assessable fraction of a rep for it to count as analyzed (same value as CURL_CONFIG.minCoverage).
  minFormCoverage: 0.8,
});

const INTERRUPT_REASONS = ['partial', 'tracking-loss', 'pause-timeout', 'low-coverage', 'reset', 'recalibration'];
const MODES = ['validated-only', 'review'];
const INSTANT_TYPES = ['incomplete-rom'];

const UNITS = Object.freeze({
  startedMs: 'ms (FeatureFrame.timestampMs clock)', endedMs: 'ms (FeatureFrame.timestampMs clock)',
  'trackingCoverage.assessableMs': 'ms', 'trackingCoverage.sessionMs': 'ms', 'trackingCoverage.fraction': 'fraction (0-1)',
  'reps.startMs': 'ms', 'reps.endMs': 'ms', 'reps.formCoverage': 'fraction (0-1)',
  'episodes.startMs': 'ms', 'episodes.endMs': 'ms', 'episodes.peak': 'deg (incomplete-rom: achieved ROM, deg)',
  noIssueFraction: 'fraction (0-1)',
  completedReps: 'count', analyzedReps: 'count', issueBearingReps: 'count', noIssueReps: 'count',
  'interruptedAttempts.total': 'count', 'interruptedAttempts.closedAtFinish': 'count', episodeCountsByType: 'count', unassessedEpisodeCountsByType: 'count',
});

const finite = (value) => (Number.isFinite(value) ? value : null);
const copy = (value) => JSON.parse(JSON.stringify(value));

/** Total length of intervals clipped to [from, to] (ms). */
function overlapMs(intervals, from, to) {
  let total = 0;
  for (const interval of intervals) {
    const start = Math.max(interval.startMs, from), end = Math.min(interval.endMs, to);
    if (end > start) total += end - start;
  }
  return total;
}

/**
 * Build the summary of one set.
 * @param {Object} input
 * @param {AnalyzerSession} input.analyzerSession analyzer.getSession().
 * @param {IssueSession|null} [input.issueSession] tracker.getSession(); without it form coverage is unknown.
 * @param {Object[]} [input.cueLog] scheduler.getCueLog(), copied as is.
 * @param {'validated-only'|'review'} [input.mode]
 * @param {string[]} [input.enabledRuleTypes] Enabled rules; default: rules with enabled true in CURL_RULES_CONFIG.
 * @param {string[]} [input.ruleTypes] All rule types (assessed in 'review'); default: CURL_ISSUE_TYPES.
 * @param {string|null} [input.feedbackVersion] FEEDBACK_CONFIG.version (not part of the agreed signature; optional).
 * @param {number} [input.startedMs] Default: issueSession.startedMs.
 * @param {number} [input.endedMs] Default: issueSession.endedMs, else issueSession.lastMs.
 * @param {string|null} [input.setId] Set lifecycle id (`set-<uid>`), extension.
 * @param {number|null} [input.setIndex] 1-based set number, extension.
 * @param {string[]} [input.closedAtFinishAttemptIds] Attempts the set's finish() closed, extension.
 */
export function buildSetSummary({ analyzerSession, issueSession = null, cueLog = [], mode = 'validated-only',
  enabledRuleTypes, ruleTypes = CURL_ISSUE_TYPES, feedbackVersion = null, startedMs, endedMs,
  setId = null, setIndex = null, closedAtFinishAttemptIds = [] } = {}) {
  if (!MODES.includes(mode)) throw new Error(`Unknown summary mode: ${mode}`);
  const enabled = enabledRuleTypes ?? Object.values(CURL_RULES_CONFIG.rules).filter((rule) => rule.enabled).map((rule) => rule.type);
  const assessedRuleTypes = [...new Set(mode === 'review' ? ruleTypes : enabled)];
  const assessed = new Set(assessedRuleTypes);

  const completed = analyzerSession?.completedReps ?? [];
  const interrupted = analyzerSession?.interruptedAttempts ?? [];
  const intervals = issueSession?.assessableIntervals ?? null;
  const start = finite(startedMs) ?? finite(issueSession?.startedMs);
  const end = finite(endedMs) ?? finite(issueSession?.endedMs) ?? finite(issueSession?.lastMs);

  const episodes = (issueSession?.episodes ?? []).map((episode) => ({ ...copy(episode), assessed: assessed.has(episode.type) }));
  const episodeEnd = (episode) => finite(episode.endMs) ?? end ?? Infinity;
  const overlaps = (episode, rep) => (episode.attemptIds ?? []).includes(rep.id)
    || (!INSTANT_TYPES.includes(episode.type) && episode.startMs < rep.endMs && episodeEnd(episode) > rep.startMs);

  const reps = completed.map((rep) => {
    const duration = finite(rep.endMs) !== null && finite(rep.startMs) !== null ? rep.endMs - rep.startMs : null;
    const formCoverage = intervals && duration !== null && duration > 0
      ? Math.min(1, overlapMs(intervals, rep.startMs, rep.endMs) / duration) : null;
    const analyzed = assessedRuleTypes.length > 0 && formCoverage !== null && formCoverage >= SET_SUMMARY_CONFIG.minFormCoverage;
    const matching = episodes.filter((episode) => episode.assessed && overlaps(episode, rep));
    const issueTypes = [...new Set(matching.map((episode) => episode.type))];
    return { id: rep.id, index: rep.index, startMs: rep.startMs, endMs: rep.endMs, analyzed, formCoverage,
      issueBearing: analyzed && matching.length > 0, issueTypes, episodeIds: matching.map((episode) => episode.id) };
  });

  const analyzedReps = reps.filter((rep) => rep.analyzed).length;
  const issueBearingReps = reps.filter((rep) => rep.issueBearing).length;
  const noIssueReps = analyzedReps - issueBearingReps;

  const byReason = Object.fromEntries(INTERRUPT_REASONS.map((reason) => [reason, 0]));
  for (const attempt of interrupted) byReason[attempt.reason] = (byReason[attempt.reason] ?? 0) + 1;
  const closedIds = new Set(closedAtFinishAttemptIds ?? []);
  const closedAtFinish = interrupted.filter((attempt) => closedIds.has(attempt.id)).length;

  const episodeCountsByType = Object.fromEntries(assessedRuleTypes.map((type) => [type, 0]));
  const unassessedEpisodeCountsByType = Object.fromEntries(ruleTypes.filter((type) => !assessed.has(type)).map((type) => [type, 0]));
  for (const episode of episodes) {
    const counts = episode.assessed ? episodeCountsByType : unassessedEpisodeCountsByType;
    counts[episode.type] = (counts[episode.type] ?? 0) + 1;
  }
  const notAnalyzedReason = assessedRuleTypes.length === 0 ? 'no-validated-rules'
    : completed.length === 0 ? 'no-completed-reps'
      : analyzedReps === 0 ? 'low-coverage' : null;

  const sessionMs = start !== null && end !== null && end > start ? end - start : null;
  const assessableMs = intervals && sessionMs !== null ? overlapMs(intervals, start, end) : null;
  const firstRep = completed[0];

  return {
    schemaVersion: SET_SUMMARY_CONFIG.schemaVersion,
    setId: setId ?? null,
    setIndex: Number.isFinite(setIndex) ? setIndex : null,
    sessionId: issueSession?.sessionId ?? analyzerSession?.sessionId ?? null,
    analyzerSessionId: analyzerSession?.sessionId ?? null,
    exerciseId: analyzerSession?.exerciseId ?? null,
    side: analyzerSession?.side ?? firstRep?.side ?? null,
    view: analyzerSession?.view ?? firstRep?.view ?? null,
    analyzerVersion: analyzerSession?.configVersion ?? null,
    featureVersion: analyzerSession?.featureVersion ?? null,
    rulesVersion: issueSession?.rulesVersion ?? null,
    feedbackVersion,
    mode,
    assessedRuleTypes,
    startedMs: start,
    endedMs: end,
    completedReps: completed.length,
    interruptedAttempts: { total: interrupted.length, byReason, closedAtFinish },
    analyzedReps,
    notAnalyzedReason,
    issueBearingReps,
    noIssueReps,
    noIssueFraction: analyzedReps > 0 ? noIssueReps / analyzedReps : null,
    noIssueFractionLabel: 'detector summary',
    trackingCoverage: { assessableMs, sessionMs, fraction: assessableMs !== null && sessionMs ? assessableMs / sessionMs : null },
    minFormCoverage: SET_SUMMARY_CONFIG.minFormCoverage,
    episodes,
    episodeCountsByType,
    unassessedEpisodeCountsByType,
    reps,
    cueLog: copy(cueLog ?? []),
    units: UNITS,
  };
}

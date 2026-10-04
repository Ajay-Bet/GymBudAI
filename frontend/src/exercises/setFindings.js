/**
 * End-of-set findings (Sprint 4 extension). Pure JavaScript, independent of React; no clock, no I/O.
 * Turns a `set-summary-1.0.0` summary (setSummary.js) into coded facts for the end-of-set panel and
 * wording (feedback/setFeedbackText.js). See "Extension contract" → Findings in
 * docs/sprints/sprint-4-STATUS.md.
 *
 * Only facts the summary supports are produced. No strength is ever made from an absent (unassessed)
 * rule or from missing tracking: a null coverage yields neither steady-tracking nor low-tracking.
 * Every finding carries numeric `values` (counts with their denominators, coverage as a 0-1 fraction).
 *
 * Strengths (in this order):
 * - `completed-reps` {completedReps}: completedReps >= 1. A completion fact, not a form claim.
 * - `steady-tracking` {coverage, assessableMs, sessionMs}: trackingCoverage.fraction >= 0.9.
 * - `clean-reps-<type>` {type, cleanReps, analyzedReps}: for each assessed rule type that can mark a
 *   completed rep (torso-swing, upper-arm-drift), when analyzedReps >= 1 and cleanReps >= 1, where
 *   cleanReps = analyzed reps without that type. incomplete-rom never marks a completed rep, so a
 *   "clean" count for it would be praise from absence; it is not produced.
 * - `full-range-completed` {completedReps}: completedReps >= 1. Every counted rep reached the
 *   calibrated top zone (true by definition of a completed rep); word it as a counting fact.
 * Improvements (in focus priority order):
 * - `issue-<type>` {type, reps, analyzedReps}: assessed live rule types with reps >= 1 analyzed reps
 *   bearing that type, in ISSUE_PRIORITY order.
 * - `partial-attempts` {count, completedReps}: committed attempts that ended 'partial' (not counted).
 * - `low-tracking` {coverage, assessableMs, sessionMs}: trackingCoverage.fraction < 0.8.
 * - `tracking-interruptions` {count, completedReps}: attempts interrupted by 'tracking-loss', minus an
 *   attempt closed only because the user pressed Finish set (interruptedAttempts.closedAtFinish).
 * Focus: the first improvement in that order (assessed issues by priority, then partial attempts,
 * then tracking), else null.
 *
 * @typedef {Object} Finding
 * @property {string} code
 * @property {Object<string, number|string>} values Numbers, plus the issue `type` string where relevant.
 *
 * @typedef {Object} SetFindings
 * @property {Finding[]} strengths
 * @property {Finding[]} improvements
 * @property {Finding|null} focus
 */

// Same order as PRIORITY_POLICY.order in frontend/src/feedback/cues.js (live issue types only).
// Duplicated on purpose so exercises/ does not import from feedback/; keep the two in step.
export const ISSUE_PRIORITY = Object.freeze(['torso-swing', 'upper-arm-drift']);

export const FINDINGS_CONFIG = Object.freeze({
  steadyTrackingMin: 0.9, // trackingCoverage.fraction at or above: steady-tracking strength
  lowTrackingBelow: 0.8, // trackingCoverage.fraction below: low-tracking improvement
});

const count = (value) => (Number.isFinite(value) ? value : 0);

/**
 * Build the findings of one set.
 * @param {Object} summary buildSetSummary() output.
 * @param {Object|null} [score] scoreSet() output. Accepted for the agreed signature; findings do not
 *   depend on it (they come from the summary alone, so they exist when the score is unavailable).
 * @returns {SetFindings}
 */
export function buildSetFindings(summary, score = null) {
  void score;
  const strengths = [], improvements = [];
  const completedReps = count(summary?.completedReps);
  const assessed = new Set(summary?.assessedRuleTypes ?? []);
  const analyzedReps = (summary?.reps ?? []).filter((rep) => rep?.analyzed === true);
  const coverage = summary?.trackingCoverage ?? {};
  const fraction = Number.isFinite(coverage.fraction) ? coverage.fraction : null;
  const coverageValues = { coverage: fraction, assessableMs: coverage.assessableMs, sessionMs: coverage.sessionMs };
  const liveTypes = ISSUE_PRIORITY.filter((type) => assessed.has(type));
  const repsWith = (type) => analyzedReps.filter((rep) => (rep.issueTypes ?? []).includes(type)).length;

  if (completedReps >= 1) strengths.push({ code: 'completed-reps', values: { completedReps } });
  if (fraction !== null && fraction >= FINDINGS_CONFIG.steadyTrackingMin) strengths.push({ code: 'steady-tracking', values: coverageValues });
  if (analyzedReps.length >= 1) {
    for (const type of liveTypes) {
      const cleanReps = analyzedReps.length - repsWith(type);
      if (cleanReps >= 1) strengths.push({ code: `clean-reps-${type}`, values: { type, cleanReps, analyzedReps: analyzedReps.length } });
    }
  }
  if (completedReps >= 1) strengths.push({ code: 'full-range-completed', values: { completedReps } });

  for (const type of liveTypes) {
    const reps = repsWith(type);
    if (reps >= 1) improvements.push({ code: `issue-${type}`, values: { type, reps, analyzedReps: analyzedReps.length } });
  }
  const byReason = summary?.interruptedAttempts?.byReason ?? {};
  const partial = count(byReason.partial);
  if (partial >= 1) improvements.push({ code: 'partial-attempts', values: { count: partial, completedReps } });
  if (fraction !== null && fraction < FINDINGS_CONFIG.lowTrackingBelow) improvements.push({ code: 'low-tracking', values: coverageValues });
  const lost = Math.max(0, count(byReason['tracking-loss']) - count(summary?.interruptedAttempts?.closedAtFinish));
  if (lost >= 1) improvements.push({ code: 'tracking-interruptions', values: { count: lost, completedReps } });

  return { strengths, improvements, focus: improvements[0] ?? null };
}

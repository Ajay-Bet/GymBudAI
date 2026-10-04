/**
 * Set score (Sprint 4 extension). Pure JavaScript, independent of React; no clock, no I/O.
 * A transparent, detector-based form summary of one set, computed only from a `set-summary-1.0.0`
 * summary (setSummary.js). See "Extension contract" → Score in docs/sprints/sprint-4-STATUS.md.
 * Every number is an unvalidated default; the score is not a clinical or injury-risk assessment.
 *
 * Formula (`curl-score-1.0.0`):
 * - Scored rule types: the summary's assessedRuleTypes that have a penalty in SCORE_CONFIG.penalties
 *   (the live rules torso-swing and upper-arm-drift). incomplete-rom has no penalty: it belongs to
 *   partial attempts, which never enter the score.
 * - Only analyzed reps enter (completed reps with >= 0.8 assessable coverage and >= 1 assessed rule).
 *   Unanalyzed reps are left out, never counted as 100, so missing observation is not good form.
 * - repScore = max(0, 100 - Σ penalty[type]) over the DISTINCT scored issue types on that rep
 *   (summary rep.issueTypes, already one entry per type however many episodes overlap the rep).
 * - value = round(mean repScore over analyzed reps), an integer 0-100.
 * - Completion counts (completed reps, partial or interrupted attempts) never feed the value.
 *
 * Availability (first failing condition wins, so the reason names the most useful fix):
 *   1. 'no-validated-rules'    no scored rule type is assessed (default mode: every rule disabled);
 *   2. 'no-completed-reps'     completedReps === 0;
 *   3. 'low-coverage'          analyzedReps / completedReps < minAnalyzedFraction (0.5);
 *   4. 'too-few-analyzed-reps' analyzedReps < minAnalyzedReps (3).
 * An unavailable score has value null and still carries label, formula, inputs and version.
 * Review-mode scores (unvalidated rules) carry experimental: true.
 *
 * @typedef {Object} RepScoreInput
 * @property {string} id Rep id (`curl-<sessionUid>-<n>`).
 * @property {string[]} issueTypes Distinct scored issue types on the rep.
 * @property {number} repScore 0-100.
 *
 * @typedef {Object} SetScore
 * @property {boolean} available
 * @property {null|'no-validated-rules'|'no-completed-reps'|'too-few-analyzed-reps'|'low-coverage'} reason
 * @property {number|null} value Integer 0-100, null when unavailable.
 * @property {boolean} experimental True in review mode (unvalidated rules).
 * @property {string} label
 * @property {string} formula Human-readable formula.
 * @property {{analyzedReps: number, completedReps: number, scoredRuleTypes: string[], perRep: RepScoreInput[]}} inputs
 *   perRep lists analyzed reps only (empty when unavailable for a rule or rep reason).
 * @property {string} version
 */

export const SCORE_CONFIG = Object.freeze({
  version: 'curl-score-1.0.0',
  // Points removed from a rep's 100 for each distinct live issue type on it (unvalidated defaults).
  penalties: Object.freeze({ 'torso-swing': 50, 'upper-arm-drift': 50 }),
  maxRepScore: 100,
  minAnalyzedReps: 3,
  minAnalyzedFraction: 0.5,
  label: 'GymBud detector-based summary, not a clinical or injury-risk assessment',
  formula: 'Per analyzed rep: 100 minus 50 for torso swing and 50 for upper-arm drift (each type once per rep, '
    + 'floored at 0). Set score: the mean over analyzed reps, rounded. Needs at least 3 analyzed reps and at least '
    + 'half of the completed reps analyzed. Unanalyzed reps and partial attempts are left out.',
});

const count = (value) => (Number.isFinite(value) ? value : 0);

/**
 * Score one set from its summary.
 * @param {Object} summary buildSetSummary() output.
 * @returns {SetScore}
 */
export function scoreSet(summary) {
  const penalties = SCORE_CONFIG.penalties;
  const scoredRuleTypes = (summary?.assessedRuleTypes ?? []).filter((type) => Object.hasOwn(penalties, type));
  const scored = new Set(scoredRuleTypes);
  const completedReps = count(summary?.completedReps);
  const analyzed = (summary?.reps ?? []).filter((rep) => rep?.analyzed === true);
  const analyzedReps = analyzed.length;

  const reason = scoredRuleTypes.length === 0 ? 'no-validated-rules'
    : completedReps === 0 ? 'no-completed-reps'
      : analyzedReps / completedReps < SCORE_CONFIG.minAnalyzedFraction ? 'low-coverage'
        : analyzedReps < SCORE_CONFIG.minAnalyzedReps ? 'too-few-analyzed-reps' : null;

  const perRep = scoredRuleTypes.length === 0 ? [] : analyzed.map((rep) => {
    const issueTypes = [...new Set(rep.issueTypes ?? [])].filter((type) => scored.has(type));
    const penalty = issueTypes.reduce((total, type) => total + penalties[type], 0);
    return { id: rep.id, issueTypes, repScore: Math.max(0, SCORE_CONFIG.maxRepScore - penalty) };
  });
  const value = reason === null ? Math.round(perRep.reduce((total, rep) => total + rep.repScore, 0) / perRep.length) : null;

  return {
    available: reason === null,
    reason,
    value,
    experimental: summary?.mode === 'review',
    label: SCORE_CONFIG.label,
    formula: SCORE_CONFIG.formula,
    inputs: { analyzedReps, completedReps, scoredRuleTypes, perRep },
    version: SCORE_CONFIG.version,
  };
}

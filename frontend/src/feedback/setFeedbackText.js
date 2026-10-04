/**
 * End-of-set feedback text (Sprint 4 extension, feedback-1.1.0). Pure JavaScript, independent of
 * React; deterministic (same input, same text). Implements "Feedback wording and output" in
 * docs/sprints/sprint-4-STATUS.md.
 *
 * Input is the structured result of the set: findings from buildSetFindings (s4-exercises,
 * `{ strengths, improvements, focus }`, each Finding `{ code, values }`), the score from scoreSet
 * (`{ available, value, reason, experimental, ... }`) and the set summary. The text states only the
 * values carried by the findings and score; it never invents an observation.
 *
 * Rules:
 *  - Strengths first, then improvements, then exactly one focus (or none).
 *  - Completion (reps finished, every counted rep reached the top) is worded as completion, never as
 *    form praise. Form statements appear only for a clean-reps or issue finding of a rule that was
 *    assessed in this set with analyzed reps; steady-tracking needs a measured coverage. Findings that
 *    fail these checks, and unknown codes, are dropped rather than worded.
 *  - The form score is reported separately from completion; when unavailable it says
 *    "Form score unavailable" with a plain reason. Review mode carries the experimental label.
 *  - Narration is at most 3 sentences, uses only numbers present in the findings or score, and no
 *    grip, wrist, load, muscle, injury or clinical wording.
 *
 * @typedef {{code: string, values: Object}} Finding
 * @typedef {{strengths: Finding[], improvements: Finding[], focus: Finding|null}} SetFindings
 *
 * @typedef {Object} SetFeedbackText
 * @property {string} headline Completion-only headline.
 * @property {string[]} strengths One line per kept strength finding, same order.
 * @property {string[]} improvements One line per kept improvement finding, same order.
 * @property {string|null} focus One next-set focus, or null.
 * @property {string} narration At most 3 sentences for audio.
 * @property {string} scoreText "Form score: 82 out of 100" or "Form score unavailable: <reason>".
 * @property {boolean} scoreAvailable
 * @property {string|null} scoreLabel The score's label (detector-based summary, not clinical).
 * @property {string|null} experimentalLabel Set in review mode or for an experimental score.
 * @property {SetFindings} findings The findings actually worded (after dropping unsupported ones).
 */

export const SET_FEEDBACK_TEXT_VERSION = 'set-feedback-text-1.0.0';

export const EXPERIMENTAL_LABEL = 'Experimental: unvalidated rules (developer review), not coaching advice';

/** Plain reasons for an unavailable form score (scoreSet reason codes). */
export const SCORE_UNAVAILABLE_TEXT = Object.freeze({
  'no-validated-rules': 'no form check has been validated yet, so form was not scored',
  'no-completed-reps': 'no reps were completed',
  'too-few-analyzed-reps': 'too few reps could be checked for form',
  'low-coverage': 'the camera could not see enough of your reps to check form',
});

const FORM_TYPES = Object.freeze(['torso-swing', 'upper-arm-drift']);

/** Per-rule friendly phrases. Only measured movement; no direction is claimed for arm drift. */
const TYPE_TEXT = Object.freeze({
  'torso-swing': Object.freeze({
    clean: 'no torso swing was detected',
    issue: 'your torso moved',
    fix: 'keep your chest tall and still',
  }),
  'upper-arm-drift': Object.freeze({
    clean: 'no upper-arm drift was detected',
    issue: 'your upper arm moved from its calibrated position',
    fix: 'keep your elbow tucked by your side',
  }),
});

const num = (value) => (Number.isFinite(value) ? value : null);
const pick = (values, ...keys) => {
  for (const key of keys) {
    const value = num(values?.[key]);
    if (value !== null) return value;
  }
  return null;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);
/** Percent used in text; the wording validator accepts Math.round(fraction * 100) for 0 < f < 1. */
const percent = (fraction) => Math.round(fraction * 100);

function coverageOf(values) {
  const fraction = pick(values, 'coverage', 'fraction');
  return fraction !== null && fraction >= 0 && fraction <= 1 ? fraction : null;
}

function typeOfCode(code, prefix) {
  return code.startsWith(prefix) ? code.slice(prefix.length) : null;
}

function assessedTypes(summary) {
  return Array.isArray(summary?.assessedRuleTypes) ? summary.assessedRuleTypes : null;
}

/** True when a form statement about `type` is supported by the summary (assessed and analyzed). */
function formSupported(type, values, summary) {
  if (!FORM_TYPES.includes(type)) return false;
  const assessed = assessedTypes(summary);
  if (assessed && !assessed.includes(type)) return false;
  const analyzed = pick(values, 'analyzedReps') ?? num(summary?.analyzedReps);
  return analyzed !== null && analyzed > 0;
}

/** Wording of one strength; null when the finding is unsupported or unknown. */
function strengthText(finding, summary) {
  const { code, values = {} } = finding;
  if (code === 'completed-reps') {
    const n = pick(values, 'completedReps', 'count');
    return n !== null && n >= 1 ? `You finished ${plural(n, 'rep', 'reps')}.` : null;
  }
  if (code === 'full-range-completed') {
    return 'Every counted rep reached the top.';
  }
  if (code === 'steady-tracking') {
    const coverage = coverageOf(values);
    if (coverage === null) return null;
    return coverage >= 1
      ? 'The camera saw you clearly for the whole set.'
      : `The camera saw you clearly for ${percent(coverage)}% of the set.`;
  }
  const type = typeOfCode(code, 'clean-reps-');
  if (type !== null) {
    if (!formSupported(type, values, summary)) return null;
    const clean = pick(values, 'cleanReps', 'count');
    const analyzed = pick(values, 'analyzedReps') ?? num(summary?.analyzedReps);
    if (clean === null || clean < 1 || analyzed === null) return null;
    return `${capitalize(TYPE_TEXT[type].clean)} on ${clean} of ${plural(analyzed, 'checked rep', 'checked reps')}.`;
  }
  return null;
}

/** Wording of one improvement; null when the finding is unsupported or unknown. */
function improvementText(finding, summary) {
  const { code, values = {} } = finding;
  const type = typeOfCode(code, 'issue-');
  if (type !== null) {
    if (!formSupported(type, values, summary)) return null;
    const reps = pick(values, 'reps', 'count');
    const analyzed = pick(values, 'analyzedReps') ?? num(summary?.analyzedReps);
    if (reps === null || reps < 1 || analyzed === null) return null;
    return `${capitalize(TYPE_TEXT[type].issue)} on ${reps} of ${plural(analyzed, 'checked rep', 'checked reps')}; ${TYPE_TEXT[type].fix}.`;
  }
  if (code === 'partial-attempts') {
    const n = pick(values, 'count');
    if (n === null || n < 1) return null;
    return n === 1
      ? "1 attempt did not complete the calibrated range, so it was not counted."
      : `${n} attempts did not complete the calibrated range, so they were not counted.`;
  }
  if (code === 'low-tracking') {
    const coverage = coverageOf(values);
    if (coverage === null) return null;
    const seen = coverage > 0 && coverage < 1 ? `only ${percent(coverage)}%` : 'little';
    return `The camera saw you clearly for ${seen} of the set; stand side-on with your whole arm in view.`;
  }
  if (code === 'tracking-interruptions') {
    const n = pick(values, 'count');
    if (n === null || n < 1) return null;
    return `Tracking dropped during ${plural(n, 'attempt', 'attempts')}; stay fully in view of the camera.`;
  }
  return null;
}

/** Next-set focus for one improvement finding (always a single action). */
function focusText(finding) {
  const type = typeOfCode(finding.code, 'issue-');
  if (type !== null && TYPE_TEXT[type]) return `Next set, ${TYPE_TEXT[type].fix}.`;
  if (finding.code === 'partial-attempts') return 'Next set, curl all the way up so every rep counts.';
  if (finding.code === 'low-tracking') return 'Next set, stand side-on with your whole arm in view.';
  if (finding.code === 'tracking-interruptions') return 'Next set, stay fully in view of the camera.';
  return null;
}

const isFinding = (f) => f && typeof f === 'object' && typeof f.code === 'string';

/**
 * Keep only findings this module can word truthfully, in their original order. Shared with
 * wording.js so AI wording facts list exactly the same items as the deterministic text.
 * @returns {{strengths: Array<{finding: Finding, text: string}>, improvements: Array<{finding: Finding, text: string}>, focus: {finding: Finding, text: string}|null}}
 */
export function wordableFindings(findings, summary) {
  const strengths = [];
  const improvements = [];
  for (const f of Array.isArray(findings?.strengths) ? findings.strengths : []) {
    if (!isFinding(f)) continue;
    const text = strengthText(f, summary);
    if (text) strengths.push({ finding: f, text });
  }
  for (const f of Array.isArray(findings?.improvements) ? findings.improvements : []) {
    if (!isFinding(f)) continue;
    const text = improvementText(f, summary);
    if (text) improvements.push({ finding: f, text });
  }
  let focus = null;
  const candidates = [findings?.focus, ...improvements.map((i) => i.finding)];
  for (const f of candidates) {
    if (!isFinding(f) || !improvements.some((i) => i.finding.code === f.code)) continue;
    const text = focusText(f);
    if (text) {
      focus = { finding: f, text };
      break;
    }
  }
  return { strengths, improvements, focus };
}

function completedRepsOf(kept, summary) {
  const finding = kept.strengths.find((s) => s.finding.code === 'completed-reps');
  if (finding) return pick(finding.finding.values, 'completedReps', 'count');
  const fromSummary = num(summary?.completedReps);
  return fromSummary === 0 ? 0 : null;
}

function isExperimental(score, summary) {
  return score?.experimental === true || summary?.mode === 'review';
}

/**
 * Deterministic, friendly end-of-set text.
 * @param {SetFindings|null} findings
 * @param {Object|null} score scoreSet result.
 * @param {Object|null} summary buildSetSummary result.
 * @returns {SetFeedbackText}
 */
export function describeSetFeedback(findings, score, summary) {
  const kept = wordableFindings(findings, summary);
  const completed = completedRepsOf(kept, summary);
  const scoreAvailable = score?.available === true && Number.isFinite(score.value);

  let headline;
  if (completed !== null && completed >= 1) headline = `Nice work: ${plural(completed, 'rep', 'reps')} done`;
  else headline = 'No reps counted this set';

  let scoreText;
  if (scoreAvailable) {
    scoreText = `Form score: ${score.value} out of 100 (detector-based)`;
  } else {
    const reason = SCORE_UNAVAILABLE_TEXT[score?.reason] ?? 'there was not enough data to score form';
    scoreText = `Form score unavailable: ${reason}`;
  }

  // Narration: completion, then the score or the first form strength, then the focus. <= 3 sentences.
  const sentences = [];
  if (completed !== null && completed >= 1) sentences.push(`You finished ${plural(completed, 'rep', 'reps')}.`);
  else sentences.push('No reps were counted this set.');
  const formStrength = kept.strengths.find((s) => s.finding.code.startsWith('clean-reps-'));
  if (scoreAvailable) sentences.push(`Your detector score is ${score.value}.`);
  else if (formStrength) sentences.push(formStrength.text);
  if (kept.focus) sentences.push(kept.focus.text);
  else if (completed !== null && completed >= 1 && kept.improvements.length === 0) sentences.push('Keep it up.');

  return Object.freeze({
    headline,
    strengths: Object.freeze(kept.strengths.map((s) => s.text)),
    improvements: Object.freeze(kept.improvements.map((i) => i.text)),
    focus: kept.focus ? kept.focus.text : null,
    narration: (isExperimental(score, summary) ? 'Experimental review with unvalidated rules: ' : '') + sentences.slice(0, 3).join(' '),
    scoreText,
    scoreAvailable,
    scoreLabel: typeof score?.label === 'string' ? score.label : null,
    experimentalLabel: isExperimental(score, summary) ? EXPERIMENTAL_LABEL : null,
    findings: Object.freeze({
      strengths: Object.freeze(kept.strengths.map((s) => s.finding)),
      improvements: Object.freeze(kept.improvements.map((i) => i.finding)),
      focus: kept.focus ? kept.focus.finding : null,
    }),
  });
}

/** AI may select only approved paraphrases. Measurements, findings and scores remain local.
 * Mirrors backend/app/services/coach_wording.py; arbitrary prose is always rejected. */
import { wordableFindings } from './setFeedbackText.js';

export const WORDING_HEADLINES = Object.freeze(['Your set summary is ready.', 'Here is what the camera recorded.']);

export function findingOptions(finding, focus = false) {
  const { code, values: v } = finding;
  const n = (key) => String(Math.trunc(v[key]));
  if (focus) {
    if (code === 'issue-torso-swing') return ['Next set, keep your chest tall and still.', 'For the next set, aim to keep your torso still.'];
    if (code === 'issue-upper-arm-drift') return ['Next set, keep your elbow by your side.', 'For the next set, aim to keep your upper arm still.'];
    if (code === 'partial-attempts') return ['Next set, aim to reach the calibrated top before lowering.', 'For the next set, complete the calibrated range before lowering.'];
    return ['Next set, stay side-on and fully in frame.', 'For the next set, keep your selected arm visible to the camera.'];
  }
  if (code === 'completed-reps') return [`You completed ${n('completedReps')} counted reps.`, `The counter recorded ${n('completedReps')} completed reps.`];
  if (code === 'full-range-completed') return ['Every counted rep reached the calibrated top.', 'Each completed rep reached the calibrated top zone.'];
  if (code === 'steady-tracking') return ['Camera tracking covered most of the set.', 'The camera tracked you steadily through most of the set.'];
  if (code.startsWith('clean-reps-')) {
    const body = code.endsWith('torso-swing') ? 'torso movement' : 'upper-arm drift';
    return [`No ${body} was detected on ${n('cleanReps')} of ${n('analyzedReps')} analyzed reps.`, `The detector recorded ${n('cleanReps')} of ${n('analyzedReps')} analyzed reps without ${body}.`];
  }
  if (code.startsWith('issue-')) {
    const body = code.endsWith('torso-swing') ? 'torso movement' : 'upper-arm drift';
    return [`The detector recorded ${body} on ${n('reps')} of ${n('analyzedReps')} analyzed reps.`, `${body[0].toUpperCase() + body.slice(1)} was detected on ${n('reps')} of ${n('analyzedReps')} analyzed reps.`];
  }
  if (code === 'partial-attempts') return [`${n('count')} partial attempts were not counted.`, `The counter excluded ${n('count')} attempts that ended partway.`];
  if (code === 'low-tracking') return ['Tracking covered less than most of the set.', 'Limited tracking reduced what the camera could assess.'];
  return [`Tracking loss interrupted ${n('count')} attempts.`, `The counter recorded ${n('count')} attempts interrupted by tracking loss.`];
}

export function approvedWordingOptions(facts) {
  const f = facts.findings;
  return { headline: facts.score?.experimental ? WORDING_HEADLINES.map((s) => `Experimental review with unvalidated rules: ${s}`) : WORDING_HEADLINES,
    strengths: f.strengths.map((x) => findingOptions(x)),
    improvements: f.improvements.map((x) => findingOptions(x)),
    focus: f.focus ? findingOptions(f.focus, true) : null };
}

/** Strip internal metadata, strings and missing values: send only codes and necessary numbers. */
export function buildAiWordingFacts(result) {
  const kept = wordableFindings(result.findings, result.summary);
  const clean = ({ finding }) => ({ code: finding.code,
    values: Object.fromEntries(Object.entries(finding.values).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) });
  const { available, value, reason, experimental } = result.score;
  return { findings: { strengths: kept.strengths.map(clean), improvements: kept.improvements.map(clean), focus: kept.focus ? clean(kept.focus) : null },
    score: { available, value, reason, experimental } };
}

/** Validate each field against its own finding, so facts cannot be swapped or invented. */
export function validateAiWording(output, facts) {
  try {
    if (!output || Object.keys(output).sort().join(',') !== 'focus,headline,improvements,narration,strengths') return false;
    const options = approvedWordingOptions(facts);
    if (!options.headline.includes(output.headline)) return false;
    for (const name of ['strengths', 'improvements']) {
      if (!Array.isArray(output[name]) || output[name].length !== options[name].length) return false;
      if (!output[name].every((text, i) => options[name][i].includes(text))) return false;
    }
    if (options.focus ? !options.focus.includes(output.focus) : output.focus !== null) return false;
    const narration = [output.headline, ...output.strengths.slice(0, 1), ...(output.focus ? [output.focus] : [])].join(' ');
    return output.narration === narration && narration.length <= 300;
  } catch { return false; }
}

/** Abort and ignore late results even when the client fails to honor its signal. */
export async function requestAiWording(facts, { client, signal, timeoutMs = 4000 } = {}) {
  if (typeof client !== 'function' || signal?.aborted) return null;
  const controller = new AbortController();
  let timer;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const cancelled = new Promise((resolve) => {
    controller.signal.addEventListener('abort', () => resolve(null), { once: true });
    timer = setTimeout(abort, timeoutMs);
  });
  try {
    const response = await Promise.race([Promise.resolve().then(() => client(facts, { signal: controller.signal })).catch(() => null), cancelled]);
    return !controller.signal.aborted && validateAiWording(response, facts) ? response : null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}

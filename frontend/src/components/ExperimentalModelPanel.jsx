import { useState } from 'react';

export default function ExperimentalModelPanel({ state, locked, onLoad, onModeChange }) {
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true); setFailure('');
    try {
      if (file.size > 1024 * 1024) throw new Error('Model artifact exceeds 1 MiB.');
      await onLoad(JSON.parse(await file.text()));
    } catch (error) { setFailure(error.message); }
    finally { setLoading(false); event.target.value = ''; }
  };
  const last = state?.records?.at(-1);
  return <section className="mt-5 rounded border border-amber-400 p-4 text-sm" aria-label="Experimental curl model">
    <h3 className="font-bold">Experimental curl model · rep-end analysis</h3>
    <p>Local predictions for completed attempts only. Logistic scores are not correctness probabilities. Counting works without a model.</p>
    <label className="block mt-2">Model artifact (JSON) <input type="file" accept="application/json,.json" onChange={load} disabled={locked || loading} /></label>
    <label className="block mt-2">Detector mode <select value={state?.mode ?? 'rules-only'} disabled={locked || loading} onChange={(event) => onModeChange(event.target.value)}>
      <option value="rules-only">Rules only</option><option value="experimental-model" disabled={!state?.modelVersion}>Experimental model (rep-end)</option>
    </select></label>
    <p role="status">{loading ? 'Checking artifact…' : state?.modelVersion ? `Model ${state.modelVersion} · ${state.status}` : 'No trained model loaded. Rules-only fallback.'}</p>
    {locked && <p>Finish this set and start a fresh set to change the model or mode.</p>}
    {(failure || state?.error) && <p role="alert">{failure || state.error}</p>}
    {state?.mode === 'experimental-model' && <>
      {last && <p>{last.assessed ? `Last attempt: ${last.predictions.filter((x) => x.detected).map((x) => x.label).join(', ') || 'No configured issue detected'}` : `Last attempt not assessed: ${last.reason}`}</p>}
      {last?.predictions?.some((x) => x.label === 'swinging' && x.detected) && <p>Movement was flagged in the completed attempt. Review your upper-arm and torso movement.</p>}
      <p>Experimental detector summary: {state.summary.score == null ? 'Unavailable' : `${state.summary.score}% without a configured model issue detected`} · {state.summary.assessed}/{state.summary.completed} completed reps assessed.</p>
      <p>Label scope: {state.summary.labelScope.join(', ') || 'None'}. {state.summary.reason}</p>
    </>}
  </section>;
}

import SetSummaryPanel from './SetSummaryPanel.jsx';

// End-of-set feedback (Sprint 4 extension). Display only: the score comes from `exercises/setScore.js`,
// the findings from `exercises/setFindings.js` and every sentence from `feedback/setFeedbackText.js`
// (deterministic) or, when the user asks, the backend-validated AI wording. Nothing is calculated here.

const NOT_ASSESSED = 'Not assessed';
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const percent = (ratio) => (finite(ratio) ? `${Math.round(ratio * 100)}%` : NOT_ASSESSED);

const itemText = (item) => (typeof item === 'string' ? item : item?.text ?? '');

const scoreValue = (score) => (score?.available === true && finite(score.value) ? score.value : null);

const NARRATION_STATUS = {
  waiting: 'Narration will play after the current cue.',
  speaking: 'Reading your feedback aloud.',
  done: 'Narration finished.',
  stopped: 'Narration stopped.',
  unavailable: 'Voice unavailable; your feedback is shown as text.',
};

const SetFeedbackPanel = ({
  result, text, wording, wordingAvailable, onImproveWording,
  audioMode, narrationStatus, onReplayNarration, onStopNarration, voiceDisclosure,
}) => {
  if (!result) return null;
  const { summary, score } = result;
  const shown = wording?.text ?? text;
  const aiWorded = Boolean(wording?.text);
  const value = scoreValue(score);
  // Score and labels always come from the deterministic text; AI wording never rewrites them.
  const experimentalLabel = text?.experimentalLabel ?? (score?.experimental || summary?.mode === 'review' ? 'Experimental: unvalidated rules (developer review)' : null);
  const strengths = (shown?.strengths ?? []).map(itemText).filter(Boolean);
  const improvements = (shown?.improvements ?? []).map(itemText).filter(Boolean);
  const focus = itemText(shown?.focus);
  const coverage = summary?.trackingCoverage ?? {};
  const label = text?.scoreLabel ?? score?.label ?? 'GymBud detector-based summary, not a clinical or injury-risk assessment';
  const speaking = narrationStatus === 'speaking' || narrationStatus === 'waiting';

  return (
    <section className="mt-5 rounded-lg border border-sky-300/60 p-4 text-sm" aria-labelledby="set-feedback-heading">
      <h3 id="set-feedback-heading" className="font-bold text-[#7ccc44]">
        Set {summary?.setIndex ?? ''} feedback{summary?.side ? ` · ${summary.side} arm` : ''}
      </h3>
      {shown?.headline && <p className="mt-2 text-lg font-bold leading-snug">{shown.headline}</p>}
      {aiWorded && <p className="mt-1 inline-block rounded border border-sky-300 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-sky-100">AI-worded from your set data</p>}

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div><dt className="text-gray-300">Completed reps</dt><dd className="text-2xl font-bold">{finite(summary?.completedReps) ? summary.completedReps : NOT_ASSESSED}</dd></div>
        <div><dt className="text-gray-300">Analyzed for form</dt><dd className="text-2xl font-bold">{finite(summary?.analyzedReps) ? summary.analyzedReps : NOT_ASSESSED}
          {finite(summary?.analyzedReps) && finite(summary?.completedReps) && <span className="text-sm font-normal text-gray-300"> of {summary.completedReps}</span>}</dd></div>
        <div><dt className="text-gray-300">Tracking coverage</dt><dd className="text-2xl font-bold">{percent(coverage.fraction)}</dd></div>
        <div>
          <dt className="text-gray-300">Form score</dt>
          <dd className="text-2xl font-bold">{value !== null ? <>{value}<span className="text-sm font-normal text-gray-300"> / 100</span></> : 'Unavailable'}</dd>
        </div>
      </dl>

      {value === null ? (
        <p className="mt-3 rounded-lg border border-amber-300 p-3 text-amber-100">
          {text?.scoreText ?? 'Form score unavailable'}.
        </p>
      ) : (
        <p className="mt-3 text-gray-300">Form-only score from the analyzed reps; completed reps do not change it.</p>
      )}
      {experimentalLabel && <p className="mt-2 inline-block rounded border border-amber-300 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-200">{experimentalLabel}</p>}
      <p className="mt-2 text-xs text-gray-300">{label}.</p>

      {strengths.length > 0 && (
        <>
          <h4 className="mt-4 font-bold">What went well</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5">{strengths.map((item, index) => <li key={`s${index}`}>{item}</li>)}</ul>
        </>
      )}
      {improvements.length > 0 && (
        <>
          <h4 className="mt-4 font-bold">What to improve</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5">{improvements.map((item, index) => <li key={`i${index}`}>{item}</li>)}</ul>
        </>
      )}
      {focus && (
        <div className="mt-4 rounded-lg bg-zinc-900 p-3">
          <p className="text-gray-300">Focus for your next set</p>
          <p className="mt-1 text-lg font-bold leading-snug">{focus}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {wordingAvailable && !aiWorded && (
          <button type="button" onClick={onImproveWording} disabled={wording?.status === 'loading'} className="px-4 py-2 rounded-lg bg-zinc-700 disabled:opacity-50">
            {wording?.status === 'loading' ? 'Improving wording…' : 'Improve wording with AI'}
          </button>
        )}
        {audioMode && (
          <>
            <button type="button" onClick={onReplayNarration} className="px-4 py-2 rounded-lg bg-zinc-700">Replay narration</button>
            <button type="button" onClick={onStopNarration} disabled={!speaking} className="px-4 py-2 rounded-lg bg-zinc-700 disabled:opacity-50">Stop narration</button>
          </>
        )}
      </div>
      {wording?.status === 'failed' && <p role="status" className="mt-2 text-amber-100">AI wording unavailable or unsupported. Your original feedback is kept.</p>}
      {wordingAvailable && <p className="mt-2 text-gray-300">AI wording only rephrases the facts above (sent as numbers and codes, never video). If it fails a check, the original text stays.</p>}
      <p className="mt-2 text-gray-300" role="status" aria-live="polite">{audioMode && narrationStatus ? NARRATION_STATUS[narrationStatus] ?? '' : ''}</p>
      {audioMode && voiceDisclosure && <p className="mt-1 text-gray-300">{voiceDisclosure}</p>}

      <details className="mt-4">
        <summary className="cursor-pointer text-gray-200">Set details, denominators and versions</summary>
        <SetSummaryPanel summary={summary} score={score} />
      </details>
    </section>
  );
};

export default SetFeedbackPanel;

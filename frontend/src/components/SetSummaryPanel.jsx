import { useEffect, useRef, useState } from 'react';

// Display-only panel for the local set summary built by `exercises/setSummary.js` (Sprint 4, GB 404).
// Every count, denominator and fraction comes from the summary; this component only formats it.
// The summary stays in this browser; "Copy summary JSON" puts it on the clipboard for review evidence.

const NOT_ASSESSED = 'Not assessed';
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const count = (value) => (finite(value) ? String(value) : NOT_ASSESSED);
const percent = (ratio) => (finite(ratio) ? `${Math.round(ratio * 100)}%` : NOT_ASSESSED);
const seconds = (ms) => (finite(ms) ? `${(ms / 1000).toFixed(1)} s` : NOT_ASSESSED);
const ratioText = (numerator, denominator) => (finite(numerator) && finite(denominator) ? `${numerator} of ${denominator}` : count(numerator));

const ISSUE_LABELS = {
  'torso-swing': 'Torso movement',
  'upper-arm-drift': 'Upper-arm movement (direction not assessed)',
  'incomplete-rom': 'Range of motion below the calibrated target',
};

const INTERRUPT_LABELS = {
  partial: 'Partial (did not reach the top)',
  'tracking-loss': 'Tracking lost',
  'pause-timeout': 'Stopped moving too long',
  recalibration: 'Recalibrated',
  'low-coverage': 'Too little valid tracking',
  reset: 'Set reset',
};

const NOT_ANALYZED_LABELS = {
  'no-validated-rules': 'No form rule has been validated yet, so no rep was analyzed for form. Reps are still counted.',
  'no-completed-reps': 'No completed reps to analyze.',
  'low-coverage': 'Tracking coverage was too low to analyze reps.',
};

const MODE_LABELS = {
  'validated-only': 'Validated rules only',
  review: 'Review mode (developer) — includes unvalidated rules',
};

function entries(map) {
  return map && typeof map === 'object' ? Object.entries(map).filter(([, value]) => finite(value)) : [];
}

const SetSummaryPanel = ({ summary, score = null }) => {
  // The copy message belongs to the summary it was made for, so a new summary never shows a stale message.
  const [copied, setCopied] = useState({ summary: null, text: '' });
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!summary) return null;
  const copyStatus = copied.summary === summary ? copied.text : '';
  const setCopyStatus = (text) => setCopied({ summary, text });

  const interrupted = summary.interruptedAttempts ?? {};
  const interruptedTotal = interrupted.total;
  const interruptedByReason = entries(interrupted.byReason).filter(([, value]) => value > 0);
  const episodeCounts = entries(summary.episodeCountsByType);
  const unassessedCounts = entries(summary.unassessedEpisodeCountsByType).filter(([, value]) => value > 0);
  const coverage = summary.trackingCoverage ?? {};
  const assessed = summary.assessedRuleTypes ?? [];

  const copy = async () => {
    // The score travels with the summary it was computed from so the evidence is self-contained.
    const text = JSON.stringify(score ? { summary, score } : summary, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Summary JSON copied.');
    } catch {
      setCopyStatus('Copy failed. Your browser blocked clipboard access.');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyStatus(''), 4000);
  };

  return (
    <div className="mt-3 rounded-lg border border-zinc-600 p-4 text-sm">
      <h3 className="font-bold text-[#7ccc44]">Set summary</h3>
      <p className="mt-1 inline-block rounded border border-zinc-400 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-gray-100">Detector summary, not a form score</p>

      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
        <div><dt className="text-gray-300">Completed reps</dt><dd className="text-lg font-bold">{count(summary.completedReps)}</dd></div>
        <div><dt className="text-gray-300">Analyzed reps</dt><dd className="text-lg font-bold">{ratioText(summary.analyzedReps, summary.completedReps)} completed</dd></div>
        <div><dt className="text-gray-300">Reps with a detected issue</dt><dd className="text-lg font-bold">{ratioText(summary.issueBearingReps, summary.analyzedReps)} analyzed</dd></div>
        <div><dt className="text-gray-300">Analyzed reps with no detected issue</dt><dd className="text-lg font-bold">{finite(summary.noIssueFraction) ? `${percent(summary.noIssueFraction)} (${ratioText(summary.noIssueReps, summary.analyzedReps)})` : NOT_ASSESSED}</dd></div>
        <div><dt className="text-gray-300">Tracking coverage</dt><dd className="text-lg font-bold">{percent(coverage.fraction)}</dd><dd className="text-gray-300">{seconds(coverage.assessableMs)} assessable of {seconds(coverage.sessionMs)}</dd></div>
        <div><dt className="text-gray-300">Interrupted attempts (not counted)</dt><dd className="text-lg font-bold">{count(interruptedTotal)}</dd>
          {interruptedByReason.length > 0 && <dd className="text-gray-300">{interruptedByReason.map(([reason, value]) => `${INTERRUPT_LABELS[reason] ?? reason}: ${value}`).join(' · ')}</dd>}
        </div>
      </dl>

      {summary.notAnalyzedReason && (
        <p className="mt-3 rounded-lg border border-amber-300 p-3 text-amber-100">{NOT_ANALYZED_LABELS[summary.notAnalyzedReason] ?? `Not analyzed: ${summary.notAnalyzedReason}`}</p>
      )}

      <h4 className="mt-4 font-bold">Issue episodes by type</h4>
      {episodeCounts.length === 0 ? <p className="mt-1 text-gray-300">None recorded.</p> : (
        <ul className="mt-1 space-y-1">
          {episodeCounts.map(([type, value]) => <li key={type}>{ISSUE_LABELS[type] ?? type}: {value} {value === 1 ? 'episode' : 'episodes'}</li>)}
        </ul>
      )}
      {unassessedCounts.length > 0 && (
        <>
          <h4 className="mt-3 font-bold">Detected but not assessed in this mode</h4>
          <ul className="mt-1 space-y-1 text-gray-300">
            {unassessedCounts.map(([type, value]) => <li key={type}>{ISSUE_LABELS[type] ?? type}: {value} {value === 1 ? 'episode' : 'episodes'}</li>)}
          </ul>
          <p className="mt-1 text-gray-300">These rules are not validated, so they are not counted in the rep figures above.</p>
        </>
      )}
      <p className="mt-1 text-gray-300">One continuous issue is one episode. A rep with several issues counts once as a rep with a detected issue.</p>

      <h4 className="mt-4 font-bold">Configuration</h4>
      <p className="mt-1">Mode: {MODE_LABELS[summary.mode] ?? summary.mode ?? NOT_ASSESSED}</p>
      <p>Rules assessed: {assessed.length ? assessed.map((type) => ISSUE_LABELS[type] ?? type).join(', ') : 'none'}</p>
      {score && (
        <p className="mt-1">Score: {score.version ?? NOT_ASSESSED}{score.available ? '' : ` · unavailable (${score.reason ?? 'no reason reported'})`}{score.formula ? ` · formula: ${score.formula}` : ''}</p>
      )}
      {summary.setId && <p className="text-gray-300">Set ID: {summary.setId}</p>}
      <p className="text-gray-300">Analyzer {summary.analyzerVersion ?? NOT_ASSESSED} · Rules {summary.rulesVersion ?? NOT_ASSESSED} · Feedback {summary.feedbackVersion ?? NOT_ASSESSED} · Features {summary.featureVersion ?? NOT_ASSESSED}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className="px-4 py-2 rounded-lg bg-zinc-700">{score ? 'Copy summary and score JSON' : 'Copy summary JSON'}</button>
        <p role="status" aria-live="polite" className="text-gray-300">{copyStatus}</p>
      </div>
      <p className="mt-2 text-gray-300">This summary is kept only in this browser session. Camera frames are never included or uploaded.</p>
    </div>
  );
};

export default SetSummaryPanel;

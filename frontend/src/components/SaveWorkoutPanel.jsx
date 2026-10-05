import { useState } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';

// Save status for finished sets (Sprint 5, GB 503). Display and buttons only: the queue
// (`api/saveQueue.js`) owns statuses and retries; CameraView owns the workout identity and calls.
// One workout = the sets finished on this camera page since load or since the last Finish workout.
// Entries restored from this browser after a reload are listed as earlier workouts.

const STATUS_TEXT = {
  pending: 'Not saved yet',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Save failed',
};
const STATUS_CLASS = {
  pending: 'border-zinc-400 text-gray-100',
  saving: 'border-amber-300 text-amber-100',
  saved: 'border-[#7ccc44] text-[#bff09b]',
  failed: 'border-red-400 text-red-200',
};

// Works with or without a router (UI tests render CameraView without one).
function AppLink({ to, children, className = 'underline text-[#bff09b]' }) {
  const inRouter = useInRouterContext();
  return inRouter ? <Link to={to} className={className}>{children}</Link> : <a href={to} className={className}>{children}</a>;
}

function timeText(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function SetRow({ entry, signedIn, onRetry, onDismiss }) {
  const [confirming, setConfirming] = useState(false);
  const setIndex = entry.payload?.setIndex;
  const reps = entry.payload?.summary?.completedReps;
  const label = `Set ${Number.isFinite(setIndex) ? setIndex : ''}`.trim();
  const unsaved = entry.status === 'failed' || entry.status === 'pending';
  const otherAccount = entry.lastError?.code === 'other-account';
  return (
    <li className="rounded border border-zinc-700 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span>{label}{Number.isFinite(reps) ? ` · ${reps} completed rep${reps === 1 ? '' : 's'}` : ''}{entry.payload?.endedAt ? ` · finished ${timeText(entry.payload.endedAt)}` : ''}</span>
        <span className={`rounded border px-2 py-0.5 font-bold ${STATUS_CLASS[entry.status] ?? STATUS_CLASS.pending}`}>{STATUS_TEXT[entry.status] ?? entry.status}</span>
        {entry.status === 'saved' && entry.savedWorkoutId && <AppLink to={`/history/${entry.savedWorkoutId}`}>View in history</AppLink>}
      </div>
      {entry.status === 'failed' && entry.lastError && (
        <p className="mt-1 text-red-200">{entry.lastError.message}{entry.lastError.retryable === false && entry.lastError.code !== 'not-authenticated' && !otherAccount ? ' Retrying will not fix this.' : ''}</p>
      )}
      {unsaved && (
        <div className="mt-2 flex flex-wrap gap-2">
          {entry.status === 'failed' && !otherAccount && (
            <button type="button" onClick={() => onRetry(entry.id)} disabled={!signedIn}
              className="px-3 py-1 rounded-lg bg-[#7ccc44] text-[#24201f] font-bold disabled:opacity-50">Retry</button>
          )}
          {confirming ? (
            <>
              <span className="self-center">Discard this summary? It cannot be recovered.</span>
              <button type="button" onClick={() => { setConfirming(false); onDismiss(entry.id); }} className="px-3 py-1 rounded-lg bg-red-700 text-white">Discard</button>
              <button type="button" onClick={() => setConfirming(false)} className="px-3 py-1 rounded-lg bg-zinc-700">Keep</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="px-3 py-1 rounded-lg bg-zinc-700">Dismiss</button>
          )}
        </div>
      )}
    </li>
  );
}

function WorkoutGroup({ title, entries, signedIn, finalize, onRetry, onDismiss, onFinish }) {
  const anySaved = entries.some((entry) => entry.status === 'saved');
  const anySaving = entries.some((entry) => entry.status === 'saving');
  const finalizing = finalize?.status === 'finalizing';
  return (
    <div className="mt-3">
      <h4 className="font-bold">{title}</h4>
      <ul className="mt-2 space-y-2">
        {entries.map((entry) => <SetRow key={entry.id} entry={entry} signedIn={signedIn} onRetry={onRetry} onDismiss={onDismiss} />)}
      </ul>
      {signedIn && (
        <div className="mt-2">
          <button type="button" onClick={onFinish} disabled={!anySaved || anySaving || finalizing}
            className="px-4 py-2 rounded-lg bg-[#7ccc44] text-[#24201f] font-bold disabled:opacity-50">{finalizing ? 'Finishing workout…' : 'Finish workout'}</button>
          {finalize?.status === 'error' && (
            <p role="alert" className="mt-2 text-red-200">Could not finish the workout: {finalize.message} <button type="button" onClick={onFinish} className="underline">Try again</button></p>
          )}
        </div>
      )}
    </div>
  );
}

const SaveWorkoutPanel = ({ entries = [], currentSessionId = null, authStatus = 'signed-out', persistent = true,
  finalizeStates = {}, lastFinalized = null, notice = null, loginPath = '/login', onRetry, onDismiss, onFinish }) => {
  const signedIn = authStatus === 'signed-in';
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.clientSessionId)) groups.set(entry.clientSessionId, []);
    groups.get(entry.clientSessionId).push(entry);
  }
  const current = currentSessionId ? groups.get(currentSessionId) ?? [] : [];
  const earlier = [...groups.entries()].filter(([id]) => id !== currentSessionId);
  if (!current.length && !earlier.length && !lastFinalized && !notice) return null;
  const hasUnowned = entries.some((entry) => entry.ownerId == null && entry.status !== 'saved');

  const counts = entries.reduce((acc, entry) => ({ ...acc, [entry.status]: (acc[entry.status] ?? 0) + 1 }), {});
  const statusLine = !entries.length ? ''
    : !signedIn ? `${entries.length} set summar${entries.length === 1 ? 'y is' : 'ies are'} waiting to be saved.`
      : [counts.saving && `${counts.saving} saving`, counts.saved && `${counts.saved} saved`, counts.failed && `${counts.failed} failed`, counts.pending && `${counts.pending} waiting`].filter(Boolean).join(' · ');

  return (
    <div className="mt-4 rounded-lg border border-zinc-600 p-4 text-sm" aria-label="Save workout">
      <h3 className="font-bold text-[#7ccc44]">Save workout</h3>
      <p className="mt-2" role="status" aria-live="polite">{statusLine}</p>
      {notice && <p role="status" aria-live="polite" className="mt-2 rounded border border-zinc-500 p-2 text-gray-100">{notice}</p>}
      {lastFinalized && (
        <p className="mt-2" role="status" aria-live="polite">Workout saved. <AppLink to={lastFinalized.workoutId ? `/history/${lastFinalized.workoutId}` : '/history'}>View it in your history</AppLink>.</p>
      )}
      {authStatus === 'loading' && <p className="mt-2 text-gray-300">Checking your sign-in…</p>}
      {!signedIn && authStatus !== 'loading' && entries.length > 0 && (
        <p className="mt-2"><AppLink to={loginPath}>Sign in to save</AppLink>. {persistent
          ? 'Your set summaries are kept in this browser until you sign in, save or dismiss them.'
          : 'This browser is not keeping data (private mode or storage blocked), so the summaries are lost if you leave this page.'}</p>
      )}
      {hasUnowned && <p className="mt-2 text-gray-300">Saved summaries you make while signed out go to the next account that signs in on this browser.</p>}
      {current.length > 0 && (
        <WorkoutGroup title="This workout" entries={current} signedIn={signedIn} finalize={finalizeStates[currentSessionId]}
          onRetry={onRetry} onDismiss={onDismiss} onFinish={() => onFinish(currentSessionId)} />
      )}
      {earlier.map(([id, group]) => (
        <WorkoutGroup key={id} title={`Earlier workout${group[0]?.workoutStartedAt ? ` from ${new Date(group[0].workoutStartedAt).toLocaleString()}` : ''} (kept in this browser)`}
          entries={group} signedIn={signedIn} finalize={finalizeStates[id]} onRetry={onRetry} onDismiss={onDismiss} onFinish={() => onFinish(id)} />
      ))}
      <p className="mt-3 text-gray-300">Only the set summaries (counts, rep measurements and detected episodes) are saved. Camera frames and pose landmarks never leave this device.</p>
    </div>
  );
};

export default SaveWorkoutPanel;

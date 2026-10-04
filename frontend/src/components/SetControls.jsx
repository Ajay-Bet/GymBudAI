// Set lifecycle controls (Sprint 4 extension): set state badge, Finish set and Start next set.
// Separate from the camera controls: stopping the camera only pauses a set; finishing is explicit.
// State comes from `exercises/setSession.js` (`createCurlSet().getState()`); nothing is decided here.

const BADGES = {
  calibrating: { text: 'Calibrating', className: 'border-amber-300 text-amber-100' },
  active: { text: 'Set active', className: 'border-[#7ccc44] text-[#bff09b]' },
  paused: { text: 'Set paused — camera off', className: 'border-zinc-400 text-gray-100' },
  finished: { text: 'Set finished', className: 'border-sky-300 text-sky-100' },
};

function badgeFor(state, cameraOn) {
  // Before the camera has produced a frame the set is formally 'calibrating'; say why nothing happens yet.
  if (state === 'calibrating' && !cameraOn) return { text: 'Set not started — camera off', className: 'border-zinc-400 text-gray-100' };
  return BADGES[state] ?? BADGES.calibrating;
}

const SetControls = ({ state, setNumber, cameraOn, canFinish, onFinish, onStartNext }) => {
  const badge = badgeFor(state, cameraOn);
  const finished = state === 'finished';
  return (
    <div className="mt-4 rounded-lg border border-zinc-600 p-3 text-sm" aria-label="Set controls">
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" aria-live="polite" className="flex items-center gap-2">
          <span className="text-gray-300">Set{Number.isFinite(setNumber) ? ` ${setNumber}` : ''}:</span>
          <span className={`rounded border px-2 py-0.5 font-bold ${badge.className}`}>{badge.text}</span>
        </p>
        <div className="flex flex-wrap gap-3 sm:ml-auto">
          <button type="button" onClick={onFinish} disabled={!canFinish || finished}
            className="px-4 py-2 rounded-lg bg-[#7ccc44] text-[#24201f] font-bold disabled:opacity-50">Finish set</button>
          <button type="button" onClick={onStartNext} disabled={!finished}
            className="px-4 py-2 rounded-lg bg-zinc-700 disabled:opacity-50">Start next set</button>
        </div>
      </div>
      <p className="mt-2 text-gray-300">
        {finished
          ? 'This set is closed. Start the next set to count again; your calibration is kept.'
          : 'Stopping the camera pauses the set. Press Finish set when you are done to see your feedback.'}
      </p>
    </div>
  );
};

export default SetControls;

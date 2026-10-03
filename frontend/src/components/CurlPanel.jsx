// Display-only panel for the curl analyzer's output and local session summary.
// All counting, phases and measurements come from the analyzer contract; nothing is calculated here.

const PHASE_LABELS = {
  idle: 'Waiting for your arm to settle at the bottom position',
  bottom: 'Bottom — arm lowered',
  lifting: 'Lifting',
  top: 'Top — arm curled',
  lowering: 'Lowering',
};

const INTERRUPT_LABELS = {
  partial: 'Partial attempt — did not reach the top before lowering',
  'tracking-loss': 'Tracking was lost during the attempt',
  'pause-timeout': 'Stopped moving for too long',
  recalibration: 'Recalibrated during the attempt',
  'low-coverage': 'Too little valid tracking during the attempt',
  reset: 'Set was reset',
};

const ISSUE_LABELS = {
  'torso-swing': 'Torso movement',
  'upper-arm-drift': 'Upper-arm movement (direction not assessed)',
  'incomplete-rom': 'Range of motion below the calibrated target',
};

// Pause reasons are analyzer codes; unknown codes are shown as-is rather than hidden.
const PAUSE_LABELS = {
  'tracking-dropout': 'brief tracking dropout — hold position',
  'tracking-loss': 'tracking lost — keep your selected arm and torso in view',
  'calibration-required': 'calibration needed — calibrate your relaxed starting posture',
  'unsupported-view': 'unsupported camera view — stand side-on',
  recalibration: 'recalibrating — hold your relaxed starting posture',
};

const NOT_ASSESSED = 'Not assessed';
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const deg = (value) => (finite(value) ? `${value.toFixed(1)} °` : NOT_ASSESSED);
const seconds = (ms) => (finite(ms) ? `${(ms / 1000).toFixed(2)} s` : NOT_ASSESSED);
const percent = (ratio) => (finite(ratio) ? `${Math.round(ratio * 100)}%` : NOT_ASSESSED);

function issueList(issues) {
  if (!issues?.length) return 'None detected';
  return issues.map((issue) => `${ISSUE_LABELS[issue.type] ?? issue.type} — candidate (not coaching yet)`).join('; ');
}

function phaseText(output, measurementsReady, calibration) {
  if (calibration?.status === 'collecting') {
    return `Calibrating — hold still with your arm relaxed (${Math.round((calibration.progress || 0) * 100)}%)`;
  }
  if (!output) return 'Not started';
  const phase = PHASE_LABELS[output.phase] ?? output.phase;
  if (output.paused) {
    const reason = output.pauseReason ? (PAUSE_LABELS[output.pauseReason] ?? output.pauseReason) : 'reason not reported';
    return `Paused (${reason}) · last phase: ${phase}`;
  }
  if (!measurementsReady) return `Paused (measurements not ready) · last phase: ${phase}`;
  return phase;
}

const CurlPanel = ({ side, output, session, measurementsReady, calibration, onResetSet, canReset }) => {
  const completed = session?.completedReps ?? [];
  const interrupted = session?.interruptedAttempts ?? [];
  const count = output?.repCount ?? completed.length;
  return (
    <div className="mt-5 rounded-lg border border-zinc-600 p-4 text-sm">
      <h3 className="font-bold text-[#7ccc44]">Dumbbell curl · {side} arm · side-on view</h3>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div role="status" aria-live="polite" aria-atomic="true">
          <p className="text-gray-300">Completed reps</p>
          <p className="text-5xl font-bold leading-none">{count}</p>
        </div>
        <button type="button" onClick={onResetSet} disabled={!canReset} className="px-4 py-2 rounded-lg bg-zinc-700 disabled:opacity-50">Reset set</button>
      </div>
      <p className="mt-3" role="status" aria-live="polite"><strong>Phase:</strong> {phaseText(output, measurementsReady, calibration)}</p>
      {output?.attempt && <p className="text-gray-300">Current attempt in progress — counted only after returning to the bottom.</p>}
      <p className="mt-2 text-gray-300">A rep counts once after a full bottom → top → bottom movement with enough valid tracking. Tracking loss interrupts the current attempt but keeps completed reps.</p>

      <h4 className="mt-4 font-bold">Rep summary</h4>
      {completed.length === 0 ? <p className="mt-1 text-gray-300">No completed reps yet.</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Measurements for each completed rep</caption>
            <thead className="text-gray-300">
              <tr>
                <th scope="col" className="pr-2 py-1">Rep</th>
                <th scope="col" className="pr-2 py-1">Duration</th>
                <th scope="col" className="pr-2 py-1">Min flexion</th>
                <th scope="col" className="pr-2 py-1">Max flexion</th>
                <th scope="col" className="pr-2 py-1">Range of motion</th>
                <th scope="col" className="pr-2 py-1">Tracking coverage</th>
                <th scope="col" className="py-1">Possible issues</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((rep) => (
                <tr key={rep.id} className="border-t border-zinc-700 align-top">
                  <th scope="row" className="pr-2 py-1 font-normal">{rep.index}</th>
                  <td className="pr-2 py-1">{seconds(rep.durationMs)}</td>
                  <td className="pr-2 py-1">{deg(rep.minFlexionDeg)}</td>
                  <td className="pr-2 py-1">{deg(rep.maxFlexionDeg)}</td>
                  <td className="pr-2 py-1">{deg(rep.romDeg)}</td>
                  <td className="pr-2 py-1">{percent(rep.coverage)}</td>
                  <td className="py-1">{issueList(rep.candidateIssues)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="mt-4 font-bold">Interrupted attempts (not counted)</h4>
      {interrupted.length === 0 ? <p className="mt-1 text-gray-300">None.</p> : (
        <ul className="mt-1 space-y-1">
          {interrupted.map((attempt, index) => (
            <li key={attempt.id}>
              Attempt {index + 1}: {INTERRUPT_LABELS[attempt.reason] ?? attempt.reason} · max flexion {deg(attempt.maxFlexionDeg)} · range {deg(attempt.romDeg)} · coverage {percent(attempt.coverage)}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-gray-300">Possible issues are detector candidates for a later sprint. They are not corrections and are not spoken. This set is kept only in this browser session.</p>
      <p className="mt-1 text-gray-300">Detector configuration: {session?.configVersion ?? output?.configVersion ?? NOT_ASSESSED} · Feature version: {session?.featureVersion ?? NOT_ASSESSED}</p>
    </div>
  );
};

export default CurlPanel;

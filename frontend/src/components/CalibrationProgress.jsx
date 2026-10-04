// Display-only calibration progress (Sprint 4 extension). Progress and the blocked reason come from
// `biomechanics.getCalibration()`; this component only words the engine's codes for the user.

const JOINT_LABELS = { shoulder: 'shoulder', elbow: 'elbow', wrist: 'wrist', hip: 'hip' };

// One specific instruction per engine blockedReason code. Unknown codes fall back to the engine message.
function blockedReasonText(reason, side) {
  if (!reason) return null;
  const arm = side ? `${side} ` : '';
  if (reason.startsWith('joints-not-visible')) {
    const joint = reason.split(':')[1];
    const label = JOINT_LABELS[joint] ?? joint;
    return label
      ? `Move so your ${arm}${label} is clearly in view.`
      : `Keep your ${arm}shoulder, elbow, wrist and hip in view.`;
  }
  switch (reason) {
    case 'not-side-on': return 'Turn side-on to the camera, with your selected arm nearest it.';
    case 'moving': return 'Hold still for a moment — your arm or torso moved.';
    case 'arm-not-relaxed': return 'Let your arm hang relaxed and straight at your side.';
    case 'tracking-gap': return 'Tracking dropped for a moment. Stay in view and hold still.';
    default: return null;
  }
}

const CalibrationProgress = ({ calibration, side, cameraOn, autoCalibrate }) => {
  const status = calibration?.status ?? 'uncalibrated';
  const progress = Number.isFinite(calibration?.progress) ? Math.min(1, Math.max(0, calibration.progress)) : 0;
  const percent = Math.round((status === 'ready' ? 1 : progress) * 100);
  const blocked = blockedReasonText(calibration?.blockedReason, side);
  let headline;
  if (!cameraOn) headline = status === 'ready' ? 'Calibrated' : 'Calibration starts when the camera is on.';
  else if (status === 'ready') headline = 'Calibrated — you can start curling.';
  else if (status === 'collecting') headline = 'Calibrating — hold still with your arm relaxed.';
  else headline = autoCalibrate ? 'Get side-on with your arm relaxed; calibration starts automatically.' : 'Press Calibrate when you are in position.';
  const instruction = cameraOn && status !== 'ready' ? (blocked ?? calibration?.message ?? null) : null;
  return (
    <div className="mt-3" aria-label="Calibration progress">
      <p role="status" aria-live="polite"><strong>Calibration:</strong> {headline}</p>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-zinc-700" role="progressbar" aria-label="Calibration progress"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={status === 'ready' ? 'Calibrated' : `${percent}%`}>
        <div className={`h-full rounded-full transition-[width] duration-150 ${status === 'ready' ? 'bg-[#7ccc44]' : 'bg-amber-300'}`} style={{ width: `${percent}%` }} />
      </div>
      {instruction && <p className="mt-2 text-amber-100" role="status" aria-live="polite">{instruction}</p>}
    </div>
  );
};

export default CalibrationProgress;

import { useEffect, useRef, useState } from 'react';
import { cameraErrorMessage, createCameraManager } from '../vision/CameraManager.js';
import { createPoseEngine } from '../vision/PoseEngine.js';
import { createTrackingValidator } from '../vision/tracking.js';
import { createBiomechanicsEngine, FEATURE_SCHEMA } from '../biomechanics/engine.js';
import { createStabilityTracker } from '../biomechanics/stability.js';
import { clearPose, drawPose } from '../vision/drawPose.js';

const EMPTY_METRICS = { captureFps: 0, poseFps: 0, inferenceMs: 0, overlayMs: 0, joints: 'Not assessed' };
const INITIAL_TRACKING = { state: 'lost', message: 'Start the camera to begin tracking.' };

function clearMeasurements(runtime, reason = 'Start calibration after tracking recovers.') {
  runtime.biomechanics?.reset(reason);
  runtime.stability?.reset();
  runtime.publishFeatures?.(null);
  runtime.publishStability?.(null);
  runtime.publishCalibration?.(runtime.biomechanics?.getCalibration());
  runtime.lastFeaturePublish = null;
}

// Display labels for the engine's machine unit codes; values come from the feature schema or frame.
const UNIT_LABELS = { deg: '°', 'deg/s': '°/s', 'torso-lengths': 'torso lengths', 'torso-lengths/s': 'torso lengths/s' };
const FALLBACK_UNITS = { elbowFlexionDeg: 'deg', torsoTiltDeg: 'deg', upperArmDriftDeg: 'deg', torsoDeviationDeg: 'deg',
  elbowDisplacement: 'torso-lengths', elbowAngularVelocityDegS: 'deg/s', elbowVelocityPerS: 'torso-lengths/s' };

function unitLabel(frame, key) {
  const code = frame?.units?.[key] ?? FEATURE_SCHEMA?.units?.[key] ?? FALLBACK_UNITS[key];
  return UNIT_LABELS[code] ?? code ?? '';
}

function measurement(frame, key) {
  const value = frame?.values?.[key];
  return frame?.validity?.[key] && Number.isFinite(value) ? `${value.toFixed(1)} ${unitLabel(frame, key)}` : 'Not assessed';
}

const degrees = (value) => (Number.isFinite(value) ? `${value.toFixed(1)} °` : 'Not assessed');

function releaseSession(runtime) {
  runtime.generation += 1;
  runtime.running = false;
  if (runtime.videoFrame !== null) runtime.video?.cancelVideoFrameCallback?.(runtime.videoFrame);
  if (runtime.animation !== null) cancelAnimationFrame(runtime.animation);
  runtime.videoFrame = null;
  runtime.animation = null;
  runtime.engine?.close();
  runtime.engine = null;
  runtime.manager?.stop();
  runtime.result = null;
  runtime.validator?.reset();
  clearMeasurements(runtime);
  clearPose(runtime.canvas);
}

const CameraView = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const runtimeRef = useRef({ generation: 0, running: false, videoFrame: null, animation: null });
  const [camera, setCamera] = useState('off');
  const [model, setModel] = useState('Not loaded');
  const [tracking, setTracking] = useState(INITIAL_TRACKING);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [side, setSide] = useState('left');
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [features, setFeatures] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [stability, setStability] = useState(null);

  useEffect(() => {
    const runtime = runtimeRef.current;
    runtime.video = videoRef.current;
    runtime.canvas = canvasRef.current;
    runtime.side = 'left';
    runtime.validator = createTrackingValidator({ side: 'left' });
    runtime.biomechanics = createBiomechanicsEngine({ side: 'left', view: 'side' });
    runtime.stability = createStabilityTracker({ windowMs: 2000, key: 'elbowFlexionDeg' });
    runtime.publishFeatures = setFeatures;
    runtime.publishStability = setStability;
    runtime.publishCalibration = setCalibration;
    runtime.manager = createCameraManager({
      video: runtime.video,
      onEnded: () => {
        releaseSession(runtime);
        setCamera('error');
        setModel('Stopped');
        setTracking(INITIAL_TRACKING);
        setMetrics(EMPTY_METRICS);
        setError('The camera disconnected or access ended. Reconnect it and start again.');
      },
      onMuted: (value) => {
        setMuted(value);
        runtime.muted = value;
        if (value) {
          runtime.result = null;
          runtime.validator.reset();
          clearMeasurements(runtime);
          clearPose(runtime.canvas);
          setTracking({ state: 'lost', message: 'Camera feed interrupted. Waiting for live frames.' });
        }
      },
    });
    const onPageHide = () => {
      releaseSession(runtime);
      setCamera('off');
      setModel('Stopped');
      setTracking(INITIAL_TRACKING);
      setMetrics(EMPTY_METRICS);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      releaseSession(runtime);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  const stopCamera = () => {
    releaseSession(runtimeRef.current);
    setCamera('off');
    setModel('Stopped');
    setTracking(INITIAL_TRACKING);
    setMuted(false);
    setMetrics(EMPTY_METRICS);
    setError('');
  };

  const startCamera = async () => {
    const runtime = runtimeRef.current;
    if (runtime.running) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamera('error');
      setError('Camera access requires a supported browser on HTTPS or localhost.');
      return;
    }
    clearMeasurements(runtime);
    runtime.running = true;
    runtime.muted = false;
    const session = ++runtime.generation;
    const current = () => runtime.generation === session && runtime.running;
    setCamera('starting');
    setError('');
    setMuted(false);
    setModel('Loading pose model…');
    setTracking({ state: 'lost', message: 'Waiting for live camera frames.' });
    setMetrics(EMPTY_METRICS);
    let phase = 'model';
    let captures = 0;
    let analyzed = 0;
    let metricStart = performance.now();
    let inferenceMs = 0;
    let overlayMs = 0;
    let joints = 'Not assessed';
    let lastTime = -1;
    let rendered = null;
    try {
      runtime.engine = createPoseEngine({
        onStatus: (status) => {
          if (!current()) return;
          if (status.state === 'stale') {
            runtime.result = null;
            runtime.validator.reset();
            clearMeasurements(runtime);
            clearPose(runtime.canvas);
            setTracking({ state: 'lost', message: status.message });
          } else {
            setModel(status.message);
          }
        },
        onError: (failure) => {
          if (!current()) return;
          releaseSession(runtime);
          setCamera('error');
          setModel('Pose unavailable');
          setTracking(INITIAL_TRACKING);
          setMetrics(EMPTY_METRICS);
          setError(failure.message || 'Pose detection failed. Stop and try again.');
        },
        onResult: (result) => {
          if (!current() || runtime.muted || performance.now() - result.timestampMs > 500) return;
          runtime.result = result;
          analyzed += 1;
          inferenceMs = result.inferenceMs;
          const next = runtime.validator.update(result.landmarks, result.timestampMs);
          setTracking((previous) => previous.state === next.state && previous.message === next.message ? previous : next);
          const frame = runtime.biomechanics.update(result, next);
          // Stability is updated on every engine frame; only its publication is throttled.
          const stable = runtime.stability.update(frame);
          // Throttle changing numbers, but publish validity and readiness changes immediately.
          const validityKey = JSON.stringify([frame.validity, frame.ready, frame.calibration.status, frame.calibration.message, frame.reasons]);
          if (runtime.lastFeaturePublish === null || result.timestampMs - runtime.lastFeaturePublish >= 100 || validityKey !== runtime.featureValidityKey) {
            setFeatures(frame);
            setCalibration(frame.calibration);
            setStability(stable);
            runtime.lastFeaturePublish = result.timestampMs;
            runtime.featureValidityKey = validityKey;
          }
          const names = ['shoulder', 'elbow', 'wrist', 'hip'];
          const indices = runtime.side === 'right' ? [12, 14, 16, 24] : [11, 13, 15, 23];
          joints = indices.map((index, i) => {
            const landmark = result.landmarks?.[index];
            const confidence = landmark ? Math.min(landmark.visibility ?? 0, landmark.presence ?? 1) : 0;
            return `${names[i]} ${confidence.toFixed(2)}`;
          }).join(' · ');
        },
      });
      await runtime.engine.start();
      if (!current()) return;
      phase = 'camera';
      setModel('Ready');
      const stream = await runtime.manager.start(deviceId);
      if (!current() || !stream) return;
      setCamera('on');
      // Labels become available only after permission. Enumeration is optional.
      navigator.mediaDevices.enumerateDevices?.().then((all) => {
        if (current()) setDevices(all.filter((item) => item.kind === 'videoinput'));
      }).catch(() => {});
      const video = runtime.video;
      const canvas = runtime.canvas;
      const capture = (timestamp) => {
        if (!current() || runtime.muted || document.hidden || video.readyState < 2 || video.currentTime === lastTime) return;
        lastTime = video.currentTime;
        captures += 1;
        runtime.engine.process(video, timestamp);
      };
      if (video.requestVideoFrameCallback) {
        const frame = (timestamp) => {
          if (!current()) return;
          capture(timestamp);
          if (current()) runtime.videoFrame = video.requestVideoFrameCallback(frame);
        };
        runtime.videoFrame = video.requestVideoFrameCallback(frame);
      }
      const render = (timestamp) => {
        if (!current()) return;
        if (!video.requestVideoFrameCallback) capture(timestamp);
        if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          rendered = null;
        }
        const result = runtime.result;
        if (result && timestamp - result.timestampMs <= 500 && !runtime.muted) {
          if (result !== rendered) {
            drawPose(canvas, result.landmarks);
            overlayMs = Math.max(0, timestamp - result.timestampMs);
            rendered = result;
          }
        } else if (rendered || result) {
          clearPose(canvas);
          rendered = null;
          runtime.result = null;
          runtime.validator.reset();
          clearMeasurements(runtime);
          joints = 'Not assessed';
          setTracking({ state: 'lost', message: 'Tracking lost. Keep your selected arm and torso in view.' });
        }
        if (timestamp - metricStart >= 1000) {
          const seconds = (timestamp - metricStart) / 1000;
          setMetrics({ captureFps: captures / seconds, poseFps: analyzed / seconds, inferenceMs, overlayMs, joints: runtime.result ? joints : 'Not assessed' });
          metricStart = timestamp;
          captures = 0;
          analyzed = 0;
        }
        runtime.animation = requestAnimationFrame(render);
      };
      runtime.animation = requestAnimationFrame(render);
    } catch (failure) {
      if (!current()) return;
      releaseSession(runtime);
      setCamera('error');
      setModel(phase === 'model' ? 'Pose unavailable' : 'Stopped');
      setTracking(INITIAL_TRACKING);
      setMetrics(EMPTY_METRICS);
      setError(phase === 'camera' ? cameraErrorMessage(failure) : (failure.message || 'The pose model could not load. Check your connection and try again.'));
    }
  };

  const changeSide = (event) => {
    const value = event.target.value;
    setSide(value);
    const runtime = runtimeRef.current;
    runtime.side = value;
    runtime.validator.setSide(value);
    runtime.biomechanics.setSide(value);
    clearMeasurements(runtime, 'Arm changed. Calibrate the selected arm again.');
    runtime.result = null;
    clearPose(runtime.canvas);
    setTracking({ state: 'lost', message: `Reacquiring your anatomical ${value} arm.` });
  };
  const calibrate = () => {
    const runtime = runtimeRef.current;
    setFeatures(null);
    runtime.stability.reset();
    setStability(null);
    runtime.lastFeaturePublish = null;
    setCalibration(runtime.biomechanics.calibrate());
  };
  const busy = camera === 'starting' || camera === 'on';
  return (
    <section className="px-6 py-12 bg-[#24201f] text-white" aria-labelledby="camera-heading">
      <div className="max-w-7xl mx-auto">
        <h2 id="camera-heading" className="text-2xl font-bold text-center text-[#7ccc44]">Try GymBud on your webcam</h2>
        <p className="mt-3 mb-6 text-center text-sm text-gray-300">Camera frames and pose processing stay in this browser. Nothing is recorded or uploaded.</p>
        <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6 lg:items-start">
        <div>
        <div className="flex flex-wrap gap-4 items-center mb-4 text-sm">
          <label>Track arm <select value={side} onChange={changeSide} className="ml-2 rounded bg-zinc-800 border border-zinc-500 p-2"><option value="left">Left (your left)</option><option value="right">Right (your right)</option></select></label>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />Mirror preview</label>
          {devices.length > 1 && <label>Camera <select className="ml-2 rounded bg-zinc-800 border border-zinc-500 p-2 max-w-full" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={busy}><option value="">Default camera</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>}
        </div>
        <div className="relative overflow-hidden rounded-xl bg-black" style={{ minHeight: busy ? undefined : '200px', transform: mirror ? 'scaleX(-1)' : undefined }}>
          <video ref={videoRef} autoPlay playsInline muted className="block w-full h-auto" aria-label="Live camera preview" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
        </div>
        <div className="mt-4 space-y-1 text-sm" role="status" aria-live="polite">
          <p><strong>Camera:</strong> {camera === 'starting' ? 'Starting — allow camera access when asked. Stop cancels startup.' : camera === 'on' ? (muted ? 'Interrupted' : 'On') : camera === 'error' ? 'Unavailable' : 'Off'}</p>
          <p><strong>Pose model:</strong> {model}</p>
          <p><strong>Tracking:</strong> {tracking.message}</p>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg border border-red-400 p-3 text-red-200">{error}</p>}
        <div className="flex gap-3 mt-4">
          <button type="button" onClick={startCamera} disabled={busy} className="px-6 py-3 bg-[#7ccc44] text-[#24201f] font-bold disabled:opacity-50 rounded-lg">Start Camera</button>
          <button type="button" onClick={stopCamera} disabled={!busy} className="px-6 py-3 bg-red-700 text-white disabled:opacity-50 rounded-lg">Stop Camera</button>
        </div>
        <p className="text-sm text-gray-300 mt-4">Supported curl view: stand side-on to the camera with your selected arm nearest it. Keep both shoulders, both hips, and the whole selected arm in frame, with good lighting. For calibration, relax your arm downward and hold still. Mirroring does not change your anatomical left and right.</p>
        </div>
        <div className="mt-5 lg:mt-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="rounded-lg border border-zinc-600 p-4 text-sm">
          <h3 className="font-bold text-[#7ccc44]">Curl measurements · {side} arm · side-on view</h3>
          <p className="mt-2" role="status" aria-live="polite"><strong>Readiness:</strong> {features?.ready ? 'Ready — calibrated measurements available.' : calibration?.message || 'Start the camera, then calibrate your comfortable starting posture.'}</p>
          {calibration?.status === 'collecting' && <p>Stable observation progress: {Math.round((calibration.progress || 0) * 100)}%</p>}
          <button type="button" onClick={calibrate} disabled={camera !== 'on' || muted} className="mt-3 px-4 py-2 rounded-lg bg-zinc-700 disabled:opacity-50">{calibration?.status === 'ready' ? 'Recalibrate' : 'Calibrate starting posture'}</button>
          <p className="mt-2 text-gray-300">Calibration clears the previous baseline. Hold still until ready; hiding a required joint makes measurements unavailable.</p>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
            <div><dt>Elbow flexion</dt><dd>{measurement(features, 'elbowFlexionDeg')}</dd></div>
            <div><dt>Torso tilt from vertical</dt><dd>{measurement(features, 'torsoTiltDeg')}</dd></div>
            <div><dt>Elbow displacement from baseline</dt><dd>{measurement(features, 'elbowDisplacement')}</dd></div>
            <div><dt>Elbow flexion velocity</dt><dd>{measurement(features, 'elbowAngularVelocityDegS')}</dd></div>
            <div><dt>Upper-arm drift from baseline</dt><dd>{measurement(features, 'upperArmDriftDeg')}</dd></div>
            <div><dt>Torso deviation from baseline</dt><dd>{measurement(features, 'torsoDeviationDeg')}</dd></div>
          </dl>
          <p className="mt-3 text-gray-300">These are projected 2D measurements, not a form assessment. Camera perspective affects them. No repetitions or coaching are generated.</p>
        </div>
        <details className="mt-5 text-sm text-gray-300">
          <summary className="cursor-pointer">Developer performance and tracking</summary>
          {import.meta.env.DEV && <p className="mt-2">Elbow flexion comparison — raw: {Number.isFinite(features?.raw?.elbowFlexionDeg) ? `${features.raw.elbowFlexionDeg.toFixed(1)} °` : 'Not assessed'} · smoothed: {Number.isFinite(features?.smoothed?.elbowFlexionDeg) ? `${features.smoothed.elbowFlexionDeg.toFixed(1)} °` : 'Not assessed'}</p>}
          {import.meta.env.DEV && (
            <div className="mt-2">
              <p>Stationary stability (last 2 s), elbow flexion{stability ? ` · ${stability.samples} samples over ${(stability.spanMs ?? 0).toFixed(0)} ms` : ''}:</p>
              <p>Raw range {degrees(stability?.raw?.range)} · SD {degrees(stability?.raw?.sd)} — Smoothed range {degrees(stability?.smoothed?.range)} · SD {degrees(stability?.smoothed?.sd)}</p>
              <p>Proposed review target: stationary variation below 5°; unvalidated. Hold your arm still for this readout; it resets on tracking loss.</p>
            </div>
          )}
          <p className="mt-2">Engine reason codes: {features?.reasons?.length ? features.reasons.join(', ') : 'none'}</p>
          <p className="mt-2">Capture: {metrics.captureFps.toFixed(1)} FPS · Analyzed: {metrics.poseFps.toFixed(1)} FPS</p>
          <p>Latest inference: {metrics.inferenceMs.toFixed(0)} ms · Frame callback to overlay: {metrics.overlayMs.toFixed(0)} ms</p>
          <p>Required {side} joint visibility/presence scores (0–1): {metrics.joints}</p>
          <p>Visibility/presence score cutoff: 0.5 · Reacquisition: 300 ms · Stale overlay cutoff: 500 ms</p>
          <p>These model scores are tracking signals, not probabilities of correct form.</p>
          <p>One frame in flight; busy frames are skipped. Measurements are local and are not saved.</p>
        </details>
        </div>
        </div>
      </div>
    </section>
  );
};
export default CameraView;

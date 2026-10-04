import { useEffect, useRef, useState } from 'react';
import { cameraErrorMessage, createCameraManager } from '../vision/CameraManager.js';
import { createPoseEngine } from '../vision/PoseEngine.js';
import { createTrackingValidator } from '../vision/tracking.js';
import { createBiomechanicsEngine, FEATURE_SCHEMA } from '../biomechanics/engine.js';
import { createStabilityTracker } from '../biomechanics/stability.js';
import { clearPose, drawPose } from '../vision/drawPose.js';
import { defaultExerciseRegistry } from '../exercises/analyzer.js';
import { createCurlIssueTracker, CURL_RULES_CONFIG } from '../exercises/curlRules.js';
import { createCurlSet } from '../exercises/setSession.js';
import { createVoice, AI_VOICE_DISCLOSURE } from '../feedback/voice.js';
import { loadOutputMode, saveOutputMode } from '../feedback/outputPreference.js';
import { describeSetFeedback } from '../feedback/setFeedbackText.js';
import { buildAiWordingFacts, requestAiWording } from '../feedback/wording.js';
import { fetchTts, fetchWording, getCoachStatus } from '../api/coach.js';
import { getCueText } from '../feedback/cues.js';
import { createFeedbackScheduler } from '../feedback/scheduler.js';
import { createSpeechAdapter } from '../feedback/speech.js';
import { loadExperimentalModel } from '../ml/model.js';
import { createModelSession } from '../ml/modelSession.js';
import ExperimentalModelPanel from './ExperimentalModelPanel.jsx';
import CurlPanel from './CurlPanel.jsx';
import CoachingPanel from './CoachingPanel.jsx';
import SetFeedbackPanel from './SetFeedbackPanel.jsx';
import SetControls from './SetControls.jsx';
import CalibrationProgress from './CalibrationProgress.jsx';

const EMPTY_METRICS = { captureFps: 0, poseFps: 0, inferenceMs: 0, overlayMs: 0, joints: 'Not assessed' };
const INITIAL_TRACKING = { state: 'lost', message: 'Start the camera to begin tracking.' };
const EXERCISE_ID = 'dumbbell-curl';

// Gives one scheduler its own view of the shared speech adapter so its onEnd subscriptions can be removed on
// effect cleanup (React StrictMode runs effects twice; without this the first scheduler would stay subscribed).
function scopedSpeech(speech, keepCurrent = () => false) {
  const unsubscribes = [];
  const scoped = Object.create(speech);
  scoped.cancel = () => { if (!keepCurrent()) speech.cancel(); };
  scoped.onEnd = (callback) => {
    const off = speech.onEnd(callback);
    unsubscribes.push(off);
    return off;
  };
  return { speech: scoped, dispose: () => unsubscribes.splice(0).forEach((off) => off()) };
}

// Rule types the configuration enables for users. Every rule ships disabled until reviewed evidence exists.
const ENABLED_RULE_TYPES = Object.values(CURL_RULES_CONFIG.rules).filter((rule) => rule.enabled).map((rule) => rule.type);

// Publishes the scheduler's state only when something the coaching panel shows changes
// (mode, status, primary cue, tracking state), so cue and status changes appear at once without re-rendering every frame.
function publishFeedback(runtime, state) {
  if (!state) return;
  const key = JSON.stringify([state.mode, state.status, state.primaryCue?.id ?? null, state.tracking?.assessable, state.tracking?.reason]);
  if (key === runtime.feedbackKey) return;
  runtime.feedbackKey = key;
  runtime.publishFeedback?.(state);
}

// Every interruption closes the current attempt, withdraws stale cues and cancels voice.
function publishSet(runtime) {
  const next = runtime.set.getState();
  const key = JSON.stringify(next);
  if (key !== runtime.setKey) {
    runtime.setKey = key;
    runtime.publishSet?.(next);
  }
}
function cancelNarration(runtime) {
  runtime.narrationToken = (runtime.narrationToken ?? 0) + 1;
  runtime.speech?.stop();
  runtime.publishNarration?.('stopped');
}
function interruptSet(runtime, reason) {
  runtime.modelSession?.interrupt();
  const output = runtime.set?.interrupt(reason);
  if (output?.analyzerOutput) {
    runtime.publishCurl?.(output.analyzerOutput);
    runtime.publishCurlSession?.(runtime.analyzer.getSession());
  }
  if (output?.issueOutput) publishFeedback(runtime, runtime.scheduler.update({ timestampMs: output.issueOutput.timestampMs, issueOutput: output.issueOutput }));
  cancelNarration(runtime);
  if (runtime.set) publishSet(runtime);
}
function prefetchSetCues(runtime) {
  const state = runtime.set.getState();
  if (state.state !== 'active' || runtime.speech.outputMode !== 'audio-text' || !runtime.speech.aiVoiceEnabled || runtime.speech.muted || document.hidden) return;
  const key = `${state.setId}:${runtime.scheduler.mode}`;
  if (runtime.prefetchedSet === key) return;
  runtime.prefetchedSet = key;
  const types = runtime.scheduler.mode === 'review' ? runtime.scheduler.config.priority : ENABLED_RULE_TYPES;
  runtime.speech.prefetchCues(types.map((type) => getCueText(type)?.speechText).filter(Boolean));
}
function nextSet(runtime) {
  runtime.wordingController?.abort();
  runtime.set.startNext();
  runtime.modelSession?.reset();
  runtime.publishModel?.(runtime.modelSession.getState());
  runtime.scheduler.reset();
  cancelNarration(runtime);
  runtime.curlKey = null;
  runtime.publishCurl?.(null);
  runtime.publishCurlSession?.(runtime.analyzer.getSession());
  runtime.feedbackKey = null;
  publishFeedback(runtime, runtime.scheduler.getState());
  runtime.publishResult?.(null);
  runtime.publishWording?.(null);
  runtime.publishNarration?.(null);
  publishSet(runtime);
}
function clearMeasurements(runtime) {
  interruptSet(runtime, 'tracking-loss');
  // The biomechanics engine owns tracking-gap recovery and baseline retention.
  runtime.stability?.reset();
  runtime.publishFeatures?.(null);
  runtime.publishStability?.(null);
  runtime.publishCalibration?.(runtime.biomechanics?.getCalibration());
  runtime.lastFeaturePublish = null;
}
function startCalibration(runtime) {
  interruptSet(runtime, 'recalibration');
  runtime.stability.reset();
  runtime.publishStability?.(null);
  runtime.lastFeaturePublish = null;
  runtime.publishCalibration?.(runtime.biomechanics.calibrate());
}

// Auto-calibration starts only from a relaxed arm so a bent arm mid-set is never used as the baseline.
// The engine restarts collection on movement, so the user only needs to hold still once in position.
const AUTO_CALIBRATE_MAX_FLEXION_DEG = 40;
const AUTO_CALIBRATE_MIN_INTERVAL_MS = 1000;
function shouldAutoCalibrate(runtime, frame) {
  return runtime.autoCalibrate && frame.calibration.status === 'uncalibrated' && frame.trackingState === 'active'
    && frame.orientation.valid && Number.isFinite(frame.raw?.elbowFlexionDeg) && frame.raw.elbowFlexionDeg <= AUTO_CALIBRATE_MAX_FLEXION_DEG
    && (runtime.lastAutoCalibrateMs == null || frame.timestampMs - runtime.lastAutoCalibrateMs >= AUTO_CALIBRATE_MIN_INTERVAL_MS);
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
  runtime.speech?.stop();
  runtime.biomechanics?.reset('Camera off. Calibrate after restarting.');
  runtime.publishCalibration?.(runtime.biomechanics?.getCalibration());
  clearPose(runtime.canvas);
}

// Camera stop pauses; only the explicit Finish action finalizes the local set.
function pauseSession(runtime) {
  runtime.set?.pause('camera-stopped');
  if (runtime.set) publishSet(runtime);
  releaseSession(runtime);
}

const CameraView = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const runtimeRef = useRef({ generation: 0, running: false, videoFrame: null, animation: null, autoCalibrate: true, lastAutoCalibrateMs: null });
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
  const [autoCalibrate, setAutoCalibrate] = useState(true);
  const [curl, setCurl] = useState(null);
  const [curlSession, setCurlSession] = useState(null);
  // Speech adapter is created once; it has no side effects until prime()/speak().
  const [speech] = useState(() => createSpeechAdapter());
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);
  const [setSnapshot, setSetSnapshot] = useState(null);
  const [outputMode, setOutputMode] = useState(loadOutputMode);
  const [coachStatus, setCoachStatus] = useState({ tts: false, wording: false });
  const [aiVoice, setAiVoice] = useState(false);
  const [wording, setWording] = useState(null);
  const [narrationStatus, setNarrationStatus] = useState(null);
  const [pendingSide, setPendingSide] = useState(null);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [reviewMode, setReviewMode] = useState(false);
  const [modelState, setModelState] = useState(null);

  useEffect(() => {
    const runtime = runtimeRef.current;
    runtime.mounted = true;
    runtime.video = videoRef.current;
    runtime.canvas = canvasRef.current;
    runtime.side = 'left';
    runtime.validator = createTrackingValidator({ side: 'left' });
    runtime.biomechanics = createBiomechanicsEngine({ side: 'left', view: 'side' });
    runtime.stability = createStabilityTracker({ windowMs: 2000, key: 'elbowFlexionDeg' });
    runtime.publishFeatures = setFeatures;
    runtime.publishStability = setStability;
    runtime.publishCalibration = setCalibration;
    runtime.analyzer = defaultExerciseRegistry.create(EXERCISE_ID);
    runtime.publishCurl = setCurl;
    runtime.publishCurlSession = setCurlSession;
    runtime.speech = createVoice({ speech, outputMode: loadOutputMode(), aiTts: fetchTts });
    runtime.tracker = createCurlIssueTracker();
    runtime.modelSession = createModelSession();
    runtime.publishModel = setModelState;
    setModelState(runtime.modelSession.getState());
    // Review mode is a developer opt-in and starts off: only enabled (validated) rules can cue.
    const schedulerSpeech = scopedSpeech(runtime.speech, () => runtime.keepCurrentCue);
    runtime.scheduler = createFeedbackScheduler({ config: { priority: ['torso-swing', 'upper-arm-drift', 'swinging', 'incomplete-rom'] }, speech: schedulerSpeech.speech, mode: 'validated-only', enabledRuleTypes: ENABLED_RULE_TYPES });
    runtime.publishFeedback = setFeedback;
    runtime.set = createCurlSet({ analyzer: runtime.analyzer, tracker: runtime.tracker });
    runtime.publishSet = setSetSnapshot;
    runtime.publishResult = setResult;
    runtime.publishWording = setWording;
    runtime.publishNarration = setNarrationStatus;
    const unsubscribeVoiceState = runtime.speech.onEnd((info) => {
      if (info.kind === 'cue' && info.reason === 'ended' && runtime.speech.narrating) setNarrationStatus('speaking');
    });
    // Fetch only capabilities, never audio, before explicit Audio + text opt-in.
    let disposed = false;
    const statusController = new AbortController();
    getCoachStatus({ signal: statusController.signal }).then((status) => {
      if (!disposed) setCoachStatus(status);
    }).catch(() => {});
    runtime.manager = createCameraManager({
      video: runtime.video,
      onEnded: () => {
        pauseSession(runtime);
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
      pauseSession(runtime);
      setCamera('off');
      setModel('Stopped');
      setTracking(INITIAL_TRACKING);
      setMetrics(EMPTY_METRICS);
    };
    // A hidden page stops capture; speech must not keep talking about movement that is no longer analyzed.
    const onVisibilityChange = () => {
      if (document.hidden) { clearMeasurements(runtime); setNarrationStatus('stopped'); }
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      releaseSession(runtime);
      disposed = true;
      runtime.mounted = false;
      cancelNarration(runtime);
      statusController.abort();
      runtime.wordingController?.abort();
      runtime.scheduler.stop();
      unsubscribeVoiceState();
      runtime.speech.dispose();
      schedulerSpeech.dispose();
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [speech]);

  const stopCamera = () => {
    pauseSession(runtimeRef.current);
    setNarrationStatus('stopped');
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
    // Start Camera is the user gesture that unlocks speech in browsers with autoplay rules.
    if (runtime.speech.outputMode === 'audio-text') runtime.speech.prime();
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
          pauseSession(runtime);
          setCamera('error');
          setModel('Pose unavailable');
          setTracking(INITIAL_TRACKING);
          setMetrics(EMPTY_METRICS);
          setError(failure.message || 'Pose detection failed. Stop and try again.');
        },
        onResult: (result) => {
          if (!current() || runtime.muted || document.hidden || performance.now() - result.timestampMs > 500) return;
          runtime.result = result;
          analyzed += 1;
          inferenceMs = result.inferenceMs;
          const next = runtime.validator.update(result.landmarks, result.timestampMs);
          setTracking((previous) => previous.state === next.state && previous.message === next.message ? previous : next);
          const frame = runtime.biomechanics.update(result, next);
          if (shouldAutoCalibrate(runtime, frame)) {
            runtime.lastAutoCalibrateMs = frame.timestampMs;
            startCalibration(runtime);
          }
          // Stability is updated on every engine frame; only its publication is throttled.
          const stable = runtime.stability.update(frame);
          // The analyzer sees every frame (not-ready ones pause or interrupt it). Rep events are stored at once.
          const setOutput = runtime.set.update(frame);
          publishSet(runtime);
          prefetchSetCues(runtime);
          const curlOutput = setOutput.analyzerOutput;
          if (!curlOutput) return;
          if (curlOutput.events.length) setCurlSession(runtime.analyzer.getSession());
          // Persistent issue episodes, then cue selection and speech, on every frame. Cue and tracking-state
          // changes publish immediately; the scheduler uses frame timestamps, so the result does not depend on frame rate.
          const issueOutput = runtime.modelSession.update(frame, curlOutput, setOutput.issueOutput);
          if (curlOutput.events.length || runtime.modelSession.getState().error) setModelState(runtime.modelSession.getState());
          if (!frame.ready) runtime.speech.stop();
          publishFeedback(runtime, runtime.scheduler.update({ timestampMs: frame.timestampMs, issueOutput }));
          const curlKey = JSON.stringify([curlOutput.phase, curlOutput.paused, curlOutput.pauseReason, curlOutput.repCount,
            curlOutput.attempt?.id ?? null, curlOutput.candidateIssues.map((issue) => issue.type)]);
          // Throttle changing numbers, but publish validity and readiness changes immediately.
          const validityKey = JSON.stringify([frame.validity, frame.ready, frame.calibration.status, frame.calibration.message, frame.reasons]);
          if (runtime.lastFeaturePublish === null || result.timestampMs - runtime.lastFeaturePublish >= 100 || validityKey !== runtime.featureValidityKey || curlKey !== runtime.curlKey) {
            setFeatures(frame);
            setCurl(curlOutput);
            runtime.curlKey = curlKey;
            setCalibration(runtime.biomechanics.getCalibration());
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

  const finishSet = () => {
    const runtime = runtimeRef.current;
    runtime.wordingController?.abort();
    const completed = runtime.set.finish(undefined, {
      cueLog: runtime.scheduler.getCueLog(), mode: runtime.modelSession.getState().mode === 'experimental-model' ? 'validated-only' : runtime.scheduler.mode,
      enabledRuleTypes: ENABLED_RULE_TYPES, feedbackVersion: runtime.scheduler.config.version,
    });
    if (completed.alreadyFinished) return completed;
    runtime.keepCurrentCue = true;
    runtime.scheduler.stop();
    runtime.keepCurrentCue = false;
    publishFeedback(runtime, runtime.scheduler.getState());
    setCurl(null); // no stale in-progress attempt after finalization
    setCurlSession(runtime.analyzer.getSession());
    publishSet(runtime);
    setResult(completed);
    setWording(null);
    if (runtime.speech.outputMode === 'audio-text' && !runtime.speech.muted) {
      const text = describeSetFeedback(completed.findings, completed.score, completed.summary);
      narrate(text.narration);
    }
    return completed;
  };
  const applySide = (value) => {
    const runtime = runtimeRef.current;
    // The confirmation button is the explicit action that closes an unfinished set.
    if (runtime.set.getState().state !== 'finished' && (runtime.set.getState().hasActivity || runtime.analyzer.getSession().completedReps?.length || curl?.attempt)) finishSet();
    if (runtime.set.getState().state !== 'finished') nextSet(runtime);
    cancelNarration(runtime);
    setNarrationStatus('stopped');
    setSide(value);
    setPendingSide(null);
    runtime.side = value;
    runtime.validator.setSide(value);
    runtime.biomechanics.setSide(value);
    clearMeasurements(runtime);
    runtime.result = null;
    clearPose(runtime.canvas);
    setTracking({ state: 'lost', message: `Reacquiring your anatomical ${value} arm.` });
  };
  const changeSide = (event) => {
    const value = event.target.value;
    const state = runtimeRef.current.set.getState();
    if (state.state !== 'finished' && (state.hasActivity || curl?.attempt)) setPendingSide(value);
    else applySide(value);
  };
  const calibrate = () => {
    setFeatures(null);
    // Recalibration keeps the set but ends any in-progress attempt.
    startCalibration(runtimeRef.current);
  };
  const changeAutoCalibrate = (event) => {
    setAutoCalibrate(event.target.checked);
    runtimeRef.current.autoCalibrate = event.target.checked;
  };
  const awaitingAuto = autoCalibrate && (!calibration || calibration.status === 'uncalibrated') && !features?.ready;
  const resetSet = () => nextSet(runtimeRef.current);
  const toggleVoiceMuted = () => {
    const next = !voiceMuted;
    setVoiceMuted(next);
    runtimeRef.current.scheduler.setMuted(next);
    if (next) cancelNarration(runtimeRef.current);
  };
  const changeVolume = (value) => {
    setVolume(value);
    runtimeRef.current.speech.setVolume(value);
  };
  const changeReviewMode = (enabled) => {
    setReviewMode(enabled);
    runtimeRef.current.scheduler.setMode(runtimeRef.current.modelSession.getState().mode === 'experimental-model' || enabled ? 'review' : 'validated-only');
  };
  const loadModel = async (artifact) => {
    const loaded = await loadExperimentalModel(artifact);
    const runtime = runtimeRef.current;
    if (!runtime.mounted) return;
    if (runtime.running || runtime.set.getState().startedMs != null) throw new Error('Start a fresh set before replacing the model.');
    runtime.modelSession.setModel(loaded);
    setModelState(runtime.modelSession.getState());
  };
  const changeModelMode = (value) => {
    const runtime = runtimeRef.current;
    runtime.modelSession.setMode(value);
    runtime.scheduler.reset();
    runtime.scheduler.setMode(value === 'experimental-model' || reviewMode ? 'review' : 'validated-only');
    cancelNarration(runtime);
    setModelState(runtime.modelSession.getState());
    publishFeedback(runtime, runtime.scheduler.getState());
  };
  const changeOutputMode = (value) => {
    cancelNarration(runtimeRef.current);
    runtimeRef.current.scheduler.setMuted(true);
    runtimeRef.current.scheduler.setMuted(voiceMuted);
    runtimeRef.current.speech.setOutputMode(value);
    if (value === 'audio-text') runtimeRef.current.speech.prime();
    prefetchSetCues(runtimeRef.current);
    setOutputMode(value);
    saveOutputMode(value);
    setNarrationStatus('stopped');
  };
  const changeAiVoice = (value) => {
    cancelNarration(runtimeRef.current);
    runtimeRef.current.scheduler.setMuted(true);
    runtimeRef.current.scheduler.setMuted(voiceMuted);
    runtimeRef.current.speech.setAiVoiceEnabled(value && coachStatus.tts);
    if (value) runtimeRef.current.speech.prime();
    prefetchSetCues(runtimeRef.current);
    setAiVoice(value && coachStatus.tts);
    setNarrationStatus('stopped');
  };
  const narrate = (text) => {
    const runtime = runtimeRef.current;
    if (document.hidden || runtime.speech.outputMode !== 'audio-text' || runtime.speech.muted) return;
    setNarrationStatus(runtime.speech.speaking() ? 'waiting' : 'speaking');
    const token = (runtime.narrationToken ?? 0) + 1;
    runtime.narrationToken = token;
    runtime.speech.speakNarration(text).then((outcome) => {
      if (!runtime.mounted || runtime.narrationToken !== token) return;
      setNarrationStatus(outcome.reason === 'cancelled' ? 'stopped' : outcome.via === 'text' ? 'unavailable' : 'done');
    });
  };
  const stopNarration = () => {
    cancelNarration(runtimeRef.current);
    setNarrationStatus('stopped');
  };
  const improveWording = async () => {
    const runtime = runtimeRef.current;
    runtime.wordingController?.abort();
    const controller = new AbortController();
    runtime.wordingController = controller;
    setWording({ status: 'loading' });
    const text = await requestAiWording(buildAiWordingFacts(result), { client: fetchWording, signal: controller.signal });
    if (runtime.mounted && !controller.signal.aborted) setWording(text ? { status: 'done', text } : { status: 'failed' });
  };
  const feedbackText = result ? describeSetFeedback(result.findings, result.score, result.summary) : null;
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
        {pendingSide && <div className="mb-4 rounded border border-amber-300 p-3" role="alert">
          <p>Changing arms will finish this set and keep its feedback. Start next set to count with your {pendingSide} arm.</p>
          <button type="button" className="mr-3 mt-2 rounded bg-zinc-700 p-2" onClick={() => applySide(pendingSide)}>Finish set and switch to {pendingSide} arm</button>
          <button type="button" className="rounded bg-zinc-700 p-2" onClick={() => setPendingSide(null)}>Keep current arm</button>
        </div>}
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
          <p className="mt-2" role="status" aria-live="polite"><strong>Readiness:</strong> {features?.ready ? 'Ready — calibrated measurements available.' : awaitingAuto ? "Get into position side-on with your arm relaxed; calibration starts automatically." : calibration?.message || 'Start the camera, then calibrate your comfortable starting posture.'}</p>
          {awaitingAuto && calibration?.message && <p className="text-gray-300">{calibration.message}</p>}
          <CalibrationProgress calibration={calibration} side={side} cameraOn={camera === 'on'} autoCalibrate={autoCalibrate} />
          <button type="button" onClick={calibrate} disabled={camera !== 'on' || muted} className="mt-3 px-4 py-2 rounded-lg bg-zinc-700 disabled:opacity-50">{calibration?.status === 'ready' ? 'Recalibrate' : 'Calibrate starting posture'}</button>
          <label className="mt-3 ml-3 inline-flex gap-2 items-center"><input type="checkbox" checked={autoCalibrate} onChange={changeAutoCalibrate} />Auto-calibrate when I'm in position</label>
          <p className="mt-2 text-gray-300">Calibration clears the previous baseline. Hold still until ready; hiding a required joint makes measurements unavailable.</p>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
            <div><dt>Elbow flexion</dt><dd>{measurement(features, 'elbowFlexionDeg')}</dd></div>
            <div><dt>Torso tilt from vertical</dt><dd>{measurement(features, 'torsoTiltDeg')}</dd></div>
            <div><dt>Elbow displacement from baseline</dt><dd>{measurement(features, 'elbowDisplacement')}</dd></div>
            <div><dt>Elbow flexion velocity</dt><dd>{measurement(features, 'elbowAngularVelocityDegS')}</dd></div>
            <div><dt>Upper-arm drift from baseline</dt><dd>{measurement(features, 'upperArmDriftDeg')}</dd></div>
            <div><dt>Torso deviation from baseline</dt><dd>{measurement(features, 'torsoDeviationDeg')}</dd></div>
          </dl>
          <p className="mt-3 text-gray-300">These are projected 2D measurements, not a form assessment. Camera perspective affects them. Reps are counted below; form cues appear in the Form coaching panel.</p>
        </div>
        <SetControls state={setSnapshot?.state ?? 'calibrating'} setNumber={setSnapshot?.index ?? 1} cameraOn={camera === 'on'}
          canFinish={setSnapshot?.startedMs != null || setSnapshot?.hasActivity} onFinish={finishSet} onStartNext={resetSet} />
        <CoachingPanel feedback={feedback} cameraOn={camera === 'on' && !muted && setSnapshot?.state !== 'finished'} voiceAvailable={speech.available}
          outputMode={outputMode} onOutputModeChange={changeOutputMode} aiVoiceAvailable={coachStatus.tts} aiVoice={aiVoice}
          onAiVoiceChange={changeAiVoice} voiceDisclosure={aiVoice ? AI_VOICE_DISCLOSURE : null}
          voiceMuted={voiceMuted} onToggleVoiceMuted={toggleVoiceMuted} volume={volume} onVolumeChange={changeVolume}
          reviewMode={reviewMode} onReviewModeChange={changeReviewMode} reviewModeLocked={busy || (setSnapshot?.startedMs != null && setSnapshot?.state !== 'finished')} />
        <ExperimentalModelPanel state={modelState} locked={busy || setSnapshot?.startedMs != null} onLoad={loadModel} onModeChange={changeModelMode} />
        <CurlPanel side={curlSession?.side ?? side} output={curl} session={curlSession} measurementsReady={features?.ready === true} calibration={calibration} finished={setSnapshot?.state === 'finished'} />
        <SetFeedbackPanel result={result} text={feedbackText} wording={wording} wordingAvailable={coachStatus.wording}
          onImproveWording={improveWording} audioMode={outputMode === 'audio-text'} narrationStatus={narrationStatus}
          onReplayNarration={() => narrate((wording?.text ?? feedbackText).narration)} onStopNarration={stopNarration}
          voiceDisclosure={aiVoice ? AI_VOICE_DISCLOSURE : null} />
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

import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { curl, render as renderFrames } from '../fixtures/curl-fixtures.js';
const mocks = vi.hoisted(() => ({ pose: null, camera: null, close: vi.fn(), stop: vi.fn(), prime: vi.fn(), speak: vi.fn(), cancel: vi.fn(), tts: vi.fn(), wording: vi.fn(), status: vi.fn(), subscriptions: new Set() }));
vi.mock('../../src/vision/PoseEngine.js', () => ({ createPoseEngine: (options) => { mocks.pose = options; return { start: async () => {}, close: mocks.close, process: vi.fn() }; } }));
vi.mock('../../src/vision/CameraManager.js', () => ({ cameraErrorMessage: (error) => error.message, createCameraManager: (options) => { mocks.camera = options; return { start: async () => ({}), stop: mocks.stop }; } }));
vi.mock('../../src/vision/drawPose.js', () => ({ clearPose: vi.fn(), drawPose: vi.fn() }));
vi.mock('../../src/biomechanics/engine.js', () => ({ FEATURE_SCHEMA: { units: {} }, createBiomechanicsEngine: () => {
  let calibration = { status: 'uncalibrated', progress: 0 };
  return { update: (result) => { calibration = result.frame.calibration; return result.frame; }, getCalibration: () => calibration, reset: () => { calibration = { status: 'uncalibrated', progress: 0 }; }, calibrate: () => calibration, setSide: vi.fn() };
} }));
vi.mock('../../src/feedback/speech.js', () => ({ createSpeechAdapter: () => ({ available: true, prime: mocks.prime, speak: mocks.speak, cancel: mocks.cancel, speaking: () => false, setMuted: vi.fn(), setVolume: vi.fn(), onEnd: (callback) => { mocks.subscriptions.add(callback); return () => mocks.subscriptions.delete(callback); } }) }));
vi.mock('../../src/api/coach.js', () => ({ getCoachStatus: (...args) => mocks.status(...args), fetchTts: (...args) => mocks.tts(...args), fetchWording: (...args) => mocks.wording(...args) }));
import { webcrypto } from 'node:crypto';
import { modelChecksum } from '../../src/ml/model.js';
import { REP_FEATURE_SCHEMA } from '../../src/ml/repFeatures.js';
import CameraView from '../../src/components/CameraView.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
  mocks.status.mockResolvedValue({ tts: false, wording: false });
  mocks.speak.mockReturnValue(false);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockReturnValue(0);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
  await waitFor(() => expect(screen.getByText('On')).toBeTruthy());
}
function emit(frames) {
  act(() => { for (const frame of frames) mocks.pose.onResult({ frame, timestampMs: frame.timestampMs, inferenceMs: 1, landmarks: [] }); });
}
function fullCurl(startMs = 1000, side = 'left') {
  return renderFrames({ startMs, side, noiseDeg: 0, spacingJitter: 0, dropFrameProb: 0, script: [{ ms: 500 }, ...curl()] });
}
describe('CameraView experimental model integration', () => {
  it('explicit artifact load routes completed reps through scheduler and keeps deterministic form score unavailable', async () => {
    const artifact = { schemaVersion: 'gymbud-logistic-1', trained: true, experimental: true, modelVersion: 'TEST-ONLY', datasetVersion: 'synthetic-test', sourceRevision: 'unit-test', missingDataHandling: 'abstain', sourceManifest: { purpose: 'synthetic-test' }, dependencies: { runtime: 'test' },
      featureSchemaVersion: REP_FEATURE_SCHEMA.version, featureOrder: [...REP_FEATURE_SCHEMA.featureOrder], units: [...REP_FEATURE_SCHEMA.units],
      supportedViews: ['side'], knownLimitations: ['Synthetic UI test only.'], evaluation: { status: 'experimental', splitStrategy: 'recording-group' },
      preprocessing: { mean: REP_FEATURE_SCHEMA.featureOrder.map(() => 0), scale: REP_FEATURE_SCHEMA.featureOrder.map(() => 1) },
      labels: [{ name: 'swinging', issueType: null, coefficients: REP_FEATURE_SCHEMA.featureOrder.map(() => 0), intercept: 1, threshold: .5 }] };
    artifact.checksumSha256 = await modelChecksum(artifact);
    render(<CameraView />);
    fireEvent.change(screen.getByLabelText(/Model artifact/), { target: { files: [{ size: 1000, text: async () => JSON.stringify(artifact) }] } });
    await waitFor(() => { const alert = screen.queryByRole('alert'); if (alert) throw new Error(alert.textContent); expect(screen.getByText(/Model TEST-ONLY/)).toBeTruthy(); });
    fireEvent.change(screen.getByLabelText(/Detector mode/), { target: { value: 'experimental-model' } });
    await start();
    expect(screen.getByLabelText(/Detector mode/).disabled).toBe(true);
    for (const t of [1000, 6000, 11000]) emit(fullCurl(t).map((frame) => ({ ...frame, values: { ...frame.values, elbowAngularVelocityDegS: 10 }, validity: { ...frame.validity, elbowAngularVelocityDegS: true } })));
    expect(screen.getByText(/Experimental rep-end model prediction/)).toBeTruthy();
    expect(screen.getByText(/3\/3 completed reps assessed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
    expect(screen.getByText('Nice work: 3 reps done')).toBeTruthy();
    expect(screen.getByText(/Form score unavailable:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop Camera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start next set' }));
    expect(screen.getByLabelText(/Detector mode/).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/Detector mode/), { target: { value: 'rules-only' } });
    expect(screen.queryByText(/Last attempt:/)).toBeNull();
  });
});

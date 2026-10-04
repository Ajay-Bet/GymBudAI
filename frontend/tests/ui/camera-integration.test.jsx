import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { curl, makeFrame, render as renderFrames } from '../fixtures/curl-fixtures.js';
const mocks = vi.hoisted(() => ({ pose: null, camera: null, close: vi.fn(), stop: vi.fn(), prime: vi.fn(), speak: vi.fn(), cancel: vi.fn(), tts: vi.fn(), wording: vi.fn(), status: vi.fn(), subscriptions: new Set() }));
vi.mock('../../src/vision/PoseEngine.js', () => ({ createPoseEngine: (options) => { mocks.pose = options; return { start: async () => {}, close: mocks.close, process: vi.fn() }; } }));
vi.mock('../../src/vision/CameraManager.js', () => ({ cameraErrorMessage: (error) => error.message, createCameraManager: (options) => { mocks.camera = options; return { start: async () => ({}), startFile: async (file) => { mocks.file = file; return file; }, stop: mocks.stop }; } }));
vi.mock('../../src/vision/drawPose.js', () => ({ clearPose: vi.fn(), drawPose: vi.fn() }));
vi.mock('../../src/biomechanics/engine.js', () => ({ FEATURE_SCHEMA: { units: {} }, createBiomechanicsEngine: () => {
  let calibration = { status: 'uncalibrated', progress: 0 };
  return { update: (result) => { calibration = result.frame.calibration; return result.frame; }, getCalibration: () => calibration, reset: () => { calibration = { status: 'uncalibrated', progress: 0 }; }, calibrate: () => calibration, setSide: vi.fn() };
} }));
vi.mock('../../src/feedback/speech.js', () => ({ createSpeechAdapter: () => ({ available: true, prime: mocks.prime, speak: mocks.speak, cancel: mocks.cancel, speaking: () => false, setMuted: vi.fn(), setVolume: vi.fn(), onEnd: (callback) => { mocks.subscriptions.add(callback); return () => mocks.subscriptions.delete(callback); } }) }));
vi.mock('../../src/api/coach.js', () => ({ getCoachStatus: (...args) => mocks.status(...args), fetchTts: (...args) => mocks.tts(...args), fetchWording: (...args) => mocks.wording(...args) }));
import { approvedWordingOptions } from '../../src/feedback/wording.js';
import CameraView from '../../src/components/CameraView.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.status.mockResolvedValue({ tts: false, wording: false });
  mocks.speak.mockReturnValue(false);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockReturnValue(0);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
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
describe('CameraView with real analyzer, lifecycle, tracker and voice', () => {
  it('plays a chosen video file through the same pipeline and pauses the set when the video ends', async () => {
    render(<CameraView />);
    expect(screen.getByRole('button', { name: 'Play Video' }).disabled).toBe(true);
    const file = new File(['x'], 'curls.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('Video file'), { target: { files: [file] } });
    expect(screen.getByLabelText('Mirror preview').checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Play Video' }));
    await waitFor(() => expect(screen.getByText('Playing curls.mp4')).toBeTruthy());
    expect(mocks.file).toBe(file);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    emit(fullCurl());
    expect(screen.getByText('Set active')).toBeTruthy();
    act(() => mocks.camera.onFileEnded());
    expect(screen.getByText('Set paused — camera off')).toBeTruthy();
    expect(screen.getByText(/Video finished/)).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: '1' })).toBeTruthy();
  });
  it('Stop pauses and restart retains completed reps; Finish is separate and next set has fresh counters', async () => {
    render(<CameraView />);
    await start();
    emit(fullCurl());
    expect(screen.getByText('Set active')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop Camera' }));
    expect(screen.getByText('Set paused — camera off')).toBeTruthy();
    expect(screen.queryByText(/Nice work:/)).toBeNull();
    expect(screen.getByRole('rowheader', { name: '1' })).toBeTruthy();
    await start();
    emit(fullCurl(6000));
    fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
    expect(screen.getByText('Nice work: 2 reps done')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish set' }).disabled).toBe(true);
    expect(screen.queryByText(/Current attempt in progress/)).toBeNull();
    emit(fullCurl(11000));
    expect(screen.getByText('Nice work: 2 reps done')).toBeTruthy();
    expect(mocks.prime).not.toHaveBeenCalled();
    expect(mocks.speak).not.toHaveBeenCalled();
    expect(mocks.tts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start next set' }));
    expect(screen.queryByText(/Nice work:/)).toBeNull();
    expect(screen.queryByRole('rowheader', { name: '1' })).toBeNull();
    emit(fullCurl(16000));
    fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
    expect(screen.getByText('Nice work: 1 rep done')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Set 2 feedback · left arm' })).toBeTruthy();
  });
  it('arm-change does not finalize until the visible consent button is pressed', async () => {
    render(<CameraView />);
    await start();
    emit(fullCurl());
    fireEvent.change(screen.getByRole('combobox', { name: /Track arm/ }), { target: { value: 'right' } });
    expect(screen.getByText('Set active')).toBeTruthy();
    expect(screen.queryByText(/Nice work:/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keep current arm' }));
    expect(screen.getByRole('combobox', { name: /Track arm/ }).value).toBe('left');
    fireEvent.change(screen.getByRole('combobox', { name: /Track arm/ }), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish set and switch to right arm' }));
    expect(screen.getByText('Nice work: 1 rep done')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Set 1 feedback · left arm' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Track arm/ }).value).toBe('right');
    expect(screen.getByText(/Dumbbell curl · left arm/)).toBeTruthy();
  });
  it('hidden page interrupts an unfinished attempt and StrictMode releases speech subscriptions', async () => {
    const view = render(<StrictMode><CameraView /></StrictMode>);
    expect(mocks.subscriptions.size).toBe(1);
    await start();
    emit(renderFrames({ script: [{ ms: 500 }, { ms: 600, to: 70 }], noiseDeg: 0, spacingJitter: 0, dropFrameProb: 0 }));
    expect(screen.getByText(/Current attempt in progress/)).toBeTruthy();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.queryByText(/Current attempt in progress/)).toBeNull();
    expect(screen.getByText(/Tracking was lost during the attempt/)).toBeTruthy();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    emit([makeFrame({ timestampMs: 9000, flexionDeg: 10 })]);
    view.unmount();
    expect(mocks.subscriptions.size).toBe(0);
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalled();
  });
  it('backend failure preserves local text and audio opt-in never enables AI implicitly', async () => {
    mocks.status.mockRejectedValue(new Error('offline'));
    render(<CameraView />);
    await start();
    emit(fullCurl());
    fireEvent.click(screen.getByRole('radio', { name: 'Audio + text' }));
    expect(mocks.prime).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Natural AI voice/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
    await waitFor(() => expect(screen.getByText(/Voice unavailable; your feedback is shown as text/)).toBeTruthy());
    expect(screen.getByText('Nice work: 1 rep done')).toBeTruthy();
    expect(mocks.tts).not.toHaveBeenCalled();
  });
  it('ignores late AI wording after next set and sends only bounded facts', async () => {
    mocks.status.mockResolvedValue({ tts: true, wording: true });
    let resolveWording;
    mocks.wording.mockImplementation(() => new Promise((resolve) => { resolveWording = resolve; }));
    render(<CameraView />);
    await start();
    emit(fullCurl());
    fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
    fireEvent.click(screen.getByRole('button', { name: 'Improve wording with AI' }));
    await waitFor(() => expect(mocks.wording).toHaveBeenCalledOnce());
    const [facts, { signal }] = mocks.wording.mock.calls[0];
    expect(Object.keys(facts).sort()).toEqual(['findings', 'score']);
    const options = approvedWordingOptions(facts);
    const output = { headline: options.headline[0], strengths: options.strengths.map((x) => x[0]), improvements: options.improvements.map((x) => x[0]), focus: options.focus?.[0] ?? null };
    output.narration = [output.headline, ...output.strengths.slice(0, 1), ...(output.focus ? [output.focus] : [])].join(' ');
    fireEvent.click(screen.getByRole('button', { name: 'Start next set' }));
    expect(signal.aborted).toBe(true);
    emit(fullCurl(6000));
    fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
    await act(async () => { resolveWording(output); });
    expect(screen.queryByText('AI-worded from your set data')).toBeNull();
    expect(screen.getByText('Nice work: 1 rep done')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Set 2 feedback · left arm' })).toBeTruthy();
    expect(mocks.tts).not.toHaveBeenCalled();
  });
  it('a cancelled narration cannot replace the fresh set narration status', async () => {
    mocks.speak.mockReturnValue(true);
    render(<CameraView />);
    await start();
    fireEvent.click(screen.getByRole('radio', { name: 'Audio + text' }));
    emit(fullCurl());
    fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Start next set' }));
    emit(fullCurl(6000));
    fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
    await waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Reading your feedback aloud.')).toBeTruthy();
    expect(screen.queryByText('Narration stopped.')).toBeNull();
  });

  it('Finish narration waits for the existing live cue instead of cutting it off', async () => {
    mocks.speak.mockReturnValue(true);
    render(<CameraView />);
    fireEvent.click(screen.getByRole('radio', { name: 'Audio + text' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Review unvalidated rules/ }));
    await start();
    emit(renderFrames({ noiseDeg: 0, spacingJitter: 0, dropFrameProb: 0, script: [{ ms: 500 }, ...curl({ torso: 20 })] }));
    expect(mocks.speak).toHaveBeenCalledOnce();
    const cancellationsBeforeFinish = mocks.cancel.mock.calls.length;
    const cueId = mocks.speak.mock.calls[0][0].id;
    fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
    expect(screen.getByText('Narration will play after the current cue.')).toBeTruthy();
    expect(mocks.cancel.mock.calls.length).toBe(cancellationsBeforeFinish);
    await act(async () => { for (const callback of mocks.subscriptions) callback({ id: cueId, reason: 'ended' }); });
    expect(mocks.speak).toHaveBeenCalledTimes(2);
    expect(mocks.speak.mock.calls[1][0].id).toMatch(/^narration-/);
  });

});

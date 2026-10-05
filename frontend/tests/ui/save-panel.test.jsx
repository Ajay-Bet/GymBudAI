// Sprint 5 independent validation (s5-validation): SaveWorkoutPanel display rules and the CameraView
// save flow (Finish set -> queue -> create workout + submit set -> Saved / Failed -> Retry -> Finish
// workout). The workouts API is mocked; frames are SYNTHETIC (tests/fixtures/curl-fixtures.js). DOM
// (jsdom) evidence only, not a real browser.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { curl, render as renderFrames } from '../fixtures/curl-fixtures.js';

const mocks = vi.hoisted(() => ({ pose: null, camera: null, api: null }));
vi.mock('../../src/vision/PoseEngine.js', () => ({ createPoseEngine: (options) => { mocks.pose = options; return { start: async () => {}, close: vi.fn(), process: vi.fn() }; } }));
vi.mock('../../src/vision/CameraManager.js', () => ({ cameraErrorMessage: (error) => error.message, createCameraManager: (options) => { mocks.camera = options; return { start: async () => ({}), startFile: async (f) => f, stop: vi.fn() }; } }));
vi.mock('../../src/vision/drawPose.js', () => ({ clearPose: vi.fn(), drawPose: vi.fn() }));
vi.mock('../../src/biomechanics/engine.js', () => ({ FEATURE_SCHEMA: { units: {} }, createBiomechanicsEngine: () => {
  let calibration = { status: 'uncalibrated', progress: 0 };
  return { update: (result) => { calibration = result.frame.calibration; return result.frame; }, getCalibration: () => calibration, reset: () => { calibration = { status: 'uncalibrated', progress: 0 }; }, calibrate: () => calibration, setSide: vi.fn() };
} }));
vi.mock('../../src/feedback/speech.js', () => ({ createSpeechAdapter: () => ({ available: true, prime: vi.fn(), speak: () => false, cancel: vi.fn(), speaking: () => false, setMuted: vi.fn(), setVolume: vi.fn(), onEnd: () => () => {} }) }));
vi.mock('../../src/api/coach.js', () => ({ getCoachStatus: async () => ({ tts: false, wording: false }), fetchTts: vi.fn(), fetchWording: vi.fn() }));
vi.mock('../../src/api/workouts.js', () => ({
  createWorkout: (...args) => mocks.api.createWorkout(...args),
  submitSet: (...args) => mocks.api.submitSet(...args),
  finalizeWorkout: (...args) => mocks.api.finalizeWorkout(...args),
  listWorkouts: vi.fn(), getWorkout: vi.fn(), updateWorkoutNotes: vi.fn(),
}));

import SaveWorkoutPanel from '../../src/components/SaveWorkoutPanel.jsx';
import CameraView from '../../src/components/CameraView.jsx';
import { AuthProvider, AUTH_STORAGE_KEY } from '../../src/auth/AuthContext.jsx';
import { SAVE_QUEUE_STORAGE_KEY } from '../../src/api/saveQueue.js';
import { ApiError } from '../../src/api/http.js';

const entry = (over = {}) => ({ id: 'set-1', clientSessionId: 'workout-a', exerciseId: 'dumbbell-curl', workoutStartedAt: '2026-10-01T11:00:00.000Z',
  timezone: 'America/Chicago', status: 'pending', attempts: 0, lastError: null, savedWorkoutId: null,
  payload: { clientSetId: over.id ?? 'set-1', setIndex: 1, endedAt: '2026-10-01T11:05:00.000Z', summary: { completedReps: 4 } }, ...over });
const handlers = () => ({ onRetry: vi.fn(), onDismiss: vi.fn(), onFinish: vi.fn() });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('SaveWorkoutPanel', () => {
  it('renders nothing with no entries and nothing finalized', () => {
    const { container } = render(<SaveWorkoutPanel entries={[]} {...handlers()} />);
    expect(container.innerHTML).toBe('');
  });

  it('signed out: Sign in to save link with the login path, summary kept, no Retry or Finish workout', () => {
    render(<SaveWorkoutPanel entries={[entry()]} currentSessionId="workout-a" authStatus="signed-out" loginPath="/login?next=%2F" {...handlers()} />);
    const link = screen.getByRole('link', { name: 'Sign in to save' });
    expect(link.getAttribute('href')).toBe('/login?next=%2F');
    expect(screen.getByText(/kept in this browser until you sign in, save or dismiss/)).toBeTruthy();
    expect(screen.getByText('1 set summary is waiting to be saved.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finish workout' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('signed out without persistent storage warns that summaries are lost on leaving', () => {
    render(<SaveWorkoutPanel entries={[entry()]} currentSessionId="workout-a" authStatus="signed-out" persistent={false} {...handlers()} />);
    expect(screen.getByText(/not keeping data/)).toBeTruthy();
  });

  it('loading auth shows a checking line and no sign-in link', () => {
    render(<SaveWorkoutPanel entries={[entry()]} currentSessionId="workout-a" authStatus="loading" {...handlers()} />);
    expect(screen.getByText(/Checking your sign-in/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in to save' })).toBeNull();
  });

  it('failed: reason shown, Retry calls onRetry; non-retryable errors say retrying will not fix it', () => {
    const h = handlers();
    const failed = entry({ status: 'failed', lastError: { status: 503, code: 'database-unavailable', message: 'Saved workouts are temporarily unavailable. Try again.', retryable: true } });
    const { rerender } = render(<SaveWorkoutPanel entries={[failed]} currentSessionId="workout-a" authStatus="signed-in" {...h} />);
    expect(screen.getByText('Save failed')).toBeTruthy();
    expect(screen.getByText('Saved workouts are temporarily unavailable. Try again.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.onRetry).toHaveBeenCalledWith('set-1');
    rerender(<SaveWorkoutPanel entries={[{ ...failed, lastError: { status: 409, code: 'conflict', message: 'Conflict.', retryable: false } }]} currentSessionId="workout-a" authStatus="signed-in" {...h} />);
    expect(screen.getByText(/Conflict\. Retrying will not fix this\./)).toBeTruthy();
    rerender(<SaveWorkoutPanel entries={[{ ...failed, lastError: { status: 401, code: 'not-authenticated', message: 'Sign in again.', retryable: false } }]} currentSessionId="workout-a" authStatus="signed-out" {...h} />);
    expect(screen.queryByText(/Retrying will not fix/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' }).disabled).toBe(true);
  });

  it('Dismiss asks for confirmation; Keep cancels; Discard calls onDismiss once', () => {
    const h = handlers();
    render(<SaveWorkoutPanel entries={[entry({ status: 'failed', lastError: { message: 'x', retryable: true } })]} currentSessionId="workout-a" authStatus="signed-in" {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByText(/Discard this summary\? It cannot be recovered\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(h.onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
    expect(h.onDismiss).toHaveBeenCalledWith('set-1');
  });

  it('saved entries cannot be dismissed and link to their history detail', () => {
    render(<SaveWorkoutPanel entries={[entry({ status: 'saved', savedWorkoutId: 'w-9' })]} currentSessionId="workout-a" authStatus="signed-in" {...handlers()} />);
    expect(screen.getByRole('link', { name: 'View in history' }).getAttribute('href')).toBe('/history/w-9');
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('Finish workout: disabled with nothing saved or while saving or finalizing, enabled with a saved set', () => {
    const h = handlers();
    const props = { currentSessionId: 'workout-a', authStatus: 'signed-in', ...h };
    const finish = () => screen.getByRole('button', { name: /Finish(ing)? workout/ });
    const { rerender } = render(<SaveWorkoutPanel entries={[entry({ status: 'pending' })]} {...props} />);
    expect(finish().disabled).toBe(true);
    rerender(<SaveWorkoutPanel entries={[entry({ status: 'saved', savedWorkoutId: 'w' }), entry({ id: 'set-2', status: 'saving' })]} {...props} />);
    expect(finish().disabled).toBe(true);
    rerender(<SaveWorkoutPanel entries={[entry({ status: 'saved', savedWorkoutId: 'w' })]} {...props} finalizeStates={{ 'workout-a': { status: 'finalizing' } }} />);
    expect(finish().disabled).toBe(true);
    expect(finish().textContent).toBe('Finishing workout…');
    rerender(<SaveWorkoutPanel entries={[entry({ status: 'saved', savedWorkoutId: 'w' })]} {...props} />);
    expect(finish().disabled).toBe(false);
    fireEvent.click(finish());
    expect(h.onFinish).toHaveBeenCalledWith('workout-a');
    rerender(<SaveWorkoutPanel entries={[entry({ status: 'saved', savedWorkoutId: 'w' })]} {...props} finalizeStates={{ 'workout-a': { status: 'error', message: 'Some sets in this workout are not saved yet.' } }} />);
    expect(screen.getByRole('alert').textContent).toMatch(/Could not finish the workout: Some sets/);
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));
    expect(h.onFinish).toHaveBeenCalledTimes(2);
  });

  it('restored entries of another workout are grouped as an earlier workout with their own Finish workout', () => {
    const h = handlers();
    render(<SaveWorkoutPanel entries={[entry(), entry({ id: 'set-old', clientSessionId: 'workout-old', status: 'saved', savedWorkoutId: 'w-old' })]}
      currentSessionId="workout-a" authStatus="signed-in" {...h} />);
    expect(screen.getByText('This workout')).toBeTruthy();
    expect(screen.getByText(/Earlier workout from .* \(kept in this browser\)/)).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'Finish workout' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(h.onFinish).toHaveBeenCalledWith('workout-old');
  });

  it('M2: a not-savable notice renders the panel on its own with the message', () => {
    render(<SaveWorkoutPanel entries={[]} notice="Not enough tracking to save this set." authStatus="signed-in" {...handlers()} />);
    expect(screen.getByText('Not enough tracking to save this set.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish workout' })).toBeNull();
  });

  it('M1: unowned entries carry the shared-browser note; an other-account failure shows its message without Retry', () => {
    const h = handlers();
    const { rerender } = render(<SaveWorkoutPanel entries={[entry({ ownerId: null })]} currentSessionId="workout-a" authStatus="signed-out" {...h} />);
    expect(screen.getByText(/go to the next account that signs in on this browser/)).toBeTruthy();
    rerender(<SaveWorkoutPanel entries={[entry({ ownerId: 'u-a', status: 'failed', lastError: { status: 403, code: 'other-account', message: 'This set belongs to another account on this device.', retryable: false } })]}
      currentSessionId="workout-a" authStatus="signed-in" {...h} />);
    expect(screen.getByText('This set belongs to another account on this device.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByText(/Retrying will not fix/)).toBeNull();
    expect(screen.queryByText(/go to the next account/)).toBeNull();
  });

  it('after finalization shows the saved message and history link; states no frames leave the device', () => {
    render(<SaveWorkoutPanel entries={[]} lastFinalized={{ workoutId: 'w-1' }} authStatus="signed-in" {...handlers()} />);
    expect(screen.getByRole('link', { name: 'View it in your history' }).getAttribute('href')).toBe('/history/w-1');
    expect(screen.getByText(/Camera frames and pose landmarks never leave this device/)).toBeTruthy();
  });
});

// ------------------------------------------------------------------------------------------------
// CameraView save flow with the real queue, real AuthProvider (fake auth API) and a mocked workouts API.
// ------------------------------------------------------------------------------------------------

function fakeWorkoutsApi() {
  const api = {
    calls: [],
    failNextSubmit: null,
    createWorkout: vi.fn(async (body, token) => { api.calls.push(['create', body, token]); return { id: 'srv-workout-1', status: 'open' }; }),
    submitSet: vi.fn(async (workoutId, payload, token) => {
      api.calls.push(['submit', workoutId, payload, token]);
      if (api.failNextSubmit) { const e = api.failNextSubmit; api.failNextSubmit = null; throw e; }
      return { id: 'srv-set' };
    }),
    finalizeWorkout: vi.fn(async (workoutId, endedAt, token) => { api.calls.push(['finalize', workoutId, endedAt, token]); return { id: workoutId, status: 'finalized' }; }),
  };
  return api;
}
const authApi = (user = { id: 'u-a', email: 'a@example.com' }) => ({ me: vi.fn(async () => user), login: vi.fn(), register: vi.fn(), logout: vi.fn(async () => null) });
function signedIn(token = 'token-user-a-0123456789', userId = 'u-a') {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, expiresAt: new Date(Date.now() + 3600e3).toISOString(), user: { id: userId } }));
}

function setupCamera() {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockReturnValue(0);
}
async function curlAndFinish(startMs = 1000) {
  fireEvent.click(screen.getByRole('button', { name: 'Start Camera' }));
  await waitFor(() => expect(screen.getByText('On')).toBeTruthy());
  const frames = renderFrames({ startMs, noiseDeg: 0, spacingJitter: 0, dropFrameProb: 0, script: [{ ms: 500 }, ...curl(), ...curl()] });
  act(() => { for (const frame of frames) mocks.pose.onResult({ frame, timestampMs: frame.timestampMs, inferenceMs: 1, landmarks: [] }); });
  fireEvent.click(screen.getByRole('button', { name: 'Finish set' }));
}
const panel = () => screen.getByLabelText('Save workout');
const stored = () => JSON.parse(localStorage.getItem(SAVE_QUEUE_STORAGE_KEY) ?? '[]');

describe('CameraView save flow (mocked API, SYNTHETIC frames)', () => {
  beforeEach(() => { mocks.api = fakeWorkoutsApi(); setupCamera(); });

  it('signed out: Finish set keeps the summary in localStorage with a Sign in to save link; nothing is sent', async () => {
    render(<AuthProvider api={authApi()} storage={localStorage}><CameraView /></AuthProvider>);
    await curlAndFinish();
    expect(within(panel()).getByRole('link', { name: 'Sign in to save' }).getAttribute('href')).toMatch(/^\/login\?next=/);
    const [saved] = stored();
    expect(saved.status).toBe('pending');
    expect(saved.payload.summary.completedReps).toBe(2);
    expect(saved.payload.summary.cueLog).toBeUndefined();
    expect(saved.clientSessionId).toMatch(/^workout-/);
    expect(saved.ownerId).toBeNull();
    expect(within(panel()).getByText(/go to the next account that signs in on this browser/)).toBeTruthy();
    expect(mocks.api.calls).toHaveLength(0);
  });

  it('signed in: auto-saves; a 503 shows Save failed with the reason; Retry resends identical ids and body; Finish workout finalizes', async () => {
    signedIn();
    mocks.api.failNextSubmit = new ApiError({ status: 503, code: 'database-unavailable', message: 'Saved workouts are temporarily unavailable. Try again.', retryable: true });
    render(<AuthProvider api={authApi()} storage={localStorage}><CameraView /></AuthProvider>);
    await waitFor(() => expect(screen.queryByText(/Checking your sign-in/)).toBeNull());
    await curlAndFinish();
    await waitFor(() => expect(within(panel()).getByText('Save failed')).toBeTruthy());
    expect(within(panel()).getByText('Saved workouts are temporarily unavailable. Try again.')).toBeTruthy();
    expect(stored()[0].status).toBe('failed');
    expect(stored()[0].ownerId).toBe('u-a');
    expect(within(panel()).getByRole('button', { name: 'Finish workout' }).disabled).toBe(true);

    fireEvent.click(within(panel()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(panel()).getByText('Saved')).toBeTruthy());
    const submits = mocks.api.calls.filter((c) => c[0] === 'submit');
    expect(submits).toHaveLength(2);
    expect(JSON.stringify(submits[1][2])).toBe(JSON.stringify(submits[0][2]));
    const creates = mocks.api.calls.filter((c) => c[0] === 'create');
    expect(creates[1][1]).toEqual(creates[0][1]);
    expect(creates[0][2]).toBe('token-user-a-0123456789');
    expect(within(panel()).getByRole('link', { name: 'View in history' }).getAttribute('href')).toBe('/history/srv-workout-1');

    fireEvent.click(within(panel()).getByRole('button', { name: 'Finish workout' }));
    await waitFor(() => expect(within(panel()).getByRole('link', { name: 'View it in your history' })).toBeTruthy());
    const finalize = mocks.api.calls.find((c) => c[0] === 'finalize');
    expect(finalize[1]).toBe('srv-workout-1');
    expect(Date.parse(finalize[2])).toBeGreaterThanOrEqual(Date.parse(submits[0][2].endedAt));
    expect(stored()).toEqual([], 'finalized sets leave the local queue');
  });

  it('a failed save survives a reload (remount) and is listed as an earlier workout until retried or dismissed', async () => {
    signedIn();
    mocks.api.failNextSubmit = new ApiError({ status: 422, code: 'validation-error', message: 'Invalid data (body): bad', retryable: false });
    const first = render(<AuthProvider api={authApi()} storage={localStorage}><CameraView /></AuthProvider>);
    await waitFor(() => expect(screen.queryByText(/Checking your sign-in/)).toBeNull());
    await curlAndFinish();
    await waitFor(() => expect(within(panel()).getByText('Save failed')).toBeTruthy());
    first.unmount();
    render(<AuthProvider api={authApi()} storage={localStorage}><CameraView /></AuthProvider>);
    await waitFor(() => expect(within(panel()).getByText(/Earlier workout from .* \(kept in this browser\)/)).toBeTruthy());
    expect(within(panel()).getByText(/Retrying will not fix this/)).toBeTruthy();
    expect(mocks.api.calls.filter((c) => c[0] === 'submit')).toHaveLength(1); // failed entries are not auto-retried
    fireEvent.click(within(panel()).getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Discard' }));
    expect(stored()).toEqual([]);
    expect(screen.queryByLabelText('Save workout')).toBeNull();
  });

  it('signing in later saves the pending summary with the new token', async () => {
    const api = authApi();
    api.login.mockResolvedValue({ accessToken: 'token-after-login-0123456', expiresAt: new Date(Date.now() + 3600e3).toISOString(), user: { id: 'u-a' } });
    const { useAuth } = await import('../../src/auth/AuthContext.jsx');
    const Probe = () => { const auth = useAuth(); return <button type="button" onClick={() => auth.login('a@example.com', 'correct-horse-battery')}>probe sign in</button>; };
    render(<AuthProvider api={api} storage={localStorage}><Probe /><CameraView /></AuthProvider>);
    await curlAndFinish();
    expect(mocks.api.calls).toHaveLength(0);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'probe sign in' })); });
    await waitFor(() => expect(within(panel()).getByText('Saved')).toBeTruthy());
    expect(mocks.api.calls.find((c) => c[0] === 'submit')[3]).toBe('token-after-login-0123456');
    expect(stored()[0].ownerId).toBe('u-a'); // the signed-out entry is claimed by the account that saved it
  });

  it("M1: user A's pending entry is neither auto-saved nor shown when user B signs in on the same browser", async () => {
    localStorage.setItem(SAVE_QUEUE_STORAGE_KEY, JSON.stringify([entry({ id: 'set-of-a', clientSessionId: 'workout-of-a', ownerId: 'u-a', status: 'pending' })]));
    signedIn('token-user-b-0123456789', 'u-b');
    const api = authApi({ id: 'u-b', email: 'b@example.com' });
    const { useAuth } = await import('../../src/auth/AuthContext.jsx');
    const Status = () => <p data-testid="auth-status">{useAuth().status}</p>;
    render(<AuthProvider api={api} storage={localStorage}><Status /><CameraView /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('auth-status').textContent).toBe('signed-in'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mocks.api.calls).toHaveLength(0);
    expect(screen.queryByLabelText('Save workout')).toBeNull();
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ id: 'set-of-a', ownerId: 'u-a', status: 'pending' });
  });
});

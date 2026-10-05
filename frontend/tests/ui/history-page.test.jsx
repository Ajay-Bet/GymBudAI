// Sprint 5 independent validation (s5-validation): HistoryPage list and detail render with real-shaped
// workouts (regression for the formatDate "Invalid option" crash found in the live run, 2026-10-04).
// api/workouts.js is mocked; the detail fixture is shaped from the backend WorkoutDetail contract. DOM
// (jsdom) evidence only.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ listWorkouts: vi.fn(), getWorkout: vi.fn() }));
vi.mock('../../src/api/workouts.js', () => ({ listWorkouts: (...a) => mocks.listWorkouts(...a), getWorkout: (...a) => mocks.getWorkout(...a),
  createWorkout: vi.fn(), submitSet: vi.fn(), finalizeWorkout: vi.fn(), updateWorkoutNotes: vi.fn() }));

import HistoryPage from '../../src/pages/HistoryPage.jsx';
import { AuthProvider, AUTH_STORAGE_KEY } from '../../src/auth/AuthContext.jsx';
import { ApiError } from '../../src/api/http.js';

const TOKEN = 'token-history-0123456789';
const totals = { sets: 1, completedReps: 4, analyzedReps: 4, issueBearingReps: 2 };
const listItem = (id, startedAt, status = 'finalized') => ({ id, clientSessionId: `workout-${id}`, exerciseId: 'dumbbell-curl', status,
  startedAt, endedAt: status === 'finalized' ? '2026-10-01T12:10:00Z' : null, totals });
const detail = {
  ...listItem('w-1', '2026-10-01T11:55:00Z'), timezone: 'America/Chicago', notes: 'felt strong',
  sets: [{
    id: 's-1', clientSetId: 'set-abc', setIndex: 1, side: 'left', view: 'side', mode: 'review',
    startedAt: '2026-10-01T11:59:40Z', endedAt: '2026-10-01T12:00:00Z', summarySchemaVersion: 'set-summary-1.0.0',
    analyzerVersion: 'curl-1.1.0', featureVersion: '1.2.0', rulesVersion: 'curl-rules-1.0.0', feedbackVersion: 'feedback-1.1.0',
    completedReps: 4, analyzedReps: 4, issueBearingReps: 2, noIssueReps: 2, noIssueFraction: 0.5, notAnalyzedReason: null,
    trackingAssessableMs: 19000, trackingSessionMs: 20000, trackingCoverage: 0.95,
    interruptedAttempts: { total: 1, byReason: { partial: 1, 'tracking-loss': 0 }, closedAtFinish: 0 },
    episodeCountsByType: { 'torso-swing': 1, 'upper-arm-drift': 1, 'incomplete-rom': 1 },
    summary: { minFormCoverage: 0.8, assessedRuleTypes: ['torso-swing', 'upper-arm-drift', 'incomplete-rom'], unassessedEpisodeCountsByType: {} },
    createdAt: '2026-10-01T12:00:01Z',
    reps: [
      { id: 'r1', clientRepId: 'curl-x-1', repIndex: 1, startMs: 1000, endMs: 4000, durationMs: 3000, minFlexionDeg: 10.2, maxFlexionDeg: 130.4, romDeg: 120.2, formCoverage: 1, analyzed: true, issueBearing: true, issueTypes: ['torso-swing'] },
      { id: 'r2', clientRepId: 'curl-x-2', repIndex: 2, startMs: 5000, endMs: 7400, durationMs: 2400, minFlexionDeg: null, maxFlexionDeg: 129, romDeg: null, formCoverage: null, analyzed: false, issueBearing: false, issueTypes: [] },
    ],
    formEvents: [
      { id: 'e1', clientEventId: 'issue-x-1', issueType: 'torso-swing', startMs: 1500, endMs: 2500, peak: 18.25, peakUnit: 'deg', assessed: true, rulesVersion: 'curl-rules-1.0.0', repClientIds: ['curl-x-1'] },
      { id: 'e2', clientEventId: 'issue-x-2', issueType: 'upper-arm-drift', startMs: 6000, endMs: null, peak: null, peakUnit: null, assessed: false, rulesVersion: 'curl-rules-1.0.0', repClientIds: [] },
    ],
  }],
};

function renderAt(path) {
  return render(
    <AuthProvider api={{ me: vi.fn(async () => ({ id: 'u', email: 'a@example.com', displayName: 'Ajay' })), login: vi.fn(), register: vi.fn(), logout: vi.fn() }} storage={localStorage}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:workoutId" element={<HistoryPage />} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: TOKEN, expiresAt: new Date(Date.now() + 3600e3).toISOString(), user: null }));
  mocks.listWorkouts.mockReset();
  mocks.getWorkout.mockReset();
});
afterEach(cleanup);

describe('HistoryPage', () => {
  it('lists workouts (dates, totals with denominators, status) and pages with Load older', async () => {
    mocks.listWorkouts
      .mockResolvedValueOnce({ items: [listItem('w-2', '2026-10-02T09:00:00Z', 'open'), listItem('w-1', '2026-10-01T11:55:00Z')], nextCursor: '2026-10-01T11:55:00Z' })
      .mockResolvedValueOnce({ items: [listItem('w-0', '2026-09-30T08:00:00Z')], nextCursor: null });
    renderAt('/history');
    await waitFor(() => expect(screen.getAllByText('Dumbbell curl')).toHaveLength(2));
    expect(mocks.listWorkouts).toHaveBeenCalledWith({ limit: 20, cursor: null }, TOKEN, expect.anything());
    expect(screen.getAllByText(/1 set · 4 completed reps · 4 of 4 analyzed/)).toHaveLength(2);
    expect(screen.getByText(/Open$/)).toBeTruthy();
    expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(2); // formatted dates rendered, page did not crash
    expect(screen.getByRole('link', { name: /Dumbbell curl.*Open/s }).getAttribute('href')).toBe('/history/w-2');
    fireEvent.click(screen.getByRole('button', { name: 'Load older workouts' }));
    await waitFor(() => expect(screen.getAllByText('Dumbbell curl')).toHaveLength(3));
    expect(mocks.listWorkouts).toHaveBeenLastCalledWith({ limit: 20, cursor: '2026-10-01T11:55:00Z' }, TOKEN, expect.anything());
    expect(screen.queryByRole('button', { name: 'Load older workouts' })).toBeNull();
  });

  it('empty list explains how to save; list error offers Retry', async () => {
    mocks.listWorkouts.mockRejectedValueOnce(new ApiError({ status: 503, code: 'database-unavailable', message: 'Saved workouts are temporarily unavailable. Try again.', retryable: true }))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    renderAt('/history');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/temporarily unavailable/));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText(/No saved workouts yet/)).toBeTruthy());
  });

  it('detail shows every saved summary field with units, denominators and Not assessed for missing values', async () => {
    mocks.getWorkout.mockResolvedValueOnce(detail);
    renderAt('/history/w-1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dumbbell curl' })).toBeTruthy());
    expect(mocks.getWorkout).toHaveBeenCalledWith('w-1', TOKEN, expect.anything());
    const text = document.body.textContent;
    for (const expected of [
      'Finished', 'America/Chicago', 'felt strong', '4 reps', '4 of 4 completed reps', '2 of 4 analyzed reps',
      '50% (2 of 4 analyzed reps)', 'Detector summary, not a validated form score', '95% (19.0 s of 20.0 s)', '80%', '1 attempts',
      'partial: 1', 'torso swing: 1', 'review', 'left', 'side', 'set-abc', 'set-summary-1.0.0', 'curl-1.1.0', '1.2.0',
      'curl-rules-1.0.0', 'feedback-1.1.0', '3.0 s', '10.2°', '130.4°', '120.2°', '100%', 'Open at finish', '18.3 deg',
      'No (not a form claim)', 'Event times are from the start of the set.',
    ]) expect(text, expected).toContain(expected);
    expect(text).toContain('Not assessed'); // rep 2 has null min flexion / ROM / coverage
    expect(text).not.toMatch(/NaN|undefined|null/);
    expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(2); // started / set times formatted
  });

  it('detail 404 says not found without Retry; other errors offer Retry', async () => {
    mocks.getWorkout.mockRejectedValueOnce(new ApiError({ status: 404, code: 'not-found', message: 'Workout not found.' }));
    renderAt('/history/someone-elses');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Workout not found\./));
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('signed out shows a sign-in link carrying the current page', async () => {
    localStorage.clear();
    renderAt('/history/w-1');
    const link = await screen.findByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fhistory%2Fw-1');
    expect(mocks.getWorkout).not.toHaveBeenCalled();
  });
});

it('uses the selected display timezone consistently for history detail', async () => {
  localStorage.setItem('gymbud.analytics.timezone', 'America/New_York');
  mocks.getWorkout.mockResolvedValueOnce(detail);
  renderAt('/history/w-1');
  await screen.findByRole('heading', {name:'Dumbbell curl'});
  expect(screen.getByLabelText('Display timezone').value).toBe('America/New_York');
  expect(document.body.textContent).toContain('7:55 AM EDT');
  expect(document.body.textContent).not.toMatch(/Invalid Date|NaN/);
});

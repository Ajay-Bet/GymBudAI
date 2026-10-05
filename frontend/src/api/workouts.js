/** Workout transport (Sprint 5, GB 503/504). Every call is authenticated; the server filters by owner. */
import { apiRequest } from './http.js';

const workoutPath = (workoutId) => `/api/workouts/${encodeURIComponent(workoutId)}`;

/** Idempotent create: `{clientSessionId, exerciseId, startedAt, timezone?}` → WorkoutDetail (201 new, 200 existing). */
export function createWorkout(body, token, options = {}) {
  return apiRequest('/api/workouts', { ...options, method: 'POST', body, token });
}

/** Batch-submit one set (WorkoutSetIn) with its reps and form events. Identical replays return 200. */
export function submitSet(workoutId, payload, token, options = {}) {
  return apiRequest(`${workoutPath(workoutId)}/sets`, { ...options, method: 'POST', body: payload, token });
}

/** Idempotent finalize → WorkoutDetail. */
export function finalizeWorkout(workoutId, endedAt, token, options = {}) {
  const iso = endedAt instanceof Date ? endedAt.toISOString() : endedAt;
  return apiRequest(`${workoutPath(workoutId)}/finalize`, { ...options, method: 'POST', body: { endedAt: iso }, token });
}

/** → `{items: WorkoutListItem[], nextBefore: string|null}`, newest first. */
export function listWorkouts({ limit = 20, before = null } = {}, token, options = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return apiRequest(`/api/workouts?${params}`, { ...options, token });
}

/** → WorkoutDetail. 404 `not-found` for workouts the caller does not own. */
export function getWorkout(workoutId, token, options = {}) {
  return apiRequest(workoutPath(workoutId), { ...options, token });
}

/** → WorkoutDetail with the new notes (≤ 1000 chars). */
export function updateWorkoutNotes(workoutId, notes, token, options = {}) {
  return apiRequest(workoutPath(workoutId), { ...options, method: 'PATCH', body: { notes }, token });
}

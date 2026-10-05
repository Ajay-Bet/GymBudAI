/**
 * Persisted save queue for finished sets (Sprint 5, GB 503). Pure JavaScript; inject `api`, `storage`,
 * `now` and `eventTarget` for tests.
 *
 * - Entries persist under `gymbud.pendingSaves.v1` so unsaved summaries survive reloads.
 * - Every retry reuses the entry's clientSessionId, clientSetId and identical payload, so the server
 *   treats repeats as idempotent replays.
 * - Failures stay visible: 409 (conflict / workout-finalized) and 422 are non-retryable failures; 401
 *   marks the entry failed with code `not-authenticated`. Only dismiss() removes an unsaved entry;
 *   clearSaved() removes saved ones.
 * - Ownership (shared browsers): each entry has `ownerId` (user id, or null when enqueued signed out).
 *   A null-owner entry is claimed by the first user who saves it. Saving another user's entry is
 *   refused with code `other-account` (the entry itself is left untouched). list({userId}) shows only
 *   that user's and unowned entries; other users' entries stay in storage, hidden. Logout keeps storage.
 * - Multiple tabs: every write first re-reads storage and merges by id (more advanced status wins:
 *   saved > saving > failed/pending; ties keep this tab's copy). A window `storage` event for the key
 *   refreshes this tab and notifies subscribers.
 * - Storage errors (private mode, quota) fall back to memory; isPersistent() reports it.
 */
import * as workoutsApi from './workouts.js';

export const SAVE_QUEUE_STORAGE_KEY = 'gymbud.pendingSaves.v1';

const STATUSES = ['pending', 'saving', 'saved', 'failed'];
const RANK = { pending: 1, failed: 1, saving: 2, saved: 3 };

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function defaultEventTarget() {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
}

function describeError(error, at) {
  const status = Number.isFinite(error?.status) ? error.status : 0;
  if (status === 401) {
    return { status, code: 'not-authenticated', message: 'Your sign-in has ended. Sign in again, then retry.', retryable: false, at };
  }
  const retryable = status === 409 || status === 422 ? false : error?.retryable === true;
  return { status, code: typeof error?.code === 'string' ? error.code : 'save-failed',
    message: typeof error?.message === 'string' && error.message ? error.message : 'Save failed.', retryable, at };
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const isValidEntry = (entry) => entry && typeof entry.id === 'string' && entry.payload && STATUSES.includes(entry.status);
const normalize = (entry) => ({ ...entry, ownerId: typeof entry.ownerId === 'string' && entry.ownerId ? entry.ownerId : null });

function parseEntries(raw) {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter(isValidEntry).map(normalize) : [];
}

/** True when `options` names a user (userId may be null = signed out). */
const scoped = (options) => Boolean(options) && Object.prototype.hasOwnProperty.call(options, 'userId');
const visibleTo = (entry, userId) => entry.ownerId === null || entry.ownerId === (userId ?? null);

/**
 * @param {Object} [options]
 * @param {Storage|{getItem: Function, setItem: Function}|null} [options.storage]
 * @param {{createWorkout: Function, submitSet: Function, finalizeWorkout: Function}} [options.api]
 * @param {() => number} [options.now] Epoch ms.
 * @param {EventTarget|null} [options.eventTarget] Receives `storage` events; default window when present.
 */
export function createSaveQueue({ storage = defaultStorage(), api = workoutsApi, now = () => Date.now(),
  eventTarget = defaultEventTarget() } = {}) {
  let entries = [];
  let persistent = Boolean(storage);
  const listeners = new Set();
  const inFlight = new Map();
  const removed = new Set(); // ids this tab dismissed/cleared, so merging never resurrects them
  // Serialized copy of each entry as this tab last read or wrote it: a stored entry equal to it is
  // this tab's own (possibly older) state, not another tab's progress.
  const known = new Map();
  const remember = (list) => { for (const entry of list) known.set(entry.id, JSON.stringify(entry)); };

  try {
    const stored = parseEntries(storage?.getItem(SAVE_QUEUE_STORAGE_KEY));
    remember(stored);
    // A save interrupted by a reload never confirmed; it goes back to pending with the same ids.
    entries = stored.map((entry) => (entry.status === 'saving' ? { ...entry, status: 'pending' } : entry));
  } catch {
    persistent = false;
    entries = [];
  }

  function readStored() {
    try { return parseEntries(storage?.getItem(SAVE_QUEUE_STORAGE_KEY)); } catch { return null; }
  }

  /** Merge entries another tab wrote into memory (by id; more advanced status wins, ties keep ours). */
  function mergeFromStorage() {
    if (!storage) return;
    const stored = readStored();
    if (!stored) return;
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    for (const theirs of stored) {
      if (removed.has(theirs.id) || known.get(theirs.id) === JSON.stringify(theirs)) continue;
      const ours = byId.get(theirs.id);
      if (!ours) byId.set(theirs.id, theirs);
      else if (RANK[theirs.status] > RANK[ours.status]) byId.set(theirs.id, theirs);
    }
    entries = [...byId.values()];
  }

  function persist() {
    if (!storage) return;
    mergeFromStorage();
    try {
      storage.setItem(SAVE_QUEUE_STORAGE_KEY, JSON.stringify(entries));
      remember(entries);
      persistent = true;
    } catch {
      persistent = false;
    }
  }

  function list(options) {
    const visible = scoped(options) ? entries.filter((entry) => visibleTo(entry, options.userId)) : entries;
    return visible.map(clone);
  }

  function notify() {
    const snapshot = list();
    for (const fn of [...listeners]) {
      try { fn(snapshot); } catch { /* a listener error must not break the queue */ }
    }
  }

  function emit() {
    persist();
    notify();
  }

  function update(id, patch) {
    entries = entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
    emit();
  }

  function get(id) {
    const entry = entries.find((item) => item.id === id);
    return entry ? clone(entry) : null;
  }

  // Another tab changed the queue: take its state as the base (it may have removed entries) and keep
  // only this tab's in-flight entries on top.
  function onStorageEvent(event) {
    if (event?.key !== SAVE_QUEUE_STORAGE_KEY && event?.key !== null) return;
    let stored;
    try { stored = event.key === null ? [] : parseEntries(event.newValue); } catch { return; }
    const byId = new Map(stored.filter((entry) => !removed.has(entry.id)).map((entry) => [entry.id, entry]));
    for (const ours of entries) {
      const theirs = byId.get(ours.id);
      if (inFlight.has(ours.id) && (!theirs || RANK[ours.status] >= RANK[theirs.status])) byId.set(ours.id, ours);
    }
    entries = [...byId.values()];
    remember(stored);
    notify();
  }
  eventTarget?.addEventListener?.('storage', onStorageEvent);

  function enqueue({ clientSessionId, exerciseId, workoutStartedAt, timezone = null, payload, ownerId = null } = {}) {
    const id = payload?.clientSetId;
    if (typeof id !== 'string' || !id) throw new Error('enqueue: payload.clientSetId is required.');
    if (typeof clientSessionId !== 'string' || !clientSessionId) throw new Error('enqueue: clientSessionId is required.');
    if (typeof exerciseId !== 'string' || !exerciseId) throw new Error('enqueue: exerciseId is required.');
    if (typeof workoutStartedAt !== 'string' || !workoutStartedAt) throw new Error('enqueue: workoutStartedAt (ISO) is required.');
    mergeFromStorage();
    const existing = get(id);
    if (existing) return existing;
    removed.delete(id);
    entries = [...entries, { id, clientSessionId, exerciseId, workoutStartedAt, timezone,
      ownerId: typeof ownerId === 'string' && ownerId ? ownerId : null, payload: clone(payload),
      status: 'pending', attempts: 0, lastError: null, savedWorkoutId: null, createdAt: now() }];
    emit();
    return get(id);
  }

  async function runSave(id, token, userId) {
    mergeFromStorage();
    const entry = entries.find((item) => item.id === id);
    if (!entry) throw codedError('not-found', `No queued save ${id}.`);
    if (entry.ownerId !== null && entry.ownerId !== (userId ?? null)) {
      // Another account's set: refuse without touching the owner's entry.
      return { ...clone(entry), status: 'failed', lastError: { status: 403, code: 'other-account',
        message: 'This set belongs to another account on this device.', retryable: false, at: now() } };
    }
    if (entry.status === 'saved') return get(id);
    if (!token) {
      update(id, { status: 'failed', lastError: { status: 401, code: 'not-authenticated',
        message: 'Sign in to save this set.', retryable: false, at: now() } });
      return get(id);
    }
    const claim = entry.ownerId === null && userId ? { ownerId: userId } : {};
    update(id, { ...claim, status: 'saving', attempts: entry.attempts + 1 });
    try {
      const workoutBody = { clientSessionId: entry.clientSessionId, exerciseId: entry.exerciseId, startedAt: entry.workoutStartedAt };
      if (entry.timezone) workoutBody.timezone = entry.timezone;
      const workout = await api.createWorkout(workoutBody, token);
      await api.submitSet(workout.id, entry.payload, token);
      if (entries.some((item) => item.id === id)) update(id, { status: 'saved', lastError: null, savedWorkoutId: workout.id, savedAt: now() });
    } catch (error) {
      if (entries.some((item) => item.id === id)) update(id, { status: 'failed', lastError: describeError(error, now()) });
    }
    return get(id);
  }

  /**
   * Save (or re-save) one entry as `userId` (the signed-in user's id). Concurrent calls for the same
   * id share one request.
   */
  function save(id, token, { userId = null } = {}) {
    if (inFlight.has(id)) return inFlight.get(id);
    const promise = runSave(id, token, userId).finally(() => inFlight.delete(id));
    inFlight.set(id, promise);
    return promise;
  }

  function removeWhere(predicate) {
    mergeFromStorage();
    const gone = entries.filter(predicate);
    if (!gone.length) return;
    for (const entry of gone) removed.add(entry.id);
    entries = entries.filter((entry) => !predicate(entry));
    emit();
  }

  return {
    enqueue,
    save,
    retry: save,
    /** Explicit removal of an entry, saved or not. */
    dismiss(id) { removeWhere((entry) => entry.id === id); },
    /** Remove saved entries only; with {userId}, only that user's (and unowned) saved entries. */
    clearSaved(options) {
      removeWhere((entry) => entry.status === 'saved' && (!scoped(options) || visibleTo(entry, options.userId)));
    },
    list,
    get,
    /** fn receives every entry (unscoped); call list({userId}) inside it for the visible ones. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    isPersistent: () => persistent,
    /** Stop listening to storage events (tests, teardown). */
    destroy() {
      eventTarget?.removeEventListener?.('storage', onStorageEvent);
      listeners.clear();
    },
    /**
     * Finalize a workout once all of the current user's sets in it are saved (with {userId}: that
     * user's and unowned entries; without it: every entry of the workout).
     * Rejects with code 'no-saved-sets' or 'unsaved-sets' otherwise; API errors propagate (ApiError).
     */
    async finalize(clientSessionId, endedAt, token, options) {
      mergeFromStorage();
      const sessionEntries = entries.filter((entry) => entry.clientSessionId === clientSessionId
        && (!scoped(options) || visibleTo(entry, options.userId)));
      const saved = sessionEntries.filter((entry) => entry.status === 'saved' && entry.savedWorkoutId);
      if (!saved.length) throw codedError('no-saved-sets', 'No saved sets in this workout yet.');
      if (saved.length !== sessionEntries.length) throw codedError('unsaved-sets', 'Some sets in this workout are not saved yet. Retry or dismiss them first.');
      const iso = endedAt instanceof Date ? endedAt.toISOString() : endedAt;
      return api.finalizeWorkout(saved[0].savedWorkoutId, iso, token);
    },
  };
}

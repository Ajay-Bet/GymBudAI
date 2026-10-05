// Sprint 5 independent validation (s5-validation): frontend/src/api/saveQueue.js against the
// "Agreed persistence contract" (GB 503). A fake API and an in-memory Storage stand in for FastAPI and
// localStorage; payloads come from the real builder on SYNTHETIC frames.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveQueue, SAVE_QUEUE_STORAGE_KEY } from '../src/api/saveQueue.js';
import { ApiError } from '../src/api/http.js';
import { realSetPayload } from './fixtures/workout-payload-fixtures.js';

class MemoryStorage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial)); this.failWrites = false; }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { if (this.failWrites) throw new Error('QuotaExceededError'); this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

/** Fake FastAPI: idempotent by client ids, records every call. `fail` queues errors per method. */
function fakeApi() {
  const calls = [];
  const workouts = new Map(); // clientSessionId -> {id, startedAt}
  const sets = new Map(); // clientSetId -> body string
  const fail = { createWorkout: [], submitSet: [], finalizeWorkout: [] };
  const take = (name) => { const e = fail[name].shift(); if (e) throw e; };
  return {
    calls, workouts, sets, fail,
    async createWorkout(body, token) {
      calls.push(['createWorkout', body, token]); take('createWorkout');
      if (!workouts.has(body.clientSessionId)) workouts.set(body.clientSessionId, { id: `w-${workouts.size + 1}`, startedAt: body.startedAt });
      else if (workouts.get(body.clientSessionId).startedAt !== body.startedAt) throw new ApiError({ status: 409, code: 'conflict', message: 'different' });
      return { id: workouts.get(body.clientSessionId).id };
    },
    async submitSet(workoutId, payload, token) {
      calls.push(['submitSet', workoutId, payload, token]); take('submitSet');
      const text = JSON.stringify(payload);
      if (sets.has(payload.clientSetId) && sets.get(payload.clientSetId) !== text) throw new ApiError({ status: 409, code: 'conflict', message: 'conflict' });
      sets.set(payload.clientSetId, text);
      return { id: `s-${payload.clientSetId}` };
    },
    async finalizeWorkout(workoutId, endedAt, token) {
      calls.push(['finalizeWorkout', workoutId, endedAt, token]); take('finalizeWorkout');
      return { id: workoutId, status: 'finalized', endedAt };
    },
  };
}

const entryFor = (payload, clientSessionId = 'workout-1') => ({ clientSessionId, exerciseId: 'dumbbell-curl',
  workoutStartedAt: payload.startedAt, timezone: 'America/Chicago', payload });

test('enqueue persists under gymbud.pendingSaves.v1 with the contract fields', () => {
  const storage = new MemoryStorage();
  const queue = createSaveQueue({ storage, api: fakeApi(), now: () => 1000 });
  const { payload } = realSetPayload({ mode: 'review' });
  const entry = queue.enqueue(entryFor(payload));
  assert.equal(entry.id, payload.clientSetId);
  for (const key of ['id', 'clientSessionId', 'exerciseId', 'workoutStartedAt', 'timezone', 'payload', 'status', 'attempts', 'lastError', 'savedWorkoutId']) {
    assert.ok(key in entry, key);
  }
  assert.equal(entry.status, 'pending');
  const stored = JSON.parse(storage.getItem(SAVE_QUEUE_STORAGE_KEY));
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].payload, payload);
  // Enqueuing the same set again does not duplicate it.
  queue.enqueue(entryFor(payload));
  assert.equal(queue.list().length, 1);
  assert.throws(() => queue.enqueue({ ...entryFor(payload), clientSessionId: '' }), /clientSessionId/);
  assert.throws(() => queue.enqueue({ ...entryFor(payload), workoutStartedAt: undefined }), /workoutStartedAt/);
});

test('save: create workout then submit set with the token; saved with the workout id', async () => {
  const api = fakeApi();
  const queue = createSaveQueue({ storage: new MemoryStorage(), api });
  const { payload } = realSetPayload({ mode: 'review' });
  queue.enqueue(entryFor(payload));
  const result = await queue.save(payload.clientSetId, 'tok-1');
  assert.equal(result.status, 'saved');
  assert.equal(result.savedWorkoutId, 'w-1');
  assert.equal(result.attempts, 1);
  assert.deepEqual(api.calls.map((c) => c[0]), ['createWorkout', 'submitSet']);
  assert.deepEqual(api.calls[0][1], { clientSessionId: 'workout-1', exerciseId: 'dumbbell-curl', startedAt: payload.startedAt, timezone: 'America/Chicago' });
  assert.equal(api.calls[0][2], 'tok-1');
  assert.deepEqual(api.calls[1][2], payload);
  // Saving a saved entry is a no-op.
  await queue.save(payload.clientSetId, 'tok-1');
  assert.equal(api.calls.length, 2);
});

test('timeout after the server committed: retry reuses the same ids and identical body (server sees a replay)', async () => {
  const api = fakeApi();
  const queue = createSaveQueue({ storage: new MemoryStorage(), api });
  const { payload } = realSetPayload({ mode: 'review' });
  queue.enqueue(entryFor(payload));
  // The server stores the set, but the client only sees a timeout.
  const original = api.submitSet;
  api.submitSet = async (...args) => { await original(...args); throw new ApiError({ code: 'timeout', message: 'The server did not respond within 10 s.', retryable: true }); };
  const failed = await queue.save(payload.clientSetId, 'tok');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.lastError.code, 'timeout');
  assert.equal(failed.lastError.retryable, true);
  api.submitSet = original;
  const saved = await queue.retry(payload.clientSetId, 'tok');
  assert.equal(saved.status, 'saved');
  assert.equal(saved.attempts, 2);
  const submits = api.calls.filter((c) => c[0] === 'submitSet');
  assert.equal(submits.length, 2);
  assert.equal(JSON.stringify(submits[0][2]), JSON.stringify(submits[1][2]), 'retry body must be identical');
  const creates = api.calls.filter((c) => c[0] === 'createWorkout');
  assert.deepEqual(creates[0][1], creates[1][1]);
  assert.equal(api.workouts.size, 1);
  assert.equal(api.sets.size, 1);
});

test('failed entries survive a reload with their reason and summary; saving resumes as pending', async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  const queue = createSaveQueue({ storage, api });
  const { payload } = realSetPayload({ mode: 'review' });
  queue.enqueue(entryFor(payload));
  api.fail.createWorkout.push(new ApiError({ status: 503, code: 'database-unavailable', message: 'Saved workouts are temporarily unavailable. Try again.', retryable: true }));
  await queue.save(payload.clientSetId, 'tok');
  // Reload: a new queue reads the same storage.
  const reloaded = createSaveQueue({ storage, api });
  const [entry] = reloaded.list();
  assert.equal(entry.status, 'failed');
  assert.equal(entry.lastError.code, 'database-unavailable');
  assert.equal(entry.lastError.status, 503);
  assert.deepEqual(entry.payload, payload, 'the summary is preserved until retry or dismissal');
  assert.equal((await reloaded.retry(entry.id, 'tok')).status, 'saved');
});

test('a save interrupted by a reload (status saving) comes back as pending with the same ids', () => {
  const { payload } = realSetPayload({ mode: 'review' });
  const storage = new MemoryStorage({ [SAVE_QUEUE_STORAGE_KEY]: JSON.stringify([{ id: payload.clientSetId, clientSessionId: 'workout-1',
    exerciseId: 'dumbbell-curl', workoutStartedAt: payload.startedAt, timezone: null, payload, status: 'saving', attempts: 1, lastError: null, savedWorkoutId: null }]) });
  const queue = createSaveQueue({ storage, api: fakeApi() });
  assert.equal(queue.list()[0].status, 'pending');
  assert.equal(queue.list()[0].id, payload.clientSetId);
});

test('corrupt or foreign storage content is ignored without throwing', () => {
  for (const raw of ['not json', '{"a":1}', JSON.stringify([null, { id: 5 }, { id: 'x', payload: {}, status: 'weird' }])]) {
    const queue = createSaveQueue({ storage: new MemoryStorage({ [SAVE_QUEUE_STORAGE_KEY]: raw }), api: fakeApi() });
    assert.deepEqual(queue.list(), []);
  }
});

test('error classification: 409 and 422 are not retryable; 5xx, 429, network, timeout are; 401 is not-authenticated', async () => {
  const cases = [
    [new ApiError({ status: 409, code: 'conflict', message: 'c', retryable: false }), 'conflict', false],
    [new ApiError({ status: 409, code: 'workout-finalized', message: 'f', retryable: false }), 'workout-finalized', false],
    [new ApiError({ status: 422, code: 'validation-error', message: 'v', retryable: false }), 'validation-error', false],
    [new ApiError({ status: 503, code: 'database-unavailable', message: 'd', retryable: true }), 'database-unavailable', true],
    [new ApiError({ status: 429, code: 'rate-limited', message: 'r', retryable: true }), 'rate-limited', true],
    [new ApiError({ code: 'network-error', message: 'n', retryable: true }), 'network-error', true],
    [new ApiError({ status: 401, code: 'session-expired', message: 'x', retryable: false }), 'not-authenticated', false],
    [new Error('boom'), 'save-failed', false],
  ];
  for (const [error, code, retryable] of cases) {
    const api = fakeApi();
    api.fail.submitSet.push(error);
    const queue = createSaveQueue({ storage: new MemoryStorage(), api });
    const { payload } = realSetPayload({ mode: 'review' });
    queue.enqueue(entryFor(payload));
    const entry = await queue.save(payload.clientSetId, 'tok');
    assert.equal(entry.status, 'failed', code);
    assert.equal(entry.lastError.code, code);
    assert.equal(entry.lastError.retryable, retryable, code);
    assert.ok(entry.lastError.message);
  }
});

test('saving without a token marks the entry failed (not-authenticated) and makes no request', async () => {
  const api = fakeApi();
  const queue = createSaveQueue({ storage: new MemoryStorage(), api });
  const { payload } = realSetPayload({ mode: 'review' });
  queue.enqueue(entryFor(payload));
  const entry = await queue.save(payload.clientSetId, null);
  assert.equal(entry.status, 'failed');
  assert.equal(entry.lastError.code, 'not-authenticated');
  assert.equal(api.calls.length, 0);
  assert.deepEqual(entry.payload, payload);
});

test('concurrent save calls for one entry share one request (no double submit)', async () => {
  const api = fakeApi();
  const queue = createSaveQueue({ storage: new MemoryStorage(), api });
  const { payload } = realSetPayload({ mode: 'review' });
  queue.enqueue(entryFor(payload));
  const [a, b, c] = await Promise.all([queue.save(payload.clientSetId, 't'), queue.save(payload.clientSetId, 't'), queue.retry(payload.clientSetId, 't')]);
  assert.equal(a.status, 'saved');
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  assert.equal(api.calls.filter((x) => x[0] === 'submitSet').length, 1);
});

test('dismiss removes only on explicit request; clearSaved keeps unsaved entries', async () => {
  const api = fakeApi();
  const queue = createSaveQueue({ storage: new MemoryStorage(), api });
  const one = realSetPayload({ mode: 'review' }).payload, two = realSetPayload({ mode: 'review' }).payload;
  queue.enqueue(entryFor(one));
  queue.enqueue(entryFor(two));
  await queue.save(one.clientSetId, 't');
  api.fail.submitSet.push(new ApiError({ status: 503, code: 'database-unavailable', message: 'd', retryable: true }));
  await queue.save(two.clientSetId, 't');
  queue.clearSaved();
  assert.deepEqual(queue.list().map((e) => e.id), [two.clientSetId]);
  queue.dismiss('unknown');
  assert.equal(queue.list().length, 1);
  queue.dismiss(two.clientSetId);
  assert.equal(queue.list().length, 0);
});

test('dismiss while a save is in flight: the late result does not resurrect the entry', async () => {
  let release;
  const api = fakeApi();
  const original = api.submitSet;
  api.submitSet = async (...args) => { await new Promise((r) => { release = r; }); return original(...args); };
  const queue = createSaveQueue({ storage: new MemoryStorage(), api });
  const { payload } = realSetPayload({ mode: 'review' });
  queue.enqueue(entryFor(payload));
  const pending = queue.save(payload.clientSetId, 't');
  await new Promise((r) => setTimeout(r, 0));
  queue.dismiss(payload.clientSetId);
  release();
  assert.equal(await pending, null);
  assert.equal(queue.list().length, 0);
});

test('subscribe receives snapshots (copies) on every change; unsubscribe stops them; listener errors are contained', async () => {
  const queue = createSaveQueue({ storage: new MemoryStorage(), api: fakeApi() });
  const seen = [];
  queue.subscribe(() => { throw new Error('bad listener'); });
  const off = queue.subscribe((snapshot) => seen.push(snapshot.map((e) => e.status)));
  const { payload } = realSetPayload({ mode: 'review' });
  queue.enqueue(entryFor(payload));
  await queue.save(payload.clientSetId, 't');
  assert.deepEqual(seen, [['pending'], ['saving'], ['saved']]);
  off();
  queue.dismiss(payload.clientSetId);
  assert.equal(seen.length, 3);
  const snap = queue.list();
  snap.push('x');
  assert.equal(queue.list().length, 0);
});

test('storage failures fall back to memory and are reported by isPersistent()', async () => {
  const storage = new MemoryStorage();
  storage.failWrites = true;
  const queue = createSaveQueue({ storage, api: fakeApi() });
  const { payload } = realSetPayload({ mode: 'review' });
  queue.enqueue(entryFor(payload));
  assert.equal(queue.isPersistent(), false);
  assert.equal(queue.list().length, 1, 'entry kept in memory');
  const none = createSaveQueue({ storage: null, api: fakeApi() });
  assert.equal(none.isPersistent(), false);
  const throwing = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.doesNotThrow(() => createSaveQueue({ storage: throwing, api: fakeApi() }));
});

test('finalize requires every set of the workout saved; uses the saved workout id; other workouts ignored', async () => {
  const api = fakeApi();
  const queue = createSaveQueue({ storage: new MemoryStorage(), api });
  await assert.rejects(queue.finalize('workout-1', new Date(), 't'), (e) => e.code === 'no-saved-sets');
  const one = realSetPayload({ mode: 'review' }).payload, two = realSetPayload({ mode: 'review' }).payload;
  const other = realSetPayload({ mode: 'review' }).payload;
  queue.enqueue(entryFor(one));
  queue.enqueue({ ...entryFor(two), workoutStartedAt: one.startedAt });
  queue.enqueue(entryFor(other, 'workout-2'));
  await queue.save(one.clientSetId, 't');
  await assert.rejects(queue.finalize('workout-1', new Date(), 't'), (e) => e.code === 'unsaved-sets');
  await queue.save(two.clientSetId, 't');
  const endedAt = new Date('2026-10-01T12:30:00Z');
  const result = await queue.finalize('workout-1', endedAt, 't');
  assert.equal(result.status, 'finalized');
  const call = api.calls.find((c) => c[0] === 'finalizeWorkout');
  assert.deepEqual(call.slice(1), ['w-1', '2026-10-01T12:30:00.000Z', 't']);
  assert.equal(api.workouts.size, 1, 'both sets went to one workout (same clientSessionId and startedAt)');
  // API errors propagate unchanged.
  api.fail.finalizeWorkout.push(new ApiError({ status: 503, code: 'database-unavailable', message: 'd', retryable: true }));
  await assert.rejects(queue.finalize('workout-1', endedAt, 't'), (e) => e.code === 'database-unavailable');
});

// --- Review fixes M1 (owner per entry) and L1 (multiple tabs), added by s5-frontend at the lead's request ---

test('M1 ownership: unowned entry is claimed by the saver; another account is refused without touching it', async () => {
  const api = fakeApi();
  const storage = new MemoryStorage();
  const queue = createSaveQueue({ storage, api, eventTarget: null });
  const mine = realSetPayload({ mode: 'review' }).payload, signedOut = realSetPayload({ mode: 'review' }).payload;
  queue.enqueue({ ...entryFor(mine), ownerId: 'user-a' });
  queue.enqueue(entryFor(signedOut));
  assert.equal(queue.get(signedOut.clientSetId).ownerId, null);

  const refused = await queue.save(mine.clientSetId, 'tok-b', { userId: 'user-b' });
  assert.equal(refused.status, 'failed');
  assert.equal(refused.lastError.code, 'other-account');
  assert.equal(refused.lastError.retryable, false);
  assert.equal(api.calls.length, 0, 'no request with the other account token');
  assert.equal(queue.get(mine.clientSetId).status, 'pending', "owner's entry is untouched");
  assert.equal((await queue.retry(mine.clientSetId, 'tok-b', { userId: 'user-b' })).lastError.code, 'other-account');

  const claimed = await queue.save(signedOut.clientSetId, 'tok-b', { userId: 'user-b' });
  assert.equal(claimed.status, 'saved');
  assert.equal(claimed.ownerId, 'user-b');
  assert.equal((await queue.save(mine.clientSetId, 'tok-a', { userId: 'user-a' })).status, 'saved');
});

test('M1 visibility: list({userId}) shows own and unowned entries; others stay stored (logout keeps storage)', () => {
  const storage = new MemoryStorage();
  const queue = createSaveQueue({ storage, api: fakeApi(), eventTarget: null });
  const a = realSetPayload({ mode: 'review' }).payload, b = realSetPayload({ mode: 'review' }).payload, none = realSetPayload({ mode: 'review' }).payload;
  queue.enqueue({ ...entryFor(a), ownerId: 'user-a' });
  queue.enqueue({ ...entryFor(b), ownerId: 'user-b' });
  queue.enqueue(entryFor(none));
  assert.deepEqual(queue.list({ userId: 'user-a' }).map((e) => e.id).sort(), [a.clientSetId, none.clientSetId].sort());
  assert.deepEqual(queue.list({ userId: null }).map((e) => e.id), [none.clientSetId], 'signed out sees only unowned');
  assert.equal(queue.list().length, 3, 'unscoped list returns everything');
  const reloaded = createSaveQueue({ storage, api: fakeApi(), eventTarget: null });
  assert.deepEqual(reloaded.list({ userId: 'user-b' }).map((e) => e.id).sort(), [b.clientSetId, none.clientSetId].sort());
});

test("M1 finalize only considers the current user's entries of the workout", async () => {
  const api = fakeApi();
  const queue = createSaveQueue({ storage: new MemoryStorage(), api, eventTarget: null });
  const a = realSetPayload({ mode: 'review' }).payload, b = realSetPayload({ mode: 'review' }).payload;
  queue.enqueue({ ...entryFor(a), ownerId: 'user-a' });
  queue.enqueue({ ...entryFor(b), workoutStartedAt: a.startedAt, ownerId: 'user-b' });
  await queue.save(a.clientSetId, 't', { userId: 'user-a' });
  const result = await queue.finalize('workout-1', new Date('2026-10-01T12:30:00Z'), 't', { userId: 'user-a' });
  assert.equal(result.status, 'finalized');
  await assert.rejects(queue.finalize('workout-1', new Date(), 't', { userId: 'user-b' }), (e) => e.code === 'no-saved-sets');
});

test('L1 two tabs: writes merge by id, never drop the other tab entries, and a more advanced status wins', async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  const tab1 = createSaveQueue({ storage, api, eventTarget: null });
  const tab2 = createSaveQueue({ storage, api, eventTarget: null });
  const one = realSetPayload({ mode: 'review' }).payload, two = realSetPayload({ mode: 'review' }).payload;
  tab1.enqueue(entryFor(one));
  tab2.enqueue(entryFor(two));
  const stored = () => JSON.parse(storage.getItem(SAVE_QUEUE_STORAGE_KEY));
  assert.deepEqual(stored().map((e) => e.id).sort(), [one.clientSetId, two.clientSetId].sort(), 'tab2 kept tab1 entry');
  await tab2.save(two.clientSetId, 't');
  // tab1 still holds `two` as pending only if it never read it; any write merges the saved status in.
  tab1.enqueue(entryFor(one));
  tab1.dismiss('nothing');
  await tab1.save(one.clientSetId, 't');
  const byId = Object.fromEntries(stored().map((e) => [e.id, e.status]));
  assert.equal(byId[one.clientSetId], 'saved');
  assert.equal(byId[two.clientSetId], 'saved', 'tab1 did not overwrite tab2 saved status');
  assert.equal(tab1.get(two.clientSetId).status, 'saved');
  // tab1's own later failure is not overwritten by its own older stored status.
  const three = realSetPayload({ mode: 'review' }).payload;
  tab1.enqueue(entryFor(three));
  api.fail.submitSet.push(new ApiError({ status: 503, code: 'database-unavailable', message: 'd', retryable: true }));
  assert.equal((await tab1.save(three.clientSetId, 't')).status, 'failed');
  assert.equal(stored().find((e) => e.id === three.clientSetId).status, 'failed');
  // A dismissed entry is not resurrected by this tab's next write.
  tab1.dismiss(three.clientSetId);
  tab1.clearSaved();
  assert.equal(stored().some((e) => e.id === three.clientSetId), false);
});

test('L1 storage event refreshes the queue and notifies subscribers; destroy stops listening', () => {
  const storage = new MemoryStorage();
  const target = new EventTarget();
  const queue = createSaveQueue({ storage, api: fakeApi(), eventTarget: target });
  const seen = [];
  queue.subscribe((snapshot) => seen.push(snapshot.length));
  const other = createSaveQueue({ storage, api: fakeApi(), eventTarget: null });
  other.enqueue(entryFor(realSetPayload({ mode: 'review' }).payload));
  const fire = (key, newValue) => { const event = new Event('storage'); event.key = key; event.newValue = newValue; target.dispatchEvent(event); };
  fire('unrelated', '[]');
  assert.equal(seen.length, 0);
  fire(SAVE_QUEUE_STORAGE_KEY, storage.getItem(SAVE_QUEUE_STORAGE_KEY));
  assert.deepEqual(seen, [1]);
  assert.equal(queue.list().length, 1);
  fire(SAVE_QUEUE_STORAGE_KEY, 'not json');
  assert.deepEqual(seen, [1], 'corrupt event value ignored');
  queue.destroy();
  fire(SAVE_QUEUE_STORAGE_KEY, '[]');
  assert.equal(queue.list().length, 1);
  assert.doesNotThrow(() => createSaveQueue({ storage, api: fakeApi() }), 'no window in node: guarded');
});

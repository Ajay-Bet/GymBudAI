// Sprint 5 independent validation (s5-validation): frontend/src/api/workoutPayload.js against the
// "Agreed persistence contract" (WorkoutSetIn) in docs/sprints/sprint-5-STATUS.md. Inputs are the REAL
// set lifecycle (createCurlSet -> buildSetSummary) on SYNTHETIC frames; they prove the wire shape and
// field mapping, not detection accuracy. The same payloads are checked against the real backend in
// backend/tests/test_idempotency.py (backend/tests/fixtures/frontend_set_payloads.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWorkoutSetPayload, checkSavable, NOT_SAVABLE_MESSAGE } from '../src/api/workoutPayload.js';
import { realSetPayload, FIXED_ENDED_AT } from './fixtures/workout-payload-fixtures.js';

const REP_KEYS = ['clientRepId', 'repIndex', 'startMs', 'endMs', 'durationMs', 'minFlexionDeg', 'maxFlexionDeg', 'romDeg',
  'formCoverage', 'analyzed', 'issueBearing', 'issueTypes'];
const EVENT_KEYS = ['clientEventId', 'issueType', 'startMs', 'endMs', 'peak', 'peakUnit', 'assessed', 'rulesVersion', 'repClientIds'];
const backendFixture = JSON.parse(readFileSync(new URL('../../backend/tests/fixtures/frontend_set_payloads.json', import.meta.url), 'utf8'));

test('payload keys are exactly the contract keys (camelCase, nothing extra)', () => {
  const { payload } = realSetPayload({ mode: 'review' });
  assert.deepEqual(Object.keys(payload).sort(), ['clientSetId', 'endedAt', 'formEvents', 'reps', 'setIndex', 'startedAt', 'summary']);
  for (const rep of payload.reps) assert.deepEqual(Object.keys(rep).sort(), [...REP_KEYS].sort());
  for (const event of payload.formEvents) assert.deepEqual(Object.keys(event).sort(), [...EVENT_KEYS].sort());
});

test('summary is sent whole minus cueLog; the caller object is not mutated', () => {
  const { summary, payload } = realSetPayload({ mode: 'review' });
  assert.ok(Array.isArray(summary.cueLog) && summary.cueLog.length === 1, 'fixture has a cue log');
  assert.ok(!('cueLog' in payload.summary));
  const { cueLog: _c, ...rest } = summary;
  assert.deepEqual(payload.summary, JSON.parse(JSON.stringify(rest)));
  payload.summary.reps[0].analyzed = 'mutated';
  assert.notEqual(summary.reps[0].analyzed, 'mutated', 'payload must hold a copy');
  assert.equal(summary.cueLog.length, 1);
});

test('ids: clientSetId = summary.setId, setIndex, rep and episode ids carried unchanged', () => {
  const { summary, payload } = realSetPayload({ mode: 'review' });
  assert.match(payload.clientSetId, /^set-[0-9a-f-]{36}$/);
  assert.equal(payload.clientSetId, summary.setId);
  assert.equal(payload.setIndex, summary.setIndex);
  assert.deepEqual(payload.reps.map((r) => r.clientRepId), summary.reps.map((r) => r.id));
  assert.deepEqual(payload.formEvents.map((e) => e.clientEventId), summary.episodes.map((e) => e.id));
  // Server ClientId pattern and length.
  for (const id of [payload.clientSetId, ...payload.reps.map((r) => r.clientRepId), ...payload.formEvents.map((e) => e.clientEventId)]) {
    assert.match(id, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
    assert.ok(id.length <= 128);
  }
});

test('wall clock: endedAt is the given time, startedAt = endedAt - (endedMs - startedMs), both UTC ISO', () => {
  const { summary, payload } = realSetPayload({ mode: 'review' });
  assert.equal(payload.endedAt, FIXED_ENDED_AT);
  assert.ok(Math.abs((Date.parse(payload.endedAt) - Date.parse(payload.startedAt)) - (summary.endedMs - summary.startedMs)) <= 1, 'span within Date ms precision');
  assert.match(payload.startedAt, /Z$/);
  // Date input variants give the same result.
  const a = buildWorkoutSetPayload({ summary, endedAt: new Date(FIXED_ENDED_AT) });
  const b = buildWorkoutSetPayload({ summary, endedAt: Date.parse(FIXED_ENDED_AT) });
  assert.equal(a.endedAt, b.endedAt);
  assert.throws(() => buildWorkoutSetPayload({ summary, endedAt: 'not a date' }), /endedAt/);
});

test('unknown span (startedMs null) gives startedAt = endedAt, never a negative span', () => {
  const { summary } = realSetPayload({ noFrames: true });
  assert.equal(summary.startedMs, null);
  const p = buildWorkoutSetPayload({ summary, endedAt: FIXED_ENDED_AT });
  assert.equal(p.startedAt, p.endedAt);
  const reversed = buildWorkoutSetPayload({ summary: { ...summary, startedMs: 5000, endedMs: 1000 }, endedAt: FIXED_ENDED_AT });
  assert.equal(reversed.startedAt, reversed.endedAt);
});

test('rep measurements come from completedReps, analysis flags from summary.reps', () => {
  const { summary, completedReps, payload } = realSetPayload({ mode: 'review' });
  assert.equal(payload.reps.length, completedReps.length);
  payload.reps.forEach((rep, i) => {
    const source = completedReps[i], flags = summary.reps[i];
    assert.equal(rep.repIndex, source.index);
    assert.equal(rep.startMs, source.startMs);
    assert.equal(rep.endMs, source.endMs);
    assert.equal(rep.durationMs, source.durationMs);
    assert.ok(Math.abs(rep.durationMs - (rep.endMs - rep.startMs)) <= 1, 'server requires durationMs = endMs - startMs (±1 ms)');
    assert.equal(rep.minFlexionDeg, source.minFlexionDeg);
    assert.equal(rep.maxFlexionDeg, source.maxFlexionDeg);
    assert.equal(rep.romDeg, source.romDeg);
    assert.equal(rep.formCoverage, flags.formCoverage);
    assert.equal(rep.analyzed, flags.analyzed);
    assert.equal(rep.issueBearing, flags.issueBearing);
    assert.deepEqual(rep.issueTypes, flags.issueTypes);
  });
});

test('counts in the payload agree with the summary (what the server cross-checks)', () => {
  for (const mode of ['validated-only', 'review']) {
    const { payload } = realSetPayload({ mode });
    const s = payload.summary;
    assert.equal(s.completedReps, payload.reps.length, mode);
    assert.equal(s.analyzedReps, payload.reps.filter((r) => r.analyzed).length, mode);
    assert.equal(s.issueBearingReps, payload.reps.filter((r) => r.issueBearing).length, mode);
    assert.equal(s.noIssueReps, s.analyzedReps - s.issueBearingReps);
    const assessed = {};
    for (const e of payload.formEvents) if (e.assessed) assessed[e.issueType] = (assessed[e.issueType] ?? 0) + 1;
    for (const type of new Set([...Object.keys(assessed), ...Object.keys(s.episodeCountsByType)])) {
      assert.equal(assessed[type] ?? 0, s.episodeCountsByType[type] ?? 0, `${mode} ${type}`);
    }
  }
});

test('repClientIds: rep ids whose episodeIds contain the episode; only reps of this payload', () => {
  const { summary, payload } = realSetPayload({ mode: 'review' });
  const repIds = new Set(payload.reps.map((r) => r.clientRepId));
  for (const event of payload.formEvents) {
    for (const id of event.repClientIds) assert.ok(repIds.has(id));
    const expected = summary.reps.filter((r) => r.episodeIds.includes(event.clientEventId)).map((r) => r.id);
    assert.deepEqual(event.repClientIds, expected);
  }
  assert.ok(payload.formEvents.some((e) => e.repClientIds.length > 0), 'review fixture links at least one episode');
  // validated-only (today's app): episodes are unassessed, so no rep links are sent (not form claims).
  const v = realSetPayload({ mode: 'validated-only' }).payload;
  assert.ok(v.formEvents.length > 0);
  assert.ok(v.formEvents.every((e) => e.assessed === false && e.repClientIds.length === 0));
});

test('missing numbers stay null, never 0; non-finite values become null', () => {
  const { summary } = realSetPayload({ mode: 'review' });
  const broken = JSON.parse(JSON.stringify(summary));
  broken.reps[0].formCoverage = null;
  broken.episodes[0].peak = undefined;
  broken.episodes[0].endMs = null;
  const reps = [{ id: broken.reps[0].id, index: 1, startMs: broken.reps[0].startMs, endMs: broken.reps[0].endMs, durationMs: NaN,
    minFlexionDeg: Infinity, maxFlexionDeg: null, romDeg: undefined }];
  const p = buildWorkoutSetPayload({ summary: broken, completedReps: reps, endedAt: FIXED_ENDED_AT });
  assert.equal(p.reps[0].formCoverage, null);
  assert.equal(p.reps[0].minFlexionDeg, null);
  assert.equal(p.reps[0].maxFlexionDeg, null);
  assert.equal(p.reps[0].romDeg, null);
  assert.equal(p.reps[0].durationMs, p.reps[0].endMs - p.reps[0].startMs, 'durationMs falls back to endMs - startMs');
  assert.equal(p.formEvents[0].peak, null);
  assert.equal(p.formEvents[0].endMs, null);
  // A rep missing from completedReps keeps nulls for measurements.
  const q = buildWorkoutSetPayload({ summary: broken, completedReps: [], endedAt: FIXED_ENDED_AT });
  assert.equal(q.reps[1].romDeg, null);
  assert.ok(!JSON.stringify(q).includes('NaN'));
});

test('input validation: summary, setId and setIndex are required', () => {
  const { summary } = realSetPayload({ mode: 'review' });
  assert.throws(() => buildWorkoutSetPayload({}), /summary/);
  assert.throws(() => buildWorkoutSetPayload({ summary: { ...summary, setId: null } }), /setId/);
  assert.throws(() => buildWorkoutSetPayload({ summary: { ...summary, setIndex: null } }), /setIndex/);
  assert.throws(() => buildWorkoutSetPayload({ summary: { ...summary, setIndex: 0 } }), /setIndex/);
});

test('JSON round trip (localStorage) yields a byte-identical body, so retries hash identically', () => {
  const { payload } = realSetPayload({ mode: 'review' });
  const once = JSON.stringify(payload);
  assert.equal(JSON.stringify(JSON.parse(once)), once);
});

test('no frame data: the payload holds no landmarks, frames or per-frame arrays', () => {
  const { payload } = realSetPayload({ mode: 'review' });
  const text = JSON.stringify(payload);
  for (const word of ['landmark', 'worldLandmarks', 'frames', 'imageData', 'visibility', 'keypoints']) assert.ok(!text.includes(word), word);
  assert.ok(text.length < 512 * 1024);
});

test('the checked-in backend fixture still matches the builder output shape', () => {
  for (const [name, mode] of [['validatedOnly', 'validated-only'], ['review', 'review']]) {
    const fresh = realSetPayload({ mode }).payload, stored = backendFixture[name];
    assert.deepEqual(Object.keys(stored).sort(), Object.keys(fresh).sort(), name);
    assert.deepEqual(Object.keys(stored.summary).sort(), Object.keys(fresh.summary).sort(), `${name} summary keys (regenerate with --write)`);
    assert.equal(stored.summary.completedReps, fresh.summary.completedReps);
    assert.equal(stored.summary.analyzedReps, fresh.summary.analyzedReps);
    assert.deepEqual(stored.summary.units, fresh.summary.units);
  }
});

test('finished before any tracked frame: side, view and featureVersion are null (server rejects with 422)', () => {
  const { payload } = realSetPayload({ noFrames: true });
  assert.equal(payload.summary.side, null);
  assert.equal(payload.summary.view, null);
  assert.equal(payload.summary.featureVersion, null);
  assert.equal(payload.reps.length, 0);
});

// --- Review fix M2 (checkSavable), added by s5-frontend at the lead's request ---
test('M2 checkSavable: a tracked set is savable; a set finished before tracking is not', () => {
  const { summary } = realSetPayload({ mode: 'review' });
  assert.deepEqual(checkSavable(summary), { ok: true, reason: null, message: null });
  const untracked = checkSavable(realSetPayload({ noFrames: true }).summary);
  assert.equal(untracked.ok, false);
  assert.equal(untracked.message, NOT_SAVABLE_MESSAGE);
  assert.equal(NOT_SAVABLE_MESSAGE, 'Not enough tracking to save this set.');
  for (const [key, reason] of [['setId', 'no-set-id'], ['side', 'no-side'], ['view', 'no-view'], ['featureVersion', 'no-feature-version'],
    ['rulesVersion', 'no-rules-version'], ['analyzerVersion', 'no-analyzer-version']]) {
    assert.equal(checkSavable({ ...summary, [key]: null }).reason, reason, key);
  }
  assert.equal(checkSavable(null).ok, false);
});

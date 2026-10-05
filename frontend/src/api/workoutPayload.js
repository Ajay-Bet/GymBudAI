/**
 * Build the Sprint 5 set payload (WorkoutSetIn) from a Sprint 4 `set-summary-1.0.0` summary and
 * analyzerSession.completedReps. Pure; no React, no clock unless `endedAt` is omitted.
 *
 * - `summary` is sent without `cueLog` (the cue log stays on the device).
 * - `endedAt` is the wall-clock time of Finish set; `startedAt` is derived as
 *   endedAt − (summary.endedMs − summary.startedMs), or equals endedAt when that span is unknown.
 * - Rep measurements come from completedReps (matched by id); analysis flags from summary.reps.
 * - Each episode becomes a form event; `repClientIds` are the reps whose `episodeIds` contain it.
 * - Missing numbers stay null, never 0.
 */

const num = (value) => (Number.isFinite(value) ? value : null);

function toDate(endedAt) {
  if (endedAt === undefined || endedAt === null) return new Date();
  const date = endedAt instanceof Date ? new Date(endedAt.getTime()) : new Date(endedAt);
  if (Number.isNaN(date.getTime())) throw new Error('buildWorkoutSetPayload: endedAt is not a valid time.');
  return date;
}

export const NOT_SAVABLE_MESSAGE = 'Not enough tracking to save this set.';

const SAVABLE_FIELDS = [
  ['setId', 'no-set-id'], ['side', 'no-side'], ['view', 'no-view'], ['featureVersion', 'no-feature-version'],
  ['rulesVersion', 'no-rules-version'], ['analyzerVersion', 'no-analyzer-version'],
];

/**
 * Whether a summary carries what the server requires to store it. A set finished before any tracked
 * frame has null side/view/versions and would be rejected with 422, so the caller skips enqueueing it
 * and shows NOT_SAVABLE_MESSAGE.
 * @returns {{ok: boolean, reason: string|null, message: string|null}}
 */
export function checkSavable(summary) {
  if (!summary || typeof summary !== 'object') return { ok: false, reason: 'no-summary', message: NOT_SAVABLE_MESSAGE };
  for (const [key, reason] of SAVABLE_FIELDS) {
    const value = summary[key];
    if (typeof value !== 'string' || !value) return { ok: false, reason, message: NOT_SAVABLE_MESSAGE };
  }
  if (!Number.isInteger(summary.setIndex) || summary.setIndex < 1) return { ok: false, reason: 'no-set-index', message: NOT_SAVABLE_MESSAGE };
  return { ok: true, reason: null, message: null };
}

/**
 * @param {Object} input
 * @param {Object} input.summary buildSetSummary() result (set-summary-1.0.0) with setId and setIndex.
 * @param {Object[]} [input.completedReps] analyzerSession.completedReps (curl rep records).
 * @param {Date|string|number} [input.endedAt] Wall-clock time the set was finished; default now.
 */
export function buildWorkoutSetPayload({ summary, completedReps = [], endedAt } = {}) {
  if (!summary || typeof summary !== 'object') throw new Error('buildWorkoutSetPayload: summary is required.');
  if (typeof summary.setId !== 'string' || !summary.setId) throw new Error('buildWorkoutSetPayload: summary.setId is required.');
  if (!Number.isInteger(summary.setIndex) || summary.setIndex < 1) throw new Error('buildWorkoutSetPayload: summary.setIndex must be a positive integer.');

  const end = toDate(endedAt);
  const startedMs = num(summary.startedMs), endedMs = num(summary.endedMs);
  const spanMs = startedMs !== null && endedMs !== null && endedMs >= startedMs ? endedMs - startedMs : 0;
  const start = new Date(end.getTime() - spanMs);

  const { cueLog: _cueLog, ...rest } = summary;
  const storedSummary = JSON.parse(JSON.stringify(rest));

  const repById = new Map((completedReps ?? []).filter((rep) => rep && rep.id).map((rep) => [rep.id, rep]));
  const summaryReps = Array.isArray(summary.reps) ? summary.reps : [];

  const reps = summaryReps.map((rep) => {
    const source = repById.get(rep.id) ?? {};
    const startMs = num(rep.startMs) ?? num(source.startMs);
    const endMs = num(rep.endMs) ?? num(source.endMs);
    const durationMs = num(source.durationMs) ?? (startMs !== null && endMs !== null ? endMs - startMs : null);
    return {
      clientRepId: rep.id,
      repIndex: num(rep.index) ?? num(source.index),
      startMs,
      endMs,
      durationMs,
      minFlexionDeg: num(source.minFlexionDeg),
      maxFlexionDeg: num(source.maxFlexionDeg),
      romDeg: num(source.romDeg),
      formCoverage: num(rep.formCoverage),
      analyzed: rep.analyzed === true,
      issueBearing: rep.issueBearing === true,
      issueTypes: Array.isArray(rep.issueTypes) ? [...rep.issueTypes] : [],
    };
  });

  const formEvents = (Array.isArray(summary.episodes) ? summary.episodes : []).map((episode) => ({
    clientEventId: episode.id,
    issueType: episode.type,
    startMs: num(episode.startMs),
    endMs: num(episode.endMs),
    peak: num(episode.peak),
    peakUnit: typeof episode.unit === 'string' ? episode.unit : null,
    assessed: episode.assessed === true,
    rulesVersion: episode.rulesVersion ?? summary.rulesVersion ?? null,
    repClientIds: summaryReps.filter((rep) => (rep.episodeIds ?? []).includes(episode.id)).map((rep) => rep.id),
  }));

  return {
    clientSetId: summary.setId,
    setIndex: summary.setIndex,
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    summary: storedSummary,
    reps,
    formEvents,
  };
}

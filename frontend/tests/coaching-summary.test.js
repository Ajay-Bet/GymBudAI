// Sprint 4 independent validation of the set summary (frontend/src/exercises/setSummary.js) against
// the "Agreed coaching contract" in docs/sprints/sprint-4-STATUS.md (GB 404). Inputs are hand-built
// SYNTHETIC sessions with known denominators plus one SYNTHETIC end-to-end pipeline run. They prove
// the arithmetic and definitions only; no reviewed recording is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetSummary } from '../src/exercises/setSummary.js';
import { createCurlAnalyzer, CURL_CONFIG } from '../src/exercises/curl.js';
import { createCurlIssueTracker, CURL_RULES_CONFIG } from '../src/exercises/curlRules.js';
import { curlsWithIssues, CONTRACT } from './fixtures/coaching-fixtures.js';

const ALL = ['torso-swing', 'upper-arm-drift', 'incomplete-rom'];

// SYNTHETIC hand-built analyzer session: reps at [1000,3000], [4000,6000], [7000,9000]; one partial.
function analyzerSession({ reps = 3 } = {}) {
  const completedReps = Array.from({ length: reps }, (_, i) => ({ id: `curl-uid-a-${i + 1}`, index: i + 1, status: 'completed', side: 'left', view: 'side',
    startMs: 1000 + 3000 * i, endMs: 3000 + 3000 * i, durationMs: 2000, candidateIssues: [], configVersion: 'curl-1.1.0', featureVersion: '1.1.0' }));
  return { sessionId: 'uid-a', exerciseId: 'dumbbell-curl', configVersion: 'curl-1.1.0', featureVersion: '1.1.0', side: 'left', view: 'side', completedReps,
    interruptedAttempts: [{ id: 'curl-uid-a-9', status: 'interrupted', reason: 'partial', startMs: 9500, endMs: 10500, romDeg: 50 },
      { id: 'curl-uid-a-10', status: 'interrupted', reason: 'tracking-loss', startMs: 11000, endMs: 11500, romDeg: null }] };
}
let n = 0;
const ep = (type, startMs, endMs, extra = {}) => ({ id: `issue-uid-b-${++n}`, type, startMs, endMs, peak: 15, unit: 'deg', endReason: 'resolved',
  attemptIds: [], rulesVersion: 'curl-rules-1.0.0', analyzerVersion: 'curl-1.1.0', enabled: false, validation: 'unvalidated', ...extra });
function issueSession({ episodes = [], intervals = [{ startMs: 500, endMs: 12000 }] } = {}) {
  return { sessionId: 'uid-b', rulesVersion: 'curl-rules-1.0.0', episodes, assessableIntervals: intervals, startedMs: 500, lastMs: 12000, endedMs: 12000 };
}
const build = (overrides) => buildSetSummary({ analyzerSession: analyzerSession(), issueSession: issueSession(), cueLog: [], mode: 'review',
  enabledRuleTypes: [], startedMs: 500, endedMs: 12000, feedbackVersion: 'feedback-1.0.0', ...overrides });

test('schema, versions, units and null-not-zero for a no-issue set (review mode)', () => {
  const s = build();
  assert.equal(s.schemaVersion, CONTRACT.summarySchema);
  for (const key of ['sessionId', 'exerciseId', 'side', 'view', 'analyzerVersion', 'featureVersion', 'rulesVersion', 'feedbackVersion', 'mode', 'assessedRuleTypes',
    'completedReps', 'interruptedAttempts', 'analyzedReps', 'issueBearingReps', 'noIssueReps', 'noIssueFraction', 'trackingCoverage', 'episodes', 'episodeCountsByType',
    'reps', 'cueLog', 'units']) assert.ok(key in s, `summary.${key} missing`);
  assert.equal(s.analyzerVersion, 'curl-1.1.0');
  assert.equal(s.rulesVersion, 'curl-rules-1.0.0');
  assert.equal(s.feedbackVersion, 'feedback-1.0.0');
  assert.deepEqual([...s.assessedRuleTypes].sort(), [...ALL].sort());
  assert.equal(s.completedReps, 3);
  assert.equal(s.interruptedAttempts.total, 2);
  assert.equal(s.interruptedAttempts.byReason.partial, 1);
  assert.equal(s.interruptedAttempts.byReason['tracking-loss'], 1);
  assert.equal(s.analyzedReps, 3);
  assert.equal(s.issueBearingReps, 0);
  assert.equal(s.noIssueReps, 3);
  assert.equal(s.noIssueFraction, 1);
  assert.equal(s.noIssueFractionLabel, 'detector summary');
  assert.equal(s.notAnalyzedReason, null);
  assert.equal(typeof s.units, 'object');
  assert.ok(Object.keys(s.units).length > 0);
});

test('validated-only with no enabled rule: analyzedReps 0, notAnalyzedReason no-validated-rules, fraction null; episodes kept unassessed', () => {
  const s = build({ mode: 'validated-only', enabledRuleTypes: [], issueSession: issueSession({ episodes: [ep('torso-swing', 1500, 2500)] }) });
  assert.deepEqual(s.assessedRuleTypes, []);
  assert.equal(s.completedReps, 3);
  assert.equal(s.analyzedReps, 0);
  assert.equal(s.notAnalyzedReason, 'no-validated-rules');
  assert.equal(s.issueBearingReps, 0);
  assert.equal(s.noIssueFraction, null);
  assert.equal(s.episodes.length, 1);
  assert.equal(s.episodes[0].assessed, false);
  assert.ok(!s.episodeCountsByType['torso-swing'], 'unassessed episodes must not be counted');
  // Default enabledRuleTypes comes from the config: all rules disabled -> same result.
  const d = buildSetSummary({ analyzerSession: analyzerSession(), issueSession: issueSession(), startedMs: 500, endedMs: 12000 });
  assert.equal(d.mode, 'validated-only');
  assert.equal(d.analyzedReps, 0);
  assert.equal(d.notAnalyzedReason, 'no-validated-rules');
});

test('validated-only with one enabled rule: only that rule marks reps', () => {
  const s = build({ mode: 'validated-only', enabledRuleTypes: ['torso-swing'],
    issueSession: issueSession({ episodes: [ep('upper-arm-drift', 1500, 2500), ep('torso-swing', 4500, 5000)] }) });
  assert.deepEqual(s.assessedRuleTypes, ['torso-swing']);
  assert.equal(s.analyzedReps, 3);
  assert.equal(s.issueBearingReps, 1);
  assert.deepEqual(s.reps.map((r) => r.issueTypes), [[], ['torso-swing'], []]);
  assert.equal(s.noIssueFraction, 2 / 3);
});

test('unavailable tracking: no assessable time -> analyzedReps 0, fraction null, coverage 0 of the session', () => {
  const s = build({ issueSession: issueSession({ intervals: [] }) });
  assert.equal(s.completedReps, 3);
  assert.equal(s.analyzedReps, 0);
  assert.equal(s.noIssueFraction, null);
  assert.equal(s.trackingCoverage.assessableMs, 0);
  assert.equal(s.trackingCoverage.sessionMs, 11500);
  assert.equal(s.trackingCoverage.fraction, 0);
  for (const r of s.reps) { assert.equal(r.analyzed, false); assert.equal(r.formCoverage, 0); }
  // Without an issue session at all, coverage is unknown (null), never 0.
  const u = build({ issueSession: null });
  assert.equal(u.trackingCoverage.assessableMs, null);
  assert.equal(u.trackingCoverage.fraction, null);
  for (const r of u.reps) assert.equal(r.formCoverage, null);
});

test('coverage denominators: per-rep form coverage threshold 0.8 and session coverage over [startedMs, endedMs]', () => {
  // Rep 1 [1000,3000] covered 1000..2700 (0.85) -> analyzed; rep 2 [4000,6000] covered 4000..5400 (0.7) -> not;
  // rep 3 [7000,9000] fully covered.
  const intervals = [{ startMs: 1000, endMs: 2700 }, { startMs: 4000, endMs: 5400 }, { startMs: 6800, endMs: 9200 }];
  const s = build({ issueSession: issueSession({ intervals }) });
  assert.deepEqual(s.reps.map((r) => r.analyzed), [true, false, true]);
  assert.ok(Math.abs(s.reps[0].formCoverage - 0.85) < 1e-9);
  assert.ok(Math.abs(s.reps[1].formCoverage - 0.7) < 1e-9);
  assert.equal(s.reps[2].formCoverage, 1);
  assert.equal(s.analyzedReps, 2);
  assert.equal(s.trackingCoverage.assessableMs, 1700 + 1400 + 2400);
  assert.equal(s.trackingCoverage.sessionMs, 11500);
  assert.ok(Math.abs(s.trackingCoverage.fraction - 5500 / 11500) < 1e-9);
  // An issue on the unanalyzed rep 2 does not make it issue-bearing.
  const t = build({ issueSession: issueSession({ intervals, episodes: [ep('torso-swing', 4200, 4800)] }) });
  assert.equal(t.issueBearingReps, 0);
  assert.equal(t.noIssueFraction, 1);
});

test('overlapping issue types on one rep count the rep once; counts by type count episodes', () => {
  const episodes = [ep('torso-swing', 1200, 1700), ep('upper-arm-drift', 1300, 2800), ep('torso-swing', 2000, 2600)];
  const s = build({ issueSession: issueSession({ episodes }) });
  assert.equal(s.analyzedReps, 3);
  assert.equal(s.issueBearingReps, 1, 'one rep with three episodes of two types is one issue-bearing rep');
  assert.equal(s.noIssueReps, 2);
  assert.deepEqual([...s.reps[0].issueTypes].sort(), ['torso-swing', 'upper-arm-drift']);
  assert.equal(s.reps[0].episodeIds.length, 3);
  assert.equal(s.episodeCountsByType['torso-swing'], 2);
  assert.equal(s.episodeCountsByType['upper-arm-drift'], 1);
});

test('one continuous episode across two reps is one event and marks both reps', () => {
  const s = build({ issueSession: issueSession({ episodes: [ep('torso-swing', 2500, 4500)] }) });
  assert.equal(s.episodes.length, 1);
  assert.equal(s.episodeCountsByType['torso-swing'], 1);
  assert.equal(s.issueBearingReps, 2);
  assert.deepEqual(s.reps.map((r) => r.episodeIds.length), [1, 1, 0]);
  // An episode only touching a rep boundary (zero-length overlap) does not mark it.
  const b = build({ issueSession: issueSession({ episodes: [ep('torso-swing', 3000, 3900)] }) });
  assert.equal(b.issueBearingReps, 0);
  // An open episode (endMs null) extends to the session end.
  const o = build({ issueSession: issueSession({ episodes: [ep('torso-swing', 5500, null, { endReason: null })] }) });
  assert.equal(o.issueBearingReps, 2);
});

test('incomplete-rom episodes belong to interrupted attempts, never to completed reps', () => {
  const s = build({ issueSession: issueSession({ episodes: [ep('incomplete-rom', 10500, 10500, { endReason: 'evaluated-at-attempt-end', attemptIds: ['curl-uid-a-9'] })] }) });
  assert.equal(s.issueBearingReps, 0);
  assert.equal(s.episodeCountsByType['incomplete-rom'], 1);
});

test('rep ids and episode ids in the summary are unique; cueLog copied', () => {
  const cueLog = [{ cueId: 'cue-1', issueType: 'torso-swing', episodeId: 'x', validation: 'unvalidated', mode: 'review', shownMs: 1, spokenMs: null, suppressed: 'muted' }];
  const episodes = [ep('torso-swing', 1200, 1700), ep('upper-arm-drift', 1300, 2800)];
  const s = build({ issueSession: issueSession({ episodes }), cueLog });
  assert.equal(new Set(s.reps.map((r) => r.id)).size, s.reps.length);
  assert.equal(new Set(s.episodes.map((e) => e.id)).size, s.episodes.length);
  assert.deepEqual(s.cueLog, cueLog);
  cueLog[0].suppressed = 'changed';
  assert.equal(s.cueLog[0].suppressed, 'muted', 'summary must hold a copy');
  assert.throws(() => build({ mode: 'coach-everything' }));
});

test('synthetic end-to-end: analyzer -> tracker -> summary on curls with torso swing on reps 1 and 3', () => {
  const frames = curlsWithIssues({ seed: 91, reps: [{ torso: 20, durationMs: 3000 }, {}, { torso: 20, durationMs: 3000 }, {}] });
  const analyzer = createCurlAnalyzer(), tracker = createCurlIssueTracker();
  for (const f of frames) tracker.update(f, analyzer.update(f));
  tracker.end(frames.at(-1).timestampMs);
  const review = buildSetSummary({ analyzerSession: analyzer.getSession(), issueSession: tracker.getSession(), mode: 'review', feedbackVersion: 'feedback-1.0.0' });
  assert.equal(review.completedReps, 4);
  assert.equal(review.analyzedReps, 4);
  assert.equal(review.issueBearingReps, 2);
  assert.equal(review.noIssueFraction, 0.5);
  assert.equal(review.analyzerVersion, CURL_CONFIG.version);
  assert.equal(review.rulesVersion, CURL_RULES_CONFIG.version);
  assert.ok(review.trackingCoverage.fraction > 0.95);
  const def = buildSetSummary({ analyzerSession: analyzer.getSession(), issueSession: tracker.getSession() });
  assert.equal(def.analyzedReps, 0);
  assert.equal(def.notAnalyzedReason, 'no-validated-rules');
  assert.equal(def.completedReps, 4);
  assert.equal(def.episodes.length, review.episodes.length);
});

test('(D5) notAnalyzedReason precedence: no-validated-rules > no-completed-reps > low-coverage > null', () => {
  const noReps = { ...analyzerSession({ reps: 0 }) };
  // No assessed rule wins even with no reps and no coverage.
  assert.equal(build({ mode: 'validated-only', enabledRuleTypes: [], analyzerSession: noReps, issueSession: issueSession({ intervals: [] }) }).notAnalyzedReason, 'no-validated-rules');
  // Rules assessed, no completed reps.
  const a = build({ analyzerSession: noReps, issueSession: issueSession({ intervals: [] }) });
  assert.equal(a.notAnalyzedReason, 'no-completed-reps');
  assert.equal(a.noIssueFraction, null);
  // Reps exist but none reaches 0.8 coverage.
  const b = build({ issueSession: issueSession({ intervals: [{ startMs: 1000, endMs: 1500 }] }) });
  assert.equal(b.analyzedReps, 0);
  assert.equal(b.notAnalyzedReason, 'low-coverage');
  // Without an issue session coverage is unknown: still not analyzed, reported as low-coverage.
  assert.equal(build({ issueSession: null }).notAnalyzedReason, 'low-coverage');
  // At least one analyzed rep: null.
  assert.equal(build().notAnalyzedReason, null);
});

test('(D5) unassessedEpisodeCountsByType is filled in validated-only mode and {} in review mode', () => {
  const episodes = [ep('torso-swing', 1200, 1700), ep('upper-arm-drift', 1300, 2800), ep('torso-swing', 4200, 4400)];
  const v = build({ mode: 'validated-only', enabledRuleTypes: [], issueSession: issueSession({ episodes }) });
  assert.deepEqual(v.episodeCountsByType, {});
  assert.equal(v.unassessedEpisodeCountsByType['torso-swing'], 2);
  assert.equal(v.unassessedEpisodeCountsByType['upper-arm-drift'], 1);
  assert.equal(v.unassessedEpisodeCountsByType['incomplete-rom'], 0);
  const one = build({ mode: 'validated-only', enabledRuleTypes: ['torso-swing'], issueSession: issueSession({ episodes }) });
  assert.deepEqual(one.episodeCountsByType, { 'torso-swing': 2 });
  assert.equal(one.unassessedEpisodeCountsByType['upper-arm-drift'], 1);
  assert.ok(!('torso-swing' in one.unassessedEpisodeCountsByType));
  const r = build({ mode: 'review', issueSession: issueSession({ episodes }) });
  assert.deepEqual(r.unassessedEpisodeCountsByType, {});
  assert.equal(r.episodeCountsByType['torso-swing'], 2);
  // Every episode is counted exactly once across the two maps.
  for (const s of [v, one, r]) {
    const total = [s.episodeCountsByType, s.unassessedEpisodeCountsByType].flatMap(Object.values).reduce((x, y) => x + y, 0);
    assert.equal(total, s.episodes.length);
  }
});

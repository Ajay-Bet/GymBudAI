import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, modelChecksum, loadExperimentalModel, predictRep } from '../src/ml/model.js';
import { FEATURE_ORDER, REP_FEATURE_SCHEMA, aggregateRepFeatures } from '../src/ml/repFeatures.js';
import { createModelSession } from '../src/ml/modelSession.js';
import { createFeedbackScheduler } from '../src/feedback/scheduler.js';
async function fixture(changes = {}) {
  const artifact = { schemaVersion: 'gymbud-logistic-1', modelVersion: 'test-only', datasetVersion: 'test-only', sourceRevision: 'test', missingDataHandling: 'abstain', sourceManifest: { purpose: 'synthetic-test' }, dependencies: { runtime: 'test' }, trained: true, experimental: true,
    evaluation: { status: 'experimental', splitStrategy: 'recording-group' }, featureSchemaVersion: REP_FEATURE_SCHEMA.version, featureOrder: [...FEATURE_ORDER], units: [...REP_FEATURE_SCHEMA.units],
    preprocessing: { mean: FEATURE_ORDER.map(() => 0), scale: FEATURE_ORDER.map(() => 1) },
    labels: [{ name: 'swinging', issueType: null, coefficients: FEATURE_ORDER.map(() => 0), intercept: 1, threshold: 0.5 }, { name: 'incomplete_rom', issueType: 'incomplete-rom', coefficients: FEATURE_ORDER.map(() => 0), intercept: -1, threshold: 0.5 }],
    supportedViews: ['side'], knownLimitations: ['Synthetic fixture for software tests only.'], ...changes };
  artifact.checksumSha256 = await modelChecksum(artifact); return artifact;
}
const frame = (timestampMs, changes = {}) => ({ timestampMs, view: 'side', ready: true, trackingState: 'active',
  validity: { elbowFlexionDeg: true, torsoDeviationDeg: true, upperArmDriftDeg: true, elbowAngularVelocityDegS: true },
  values: { elbowFlexionDeg: timestampMs / 10, torsoDeviationDeg: 1, upperArmDriftDeg: 2, elbowAngularVelocityDegS: 10 }, ...changes });
const output = { assessable: true, active: [], events: [] };
const repEvent = (id, startMs, endMs) => ({ type: 'rep-completed', id, rep: { startMs, endMs } });
test('canonical checksum detects tampering', async () => {
  assert.equal(canonicalJson({ b: 1, a: [2] }), '{"a":[2],"b":1}');
  const artifact = await fixture(); await loadExperimentalModel(artifact); artifact.labels[0].intercept = -1;
  await assert.rejects(loadExperimentalModel(artifact), /checksum/);
});
test('blocked/untrained, schema, view, evaluation, scaling, mapping reject', async () => {
  for (const change of [{ trained: false }, { evaluation: { status: 'blocked' } }, { supportedViews: ['front'] }, { featureOrder: [...FEATURE_ORDER].reverse() },
    { preprocessing: { mean: FEATURE_ORDER.map(() => 0), scale: FEATURE_ORDER.map(() => 0) } },
    { labels: [{ name: 'swinging', issueType: 'torso-swing', coefficients: FEATURE_ORDER.map(() => 0), intercept: 0, threshold: 0.5 }] }]) await assert.rejects(loadExperimentalModel(await fixture(change)));
});
test('per-label parity fixture, missing features and views abstain', async () => {
  const model = await loadExperimentalModel(await fixture());
  const features = aggregateRepFeatures([frame(0), frame(100), frame(200)], { startMs: 0, endMs: 200 });
  const prediction = predictRep(model, features); assert.equal(prediction.assessed, true);
  assert.ok(Math.abs(prediction.predictions[0].score - 0.7310585786300049) < 1e-12);
  assert.equal(prediction.predictions[1].detected, false);
  assert.equal(predictRep(model, features, { view: 'front' }).assessed, false);
  features.vector[4] = null; assert.equal(predictRep(model, features).assessed, false);
});
test('fullrep model emits only at rep completion, deduplicates, and uses end cue scheduler', async () => {
  const session = createModelSession(); session.setModel(await loadExperimentalModel(await fixture())); session.setMode('experimental-model');
  for (const t of [0, 100]) assert.equal(session.update(frame(t), { events: [] }, output).events.length, 0);
  const ended = session.update(frame(200), { events: [repEvent('r1', 0, 200)] }, output); assert.equal(ended.events[0].episode.type, 'swinging');
  const scheduler = createFeedbackScheduler({ config: { priority: ['swinging', 'incomplete-rom'] }, mode: 'review' });
  const cue = scheduler.update({ timestampMs: 200, issueOutput: ended }).primaryCue;
  assert.equal(cue.label, 'experimental rep-end model prediction'); assert.match(cue.speechText, /Experimental prediction/);
  assert.equal(session.update(frame(300), { events: [repEvent('r1', 0, 200)] }, output).events.length, 0);
  assert.equal(session.getState().summary.score, null);
});
test('tracking gate denies clean credit and incomplete attempts cannot earn score', async () => {
  const session = createModelSession(); session.setModel(await loadExperimentalModel(await fixture())); session.setMode('experimental-model');
  session.update(frame(0), { events: [] }, output);
  session.update(frame(100), { events: [repEvent('blocked', 0, 100)] }, { ...output, assessable: false });
  assert.equal(session.getState().summary.completed, 1); assert.equal(session.getState().summary.assessed, 0);
  for (let index = 1; index <= 3; index++) for (const t of [0, 100, 200]) session.update(frame(index * 1000 + t), { events: t === 200 ? [repEvent(`r${index}`, index * 1000, index * 1000 + 200)] : [] }, output);
  assert.equal(session.getState().summary.score, null);
  session.reset(); assert.equal(session.getState().summary.completed, 0);
});
test('inference failure filters unvalidated fallback rules', async () => {
  const session = createModelSession(); session.setModel(await loadExperimentalModel(await fixture())); session.setMode('experimental-model');
  const rules = { ...output, active: [{ type: 'torso-swing', enabled: false }, { type: 'upper-arm-drift', enabled: true }] };
  const result = session.update(frame(0), { events: [repEvent('invalid', 0, 0)] }, rules);
  assert.equal(result.active.length, 1); assert.equal(result.active[0].enabled, true); assert.equal(session.getState().status, 'fallback');
  session.setMode('rules-only'); assert.equal(session.update(frame(100), { events: [] }, rules), rules);
});

test('shared Python export checksum and nonzero normalized coefficient parity', async () => {
  const { readFile } = await import('node:fs/promises');
  const shared = JSON.parse(await readFile(new URL('../../ml/tests/fixtures/parity.json', import.meta.url), 'utf8'));
  const model = await loadExperimentalModel(shared.model);
  for (const fixture of shared.fixtures) {
    const features = { schemaVersion: REP_FEATURE_SCHEMA.version, featureOrder: [...FEATURE_ORDER], vector: fixture.features,
      values: Object.fromEntries(FEATURE_ORDER.map((key, index) => [key, fixture.features[index]])) };
    const result = predictRep(model, features);
    if (features.values.formCoverage < 0.8) { assert.equal(result.assessed, false); continue; }
    for (const prediction of result.predictions) assert.ok(Math.abs(prediction.score - fixture.scores[prediction.label]) < 1e-12);
  }
});

test('experimental score counts distinct issue-bearing complete reps within supported label scope', async () => {
  const session = createModelSession(); session.setModel(await loadExperimentalModel(await fixture())); session.setMode('experimental-model');
  for (let index = 1; index <= 3; index++) for (const t of [0, 100, 200]) session.update(frame(index * 1000 + t), { events: t === 200 ? [repEvent(`r${index}`, index * 1000, index * 1000 + 200)] : [] }, output);
  assert.equal(session.getState().summary.score, 0);
  assert.equal(session.getState().summary.issueBearing, 3);
  assert.deepEqual(session.getState().summary.labelScope, ['swinging', 'incomplete_rom']);
  const ended = session.update(frame(4000), { events: [repEvent('bad', 4000, 4000)] }, output);
  assert.equal(ended.assessable, true); assert.equal(session.getState().summary.score, null);
  session.update(frame(5000), { events: [repEvent('afterfailure', 4800, 5000)] }, output);
  assert.equal(session.getState().summary.completed, 5);
});
test('partial completion model produces only ROM end cues and excludes partials from score', async () => {
  const artifact = await fixture(); artifact.labels[1].intercept = 2; artifact.checksumSha256 = await modelChecksum(artifact);
  const session = createModelSession(); session.setModel(await loadExperimentalModel(artifact)); session.setMode('experimental-model');
  session.update(frame(0), { events: [] }, output); session.update(frame(100), { events: [] }, output);
  const result = session.update(frame(200), { events: [{ type: 'attempt-interrupted', id: 'partial', attempt: { startMs: 0, endMs: 200, reason: 'partial' } }] }, output);
  assert.equal(result.events.length, 1); assert.equal(result.events[0].episode.type, 'incomplete-rom');
  assert.equal(session.getState().summary.completed, 0); assert.equal(session.getState().summary.score, null);
  session.interrupt();
  const missing = session.update(frame(500), { events: [repEvent('aftergap', 300, 500)] }, output);
  assert.equal(missing.events.length, 0); assert.equal(session.getState().records.at(-1).assessed, false);
});

test('a graced dropout preserves offline/browser completed-window parity', async () => {
  const model = await loadExperimentalModel(await fixture());
  const session = createModelSession(); session.setModel(model); session.setMode('experimental-model');
  const observations = Array.from({ length: 61 }, (_, index) => frame(index * 50));
  observations[54] = frame(2700, { ready: false, dropout: true });
  for (const observation of observations) session.update(observation,
    { events: observation.timestampMs === 3000 ? [repEvent('graced', 0, 3000)] : [] },
    { ...output, assessable: observation.ready });
  const offline = predictRep(model, aggregateRepFeatures(observations, { startMs: 0, endMs: 3000 }));
  assert.equal(offline.assessed, true);
  const browser = session.getState().records.at(-1);
  assert.equal(browser.assessed, true);
  assert.deepEqual(browser.predictions, offline.predictions);
});

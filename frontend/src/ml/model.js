import { REP_FEATURE_SCHEMA, WINDOW_FEATURE_SCHEMA } from './repFeatures.js';

const FEATURE_SCHEMAS = Object.freeze({ 'rep-end-v1': REP_FEATURE_SCHEMA, 'rep-end-v2': WINDOW_FEATURE_SCHEMA });

export const MODEL_SCHEMA = 'gymbud-logistic-1';
const ISSUE_TYPES = ['torso-swing', 'upper-arm-drift', 'incomplete-rom'];
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function modelChecksum(artifact) {
  const payload = { ...artifact }; delete payload.checksumSha256;
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(payload)));
  return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export async function loadExperimentalModel(artifact) {
  const fail = (message) => { throw new Error(message); };
  if (!artifact || artifact.schemaVersion !== MODEL_SCHEMA || artifact.trained !== true || artifact.experimental !== true) fail('A trained experimental model artifact is required.');
  for (const key of ['modelVersion', 'datasetVersion', 'sourceRevision']) if (typeof artifact[key] !== 'string' || !artifact[key]) fail(`Missing ${key}.`);
  if (artifact.missingDataHandling !== 'abstain' || !artifact.sourceManifest || typeof artifact.sourceManifest !== 'object'
    || !artifact.dependencies || typeof artifact.dependencies !== 'object') fail('Source manifest, dependencies and abstention policy are required.');
  if (artifact.evaluation?.status !== 'experimental' || !['participant', 'recording-group'].includes(artifact.evaluation?.splitStrategy)) fail('Unsupported evaluation status or split strategy.');
  const schema = FEATURE_SCHEMAS[artifact.featureSchemaVersion];
  if (!schema || canonicalJson(artifact.featureOrder) !== canonicalJson(schema.featureOrder)
    || canonicalJson(artifact.units) !== canonicalJson(schema.units)) fail('Feature schema, order or units mismatch.');
  if (!Array.isArray(artifact.supportedViews) || artifact.supportedViews.length !== 1 || artifact.supportedViews[0] !== 'side') fail('Only the side camera view is supported.');
  if (!Array.isArray(artifact.knownLimitations) || !artifact.knownLimitations.length) fail('Known limitations must be recorded.');
  const n = artifact.featureOrder.length;
  const numeric = (xs) => Array.isArray(xs) && xs.length === n && xs.every(Number.isFinite);
  if (!numeric(artifact.preprocessing?.mean) || !numeric(artifact.preprocessing?.scale) || artifact.preprocessing.scale.some((x) => x <= 0)) fail('Invalid normalization.');
  if (!Array.isArray(artifact.labels) || !artifact.labels.length || new Set(artifact.labels.map((x) => x.name)).size !== artifact.labels.length) fail('Invalid label heads.');
  for (const head of artifact.labels) {
    if (typeof head.name !== 'string' || !head.name || !numeric(head.coefficients) || !Number.isFinite(head.intercept) || !Number.isFinite(head.threshold) || head.threshold <= 0 || head.threshold >= 1
      || (head.issueType !== null && !ISSUE_TYPES.includes(head.issueType))) fail('Invalid classifier head or label mapping.');
    if (head.name === 'swinging' && head.issueType !== null) fail('Composite swinging cannot be mapped to a specific body-part correction.');
    const expected = { swinging: null, 'torso-swing': 'torso-swing', 'upper-arm-drift': 'upper-arm-drift', incomplete_rom: 'incomplete-rom', 'incomplete-rom': 'incomplete-rom' };
    if (!Object.hasOwn(expected, head.name) || head.issueType !== expected[head.name]) fail('Unsupported label semantics.');
  }
  if (!/^[a-f0-9]{64}$/.test(artifact.checksumSha256 ?? '') || await modelChecksum(artifact) !== artifact.checksumSha256) fail('Model checksum mismatch.');
  return Object.freeze(structuredClone(artifact));
}

const artifactCoverage = (model) => (model.featureSchemaVersion === 'rep-end-v2' ? 'geometryCoverage' : 'formCoverage');

// Scores are logistic outputs, never calibrated correctness probabilities.
export function predictRep(model, features, { view = 'side' } = {}) {
  if (features.schemaVersion !== model.featureSchemaVersion || canonicalJson(features.featureOrder) !== canonicalJson(model.featureOrder)) throw new Error('Inference feature schema mismatch.');
  if (!model.supportedViews.includes(view)) return { assessed: false, reason: 'unsupported-view', predictions: [] };
  if (!Array.isArray(features.vector) || features.vector.length !== model.featureOrder.length || !features.vector.every(Number.isFinite)
    || features.values[artifactCoverage(model)] < 0.8) return { assessed: false, reason: 'missing-or-low-coverage', predictions: [] };
  const normalized = features.vector.map((x, i) => (x - model.preprocessing.mean[i]) / model.preprocessing.scale[i]);
  if (!normalized.every(Number.isFinite)) throw new Error('Non-finite normalized features.');
  const predictions = model.labels.map((head) => {
    const z = head.intercept + head.coefficients.reduce((sum, coefficient, i) => sum + coefficient * normalized[i], 0);
    if (!Number.isFinite(z)) throw new Error('Non-finite model output.');
    const score = z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
    return { label: head.name, issueType: head.issueType, score, threshold: head.threshold, detected: score >= head.threshold };
  });
  return { assessed: true, reason: null, predictions };
}

/** Replay the production tracking, biomechanics, calibration and curl analyzer locally. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTrackingValidator } from '../frontend/src/vision/tracking.js';
import { createBiomechanicsEngine, FEATURE_SCHEMA } from '../frontend/src/biomechanics/engine.js';
import { createCurlAnalyzer, CURL_CONFIG } from '../frontend/src/exercises/curl.js';
import { aggregateRepFeatures, REP_FEATURE_SCHEMA } from '../frontend/src/ml/repFeatures.js';

export function readPoseCache(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const streams = {};
  for (const [name, hash, count] of [['poses', 'posesSha256', 'processedFrames'], ['frames', 'framesSha256', 'decodedFrames']]) {
    const content = fs.readFileSync(path.join(directory, `${name}.jsonl`));
    if (createHash('sha256').update(content).digest('hex') !== manifest[hash]) throw new Error(`Corrupted ${name} cache: ${directory}`);
    streams[name] = content.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    if (streams[name].length !== manifest[count]) throw new Error(`Incomplete ${name} cache: ${directory}`);
  }
  if (streams.poses.some((pose) => pose.recordingId !== manifest.recordingId)) throw new Error(`Recording mismatch: ${directory}`);
  return { manifest, poses: streams.poses };
}

export function replay(poses, { side, view, metadataConfirmed = false } = {}) {
  if (!['left', 'right'].includes(side) || !['side', 'front', 'oblique', 'unknown'].includes(view)) throw new Error('Explicit side and view required');
  const validator = createTrackingValidator({ side });
  const biomechanics = createBiomechanicsEngine({ side, view });
  const analyzer = createCurlAnalyzer();
  const frames = [], events = [];
  let lastAuto = null;
  for (const pose of poses) {
    const tracking = validator.update(pose.landmarks, pose.timestampMs);
    const frame = biomechanics.update(pose, tracking);
    // Identical initiation/retry defaults to CameraView; do not relax orientation/calibration.
    if (frame.calibration.status === 'uncalibrated' && frame.trackingState === 'active'
      && frame.orientation.valid && Number.isFinite(frame.raw?.elbowFlexionDeg) && frame.raw.elbowFlexionDeg <= 40
      && (lastAuto === null || frame.timestampMs - lastAuto >= 1000)) {
      analyzer.interrupt('recalibration', frame.timestampMs);
      biomechanics.calibrate(); lastAuto = frame.timestampMs;
    }
    const analysis = analyzer.update(frame);
    frames.push({ ...frame, frameIndex: pose.frameIndex, recordingId: pose.recordingId });
    for (const event of analysis.events) {
      const attempt = event.rep ?? event.attempt;
      events.push({ ...event, trainingEligible: false, boundaryReviewStatus: 'candidate-unreviewed',
        aggregate: attempt.endMs > attempt.startMs ? aggregateRepFeatures(frames, attempt) : null });
    }
  }
  const session = analyzer.getSession();
  const validTimestamps = frames.map((f) => f.timestampMs).filter(Number.isFinite);
  const startMs = validTimestamps.length ? validTimestamps[0] : null;
  const endMs = validTimestamps.length ? validTimestamps.at(-1) : null;
  const readyObservedMs = frames.slice(1).reduce((sum, f, i) => {
    const before = frames[i], dt = f.timestampMs - before.timestampMs;
    return sum + (f.ready && before.ready && dt > 0 && dt <= 150 ? dt : 0);
  }, 0);
  return { frames, events, report: { side, view, metadataConfirmed, trainingEligible: false,
    measurementEligible: metadataConfirmed && frames.some((f) => f.ready),
    labelStatus: 'Human annotation matching and quality eligibility required separately',
    featureSchema: FEATURE_SCHEMA.version, repFeatureSchema: REP_FEATURE_SCHEMA.version,
    analyzerVersion: CURL_CONFIG.version, sourceFrameCount: frames.length,
    sourceStartMs: startMs, sourceEndMs: endMs, readyObservedMs,
    readyTimeCoverage: endMs > startMs ? readyObservedMs / (endMs - startMs) : null,
    activeFrames: frames.filter((f) => f.trackingState === 'active').length,
    readyFrames: frames.filter((f) => f.ready).length,
    calibrationReadyFrames: frames.filter((f) => f.calibration.status === 'ready').length,
    calibrationBlockers: Object.fromEntries([...new Set(frames.map((f) => f.calibration.blockedReason).filter(Boolean))]
      .map((reason) => [reason, frames.filter((f) => f.calibration.blockedReason === reason).length])),
    completedCandidates: session.completedReps.length, interruptedCandidates: session.interruptedAttempts.length,
    pauseReasons: Object.fromEntries([...new Set(frames.flatMap((f) => f.reasons))].map((reason) => [reason, frames.filter((f) => f.reasons.includes(reason)).length])) } };
}

function main() {
  const args = process.argv.slice(2);
  const arg = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const root = arg('--input', 'ml/outputs/extraction'), output = arg('--output', 'ml/outputs/measurements');
  const side = arg('--side', null), view = arg('--view', null);
  const both = args.includes('--exploratory-both-arms');
  if (!view || (!side && !both)) throw new Error('Supply --view and --side; absent confirmed metadata use --exploratory-both-arms with --view unknown/side as an explicit hypothesis.');
  const reports = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const dir = path.join(root, entry.name), source = path.join(dir, 'poses.jsonl');
    // A completion marker alone is insufficient: both stream hashes/counts must match.
    if (!fs.existsSync(source) || !fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error(`Incomplete extraction: ${dir}`);
    const { poses, manifest } = readPoseCache(dir);
    for (const arm of both ? ['left', 'right'] : [side]) {
      const result = replay(poses, { side: arm, view, metadataConfirmed: args.includes('--metadata-confirmed') && !both });
      const destination = path.join(output, entry.name, arm); fs.mkdirSync(destination, { recursive: true });
      const measured = result.frames.map((f) => JSON.stringify(f)).join('\n')+'\n';
      result.report.extractionManifest = manifest;
      result.report.measuredFramesSha256 = createHash('sha256').update(measured).digest('hex');
      fs.writeFileSync(path.join(destination, 'frames.jsonl'), measured);
      fs.writeFileSync(path.join(destination, 'candidates.json'), JSON.stringify(result.events, null, 2)+'\n');
      fs.writeFileSync(path.join(destination, 'report.json'), JSON.stringify(result.report, null, 2)+'\n');
      reports.push({ recordingId: poses[0]?.recordingId, ...result.report });
    }
  }
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'coverage.json'), JSON.stringify(reports, null, 2)+'\n');
  console.log(JSON.stringify(reports, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

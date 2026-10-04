import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readPoseCache } from '../../ml/measure.mjs';

test('replay rejects corrupted derived streams and mismatched recording provenance', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gymbud-cache-'));
  const hash = (content) => createHash('sha256').update(content).digest('hex');
  try {
    const poses = JSON.stringify({ recordingId: 'clip.mp4', frameIndex: 0, timestampMs: 0 }) + '\n';
    const frames = JSON.stringify({ frameIndex: 0, timestampMs: 0 }) + '\n';
    const manifest = { recordingId: 'clip.mp4', posesSha256: hash(poses), framesSha256: hash(frames), processedFrames: 1, decodedFrames: 1 };
    const save = () => fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(directory, 'poses.jsonl'), poses); fs.writeFileSync(path.join(directory, 'frames.jsonl'), frames); save();
    assert.equal(readPoseCache(directory).poses.length, 1);
    fs.appendFileSync(path.join(directory, 'poses.jsonl'), '{}\n');
    assert.throws(() => readPoseCache(directory), /Corrupted poses/);
    fs.writeFileSync(path.join(directory, 'poses.jsonl'), poses);
    fs.appendFileSync(path.join(directory, 'frames.jsonl'), '{}\n');
    assert.throws(() => readPoseCache(directory), /Corrupted frames/);
    fs.writeFileSync(path.join(directory, 'frames.jsonl'), frames);
    manifest.recordingId = 'other.mp4'; save();
    assert.throws(() => readPoseCache(directory), /Recording mismatch/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

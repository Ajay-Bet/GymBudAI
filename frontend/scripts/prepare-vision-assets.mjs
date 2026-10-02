import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, readdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = path.join(root, 'node_modules/@mediapipe/tasks-vision');
const destination = path.join(root, 'public/vision');
const version = '0.10.32';
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const modelSha256 = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const installed = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
if (installed.version !== version) throw new Error(`Expected MediaPipe ${version}; run npm ci.`);
await mkdir(path.join(destination, 'wasm'), { recursive: true });

// A classic worker must retain importScripts for the MediaPipe WASM loader.
// Adapt the package's CommonJS exports without changing the vendor implementation.
const bundle = await readFile(path.join(packageRoot, 'vision_bundle.cjs'), 'utf8');
await writeFile(path.join(destination, 'vision_bundle.js'),
  `/* Generated from @mediapipe/tasks-vision ${version}, Apache-2.0. */\nvar exports = {};\n${bundle}\nself.vision = exports;\n`);
for (const file of await readdir(path.join(packageRoot, 'wasm'))) {
  if (file.endsWith('.js') || file.endsWith('.wasm')) {
    await copyFile(path.join(packageRoot, 'wasm', file), path.join(destination, 'wasm', file));
  }
}

const modelPath = path.join(destination, 'pose_landmarker_lite.task');
let valid = false;
try { valid = digest(await readFile(modelPath)) === modelSha256; } catch { /* First setup. */ }
if (!valid) {
  console.log('Downloading pinned Pose Landmarker Lite model (about 5.8 MB)…');
  const response = await fetch(modelUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== modelSha256) throw new Error('Model checksum mismatch; refusing unverified assets.');
  await writeFile(`${modelPath}.tmp`, bytes);
  await rename(`${modelPath}.tmp`, modelPath);
}
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify({
  package: '@mediapipe/tasks-vision', version,
  model: 'pose_landmarker_lite/float16/1', modelUrl, modelSha256,
}, null, 2) + '\n');
console.log(`Vision assets ready: MediaPipe ${version}, Pose Landmarker Lite float16/1 (SHA-256 verified).`);

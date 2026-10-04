---
name: mediapipe-workflow
description: |
  How GymBud uses MediaPipe and how to change it safely. Use before touching pose detection, the pose worker, vision assets or model pins, offline landmark extraction in ml/, a MediaPipe version upgrade, or any code that reads landmarks, visibility or world coordinates. Covers where MediaPipe lives in the repo, the pinned versions and model checksum, the browser worker contract, timestamps, coordinate conventions, teardown, browser/offline parity, the upgrade checklist and which checks to run. For general MediaPipe Tasks API facts, use the cv-mediapipe skill.
---
# GymBud MediaPipe workflow

Read the GymBud master instructions (`AGENTS.md`, `docs/project-instructions.md`) first; they win over this skill. Component ownership: `c-vision` owns the browser MediaPipe code and asset script, `c-ml` owns offline extraction (`.claude/agents/c-vision.md`, `c-ml.md`). Route changes through the owner and update its file in the same change.

## Where MediaPipe lives

| Path | Role | Owner |
|---|---|---|
| `frontend/package.json` / lockfile | `@mediapipe/tasks-vision` pinned **exactly** at 0.10.32 | c-frontend-app (pin), c-vision (use) |
| `frontend/scripts/prepare-vision-assets.mjs` | Copies the bundle and WASM to `public/vision/`, downloads Pose Landmarker Lite `float16/1`, verifies SHA-256, writes `manifest.json`. Runs on `predev`/`prebuild`. | c-vision |
| `frontend/src/vision/pose.worker.js` | Classic worker: `FilesetResolver.forVisionTasks` → `PoseLandmarker.createFromOptions` (CPU, `runningMode: 'VIDEO'`, `numPoses: 1`, 0.5 confidences, no masks) → `detectForVideo(bitmap, timestampMs)` → `close()` | c-vision |
| `frontend/src/vision/PoseEngine.js` | Main-thread side: one pending frame, ≤640 px bitmap with original aspect ratio, strictly increasing timestamps, 500 ms stale-result rejection, teardown | c-vision |
| `frontend/src/vision/tracking.js`, `armSelect.js`, `drawPose.js` | Visibility hysteresis and dropout grace, near-arm selection, overlay | c-vision |
| `ml/extract.py`, `ml/requirements-extraction.txt` | Offline Python extraction with `mediapipe==0.10.32`, VIDEO mode, the same model SHA, PyAV presentation timestamps | c-ml |
| `docs/vision-sprint-01.md` | Versions, data boundary, browser acceptance checklist | c-docs / c-vision |

The live loop is browser-only (camera → pose → tracking → smoothing → biomechanics → analyzer → feedback). Frames never leave the device; no per-frame network calls.

## Rules for any MediaPipe change

1. **Pin everything together.** The npm package, the WASM files, the version constant in `prepare-vision-assets.mjs`, the model URL (including `float16/1`) and its SHA-256, and `ml/requirements-extraction.txt` + `extract.py`'s model SHA must agree. Browser/offline parity depends on it.
2. **VIDEO mode, real timestamps.** Use capture (`performance.now()`-based) timestamps in the browser and presentation timestamps (PTS × time_base) offline. Timestamps must strictly increase; skip a frame instead of reusing or inventing one. Never use frame index × nominal fps for analysis data.
3. **Run detection off the UI thread.** `detectForVideo` is synchronous. Keep it in the worker, keep at most one frame in flight, and drop results older than the stale limit rather than queueing.
4. **Coordinates.** Landmarks are normalized to the **unmirrored** source frame. Mirroring is a display transform only and must not swap anatomical left/right. Carry `sourceWidth`/`sourceHeight` and correct aspect ratio before 2D angles. World landmarks are metres (hip-centred) and are used only where their stability has been evaluated.
5. **Confidence is not correctness.** `visibility`/`presence` are model scores. Gate on them with the documented hysteresis; missing landmarks mean "not assessed", never 0 or good form.
6. **Teardown.** Close the landmarker in the worker, wait briefly for `closed`, then terminate. Close every `ImageBitmap`. No leaked workers, tracks or loops after Stop or navigation.
7. **Thresholds are parameters.** Confidence values (0.5 detection/presence/tracking; tracking validator 0.5 / 0.3 / 250 ms) are unvalidated defaults. Changing them is a detector change: it needs reviewed examples and a record in the owning component file.
8. **Legacy API is gone.** `mediapipe.solutions` is not in the 0.10.32 Python wheel. Use `mp.tasks.vision` (as `ml/extract.py` does).
9. **Licensing and assets.** Generated `public/vision/` stays out of Git. Large models or recordings go to Cloud Storage, not the repo.

## Upgrading MediaPipe

1. Read the GitHub release notes between the current and target tags (`https://github.com/google-ai-edge/mediapipe/releases`) and the task page for the target version. Note API, default or model changes.
2. Bump `@mediapipe/tasks-vision` exactly (no caret) and `npm install` to update the lockfile.
3. Update `version` in `prepare-vision-assets.mjs`; if the model changes, update URL and SHA-256 (download, `shasum -a 256`, record both). The script refuses mismatches; keep that.
4. Bump `mediapipe==` in `ml/requirements-extraction.txt` and the model SHA in `ml/extract.py` in the same change.
5. Check the worker still loads as a classic worker (the bundle wrapper relies on `vision_bundle.cjs` and `importScripts`).
6. Run the checks below, then re-run browser/offline parity on a reviewed clip and compare landmark and feature output.
7. Update `docs/vision-sprint-01.md` versions, `c-vision.md` and `c-ml.md` (Contracts, History, Lessons learned), and the cv-mediapipe skill's "verified against" note.

## Checks

From `frontend`: `npm run vision:assets`, `npm test`, `npm run lint`, `npm run build`. Then the browser checklist in `docs/vision-sprint-01.md` (`tests/vision-smoke.html`, `tests/camera-smoke.html` with a real camera or a local video).

From the repo root (ML venv, Python 3.12): `python3 -m unittest ml.tests.test_extract ml.tests.test_frame_times -v`, plus the commands in `ml/README.md` when extraction output matters.

Report only checks you actually ran. Unit tests use synthetic landmarks; they do not validate MediaPipe accuracy on real footage.

## Verifying a MediaPipe claim

Before relying on an API detail, default or field name, check it against the pinned version: the installed typings at `frontend/node_modules/@mediapipe/tasks-vision/vision.d.ts`, the Python sources at `https://github.com/google-ai-edge/mediapipe/tree/v0.10.32/mediapipe/tasks/python`, and the task page at `https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker`. Third-party tutorials often describe the removed `solutions` API.

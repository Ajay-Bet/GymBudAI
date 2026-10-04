---
name: c-vision
description: "Component owner for browser vision: camera capture helpers, pose engine, worker, tracking validation and skeleton drawing."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `frontend/src/vision/PoseEngine.js`, `pose.worker.js`, `tracking.js`, `drawPose.js`
- `frontend/scripts/prepare-vision-assets.mjs` (pinned MediaPipe assets)

## Skills

- Use `.claude/skills/mediapipe-workflow` before changing pose detection, the worker, asset pins or anything that reads landmarks; use `.claude/skills/cv-mediapipe` for MediaPipe Tasks API facts (verified against 0.10.32).

## Contracts to keep

- Engine interface: `createPoseEngine` callbacks; async `start()`, `process(video, timestampMs)`, `close()`. Results carry `timestampMs`, normalized unmirrored `landmarks`, `worldLandmarks`, original `sourceWidth`/`sourceHeight` and `inferenceMs`. Only one frame may be pending. See `docs/vision-sprint-01.md`.
- Tracking validator: `createTrackingValidator({ side, confidence=0.5, releaseConfidence=0.3, stableMs=300, graceMs=250 })` returns `{ state: active|partial|lost, message, side, confidence, dropout }`. Acquire at `confidence`, keep at `releaseConfidence`; dropouts within `graceMs` recover without a new settle wait.

## History

- Sprint 1 built it (`s1-vision`). Sprint 2 added hysteresis and dropout grace to `tracking.js`.

- 2026-10-04: `armSelect.js` `createNearArmDetector` picks the side-view arm nearest the camera from shoulder/elbow/wrist visibility (≥10 frames and 0.1 margin, else the higher after 45). Unvalidated defaults. Test: `arm-select.test.js`.

- 2026-10-04: Added the `cv-mediapipe` (imported, corrected for 0.10.32) and `mediapipe-workflow` skills. Version check: npm `@mediapipe/tasks-vision` 0.10.32 and Python `mediapipe==0.10.32` (ml); same Pose Landmarker Lite float16/1 SHA in both. No code changed.

## Open carryover

- Thresholds (0.5 / 0.3 / 250 ms) are unvalidated; tune on reviewed real footage.
- Sprint 1 carryover: numerical five-minute benchmark, cross-browser evidence.

## Lessons learned

- Single-frame confidence dips (wrist side-on often hovers near 0.5) caused visible flicker; hysteresis plus a short grace window fixed it in a live test (Sprint 2).
- MediaPipe 0.10.32 Python ships only the Tasks API (`mediapipe.solutions` is gone), default `num_hands` is 1, and Python GPU delegate is Ubuntu-only. Many tutorials and imported skills get these wrong; verify against the pinned tag and typings before relying on them (2026-10-04 skill import).
- Hips leaving the bottom of the frame was the most common tracking blocker in the live test; positioning guidance should mention stepping back (Sprint 2).

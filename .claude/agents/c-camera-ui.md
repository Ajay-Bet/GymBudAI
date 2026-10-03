---
name: c-camera-ui
description: "Component owner for the camera UI: CameraView, camera manager, controls, overlay surface, calibration panel and live measurement display."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `frontend/src/components/CameraView.jsx`
- `frontend/src/components/CurlPanel.jsx` (Sprint 3)
- `frontend/src/vision/CameraManager.js`

## Contracts to keep

- Calls `vision`, `biomechanics` and `exercises` through their public functions only; no calculations in React.
- Lifecycle: every stop, mute, stale result, tracking loss and side change runs `clearMeasurements()` and releases camera tracks, loops and workers. `clearMeasurements()` calls `analyzer.interrupt('tracking-loss')` and never resets the analyzer.
- Analyzer: `analyzer.update(frame)` on every FeatureFrame (unthrottled); rep events refresh the panel from `getSession()` immediately; phase/count/pause publish immediately, live numbers on the 100 ms throttle. `analyzer.reset` only on camera start, side change and Reset set. Completed reps survive tracking loss, recalibration and stop.
- Calibration: auto-calibration on by default; starts only from an uncalibrated, active, side-on frame with raw elbow flexion ≤ 40°, at most once per second, via the same `startCalibration` path as the button (interrupt `'recalibration'`). Calibration state is published from `biomechanics.getCalibration()`.
- Wide screens: calibration and curl panels sit to the right of the preview; stack on narrow screens. Candidate issues are labelled "candidate (not coaching yet)".

## History

- Sprint 1 built the camera shell (`s1-camera-ui`). Sprint 2 added calibration, measurements and the developer stability readout (`s2-calibration-ui`). Sprint 3 wired the curl analyzer, added CurlPanel, fixed set-wiping on stop, and added auto-calibration (`s3-workout-ui`).

## Open carryover

- JSX today; TypeScript is the target architecture, with no broad migration yet.
- Auto-calibration gates (40° relaxed arm, 1 s rate limit) are unvalidated defaults.
- Pre-existing console warnings for SVG attribute names (`stroke-linecap`, `class`) in other homepage components.

## Lessons learned

- Users want calibration and readings beside the video, not below it; keep the panel visible while the camera runs (Sprint 2).
- Label units from the engine contract (`frame.units`), never hard-code them; a hard-coded label was wrong once (Sprint 2).
- A user can't press Calibrate and then get into a side-on stance without moving; calibration must start automatically once in position (Ajay's live test, Sprint 3).
- The set must stay on screen when the camera stops; every path that clears measurements must also close the in-progress attempt (Sprint 3).

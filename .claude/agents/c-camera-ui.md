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
- `frontend/src/components/CoachingPanel.jsx`, `frontend/src/components/SetSummaryPanel.jsx` (Sprint 4)
- `frontend/src/vision/CameraManager.js`

## Contracts to keep

- Calls `vision`, `biomechanics` and `exercises` through their public functions only; no calculations in React.
- Lifecycle: every stop, mute, stale result, tracking loss and side change runs `clearMeasurements()` and releases camera tracks, loops and workers. `clearMeasurements()` calls `analyzer.interrupt('tracking-loss')` and never resets the analyzer.
- Analyzer: `analyzer.update(frame)` on every FeatureFrame (unthrottled); rep events refresh the panel from `getSession()` immediately; phase/count/pause publish immediately, live numbers on the 100 ms throttle. `analyzer.reset` only on camera start, side change and Reset set. Completed reps survive tracking loss, recalibration and stop.
- Calibration: auto-calibration on by default; starts only from an uncalibrated, active, side-on frame with raw elbow flexion ≤ 40°, at most once per second, via the same `startCalibration` path as the button (interrupt `'recalibration'`). Calibration state is published from `biomechanics.getCalibration()`.
- Wide screens: calibration and curl panels sit to the right of the preview; stack on narrow screens. Candidate issues are labelled "candidate (detector output, not a correction)".
- Coaching (Sprint 4): per FeatureFrame `analyzer.update` → `tracker.update(frame, output)` → `scheduler.update({ timestampMs, issueOutput })`; feedback state publishes immediately on mode/status/cue/tracking change. `clearMeasurements` passes `analyzer.interrupt` events to `tracker.interrupt('tracking-loss', …)` and cancels speech; calibration uses `'recalibration'`. Session end (Stop, camera ended, pose error, pagehide): close the analyzer attempt, `tracker.end(t, events)`, `scheduler.stop()`, cancel speech, release, then `buildSetSummary`; the summary stays until Start, side change or Reset set. `resetAnalyzer` resets tracker and scheduler too. `speech.prime()` runs synchronously in the Start click. Speech cancelled on page hidden and unmount; each scheduler gets its own speech wrapper whose `onEnd` subscriptions are removed on cleanup. Review mode off by default and locked while the camera runs. Tracking text always from `getTrackingText`.

## History

- Sprint 1 built the camera shell (`s1-camera-ui`). Sprint 2 added calibration, measurements and the developer stability readout (`s2-calibration-ui`). Sprint 3 wired the curl analyzer, added CurlPanel, fixed set-wiping on stop, and added auto-calibration (`s3-workout-ui`). Sprint 4 wired the issue tracker, scheduler and speech and added CoachingPanel and SetSummaryPanel (`s4-coaching-ui`); headless Chrome check with a fake camera only.

## Open carryover

- JSX today; TypeScript is the target architecture, with no broad migration yet.
- Auto-calibration gates (40° relaxed arm, 1 s rate limit) are unvalidated defaults.
- No live test yet with a person, real speech or review-mode cues; no component/DOM tests for the coaching panels.
- Pre-existing console warnings for SVG attribute names (`stroke-linecap`, `class`) in other homepage components.

## Lessons learned

- Users want calibration and readings beside the video, not below it; keep the panel visible while the camera runs (Sprint 2).
- Label units from the engine contract (`frame.units`), never hard-code them; a hard-coded label was wrong once (Sprint 2).
- A user can't press Calibrate and then get into a side-on stance without moving; calibration must start automatically once in position (Ajay's live test, Sprint 3).
- The set must stay on screen when the camera stops; every path that clears measurements must also close the in-progress attempt (Sprint 3).
- An effect that subscribes to a long-lived adapter must unsubscribe on cleanup; StrictMode runs effects twice (Sprint 4).
- On session end, close the analyzer attempt before ending the tracker so the attempt ID reaches episodes without ending them as tracking loss (Sprint 4).


## Sprint 4 extension continuity — 2026-10-03

- Owns integrated `CameraView.jsx`, `CurlPanel.jsx`, `CoachingPanel.jsx`, `SetControls.jsx`, `CalibrationProgress.jsx`, `SetFeedbackPanel.jsx`, `SetSummaryPanel.jsx`. `createCurlSet.update` now owns analyzer/tracker sequencing. Stop/error/ended pauses with retained counts; restart does not reset the set. Finish is explicit/idempotent; next creates fresh counters/IDs. Used-set arm switch requires visible Finish-and-switch choice, and the finished summary retains its original side until next.
- Text default/output preference; backend-status-gated optional AI; output/AI/mute controls, progress blockers, eligible scoring/findings/JSON, optional approved wording and narration Replay/Stop wired. Finish removes queued scheduler work but lets a current live cue finish before narration.
- Cancellation invalidates narration tokens/aborts wording on interruptions, next set and teardown; cleanup removes subscriptions (StrictMode). Transient loss lets biomechanics own bounded baseline grace; actual camera release/side change clears baseline. Prefetch only eligible cues once per active set with AI/audio/unmuted guards.
- 11 Vitest/jsdom tests (7 actual CameraView integration with mocked capture/pose and real analyzer/tracker/lifecycle,4 leaf panel interactions) pass; these do not establish human camera or browser audio behavior.
- Live demo/Chrome/Safari/iOS audio/recording review pending. Lessons: guard async UI completion with lifecycle tokens and mounted state; arm-change consent must precede finalization. Knowledge writeback: lead from s4-coaching-ui/review.

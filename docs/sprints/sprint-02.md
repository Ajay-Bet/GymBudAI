# Sprint 02 — Biomechanics and calibration

Status: complete (user-accepted; physical stability/delay targets carried over)
Last updated: 2026-10-03

## Scope and acceptance criteria

- User selected Sprint 2 and adopted `GymBud_Sprint_02_Biomechanics_Engine.docx` from Downloads as its requirements; project instructions were read before planning.
- GB 201: confidence-aware elapsed-time smoothing, confidence-gap handling and prolonged-loss reset; raw and smoothed development measurements.
- GB 202: known 0/90/180-degree fixtures, invalid degenerate measurements, documented coordinate space and aspect correction.
- GB 203: explicit selected anatomical side and camera view, several stable observations for upper-arm/torso calibration, missing joints/unstable posture/wrong orientation block readiness with reasons; recalibration clears baseline.
- GB 204: versioned FeatureFrame with timestamps, tracking quality, measurement validity and units; real-time velocity rejects invalid intervals; body-segment-normalized displacement never substitutes zero for missing evidence.
- Verification: both sides, display mirroring, source aspect changes, gaps, differing sampling/render rates, calibration/reposition/recovery, stationary smoothing and movement delay.
- Proposed document review targets: stationary elbow variation below 5 degrees and added smoothing delay below 150 ms on a chosen reviewed recording. These are unvalidated engineering targets, not measured performance or clinical claims.
- Prerequisites: Sprint 1 user-accepted locally; numerical five-minute benchmark, broader physical/cross-browser evidence and remote CI remain carryover. First view is provisionally side-on with selected arm facing camera, camera near torso height. Approved reference recording/device is not supplied.
- Out of scope: reps, form corrections, speech, backend changes, persisted measurements, recording/uploads, ML and later sprints.

## Agent assignments and shared contracts

- Lead: scope/contract reconciliation, integration checks, documentation and final handoff.
- Biomechanics specialist: `frontend/src/biomechanics/*`; pure geometry, smoothing, calibration and feature contracts. Communicates contract to UI and validator before dependent work.
- Calibration UI specialist: `frontend/src/components/CameraView.jsx` and dedicated UI component if needed; explicit view/side, calibration and live/development measurement display, lifecycle resets.
- Independent validation specialist: `frontend/tests/biomechanics*.test.js` and synthetic fixtures if needed; numerical/tracking/calibration evidence and independent review.
- Existing JSX/JavaScript camera shell is retained as in Sprint 1; calculations stay independent of React. TypeScript remains target architecture; a broad unrelated migration is excluded.

## Progress and decisions

- Read full project instructions, sprint guide, Sprint 1 handoff, camera guide, current camera/vision code and DOCX text.
- Existing unrelated modification: unused CameraView import in `frontend/src/pages/Playground.jsx`; preserve it.
- Side-on orientation checks are conservative observable heuristics, not proof of true 3D camera orientation. Thresholds require reviewed human examples before detector-quality claims.
- Requirements source confirmed: the user's attached `GymBud_Sprint_02_Biomechanics_Engine.docx` is identical in text to `~/Downloads/GymBud_Master_and_Sprints_01-12/GymBud_Sprint_02_Biomechanics_Engine.docx` (checked 2026-10-02).
- Claude Code chat (2026-10-02) used only `s2-biomechanics`, `s2-calibration-ui` and `s2-validation`.
- Implemented: `FEATURE_SCHEMA` (version 1.0.0, units for every value, normalization note) and per-frame `units`; `biomechanics/stability.js` (`createStabilityTracker`, `measureStepDelay`); CameraView unit labels from the contract (displacement is in torso lengths, fixing an "upper-arm lengths" label), upper-arm drift and torso deviation readouts, engine reason codes and a dev-only 2 s raw vs smoothed stability readout.
- Review fixes: smoothed displacement/velocity divide by the smoothed torso length; side-on check requires the selected-side shoulder/hip to be reliable but accepts finite far-side estimates, exposing `orientation.farSideReliable`.
- User request (2026-10-02): calibration and measurement panel moved to the right of the camera preview on large screens (sticky, developer details beneath it); stacks on small screens. Layout-only change in CameraView.jsx.
- User live test (2026-10-02): readings flickered between values and Not assessed. Cause: one frame with a required joint below 0.5 visibility made tracking partial (300 ms re-settle) and wiped the calibration baseline. Fix: confidence hysteresis (acquire 0.5, keep while ≥ 0.3) in `vision/tracking.js` and the engine, plus a 250 ms dropout grace window that keeps the baseline (frames inside it still publish null values, never held ones) and restarts smoothing from the raw pose on recovery. `tracking.js` was assigned to s2-biomechanics for this change. Thresholds are unvalidated defaults.
- Decision: camera view is fixed to side-on (the only supported view) and shown explicitly in the measurement heading; no selector was added because there is no second view to choose.

## Validation and review evidence

- `npm test` 48/48 pass, eslint clean, vite build succeeds (2026-10-02). Dropout tests in `frontend/tests/biomechanics-dropout.test.js`; four older tests updated to the new dropout contract.
- Synthetic tests in `frontend/tests/biomechanics.test.js` and `biomechanics-timing.test.js` (seeded fixtures). Synthetic results, not physical measurements: 0→90° ramp velocity 89.9 °/s at 30 and 60 fps (irregular intervals: mean 87.5, worst frame error 12.7 °/s); stationary jitter raw SD 2.08° / range 9.66° vs smoothed SD 0.82° / range 4.09°; 0→60° step added delay to 50% is 66.7 ms at confidence 1.0 and 100 ms at 0.6.
- Ajay's live camera retest (2026-10-02): detection reported steady after the dropout fix; calibration panel layout accepted. Arm used and stability numbers not yet recorded.
- Live session observed through Chrome (2026-10-03, left arm, built-in Mac webcam, ~30 FPS capture and analysis): tracking reached active with left shoulder/elbow/wrist/hip scores ≥ 0.9 when hips were in frame. Ajay reported that in an exact side-on stance the elbow is hard to track where it overlaps the torso. Hips leaving the bottom of the frame (score 0.01–0.36) was the most common blocker.
- Independent review (s2-validation): no CameraView defects; engine findings resolved above or carried over below.
- Physical reference recording and camera review not yet performed.

## Handoff

- Carryover to Sprint 3: per-frame velocity varies with frame spacing (up to ~13 °/s on jittered intervals); analyzers should not threshold on single-frame velocity — use a windowed or filtered derivative. Low confidence lengthens smoothing delay, so the physical review must record landmark visibility.
- Ajay accepted Sprint 2 after the live session (2026-10-03) without a recorded stationary stability reading. During that session the readings captured were taken while moving or repositioning (raw range 14–43°), so they are not stationary evidence.
- Carryover: measure stationary elbow variation (< 5° proposed) and added smoothing delay (< 150 ms proposed) on a reviewed real setup for both arms; tune releaseConfidence/dropoutGraceMs/maxOrientationRatio on real footage; consider allowing an oblique (~30°) view since exact side-on occludes the elbow; windowed velocity for Sprint 3.
- Previously listed as remaining:, execute numerical/lifecycle checks, independently review, document feature contract and physical acceptance limitations.
- No recording consent inferred from document entry requirement; this implementation keeps observations in memory.
- No commits or publication requested in this chat.

## Codex catch-up intake — 2026-10-03

- User supplied **Sprint 2** with `/Users/prabh/Downloads/GymBud_Sprint_02_Biomechanics_Engine.pdf` (two pages; planning baseline 1 October 2026). Read both pages using text extraction and rendered-page inspection.
- Under the current catch-up direction, this is memory intake. The attachment is reference content; its implementation, verification, recording and handoff instructions do not authorize restarting work or recording a participant. The user's report that Sprints 1–3 are completed remains separate from the historical acceptance and validation evidence above.
- The PDF matches the existing adopted DOCX scope in substance: GB 201 elapsed-time confidence-aware smoothing, GB 202 valid aspect-corrected geometry, GB 203 selected-side calibration/readiness, and GB 204 timestamped features with units and validity. No new scope or acceptance criteria were found. Its requested review demonstration, reference setup and motion fixtures are requirements, not evidence that those checks occurred.
- Preserve the user-accepted Sprint 2 status with physical stability/delay targets carried over. The historical 48-test, lint/build, synthetic stability/delay and live-camera results above were not rerun during intake. Stationary variation below 5 degrees and added smoothing delay below 150 ms remain proposed, unmeasured real-body targets; both-arm physical review and threshold tuning remain open. Exact side-on elbow occlusion and hips leaving the frame remain recorded limitations.
- Historical handoff retained: aspect-corrected unmirrored image coordinates, anatomical side unaffected by preview mirroring, invalid features represented by null plus validity false, torso-length normalization, actual timestamps, and no form judgments from readiness. Confidence hysteresis and the 250 ms dropout grace preserve calibration briefly while missing observations still publish null measurements; prolonged loss clears the baseline. Thresholds remain unvalidated defaults.
- Component continuity: `.claude/agents/c-biomechanics.md` records the later Sprint 3 schema 1.1.0 and `baselineElbowFlexionDeg` addition; do not revert it to Sprint 2's historical 1.0.0. It also records that the curl analyzer uses a windowed slope instead of the variable per-frame velocity. The Sprint 2 guide remains a historical measurement guide, not a description of every later UI feature.
- Intake changed only this sprint record. No application changes, tests, new acceptance evidence, agent reactivation, commits or publication occurred. Sprint 2 specialists remain retired; this chat is the Sprint 2 lead for intake. Await an explicit request before resuming implementation or validation.

## Cursor catch-up intake — 2026-10-03

- This Cursor chat received **Sprint 2** with the same file, `/Users/prabh/Downloads/GymBud_Sprint_02_Biomechanics_Engine.pdf`. Both pages were extracted independently (title GymBud Sprint 2 Biomechanics Engine; author GymBud Team; creator Microsoft Word; planning baseline 1 October 2026).
- The PDF text matches the adopted scope above and the Codex catch-up: GB 201 elapsed-time confidence-aware smoothing, GB 202 aspect-corrected geometry with 0/90/180 fixtures, GB 203 selected-side calibration and readiness, and GB 204 timestamped features with units and validity. No new scope, acceptance criteria, or decisions.
- Under the current catch-up direction this is memory intake. The attachment does not authorize restarting Sprint 2 or recording a participant. The user's report that Sprints 1–3 are completed stays separate from the user-accepted status and the unmeasured physical targets above.
- Preserved limitations: stationary elbow variation below 5 degrees and added smoothing delay below 150 ms remain proposed, unmeasured real-body targets. Both-arm physical review, threshold tuning, exact side-on elbow occlusion, and hips leaving the frame remain open. The historical 48-test, lint, build, synthetic, and live-camera results were not rerun.
- Component continuity: `.claude/agents/c-biomechanics.md` now records `FEATURE_SCHEMA` 1.2.0, including the Sprint 3 `baselineElbowFlexionDeg` field and later Sprint 4 calibration display fields. Do not revert it to Sprint 2's historical 1.0.0. The curl analyzer still uses a windowed slope instead of the variable per-frame velocity. `s2-biomechanics`, `s2-calibration-ui`, and `s2-validation` stay retired in `.claude/AGENT-MAP.md`.
- Intake changed only this sprint record. No application changes, tests, new acceptance evidence, agent reactivation, commits, or publication. Await an explicit request before resuming implementation or validation.

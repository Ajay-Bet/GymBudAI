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
- `frontend/src/vision/CameraManager.js`

## Contracts to keep

- Calls `vision` and `biomechanics` through their public functions only; no calculations in React.
- Lifecycle: every stop, mute, stale result, tracking loss and side change runs `clearMeasurements()` and releases camera tracks, loops and workers.
- Wide screens: calibration panel sits to the right of the preview (sticky); stacks on narrow screens.

## History

- Sprint 1 built the camera shell (`s1-camera-ui`). Sprint 2 added calibration, measurements and the developer stability readout (`s2-calibration-ui`).

## Open carryover

- JSX today; TypeScript is the target architecture, with no broad migration yet.

## Lessons learned

- Users want calibration and readings beside the video, not below it; keep the panel visible while the camera runs (Sprint 2).
- Label units from the engine contract (`frame.units`), never hard-code them; a hard-coded label was wrong once (Sprint 2).

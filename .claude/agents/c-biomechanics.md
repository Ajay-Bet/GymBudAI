---
name: c-biomechanics
description: "Component owner for biomechanics: geometry, smoothing, calibration, FeatureFrame contract and stability measurement."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `frontend/src/biomechanics/*` (`engine.js`, `geometry.js`, `stability.js`)

## Contracts to keep

- `FEATURE_SCHEMA` and the `FeatureFrame` typedef in `engine.js` (version 1.0.0, coordinate space `unmirrored-image-height`, units for every value). Invalid values are `null` with validity `false`, never 0.
- `createBiomechanicsEngine({ side, view, config })` → `update(result, tracking)`, `calibrate()`, `reset()`, `setSide()`, `setView()`, `getCalibration()`.
- `createStabilityTracker()` and `measureStepDelay()` in `stability.js`.
- Guide: `docs/biomechanics-sprint-02.md`. Bump `FEATURE_SCHEMA.version` on any change to meaning or units.

## History

- Sprint 2 built it (`s2-biomechanics`).

## Open carryover

- Per-frame velocity varies with frame spacing; use a windowed or filtered derivative before analyzers threshold on it.
- Stationary variation (< 5°) and smoothing delay (< 150 ms) not yet measured on a real body.
- Exact side-on hides the elbow behind the torso; consider an oblique (~30°) supported view.
- `releaseConfidence`, `dropoutGraceMs`, `maxOrientationRatio` are untuned defaults.

## Lessons learned

- Keeping old smoothing state across a dropout makes values lag behind real movement; restart smoothing from the raw pose on recovery (Sprint 2).
- Normalize smoothed vectors by the smoothed reference length, not the raw one, or raw jitter leaks back in (Sprint 2).
- Requiring far-side shoulder/hip visibility blocks a true side view; accept finite far-side estimates (Sprint 2).
- Exact side-on lets the torso hide the elbow on a real body (Ajay's live test, Sprint 2).

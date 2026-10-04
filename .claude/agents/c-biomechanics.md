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

- `FEATURE_SCHEMA` and the `FeatureFrame` typedef in `engine.js` (version 1.2.0, coordinate space `unmirrored-image-height`, units for every value). Invalid values are `null` with validity `false`, never 0.
- Calibration snapshot (`CalibrationSnapshot`) includes `baselineElbowFlexionDeg`: mean raw flexion of the accepted calibration samples, a number only while status is `ready`, else null (added Sprint 3 for the curl analyzer).
- `createBiomechanicsEngine({ side, view, config })` → `update(result, tracking)`, `calibrate()`, `reset()`, `setSide()`, `setView()`, `getCalibration()`.
- `createStabilityTracker()` and `measureStepDelay()` in `stability.js`.
- Guide: `docs/biomechanics-sprint-02.md`. Bump `FEATURE_SCHEMA.version` on any change to meaning or units.

## History

- Sprint 2 built it (`s2-biomechanics`). Sprint 3 added `baselineElbowFlexionDeg` and bumped the schema to 1.1.0 (`s3-exercises`).

## Open carryover

- Per-frame `elbowAngularVelocityDegS` still varies with frame spacing; the curl analyzer uses its own windowed slope instead, so no analyzer depends on it.
- Stationary variation (< 5°) and smoothing delay (< 150 ms) not yet measured on a real body.
- Exact side-on hides the elbow behind the torso; consider an oblique (~30°) supported view.
- `releaseConfidence`, `dropoutGraceMs`, `maxOrientationRatio` are untuned defaults.
- Any tracking loss over the 250 ms grace window clears calibration; the UI's auto-calibration now recovers it, but a longer grace or baseline retention could be considered.

## Lessons learned

- Keeping old smoothing state across a dropout makes values lag behind real movement; restart smoothing from the raw pose on recovery (Sprint 2).
- Normalize smoothed vectors by the smoothed reference length, not the raw one, or raw jitter leaks back in (Sprint 2).
- Requiring far-side shoulder/hip visibility blocks a true side view; accept finite far-side estimates (Sprint 2).
- Exact side-on lets the torso hide the elbow on a real body (Ajay's live test, Sprint 2).


## Sprint 4 extension continuity — 2026-10-03

- FeatureFrame1.2.0 additive `calibration.blockedReason`/display progress. Required evidence remains contiguous stable valid1000ms and≥8frames. On instability retain longest suffix meeting the original first-reference8°/.06/scale checks; no median widening or extended baseline hold. Relaxed elbow collection eligibility≤45° unvalidated setting; auto-initiation still≤40°.
- Display progress retains high-water below.99 until readiness; true invalidation resets. Baseline retention remains250ms grace; >500ms source gap or reposition invalidates. Snapshot codes missing-joint name/not-side-on/moving/arm-not-relaxed/tracking-gap/null.
- Reproducible synthetic seed7 before→after15fps1333→1067ms,30fps1167→1067ms,60fps8633→1017ms. Seeds2026/42 remain1000ms. Dedicated replay fixtures/tests record original checks; physical speed/stationary variation/delay and video review pending.
- Lesson: retain contiguous qualifying observations rather than full noise-driven resets; a monotonic visual indicator must never authorize readiness without the real retained window. Knowledge writeback: lead from s4-biomechanics/review.

---
name: c-exercises
description: "Component owner for exercise analyzers: phases, rep events, metrics and candidate form issues."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `frontend/src/exercises/analyzer.js` (contract typedefs, `createExerciseRegistry`, `defaultExerciseRegistry` with `'dumbbell-curl'`)
- `frontend/src/exercises/curl.js` (`CURL_CONFIG`, `createCurlAnalyzer`)
- Guide: `docs/curl-analyzer-sprint-03.md`

## Contracts to keep

- One analyzer contract: timestamped FeatureFrames and tracking quality in; phase, unique rep events, metrics and candidate issues out. Full contract: `docs/sprints/sprint-3-STATUS.md` ("Agreed analyzer contract") and the guide.
- Analyzer API: `update(frame)`, `reset(reason)`, `interrupt(reason, timestampMs)` (reasons `tracking-loss`, `recalibration`; keeps completed reps), `getSession()`.
- Events: `rep-completed` (RepSummary: duration, min/max flexion, ROM, coverage, drift/torso extrema, candidate issues, configVersion, featureVersion, units) and `attempt-interrupted` (`partial`, `tracking-loss`, `pause-timeout`, `low-coverage`, `reset`, `recalibration`). Missing values are null, never 0.
- `CURL_CONFIG` `curl-1.1.0` (unvalidated defaults, flexion offsets from the calibration baseline B): bottom enter 15 / exit 30, attempt ID at 45, top exit 80 / enter 95, minRom 80; direction = least-squares slope over 200 ms (±20 °/s); minimum phase times 100/150/50/150 ms; startLookbackMs 500; pause rule = 4 s without ≥ 8° (`stallProgressDeg`) change in the 200 ms windowed mean; top hold timeout 10 s; max frame gap 500 ms; coverageGapMs 150; min coverage 0.8; torso-swing > 10° and upper-arm-drift > 20° for 250 ms. Bump the version on any counting change.
- Requires FeatureFrame ≥ 1.1.0 (`calibration.baselineElbowFlexionDeg`). Ignores duplicate/out-of-order timestamps; not-ready frames never advance a phase.

## History

- Sprint 3 (`s3-exercises`) built the registry and curl analyzer. Live runs with Ajay (left arm, Mac webcam): curl-1.0.0 counted a 101° half curl (1 error in 7); curl-1.1.0 counted all 9 intended reps and rejected 3 unwanted half curls (Ajay-confirmed).

## Open carryover

- Thresholds are tuned from one participant and two sessions; B+95 top may reject users with a short comfortable range. Needs annotated recordings from more people (Sprint 3 exit target: ≤ 1 count error per 20 curls in each of three recordings, not yet run).
- Rep IDs (`curl-<pageSession>-<n>`) repeat after a reload; Sprint 5 persistence needs globally unique IDs (UUID prefix).
- Upper-arm drift is unsigned (forward direction not derivable side-on); lateral flare deferred.
- Movement under ~2 °/s counts as a pause.
- Candidate issues are not yet validated against reviewed examples (Sprint 4).

## Lessons learned

- Assign attempt IDs only past a commit angle above the bottom exit; hysteresis alone still lets boundary jitter create attempts (Sprint 3).
- Start a rep at the lowest bottom frame shortly before lift-off so extrema stay inside [start, end] (Sprint 3).
- Slope-only transitions miss slow tempo; let position past a committed boundary advance the phase (Sprint 3).
- Slope- or single-frame-based stall timers are reset by noise; measure progress of a windowed mean from a fixed anchor (Sprint 3).
- Synthetic fixtures with large excursions could not catch a too-low top threshold; check zones against real peaks (Ajay's live run 1, Sprint 3).

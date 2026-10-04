# Sprint 3 dumbbell curl analyzer guide

## Scope and review

The curl analyzer turns the biomechanics `FeatureFrame` stream into a movement phase, a completed-rep count, per-rep summaries and candidate form issues for one selected arm in the side view. It runs entirely in the browser, keeps its session in local memory and needs no network. Nothing is recorded, uploaded or saved, and nothing is spoken or shown as a correction: candidate issues are inputs for Sprint 4 coaching.

Code: `frontend/src/exercises/analyzer.js` (contract typedefs and registry) and `frontend/src/exercises/curl.js` (`CURL_CONFIG`, `createCurlAnalyzer`). Both are plain JavaScript modules with no React dependency. The analyzer requires feature schema 1.1.0, whose calibration snapshot carries `baselineElbowFlexionDeg` (the mean raw elbow flexion over the accepted calibration samples, relaxed arm; `null` unless calibration is ready).

## Contract

- `createExerciseRegistry()` returns `register(id, factory)`, `create(id, options)` and `list()`. `defaultExerciseRegistry` registers `'dumbbell-curl'`.
- `createCurlAnalyzer({ config })` merges overrides onto `CURL_CONFIG` and validates them (positive numbers, zone offsets strictly increasing, `minCoverage` at most 1). It returns:
  - `update(frame)` → `AnalyzerOutput` for one `FeatureFrame`.
  - `reset(reason)` → clears phase, attempt, completed reps and count, and starts a new ID session. Use it for exercise change, side change and session restart. If a committed attempt was in progress its output carries one `attempt-interrupted` event with reason `reset`. The output also carries `resetReason` (the string passed in).
  - `interrupt(reason, timestampMs)` with reason `tracking-loss` or `recalibration` → ends a committed attempt with that reason (one `attempt-interrupted` event in the output), drops a pending attempt, and sets phase `idle` with `paused: true` and `pauseReason` = reason. Completed reps and the count are kept. A non-finite (or earlier) timestamp uses the last processed one; `update()`'s timestamp ordering is unchanged. Any other reason throws.
  - `getSession()` → copies of `{ exerciseId, configVersion, featureVersion, side, completedReps, interruptedAttempts }`.
- `AnalyzerOutput`: `exerciseId`, `configVersion`, `timestampMs`, `phase` (`idle | bottom | lifting | top | lowering`), `paused`, `pauseReason` (`tracking-dropout | tracking-loss | recalibration | calibration-required | unsupported-view | null`), `repCount`, `attempt` (`{ id, startMs, phase }` of the committed attempt, else `null`), `events` (new this frame only), `live` (`elbowFlexionDeg`, `directionDegS`, both `null` when not observed) and `candidateIssues` (confirmed episodes on the current attempt).
- `RepEvent`: `{ type: 'rep-completed', id, rep }` or `{ type: 'attempt-interrupted', id, attempt }`. IDs look like `curl-<sessionUid>-<n>`; since Sprint 4 the session UID is a new `crypto.randomUUID()` (with a fallback) for every analyzer instance and every reset, so IDs are unique across reloads and are never re-emitted. `getSession()` also returns `sessionId` (that UID) and `view`. Sprint 4 coaching (issue tracker, set summary, cues) is described in `docs/coaching-sprint-04.md`.
- `RepSummary` and `InterruptedAttempt` fields are listed in `analyzer.js` and `docs/sprints/sprint-3-STATUS.md`. Missing measurements are `null`, never 0. `units` in each rep names the unit of every numeric field.
- `CandidateIssue`: `{ type, startMs, endMs, peak, unit: 'deg', configVersion }`. An open episode has `endMs: null`. For `incomplete-rom`, `peak` is the achieved ROM.

## State machine

Let B be `calibration.baselineElbowFlexionDeg` and flexion the smoothed `values.elbowFlexionDeg` (0° is a straight arm). Direction is the least-squares slope of flexion over the valid frames in the last `directionWindowMs`; it is `null` (unknown) with too few samples or too short a span. A single frame difference is never used.

| From | To | Condition |
|---|---|---|
| idle | bottom | flexion ≤ B + `bottomEnterOffsetDeg` |
| bottom | lifting | bottom held ≥ `minBottomMs` and either flexion > B + `bottomExitOffsetDeg` with direction rising (a pending attempt starts) or flexion ≥ B + `attemptCommitOffsetDeg` on a valid frame whatever the slope (slow tempo; the attempt is committed at once) |
| lifting (pending) | bottom | direction falling, flexion back in the bottom entry zone, or stall ≥ `pauseTimeoutMs`; no event |
| lifting | (commit) | flexion ≥ B + `attemptCommitOffsetDeg` assigns the attempt ID |
| lifting | top | flexion ≥ B + `topEnterOffsetDeg`, lifting ≥ `minLiftingMs`, attempt committed |
| lifting | lowering | direction falling, lifting ≥ `minLiftingMs` (top not reached) |
| top | lowering | flexion < B + `topExitOffsetDeg`, top ≥ `minTopMs` (no slope needed) |
| lowering | top | top was reached and flexion ≥ B + `topEnterOffsetDeg` again |
| lowering | lifting | top not reached and direction rising |
| lowering or lifting | bottom | flexion ≤ B + `bottomEnterOffsetDeg` (lowering also needs ≥ `minLoweringMs`): completes the rep if top was reached, otherwise `partial` |

- A rep starts at the lowest-flexion bottom-phase frame within `startLookbackMs` before lift-off (the latest one on ties) and ends at the first frame back inside the bottom entry zone. Minimum and maximum flexion are values observed on ready frames inside [start, end]. ROM is maximum minus minimum flexion.
- A completed rep also needs ROM ≥ `minRomDeg` and coverage ≥ `minCoverage`; otherwise it is interrupted as `partial` or `low-coverage`.
- A partial attempt (committed, top never reached, back to bottom) is interrupted with reason `partial` and an `incomplete-rom` candidate issue. Oscillations that never reach the commit boundary create no attempt, no ID and no event.
- Pauses (progress-based): when the stall timer starts it records the anchor, the mean flexion of the valid frames in the direction window (`directionWindowMs`); it restarts only when that windowed mean moves at least `stallProgressDeg` from the anchor. Frame noise and slope sign flips do not restart it, and neither do noise-driven lifting/lowering flips; entering or leaving the top does. No such progress for `pauseTimeoutMs` while lifting or lowering, or a top hold lasting `topHoldTimeoutMs`, interrupts with `pause-timeout` and returns to idle. Shorter pauses resume normally.
- Tracking: a frame with `ready !== true` never advances a phase. If `dropout === true` (inside the engine's grace window) analysis pauses and the attempt is kept; the time is uncovered. Any other unusable frame (not ready, no baseline, no flexion, unsupported view) interrupts a committed attempt with `tracking-loss` and returns to idle, which needs a valid bottom before a new attempt. A gap between processed frames above `maxFrameGapMs` is also tracking loss.
- Frames whose timestamp is missing or not later than the last processed one are ignored: the previous output is returned with no events.
- A frame whose `side` or `view` differs from the session's starts a new session (as `reset`), as a safety net; the UI should still call `reset` explicitly.
- Coverage is observed time divided by rep duration. Observed time sums only intervals between consecutive ready frames no longer than `coverageGapMs`; longer intervals and dropouts stay uncovered.

## Candidate issues

`torso-swing` uses |`torsoDeviationDeg`| and `upper-arm-drift` uses |`upperArmDriftDeg`|, both relative to the calibration baseline. An episode is confirmed once the value stays above its threshold for the persistence time of valid observation; it ends at the last frame above threshold. Invalid frames and dropouts end an episode (evidence is not carried across gaps). Episodes are kept per attempt. Upper-arm drift is unsigned: forward direction is not derivable from one side-on 2D view, so its direction is not assessed. Lateral flare is not assessed.

## Configuration (`curl-1.1.0`)

Every value is an unvalidated engineering default. None has been checked against annotated recordings.

Version history: `curl-1.1.0` raised the top zone (entry B + 95°, exit B + 80°) and `minRomDeg` to 80°. Under `curl-1.0.0`, Ajay's live run 1 (left arm, Mac webcam, baselines about 13–21°) counted a half curl that peaked at 100.8° (ROM 82.7°). His full reps peaked at 132–135° (ROM 111–122°) and correctly rejected partials peaked at 77.5–82.7°. These values are tuned from one participant's one session, not validated. Live evidence recorded before this change belongs to `curl-1.0.0`.

| Key | Value | Meaning |
|---|---|---|
| bottomEnterOffsetDeg | 15 | Bottom zone entry, B + value |
| bottomExitOffsetDeg | 30 | Bottom zone exit |
| attemptCommitOffsetDeg | 45 | Attempt gets an ID |
| topExitOffsetDeg | 80 | Top zone exit (1.0.0: 65) |
| topEnterOffsetDeg | 95 | Top zone entry (1.0.0: 80) |
| minRomDeg | 80 | Minimum ROM for a completed rep (1.0.0: 60) |
| directionWindowMs | 200 | Slope window |
| directionMinSamples | 3 | Minimum valid frames in the window |
| directionMinSpanMs | 80 | Minimum time span in the window |
| directionThresholdDegS | 20 | Rising/falling/stall threshold (deg/s) |
| startLookbackMs | 500 | Rep start search window before lift-off |
| minBottomMs / minLiftingMs / minTopMs / minLoweringMs | 100 / 150 / 50 / 150 | Minimum time in a phase |
| pauseTimeoutMs | 4000 | Limit without progress while lifting or lowering |
| stallProgressDeg | 8 | Movement from the anchor that restarts the stall timer |
| topHoldTimeoutMs | 10000 | Hold limit at the top |
| maxFrameGapMs | 500 | Gap treated as tracking loss |
| coverageGapMs | 150 | Longest interval between ready frames counted as observed |
| minCoverage | 0.8 | Minimum valid observation fraction |
| torsoSwingDeg / torsoSwingPersistMs | 10 / 250 | Torso swing candidate |
| upperArmDriftDeg / upperArmDriftPersistMs | 20 / 250 | Upper-arm drift candidate |

## Limitations

- Synthetic replays check the logic only. Counting accuracy, the proposed exit target (≤ 1 count error per 20 labeled curls) and every threshold still need reviewed, annotated recordings, which do not exist yet.
- Thresholds are offsets from a relaxed-arm baseline. The `curl-1.1.0` top zone (B + 95°) comes from a single participant's one session, not validation: a user whose comfortable top is below B + 95° (a short comfortable range, or a high calibrated baseline) never reaches the top zone and gets only partial attempts. A user who calibrates with a bent arm shifts every zone. If B + 95° exceeds 180° no rep can complete.
- Reasons `recalibration` and `tracking-loss` via `interrupt()` come from the UI; the analyzer cannot see recalibration itself.
- Projected 2D angles depend on camera viewpoint; exact side-on can hide the elbow. Only the side view is supported.
- Tempo: the slope threshold (20 deg/s) is only needed for leaving the bottom between B + 30° and B + 45°, for lifting→lowering before the top, and for lowering→lifting; past the commit angle and below the top exit, position alone advances the phase. The pause timeout is progress-based, so a steady slow curl (for example 120° at 15 deg/s) keeps resetting it and completes. Movement slower than `stallProgressDeg` per `pauseTimeoutMs` (8° per 4 s, 2 deg/s) is treated as a pause. Anchor and progress use the windowed mean, so single-frame noise does not restart the timer: in a synthetic check over 20 seeds, an 8 s pause halfway down with 2° or 3° (SD) frame noise never completed a rep, while a steady 15 deg/s curl counted every time. Much larger noise, or a slow drift of the mean, can still restart it; this is synthetic evidence only.
- Frequent short dropouts empty the direction window, so no phase advances until enough valid frames return.
- IDs: resolved in Sprint 4. They now carry a per-session UUID, so they are unique across reloads.
- Candidate issues are not coaching, injury prevention or clinical assessment. Grip, wrist rotation, load and muscle activation are not assessed.

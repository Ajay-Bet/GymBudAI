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
- `frontend/src/exercises/curlRules.js` (`CURL_RULES_CONFIG` curl-rules-1.0.0, `createCurlIssueTracker`, `curlUnavailableReason`, `CURL_ISSUE_TYPES`) (Sprint 4)
- `frontend/src/exercises/setSummary.js` (`buildSetSummary`, `SET_SUMMARY_CONFIG` set-summary-1.0.0) (Sprint 4)
- `frontend/src/exercises/ids.js` (`createSessionUid`) (Sprint 4)
- Guides: `docs/curl-analyzer-sprint-03.md`, `docs/coaching-sprint-04.md`

## Contracts to keep

- One analyzer contract: timestamped FeatureFrames and tracking quality in; phase, unique rep events, metrics and candidate issues out. Full contract: `docs/sprints/sprint-3-STATUS.md` ("Agreed analyzer contract") and the guide.
- Analyzer API: `update(frame)`, `reset(reason)`, `interrupt(reason, timestampMs)` (reasons `tracking-loss`, `recalibration`; keeps completed reps), `getSession()`.
- Events: `rep-completed` (RepSummary: duration, min/max flexion, ROM, coverage, drift/torso extrema, candidate issues, configVersion, featureVersion, units) and `attempt-interrupted` (`partial`, `tracking-loss`, `pause-timeout`, `low-coverage`, `reset`, `recalibration`). Missing values are null, never 0.
- `CURL_CONFIG` `curl-1.1.0` (unvalidated defaults, flexion offsets from the calibration baseline B): bottom enter 15 / exit 30, attempt ID at 45, top exit 80 / enter 95, minRom 80; direction = least-squares slope over 200 ms (±20 °/s); minimum phase times 100/150/50/150 ms; startLookbackMs 500; pause rule = 4 s without ≥ 8° (`stallProgressDeg`) change in the 200 ms windowed mean; top hold timeout 10 s; max frame gap 500 ms; coverageGapMs 150; min coverage 0.8; torso-swing > 10° and upper-arm-drift > 20° for 250 ms. Bump the version on any counting change.
- IDs: reps/attempts `curl-<sessionUid>-<n>`, episodes `issue-<sessionUid>-<n>`; UUID per analyzer/tracker instance and per reset. `getSession()` adds `sessionId` and `view` (Sprint 4).
- Issue tracker (`curl-rules-1.0.0`, every rule `enabled: false`, `validation: 'unvalidated'`, `evidence: []`): torso-swing |torsoDeviationDeg| > 10° for 400 ms, release ≤ 7° for 500 ms; upper-arm-drift |upperArmDriftDeg| > 20° for 400 ms, release ≤ 15° for 500 ms; incomplete-rom = instant episode on `attempt-interrupted`/`partial`. Gate: ready, not dropout, side view, calibrated, finite feature, analyzer not paused, frame rate OK. Invalid frames discard pending evidence and suspend (never release) episodes; `maxSuspendMs` 500 then `tracking-lost`; `maxEvidenceGapMs` 150; `'low-frame-rate'` when the lower median of valid frame gaps over `frameRateWindowMs` 1000 exceeds 150 ms. API: `update(frame, analyzerOutput)`, `interrupt(reason, t, analyzerEvents)`, `end(t, analyzerEvents)`, `reset(reason)`, `getSession()`. Full schema in `docs/coaching-sprint-04.md`.
- A rule may be enabled only with reviewed evidence recorded in its `evidence` and the sprint record; bump the rules version.
- Set summary (`set-summary-1.0.0`): analyzed rep = completed rep with ≥ 0.8 assessable coverage and ≥ 1 assessed rule; issue-bearing reps counted once per rep; `notAnalyzedReason` precedence `no-validated-rules` > `no-completed-reps` > `low-coverage`; `noIssueFraction` null when nothing analyzed, labelled detector summary.
- Requires FeatureFrame ≥ 1.1.0 (`calibration.baselineElbowFlexionDeg`). Ignores duplicate/out-of-order timestamps; not-ready frames never advance a phase.

## History

- Sprint 3 (`s3-exercises`) built the registry and curl analyzer. Live runs with Ajay (left arm, Mac webcam): curl-1.0.0 counted a 101° half curl (1 error in 7); curl-1.1.0 counted all 9 intended reps and rejected 3 unwanted half curls (Ajay-confirmed).
- Sprint 4 (`s4-exercises`) added the issue tracker, set summary and globally unique IDs (resolving Sprint 3 D7); review fixes added the low-frame-rate gate, analyzer events on interrupt/end and not-analyzed reasons. Synthetic evidence only.

## Open carryover

- Thresholds are tuned from one participant and two sessions; B+95 top may reject users with a short comfortable range. Needs annotated recordings from more people (Sprint 3 exit target: ≤ 1 count error per 20 curls in each of three recordings, not yet run).
- Upper-arm drift is unsigned (forward direction not derivable side-on); lateral flare deferred.
- Movement under ~2 °/s counts as a pause.
- No rule is enabled. Sprint 4 closed 2026-10-04 on Ajay's attestation that the human checks passed, but no per-rule evidence is recorded; `enabled: true` still needs reviewed evidence entered in `curlRules.js` `evidence` and the sprint record (measure with `ml/coaching_eval.mjs`, target ≤ 1 false cue/min).
- Below about 7 fps the tracker reports `'low-frame-rate'`; no coaching at that rate.
- `reset()` does not attach analyzer attempt IDs to episodes (the old session is discarded).

## Lessons learned

- Assign attempt IDs only past a commit angle above the bottom exit; hysteresis alone still lets boundary jitter create attempts (Sprint 3).
- Start a rep at the lowest bottom frame shortly before lift-off so extrema stay inside [start, end] (Sprint 3).
- Slope-only transitions miss slow tempo; let position past a committed boundary advance the phase (Sprint 3).
- Slope- or single-frame-based stall timers are reset by noise; measure progress of a windowed mean from a fixed anchor (Sprint 3).
- Synthetic fixtures with large excursions could not catch a too-low top threshold; check zones against real peaks (Ajay's live run 1, Sprint 3).
- An evidence limit that can never be met must surface as an explicit not-assessable reason, not silent abstention (Sprint 4 review D1).
- Measure persistence from the first frame of a continuous valid run and cap the frame gap, so a low frame rate cannot create evidence from unobserved time; use a robust statistic (lower median over a window) so one stall does not flip the state (Sprint 4).
- Attach attempt IDs to episodes by time overlap when the attempt ends; the ID exists only after commit (Sprint 4).


## Sprint 4 extension continuity — 2026-10-03

- Owns new `setSession.js`, `setScore.js`, `setFindings.js` plus additive set-summary metadata. Set lifecycle owns analyzer/tracker sequence; explicit finish is idempotent; pause keeps counts but interrupts open attempts; next-set resets counters/session UIDs while external calibration may remain. Arm-change finalization requires visible UI consent.
- `curl-score-1.0.0`: per analyzed rep100−50 per distinct assessed live issue type, floor0; rounded set mean excludes partial/unanalyzed reps. Requires scored rule, ≥3 analyzed reps and ≥0.5 analyzed/completed. No validated rules means unavailable in production; review experimental. Inputs/formula/denominators retained.
- Shared tracker form intervals now require all persistent features finite with validity=true; per-rule invalid flags discard evidence/suspend episodes. Conservative across both live rules even if only one is enabled. Missing torso/arm evidence cannot earn clean-rep findings or a score. Counting remains unchanged curl-1.1.0.
- Findings are deterministic completion/tracking/assessed-rule facts and one prioritized improvement focus. An attempt closed solely by Finish is separately counted and excluded from tracking-loss improvement.
- User reports good/bad-form curl recordings available; independent labeling/review and false-cue measurement pending. Rules still disabled/unvalidated. Thresholds remain tuned from one participant; Sprint3 annotated-counting exit evidence pending.
- Independent review found and fixed missing-feature coverage manufacturing analyzed reps/100 scores. Lesson: test measurement validity through final summary/score, not merely episode suspension. Knowledge writeback: lead from s4-exercises/review; no acceptance or agent retirement.

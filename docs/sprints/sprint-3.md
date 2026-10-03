# Sprint 3 — Dumbbell Curl Analyzer (requirements)

Source: `GymBud_Sprint_03_Dumbbell_Curl_Analyzer.docx`, attached by Ajay and copied from `~/Downloads/GymBud_Master_and_Sprints_01-12/` (2026-10-03). Text below is the document's content, reformatted as Markdown. Status, evidence and handoff live in `sprint-3-STATUS.md`.

Two week working plan with backlog implementation and review criteria.

Count complete dumbbell curls through an explicit movement state machine and generate reliable per-rep measurements without counting jitter or incomplete attempts.

Dates and owners are assigned at sprint planning. Proposed acceptance targets are reviewed before implementation and are not claims of measured performance.

## Entry requirements

Sprint 2 supplies calibrated, timestamped features with validity flags. The team has manually annotated complete curls, partial movements, pauses, and tracking-loss examples.

## Sprint scope

Support one selected arm in the documented view. Build the analyzer interface, exercise registry, phase detection, counting, and rep metrics. Generate candidate issues for Sprint 4, but prioritize correct counting over a large rule catalog.

## Sprint backlog

### GB 301 Analyzer interface

As a developer, I can add exercises through a consistent analyzer contract.

Acceptance criteria: The curl analyzer consumes FeatureFrames and returns phase, unique rep events, metrics, and candidate issues. State resets on exercise change, side change, and session restart.

### GB 302 Curl phases

As a user, I can see my current movement phase.

Acceptance criteria: Bottom, lifting, top, and lowering states use configurable thresholds and hysteresis. Invalid tracking pauses analysis and cannot advance a phase from an unreliable observation.

### GB 303 Complete rep counting

As a user, I want completed curls counted once.

Acceptance criteria: A rep requires the agreed bottom-to-top-to-bottom sequence, sufficient excursion, and valid observation time. Small oscillations, partial attempts, and duplicate frames do not add repetitions.

### GB 304 Rep summary

As a user, I can review what GymBud measured for each rep.

Acceptance criteria: Completed reps contain duration, angular extrema, ROM, tracking coverage, and detector configuration version. Interrupted attempts are distinguishable from analyzed completed reps.

## Implementation and sprint review

### Technical plan

- **State machine:** Use calibrated bottom and top ranges with separate entry and exit boundaries. Track movement direction over time rather than trusting one angle difference. Add minimum phase duration and an explicit timeout for prolonged pauses.
- **Rep lifecycle:** Create an attempt ID at a valid start and a completion event only after the full sequence. Keep completed rep IDs in session state so repeated processing cannot increment the count twice. Reacquisition begins from a safe start state.
- **Metric aggregation:** Accumulate extrema, valid observation duration, upper-arm movement, and torso deviation during the rep. Compute ROM from the angular span. Keep invalid intervals visible in coverage rather than filling them with guessed measurements.
- **Rules and extension points:** Separate rep eligibility from form quality. A completed curl can have a detected issue. Configure observable torso movement, forward arm drift, and calibrated ROM rules; lateral flare requires a supported view and may remain deferred.

### Verification checklist

- Replay annotated full curls, partial curls, bottom-position jitter, and slow or fast sequences.
- Pause at the top and halfway down; verify the timeout and resumption rules.
- Lose tracking mid-rep, switch selected sides, restart the session, and verify reset behavior.
- Process duplicate or out-of-order timestamps and confirm no extra completion event.
- Compare count, boundaries, ROM, and duration against manual annotations on three reviewed recordings.

### Exit criteria

Proposed counting target: no more than one count error per 20 manually labeled full curls in each of three recordings from the supported view. Partial-motion and jitter fixtures must produce zero false completions. Record eligibility rules and failures alongside results.

### Sprint review demonstration

Perform five complete curls, two partial attempts, a pause, and a tracking interruption. Show the phase transition, one completion per valid curl, and the stored per-rep summary in local session state.

### Risks and scope decisions

Fixed angle thresholds may exclude a user with a different comfortable range. Use calibration and record limitations before broadening support. Bilateral synchronization, automatic recognition, and cloud persistence remain later work.

### Handoff and review record

Deliver the analyzer contract, rep-event schema, reviewed recordings, configuration values, and candidate issue definitions to Sprint 4.

Review record: completed tickets, reviewer, evidence, results, defects, and carryover. Retrospective: one improvement, owner, and check date. Apply the master Definition of Done.

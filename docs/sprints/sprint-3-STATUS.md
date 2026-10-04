# Sprint 03 — Dumbbell curl analyzer

Status: complete (Ajay accepted the live demo on 2026-10-03; the annotated three-recording counting target is carried over)
Last updated: 2026-10-03

## Scope and acceptance criteria

- User-supplied requirements: `docs/sprints/sprint-3.md` (GB 301 analyzer interface, GB 302 curl phases, GB 303 complete rep counting, GB 304 rep summary, verification checklist, exit criteria, review demo). Adopted from Ajay's attached `GymBud_Sprint_03_Dumbbell_Curl_Analyzer.docx` (Downloads copy, 2026-10-03).
- Proposed criteria awaiting clarification: the counting target (≤ 1 count error per 20 labeled full curls in each of three recordings) is the document's own proposal and needs three reviewed recordings that do not exist yet.
- Prerequisites and evidence:
  - Sprint 2 is user-accepted and supplies `FeatureFrame` 1.0.0 with validity flags (`docs/sprints/sprint-02.md`).
  - Entry requirement gap: no manually annotated curls, partial movements, pauses or tracking-loss examples exist in the repository. This sprint uses labeled synthetic fixtures for logic and a live review with Ajay; the annotated-recording comparison stays open until recordings are supplied. Recording requires opt-in and is not added here.
  - Sprint 2 carryover adopted: no thresholding on single-frame velocity (use a windowed derivative); thresholds are unvalidated defaults; exact side-on can hide the elbow.
- Out of scope: speech and spoken/visual coaching cues (Sprint 4), persistence and backend changes (Sprint 5), bilateral sync, automatic recognition, lateral flare, recording/uploads, ML.

## Agent assignments and shared contracts

- Lead (this chat): contract, integration, sprint records, component file write-back, final handoff.
- `s3-exercises` (from `c-exercises`, plus `c-biomechanics` for one additive engine field): owns new `frontend/src/exercises/*` and the additive `engine.js` change below. Reports contract changes to the lead before changing them.
- `s3-workout-ui` (from `c-camera-ui`): owns `frontend/src/components/CameraView.jsx` and new `frontend/src/components/CurlPanel.jsx`. Wires the analyzer into the existing per-result loop and shows phase, count, per-rep summaries and interrupted attempts in local session state.
- `s3-validation` (from `c-validation`): owns new `frontend/tests/curl*.test.js` and `frontend/tests/fixtures/curl*.js`; labeled synthetic fixtures for every verification-checklist item; independent review of the analyzer and UI wiring. Reports defects to the lead/owner.

### Agreed analyzer contract (lead, 2026-10-03)

- `frontend/src/exercises/analyzer.js`: JSDoc typedefs for the contract and `createExerciseRegistry()` with `register(id, factory)`, `create(id, options)`, `list()`. Default registry registers `'dumbbell-curl'`.
- `frontend/src/exercises/curl.js`: `CURL_CONFIG` (frozen, `version: 'curl-1.0.0'`, every threshold documented as an unvalidated default) and `createCurlAnalyzer({ config })` returning:
  - `update(frame)` → `AnalyzerOutput` for one `FeatureFrame`.
  - `reset(reason)` → clears phase, the current attempt, completed reps and the count; used for exercise change, side change and session restart. Returns the reset output.
  - `getSession()` → `{ exerciseId, configVersion, featureVersion, side, completedReps, interruptedAttempts }` copies.
- `AnalyzerOutput`: `{ exerciseId, configVersion, timestampMs, phase: 'idle'|'bottom'|'lifting'|'top'|'lowering', paused: boolean, pauseReason: string|null, repCount, attempt: { id, startMs, phase } | null, events: RepEvent[] (new this frame only), live: { elbowFlexionDeg|null, directionDegS|null }, candidateIssues: CandidateIssue[] (open on the current attempt) }`.
- `RepEvent`: `{ type: 'rep-completed', id, rep: RepSummary }` or `{ type: 'attempt-interrupted', id, attempt: InterruptedAttempt }`. IDs are unique within a session and never re-emitted.
- `RepSummary`: `{ id, index (1-based), status: 'completed', side, view, startMs, topMs, endMs, durationMs, minFlexionDeg, maxFlexionDeg, romDeg, validObservedMs, coverage (0–1), maxAbsUpperArmDriftDeg, maxElbowDisplacement, maxAbsTorsoDeviationDeg, candidateIssues, configVersion, featureVersion, units }`. Missing measurements are `null`, never 0.
- `InterruptedAttempt`: `{ id, status: 'interrupted', reason: 'partial'|'tracking-loss'|'pause-timeout'|'low-coverage'|'reset', startMs, endMs, maxFlexionDeg, romDeg, coverage, candidateIssues, configVersion }`.
- `CandidateIssue`: `{ type: 'torso-swing'|'upper-arm-drift'|'incomplete-rom', startMs, endMs, peak, unit, configVersion }`. These are candidates for Sprint 4; nothing is spoken or shown as a correction this sprint.
- Phase rules: bottom/top use the calibration baseline elbow flexion plus separate entry/exit offsets (hysteresis); direction comes from a windowed derivative over a configured time span, not one frame; minimum phase durations; a pause timeout interrupts an attempt that stalls between bottom and top. A frame with `ready === false` pauses analysis and can never advance a phase. A frame inside the engine's dropout grace window (`dropout === true`) pauses but keeps the attempt (its time counts as invalid coverage); any other not-ready frame interrupts the current attempt with `tracking-loss` and analysis restarts from `idle`, which requires a valid bottom before a new attempt. Frames with a timestamp that is not later than the last processed one are ignored (no state change, no event).
- `engine.js` additive change: the calibration snapshot gains `baselineElbowFlexionDeg` (number when ready, otherwise null); `FEATURE_SCHEMA.version` becomes `1.1.0`.

## Progress and decisions

- 2026-10-03: requirements saved, status record and `s3-` agents created, contract above agreed before dependent work. The attached DOCX is identical in text to the Downloads copy (checked 2026-10-03).
- Decision: grace-window dropouts keep the attempt but count as uncovered time; longer losses interrupt it (master rule: no rep completes across tracking loss).
- Decision (2026-10-03, from s3-workout-ui gap report): recalibration does not reset the analyzer, so completed reps survive a tracking loss followed by recalibration. Only session stop/restart, side change and the Reset set button clear the set. The analyzer reads `baselineElbowFlexionDeg` from every frame, and not-ready frames during calibration interrupt any in-progress attempt.
- s3-workout-ui done (pending the recalibration change): CameraView calls `analyzer.update(frame)` on every frame; new `CurlPanel.jsx` shows phase, count, rep table, interrupted attempts and versions; `clearMeasurements` never resets the analyzer. Reset reason codes used: `session-restart`, `side-change`, `user-reset`. Lint, build and tests passed (85/85) in the agent's run; no browser run yet.
- s3-exercises done: `exercises/analyzer.js` (registry, typedefs, `defaultExerciseRegistry`), `exercises/curl.js` (`CURL_CONFIG` curl-1.0.0), `engine.js` calibration snapshot adds `baselineElbowFlexionDeg` and `FEATURE_SCHEMA` 1.1.0, guide `docs/curl-analyzer-sprint-03.md`. Config (unvalidated defaults, flexion offsets from baseline B): bottom enter 15 / exit 30, attempt ID at 45, top exit 65 / enter 80, minRom 60; least-squares direction over 200 ms (≥ 3 samples, ≥ 80 ms span, ±20 °/s); minimum phase times 100/150/50/150 ms; pause timeout 4 s, top hold timeout 10 s, max frame gap 500 ms; min coverage 0.8; torso-swing > 10° and upper-arm-drift > 20° for 250 ms.
- Contract additions accepted by the lead: `startLookbackMs` (500 ms; a rep starts at the lowest bottom frame before lift-off so extrema stay inside [start, end]); reset output carries `resetReason`; pause reasons are `tracking-dropout`, `tracking-loss`, `calibration-required`, `unsupported-view`; a frame whose side/view differs from the session auto-resets it. Attempts get an ID only past B+45, so boundary jitter never creates an attempt.
- s3-validation done: `tests/fixtures/curl-fixtures.js` (24 labelled seeded fixtures), `tests/curl-analyzer.test.js`, `tests/curl-pipeline.test.js`; 90/90 tests pass (synthetic). Review found 7 defects; lead routing (2026-10-03):
  - D1 (medium) stop/camera error/pagehide wiped completed reps → s3-workout-ui: reset only on Start, side change and Reset set; keep the summary visible after stop or error.
  - D2 stale/muted/render-loop loss leaves the analyzer showing an old phase → contract addition `interrupt(reason, timestampMs)` (reasons `tracking-loss`, `recalibration`), s3-exercises implements, s3-workout-ui calls it from `clearMeasurements` paths and `calibrate()`.
  - D3 slow tempo (< 20 °/s) never leaves bottom/top → s3-exercises: zone crossing past the commit angle (lifting) or below top exit (lowering) advances the phase without needing the slope; remaining tempo limits recorded.
  - D4 `pause-timeout` label wrong for lowering/top hold → s3-workout-ui.
  - D5 recalibration shown as tracking loss → solved by `interrupt('recalibration')`.
  - D6 coverage counts frame gaps up to 500 ms as observed → s3-exercises: only gaps up to a configured `coverageGapMs` count.
  - D7 IDs repeat across reloads → Sprint 5 carryover (needs UUIDs before persistence).
- s3-exercises fixes (2026-10-03): `interrupt(reason, timestampMs)` added (reasons `tracking-loss`, `recalibration`; keeps completed reps; clamps to the last timestamp); position past B+45 starts lifting and below B+65 starts lowering whatever the slope; `coverageGapMs: 150`. 90/90 tests, eslint clean. Accepted limitation: movement slower than 20 °/s for over 4 s still ends as `pause-timeout`; a progress-based stall rule is carryover.
- s3-workout-ui fixes (2026-10-03): `clearMeasurements` calls `analyzer.interrupt('tracking-loss')` (stale, mute, render-loop loss, stop, camera ended, error, pagehide); `calibrate()` calls `interrupt('recalibration')`; `analyzer.reset` only on camera start, side change and Reset set; completed reps stay visible after stop. CurlPanel labels fixed. Lint, build, 90/90 tests pass.
- Validation re-run found frame noise reset the slope-based stall timer (8 s noisy pause completed a rep). s3-exercises replaced it with a progress rule: `stallProgressDeg: 8` from an anchor flexion, timer also restarts on entering/leaving top. Steady slow curls (15 °/s) now complete; the earlier slow-tempo limitation is removed. Remaining limit: movement under ~2 °/s counts as a pause.
- R1 fix (2026-10-03): stall anchor and progress use the mean flexion of valid frames over `directionWindowMs`.
- Ajay live test (2026-10-03, left arm, Mac webcam via Chrome): he could not calibrate because pressing the button and returning to a side-on stance moved him during collection. Request: auto-calibration. Assigned to s3-workout-ui: a default-on "Auto-calibrate when I'm in position" toggle that starts calibration when uncalibrated, tracking active, orientation valid and elbow flexion ≤ 40° (rate-limited 1/s); the manual button stays.
- Auto-calibration added (s3-workout-ui): default-on toggle; starts collection when uncalibrated, tracking active, side-on valid and raw elbow flexion ≤ 40°, at most once per second; same path as the button (interrupt 'recalibration', keeps reps). Lint, build, 101/101 tests pass.
- Decision: upper-arm drift uses the absolute drift angle because forward direction is not derivable from a single side-on 2D view without a facing-direction estimate; labelled `upper-arm-drift`, direction not assessed.

## Validation and review evidence

- Lead run (2026-10-03, uncommitted working tree on `codex/initial-setup`): `npm test` 101/101 pass, `npx eslint .` clean, `npm run build` succeeds.
- Synthetic evidence only (seeded fixtures in `tests/fixtures/curl-fixtures.js`): every labelled fixture matches its expected completed count and interrupted reasons; partial, jitter and baseline-40 partial fixtures give zero false completions and jitter gives zero attempts; duplicate/out-of-order timestamps and full replay add nothing; not-ready frames never advance a phase; summary extrema lie inside [startMs, endMs]; grace dropout lowers coverage; 400 ms frame stall gives coverage 0.8–0.9.
- R1 (stall anchor reset by noise) fixed by windowed-mean anchor: over 20 seeds at 2° and 3° frame noise, an 8 s mid-rep pause completed 0/20 and timed out 20/20; a steady 15 °/s curl counted 20/20 (s3-exercises scratchpad check, synthetic).
- Independent review (s3-validation): D1–D6 and R1 fixed, no regressions found; D7 carried over.
- Live run 1 (2026-10-03, Ajay, left arm, Mac webcam via Chrome, after auto-calibration was added): panel showed 7 completed reps (durations 1.29–4.04 s, max flexion 100.8–135.4°, ROM 82.7–122.2°, coverage 100%) and 3 partial attempts (max flexion 77.5–82.7°); no pause-timeout or tracking-loss interrupts. Auto-calibration completed in position. Ajay's ground truth: rep 5 (100.8°) was a half curl counted in error; rep 6 (4.04 s) was the requested pause rep, correctly counted because movement resumed before the 4 s stall limit; he did not step out. Result: 1 false count in 7 under curl-1.0.0. Action: top zone raised to B+95/B+80 and minRom 80 as curl-1.1.0 (tuned from one participant, one session).
- Live run 2 (2026-10-03, Ajay, left arm, curl-1.1.0, auto-calibration): 9 completed reps at 100% coverage. Reps 1–5 peaked at 132–136° (ROM 116–127°, 1.8–2.1 s); reps 6–9 peaked at 112–119° (ROM 96–107°, 2.7–5.9 s, some with top holds). 3 partial attempts at 91–98° were rejected. Ajay confirmed all 9 counted reps were intended and the 3 rejected attempts were unwanted half curls: 0 count errors in 12 attempts in this run (one participant, not an annotated recording).
- curl-1.1.0 regression (s3-validation, synthetic): 106/106 tests, eslint clean. New fixtures shaped from live run 1 peaks (baselines 13/21°, half curls at 101°, full at 132°) and B+85 half curls: correct under 1.1.0; under the 1.0.0 thresholds they count every half curl, so they guard this defect. (Validation's report still listed R1 as open; that is stale, since R1 was fixed with the windowed-mean anchor and checked at 0/20.)
- Not run: browser/physical camera review; three annotated recordings and the ≤ 1 error per 20 curls comparison (recordings do not exist).

## Handoff

- Ticket status:
  - GB 301 analyzer interface: done.
  - GB 302 phases: done. Thresholds and hysteresis are configurable, and not-ready frames pause analysis.
  - GB 303 counting: done on synthetic fixtures and in two live runs.
  - GB 304 rep summary: done. Reps are kept in local session state.
- Sprint review demo (2026-10-03, Ajay):
  - Shown: full curls, partial attempts, a pause rep and per-rep summaries.
  - Not exercised live: a deliberate tracking interruption. It is covered by synthetic and pipeline tests.
- Exit criteria not met: three annotated recordings with ≤ 1 count error per 20 curls each. The recordings don't exist, so this is carried over. Partial and jitter fixtures give zero false completions (synthetic).
- Reviewer: `s3-validation`, the independent agent review. Defects D1–D6 and R1 were fixed; D7 is carried over.
- Carryover:
  - Rep IDs need a globally unique prefix before Sprint 5 persistence (D7).
  - The thresholds come from one participant.
  - Upper-arm drift is unsigned.
  - Lateral flare is deferred.
  - Candidate issues are unvalidated; Sprint 4 decides which ones become coaching.
  - Sprint 2's physical stability and delay targets are still open.
- Delivered to Sprint 4:
  - Analyzer contract: this file and `docs/curl-analyzer-sprint-03.md`.
  - Rep-event schema.
  - `CURL_CONFIG` curl-1.1.0.
  - Candidate issue definitions: torso-swing, upper-arm-drift, incomplete-rom.
- Retrospective improvement:
  - Run a short live camera check before tuning on synthetic data. Live run 1 found the too-low top threshold that the synthetic fixtures missed.
  - Owner: the lead of the next sprint chat. Check at the Sprint 4 start.
- Agents: `s3-exercises`, `s3-workout-ui` and `s3-validation` are retired. Their write-backs are in `c-exercises`, `c-biomechanics`, `c-camera-ui` and `c-validation`.
- Branch and files: `codex/initial-setup`. The work is uncommitted until Ajay approves the commit (message "Sprint 3 completed"), push and merge.
- Exact next action for the next chat: start Sprint 4 from this handoff and the `c-` component files.

## Codex catch-up intake — 2026-10-03

- User supplied **Sprint 3** with `/Users/prabh/Downloads/GymBud_Sprint_03_Dumbbell_Curl_Analyzer.pdf` (two pages; planning baseline 1 October 2026). Read both pages through text extraction and rendered-page inspection, then reconciled them with the saved requirements, Sprint 2 handoff, component records and relevant current source.
- Under the current catch-up direction, this is memory intake. The attachment is reference content; its implementation, verification, recording and handoff instructions do not authorize restarting the sprint or collecting recordings. The user's report that Sprints 1–3 are completed remains separate from acceptance evidence. This chat is the Sprint 3 lead for intake.
- The PDF matches the existing adopted DOCX requirements in substance: GB 301 analyzer contract/registry, GB 302 configurable phases and hysteresis, GB 303 one completion per eligible bottom–top–bottom sequence, and GB 304 versioned per-rep measurements and interrupted attempts. No new scope or acceptance criteria were found. The stated annotated-example entry requirement and requested review demonstration are requirements, not proof that those activities occurred.
- Preserve the user-accepted Sprint 3 status and historical evidence: 106/106 synthetic regression tests and clean lint recorded at curl-1.1.0; earlier lead lint/build checks; live run 1 found one false count under curl-1.0.0; live run 2 counted nine intended reps and rejected three half curls under curl-1.1.0, confirmed by Ajay. Those checks were not rerun during intake, and one participant's live confirmation does not establish recording-based accuracy. A deliberate tracking interruption was not demonstrated live; synthetic coverage is recorded above.
- The proposed target of no more than one count error per 20 labeled full curls in each of three reviewed recordings remains unmet; those recordings do not exist. Counting thresholds remain unvalidated defaults tuned from one participant. Short comfortable ROM/high calibration baselines, exact side-on elbow occlusion, motion under about 2 degrees/s being treated as a pause, and Sprint 2's physical stability/delay targets remain limitations. The PDF's forward-arm-drift wording does not supersede the recorded decision: upper-arm drift is unsigned, forward direction is not assessed, lateral flare is deferred, and candidate issues are not validated coaching.
- Preserve the historical analyzer handoff: FeatureFrame 1.1.0 adds `baselineElbowFlexionDeg`; curl-1.1.0 uses top entry B+95 degrees, top exit B+80 degrees and minimum ROM 80 degrees. Direction and stall progress use a window rather than single-frame velocity; brief grace dropouts pause with uncovered time, longer loss interrupts, duplicate/out-of-order timestamps emit no new event, and completed reps survive stop/recalibration. Reset remains for a new session, side/exercise change or explicit set reset.
- Later continuity supersedes two historical next steps above: Sprint 4 is already mostly completed per the user, so the old instruction to start it is not a current work trigger. Sprint 3 D7 (IDs repeating across reloads) was resolved in Sprint 4, as recorded in `c-exercises`, `docs/sprints/sprint-4-STATUS.md` and the analyzer guide and corroborated in current source: rep/attempt IDs carry a per-session UID, recreated on reset, and `getSession()` includes `sessionId` and `view`. Do not reopen D7 or revert those additions; this read-only check is not new runtime validation.
- Intake changed only this status/handoff record. No application changes, tests, new acceptance evidence, agent reactivation, commits or publication occurred. Sprint 3 specialists remain retired and Sprint 4 specialists retain their existing status. Await an explicit request before resuming implementation or validation.

## Cursor catch-up intake — 2026-10-03

- This Cursor chat received **Sprint 3** with the same file, `/Users/prabh/Downloads/GymBud_Sprint_03_Dumbbell_Curl_Analyzer.pdf`. Both pages were extracted independently (title GymBud Sprint 3 Dumbbell Curl Analyzer; author GymBud Team; creator Microsoft Word; planning baseline 1 October 2026; created 2026-10-03).
- The PDF text matches the adopted requirements in `sprint-3.md` and the Codex catch-up above: GB 301 analyzer contract and registry, GB 302 configurable phases and hysteresis, GB 303 one completion per eligible bottom–top–bottom sequence, and GB 304 versioned per-rep measurements and interrupted attempts. The technical plan, verification checklist, proposed counting target, review demonstration, and later-work exclusions match. No new scope, acceptance criteria, or decisions.
- Under the current catch-up direction this is memory intake. The attachment does not authorize restarting Sprint 3, collecting recordings, or implementing. The user's report that Sprints 1–3 are completed stays separate from the user-accepted live demo and the unmet annotated-recording target above.
- Preserved evidence and limitations: the recorded 106/106 synthetic regression, earlier lint and build checks, live run 1 (one false count under curl-1.0.0), and live run 2 (nine intended reps and three rejected half curls under curl-1.1.0, confirmed by Ajay) were not rerun. A deliberate tracking interruption was covered by synthetic tests and was not shown in the live demo. The proposed target of no more than one count error per 20 labeled full curls in each of three reviewed recordings remains unmet. Counting thresholds remain unvalidated defaults tuned from one participant. Motion under about 2 °/s still counts as a pause. The PDF's forward-arm-drift wording stays subordinate to the recorded decision: upper-arm drift is unsigned, forward direction is not assessed, lateral flare is deferred, and candidate issues are not validated coaching.
- Later continuity, checked in current source and component records: Sprint 4 status records that good-form and bad-form curl videos have since been reported. Independent labeling and review are still pending, so that report does not satisfy this sprint's annotated counting target. `CURL_CONFIG` remains curl-1.1.0 (top entry B+95, top exit B+80, minimum ROM 80). `FEATURE_SCHEMA` is now 1.2.0; Sprint 3's `baselineElbowFlexionDeg` remains, and the schema stays at 1.2.0. Sprint 3 D7 is resolved in `c-exercises` and `frontend/src/exercises/curl.js`: rep and attempt IDs use `curl-<sessionUid>-<n>`, recreated on reset, and `getSession()` includes `sessionId` and `view`. Leave D7 closed.
- `s3-exercises`, `s3-workout-ui`, and `s3-validation` stay retired in `.claude/AGENT-MAP.md`. Sprint 4 specialists stay Active. Intake changed only this status record. No application changes, tests, new acceptance evidence, agent reactivation, commits, or publication. Await an explicit request before resuming implementation or validation.

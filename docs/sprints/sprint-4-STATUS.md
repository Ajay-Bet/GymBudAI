# Sprint 04 — Real-time form coaching

Status: original coaching and extension implemented, integrated and independently reviewed on automated evidence; recording, physical demo and live-audio acceptance remain pending (not complete)
Last updated: 2026-10-03

## Scope and acceptance criteria

- User-supplied requirements: `docs/sprints/sprint-4.md` (GB 401 persistent issue detection, GB 402 visual coaching, GB 403 speech control, GB 404 set summary, verification checklist, exit criteria, review demo). Adopted from Ajay's attached `GymBud_Sprint_04_Real_Time_Form_Coaching.pdf` (Downloads copy, 2026-10-03). Ajay's instruction for this sprint: continue all implementation and testing that can proceed, keep unsupported or unvalidated corrections disabled under the repository's rules, do not invent evidence or mark live validation complete without reviewed examples, avoid expanding into Sprint 5.
- Proposed criteria awaiting clarification:
  - Exit criterion "on at least three reviewed recordings, annotated sustained issues produce the intended cue within the configured persistence plus processing delay" needs reviewed recordings that do not exist.
  - The false-cue target must be chosen before review. Proposal (not adopted): at most 1 false spoken correction per minute of accepted-form curling, measured on the reviewed recordings.
- Prerequisites and evidence (checked 2026-10-03 against the repository, not taken from the handoff alone):
  - Sprint 3 counts curls and emits timestamped candidate issues: confirmed in `frontend/src/exercises/curl.js` (`curl-1.1.0`, `torso-swing`, `upper-arm-drift`, `incomplete-rom`). Baseline on `main` at `d710228`: `npm test` 106/106 pass, `npm run lint` clean, `npm run build` succeeds (lead run, 2026-10-03, Ajay's laptop).
  - **Entry requirement not met:** no reviewed examples of torso swing, forward arm drift or incomplete calibrated ROM exist in the repository or in Sprint 3 evidence (Sprint 3 handoff: "Candidate issues are unvalidated"). Codex's earlier report of missing reviewed recordings is confirmed. Consequence under the master rules ("Validate them with annotated examples before making coaching claims", "Withhold unsupported corrections"): every form rule ships disabled for users. The pipeline is built and tested so rules can be enabled per rule once evidence exists.
  - No partial Sprint 4 code from Codex exists in this checkout (clean tree, no stash, only `main` and `codex/initial-setup`, both at Sprint 3). Codex left only text extractions of the PDFs under `~/Documents/Codex/2026-10-03/work-on-sprint-4-in-this/work/`.
  - Upper-arm drift is unsigned (Sprint 3 decision): forward vs backward drift is not distinguished side-on, so the rule reports "upper-arm drift", not "forward arm drift".
- Out of scope: accounts, persistence, upload of summaries (Sprint 5); recording or annotation tooling (Sprint 7); wrist position and lateral flare (not observable from the supported side view); counting changes (`curl-1.1.0` unchanged).

## Agent assignments and shared contracts

- Lead (this chat): contract, integration, sprint records, component file write-back, final handoff.
- `s4-exercises` (from `c-exercises`): owns `frontend/src/exercises/*`. New `curlRules.js` (rule config and issue tracker) and `setSummary.js` (summary builder); globally unique rep IDs in `curl.js` (Sprint 3 D7).
- `s4-feedback` (from `c-feedback`): owns new `frontend/src/feedback/*`: `cues.js`, `scheduler.js`, `speech.js`.
- `s4-coaching-ui` (from `c-camera-ui`): owns `frontend/src/components/CameraView.jsx`, `CurlPanel.jsx`, new `CoachingPanel.jsx` and new `SetSummaryPanel.jsx`.
- `s4-validation` (from `c-validation`): owns `frontend/tests/**`: new `coaching-*.test.js` and `fixtures/coaching-*.js`; independent review of all Sprint 4 changes. Reports defects to the lead.

### Agreed coaching contract (lead, 2026-10-03)

All numbers are unvalidated engineering defaults. Times use frame timestamps (ms, the `FeatureFrame.timestampMs` clock), never frame counts.

**Rule configuration** — `frontend/src/exercises/curlRules.js` exports frozen `CURL_RULES_CONFIG` (`version: 'curl-rules-1.0.0'`) with one entry per issue:

| Field | torso-swing | upper-arm-drift | incomplete-rom |
|---|---|---|---|
| feature | \|`values.torsoDeviationDeg`\| | \|`values.upperArmDriftDeg`\| | ROM of a committed attempt that ended `partial` |
| supported view | side | side | side |
| baseline | calibration torso tilt (feature is already baseline-relative) | calibration upper-arm tilt (already relative) | calibration `baselineElbowFlexionDeg` (via analyzer) |
| onset | > 10° for ≥ 400 ms of continuous valid observation | > 20° for ≥ 400 ms | evaluated once when the analyzer emits `attempt-interrupted` with reason `partial` |
| release | ≤ 7° for ≥ 500 ms of continuous valid observation | ≤ 15° for ≥ 500 ms | instant episode (starts and ends at the attempt end) |
| cue text | "Keep your torso still" | "Keep your upper arm still at your side" | "Curl all the way up" |
| `enabled` | false | false | false |
| `validation` | 'unvalidated' | 'unvalidated' | 'unvalidated' |

Each rule also records `evidence: []` (references to reviewed examples; empty now). A rule may be set `enabled: true` only with reviewed evidence recorded in this file.

**Validity gate** (GB 401): a frame is assessable only when `frame.ready === true`, `frame.dropout !== true`, `frame.view === 'side'`, calibration is ready, the feature value is finite, and the analyzer output is not `paused`. On a non-assessable frame:
- pending onset evidence is discarded (an invalid gap cannot accumulate evidence);
- an open episode is *suspended*, not released, and release evidence is discarded (a gap cannot read as a resolved issue);
- if non-assessable time exceeds `maxSuspendMs` (500 ms), or the UI calls `interrupt()`, the open episode ends with `endReason: 'tracking-lost'` (or `'recalibration'`), never `'resolved'`.

**Issue tracker** — `createCurlIssueTracker({ config })` in `curlRules.js`:
- `update(frame, analyzerOutput)` → `IssueOutput { timestampMs, assessable, unavailableReason: null | 'tracking-dropout' | 'tracking-loss' | 'calibration-required' | 'unsupported-view' | 'recalibration', active: ActiveIssue[], events: IssueEvent[] }`.
- `ActiveIssue { type, episodeId, startMs, peak, unit: 'deg', state: 'active' | 'suspended', enabled, validation }`.
- `IssueEvent { type: 'issue-started' | 'issue-ended', episode: IssueEpisode }` (new this frame only; IDs never re-emitted).
- `IssueEpisode { id, type, startMs, endMs, peak, unit, endReason: 'resolved' | 'tracking-lost' | 'recalibration' | 'set-ended' | 'reset' | 'evaluated-at-attempt-end' | null, attemptIds: string[], rulesVersion, analyzerVersion, enabled, validation }`. One continuous episode is one event; `attemptIds` lists every committed attempt (by analyzer `attempt.id`) that overlapped it.
- `interrupt(reason, timestampMs)`, `end(timestampMs)` (session stop → open episodes end `'set-ended'`), `reset(reason)`, `getSession()` → `{ sessionId, rulesVersion, episodes, assessableIntervals: [{ startMs, endMs }], startedMs, lastMs }`.
- Episode IDs: `issue-<sessionUid>-<n>`; `sessionUid` comes from `crypto.randomUUID()` (fallback: time + random) so IDs are unique across reloads.

**Rep IDs** (Sprint 3 D7): `curl.js` rep and attempt IDs become `curl-<sessionUid>-<n>` with the same `sessionUid` scheme. Counting is unchanged, so `CURL_CONFIG.version` stays `curl-1.1.0`.

**Feedback** — `frontend/src/feedback/`:
- `cues.js`: frozen `FEEDBACK_CONFIG` (`version: 'feedback-1.0.0'`): `priority: ['torso-swing', 'upper-arm-drift', 'incomplete-rom']`, `globalCooldownMs: 4000`, `perIssueCooldownMs: 10000`, `maxQueueAgeMs: 1500`, `minCueDisplayMs: 1500`, `attemptEndCueDisplayMs: 3000`. Priority policy (explicit, not a clinical severity ranking): cues about the movement in progress come before cues about a finished attempt; torso swing before arm drift because torso movement also shifts the measured upper-arm angle, so correcting it first makes the arm cue more meaningful. Also the text for tracking/positioning states (`tracking-dropout`, `tracking-loss`, `calibration-required`, `unsupported-view`, `recalibration`, `no-validated-rules`).
- `scheduler.js`: `createFeedbackScheduler({ config, speech, mode })`, `mode` is `'validated-only'` (default: only `enabled` rules can cue) or `'review'` (developer opt-in: unvalidated rules cue too, every cue labelled "unvalidated rule"). `update({ timestampMs, issueOutput })` → `FeedbackState { mode, status: 'coaching' | 'watching' | 'unavailable' | 'off', primaryCue: Cue | null, tracking: { assessable, reason, text }, spokenCueId, cancelledSpeech }`. `Cue { id, issueType, episodeId, text, speechText, validation, sinceMs }`.
  - One primary cue: the highest-priority eligible active issue; shown for at least `minCueDisplayMs` to avoid flicker; an `incomplete-rom` cue shows for `attemptEndCueDisplayMs`.
  - Speech: at most one utterance speaking plus at most one queued. A queued cue is dropped when its episode ends, its issue is no longer eligible, or it is older than `maxQueueAgeMs`; a higher-priority eligible cue replaces a queued one. Per-issue cooldown from the last spoken cue of that type; global cooldown from the last spoken cue of any type. Cooldowns use elapsed timestamps, so they behave the same at any frame rate.
  - Cancellation: a non-assessable frame (tracking loss/dropout/unsupported view), `setMuted(true)`, `stop()` and `reset()` cancel current and queued speech. Text cues are unaffected by mute.
  - `getCueLog()` → `[{ cueId, issueType, episodeId, validation, mode, shownMs, spokenMs | null, suppressed: null | 'muted' | 'cooldown-issue' | 'cooldown-global' | 'speech-unavailable' | 'replaced' | 'stale' | 'cancelled' }]` for false-cue counting.
- `speech.js`: `createSpeechAdapter({ synthesis = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance })` → `{ available, prime(), speak({ id, text }) → boolean, cancel(), setMuted(bool), muted, setVolume(0..1), volume, speaking(), onEnd(callback) }`. `prime()` is called from a user gesture (Start camera) to satisfy autoplay rules. Unavailable speech returns `false` from `speak` and the UI says "Voice unavailable; cues are shown as text".

**Set summary** — `frontend/src/exercises/setSummary.js`: `buildSetSummary({ analyzerSession, issueSession, cueLog, mode, enabledRuleTypes, startedMs, endedMs })` → `SetSummary` (`schemaVersion: 'set-summary-1.0.0'`; the Sprint 5 workout payload candidate):
- `sessionId`, `exerciseId`, `side`, `view`, `analyzerVersion`, `featureVersion`, `rulesVersion`, `feedbackVersion`, `mode`, `assessedRuleTypes` (rules counted in this summary: enabled rules in `validated-only`, all rules in `review`).
- `completedReps`, `interruptedAttempts` (count plus counts by reason).
- `analyzedReps`: completed reps with assessable coverage ≥ 0.8 inside [startMs, endMs] **and** at least one assessed rule. With no assessed rule, `analyzedReps = 0` and `notAnalyzedReason = 'no-validated-rules'`.
- `issueBearingReps`: analyzed reps overlapped by at least one episode of an assessed rule, each rep counted once however many types or episodes overlap it. `noIssueReps = analyzedReps - issueBearingReps`; `noIssueFraction = noIssueReps / analyzedReps` or `null` when `analyzedReps === 0`, labelled "detector summary".
- `trackingCoverage { assessableMs, sessionMs, fraction }` over the session.
- `episodes` (all episodes, each with `assessed`), `episodeCountsByType`, `reps: [{ id, index, analyzed, formCoverage, issueTypes, episodeIds }]`, `cueLog`.
- Units named in a `units` map; missing values are `null`, never 0.

**UI** (`s4-coaching-ui`): per FeatureFrame, `analyzer.update` → `tracker.update(frame, output)` → `scheduler.update`. `clearMeasurements` also calls `tracker.interrupt('tracking-loss')` and cancels speech; `calibrate()` calls `tracker.interrupt('recalibration')`. Stop runs `tracker.end` and `scheduler.stop`, then shows the summary. Start camera primes speech and resets tracker/scheduler with the analyzer. `CoachingPanel.jsx` shows one primary cue in large readable text, the tracking state in a separate area, mute toggle, volume, speech availability, and a "Review unvalidated rules (developer)" toggle, off by default. `SetSummaryPanel.jsx` shows the summary with denominators, versions, "detector summary" label and a "Copy summary JSON" button for evidence. Text never depends on speech. No frames leave the device.

## Progress and decisions

- 2026-10-03: Ajay restarted Sprint 4 on his laptop in `/Users/prabh/GymBud_/GymBudAI`. Lead confirmed Git root, `CLAUDE.md`, `AGENTS.md`, clean `main` at `d710228`, found the Sprint 4 PDF in Downloads, ran the baseline checks, created branch `sprint-4`, saved requirements, and agreed the contract above before dependent work.
- Decision: all form rules ship `enabled: false` because the entry requirement (reviewed examples) is not met. The default `validated-only` mode therefore shows tracking guidance and "Form coaching off: no rule has been validated yet", and the summary reports `analyzedReps = 0` with that reason. A developer-only `review` mode, off by default and labelled on every cue, exercises the full cue and speech pipeline so reviewed recordings can be evaluated against it. This mode is not user coaching and makes no accuracy claim.
- Decision: rep IDs become globally unique now (Sprint 3 D7), because GB 404 needs unique rep and event IDs in the summary.

- s4-exercises done (2026-10-03): `curlRules.js` (`CURL_RULES_CONFIG` curl-rules-1.0.0, `createCurlIssueTracker`, `curlUnavailableReason`), `setSummary.js` (`buildSetSummary`, `SET_SUMMARY_CONFIG` set-summary-1.0.0), `ids.js` (`createSessionUid`); `curl.js` IDs now `curl-<uuid>-<n>` (D7 resolved), `getSession()` adds `sessionId` and `view`; counting unchanged. Synthetic checks only. Contract additions accepted by the lead:
  - `maxEvidenceGapMs: 150` (matches `coverageGapMs`): a longer gap between assessable frames breaks continuous evidence, so two sparse frames cannot satisfy 400 ms persistence. Consequence: no persistence below about 7 fps.
  - End times: `resolved` ends at the first frame of the release run; other end reasons at the episode's last assessable frame.
  - Summary input `feedbackVersion`; output adds `analyzerSessionId`, `startedMs`, `endedMs`, `noIssueFractionLabel`, `minFormCoverage`, per-rep `startMs`/`endMs`/`issueBearing`; `interruptedAttempts = { total, byReason }`; `episodeCountsByType` counts assessed episodes only.
  - Attempt IDs reach episodes by time overlap when the attempt ends. Known limit: an attempt ended by `analyzer.interrupt()`/`reset()` reaches only episodes open while it was committed.
- s4-feedback done (2026-10-03): `feedback/cues.js` (`FEEDBACK_CONFIG` feedback-1.0.0, `PRIORITY_POLICY`, cue catalog, tracking texts), `speech.js` (`createSpeechAdapter`), `scheduler.js` (`createFeedbackScheduler`). Checked with a fake speech engine at 15/30/60 fps (identical decisions); no real-browser speech test yet. Contract additions accepted by the lead:
  - `maxSpeechMs: 8000` safety timeout when a browser never fires the end event.
  - `createFeedbackScheduler({ ..., enabledRuleTypes })` so it can show "Form coaching off" when no rule is enabled; per-cue eligibility still comes from each issue's `enabled` flag.
  - `tracking.reason` may also be `'no-validated-rules'` or `'stopped'`; `Cue.label = 'unvalidated rule'` when not validated; `getState()`, `mode` and `muted` getters.
  - Speech is decided once per cue when it becomes primary; a cue held back by a cooldown stays as text and is not retried. Mode change also cancels speech.
- s4-coaching-ui done (2026-10-03): `CameraView.jsx` wires analyzer → tracker → scheduler per FeatureFrame; `clearMeasurements` interrupts the tracker (`tracking-loss`) and cancels speech; calibration interrupts with `recalibration`; Stop/camera ended/pose error/pagehide run `tracker.end` and `scheduler.stop` before releasing the session, then build the summary; Start primes speech inside the click; reset paths reset all three. New `CoachingPanel.jsx` (one cue, aria-live, separate tracking box, mute, volume, voice availability, review toggle) and `SetSummaryPanel.jsx` (denominators, coverage, versions, detector-summary label, Copy JSON). Decisions accepted: review mode can only change while the camera is stopped (one mode per summary); pagehide ends the set like Stop; mute and volume disabled when speech is unavailable. Headless Chrome check with a fake camera (no person): paused/calibrate-first state, empty summary with the no-validated-rules note, no new console errors. Known gap: attempts ended by `analyzer.interrupt()` are not passed to the tracker, so their IDs can be missing from `attemptIds` (denominators unaffected).
- s4-validation done (2026-10-03): `tests/fixtures/coaching-fixtures.js`, `tests/fixtures/coaching-speech-fake.js`, `coaching-{rules,scheduler,speech,summary}.test.js` (61 new tests). Independent review found six non-blocking defects; lead routing (2026-10-03):
  - D1 (medium) below about 7 fps no correction can start but the UI says "Analysis active" → s4-exercises: median valid-frame interval over ~1 s above `maxEvidenceGapMs` makes frames non-assessable with new `unavailableReason: 'low-frame-rate'`; s4-feedback adds its text; s4-coaching-ui shows it.
  - D2 (low) a higher-priority cue waits up to `minCueDisplayMs` to replace a shown cue; a cooldown-suppressed cue is not retried → accepted design, documented in `cues.js`.
  - D3 (low) a single dropout re-cues the same episode with a new cue ID, inflating the cue log → s4-feedback: one cue identity and log entry per episode (`reshownCount`), no repeat speech request.
  - D4 (low) a browser speech error still consumes cooldowns → s4-feedback: roll back.
  - D5 (low) `notAnalyzedReason` never explains low coverage or no reps; unassessed episodes hidden in the panel → s4-exercises (`no-completed-reps`, `low-coverage`, `unassessedEpisodeCountsByType`) and s4-coaching-ui.
  - D6 (low) StrictMode leaks a scheduler `onEnd` subscription; speech continues in a hidden tab; `'stopped'` text falls back to "Tracking lost" → s4-coaching-ui and s4-feedback.
  - UI gap from s4-coaching-ui: analyzer interrupt events now passed to `tracker.interrupt(reason, timestampMs, analyzerEvents)` (s4-exercises, s4-coaching-ui).
- Review fixes landed (2026-10-03):
  - s4-exercises: `'low-frame-rate'` gate (`frameRateWindowMs: 1000`; lower median of valid frame gaps above `maxEvidenceGapMs` with at least 2 gaps; one long stall does not switch it); `tracker.interrupt(reason, timestampMs, analyzerEvents)` and `tracker.end(timestampMs, analyzerEvents)` attach interrupted attempt IDs; `notAnalyzedReason` ∈ `no-validated-rules`, `no-completed-reps`, `low-coverage`, null (that precedence); `unassessedEpisodeCountsByType`.
  - s4-feedback: one cue ID and log entry per episode with `reshownCount`, a reshown cue is not spoken again; a speech error rolls back both cooldowns (a cancellation does not); texts for `'stopped'` ("Session stopped") and `'low-frame-rate'`; design notes D2 recorded in `cues.js`.
  - s4-coaching-ui: analyzer interrupt events passed to the tracker on tracking loss, recalibration and session end (attempt closed before `tracker.end`, so episodes end `'set-ended'`); per-scheduler speech wrapper unsubscribed on effect cleanup (StrictMode); speech cancelled when the page is hidden; tracking text always from `getTrackingText`; summary shows the new reasons and unassessed episodes.
  - After the fixes: lint clean; `npm test` 166/167, the one failure being the old validation test that did not list `'low-frame-rate'` (handed back to s4-validation).

## Validation and review evidence

- Baseline (lead, `main` `d710228`, 2026-10-03): `npm ci`, `npm test` 106/106, `npm run lint` clean, `npm run build` ok.
- s4-validation run (synthetic, before the D1–D6 fixes): `npm test` 167/167, `npm run lint` clean. Spikes up to 380 ms: 0 episodes over 20 seeds × 15/30/60 fps; 1–3° noise: 0 episodes in 180 streams. Onset latency for the 400 ms rule (min/max ms): 400/476 at 15 fps, 400/438 at 30, 400/419 at 60 (n=220 each); release latency for the 500 ms rule 501/577, 500/539, 500/518. Cooldown spoken sequence identical in 60/60 runs across fps and seeds. Two simultaneous issues: only the torso cue spoken (15/15), both episodes kept. Sustained issue detected 0/10 at 5–6 fps, 10/10 at 8–10 fps (documented limit). Mutation check: five deliberately broken gates in a scratch copy were all caught.

- s4-validation re-run after the D1–D6 fixes (synthetic): `npm test` 178/178, `npm run lint` clean. Low frame rate: 5 and 6 fps opened 0/10 episodes and reported `'low-frame-rate'` on every post-warm-up frame; 8 and 10 fps opened 10/10. A single 400 ms gap at 30 fps never switched the state. D3: chattering dropouts every 300 ms over a 5 s episode gave one cue-log entry and one speak. D4 rollback and the no-rollback-on-cancel case verified. Text state identical frame for frame with speech absent vs muted. Re-review: D1–D6 fixed, no master-rule violation; new low findings: dead `scheduler.dispose?.()` call in CameraView (routed to s4-coaching-ui), a cue cut off by a one-frame dropout stays text-only for that episode (documented), only `reset()` revives a tracker after `end()` (documented).
- Lead final run (2026-10-03, branch `sprint-4`, uncommitted, after the dead `dispose` call was removed): `npm test` 178/178, `npm run lint` clean, `npm run build` succeeds; all rules confirmed `enabled: false` in `curlRules.js`.
- Reviewed examples and acceptance evidence: none. No reviewed recordings exist; no detection-accuracy, false-cue or live-speech evidence has been collected.
- Checks not run: real browser speech (Chrome/Safari/iOS); live camera session with a person; component/DOM tests of the panels.

## Handoff

- Ticket status:
  - GB 401 persistent issue detection: implemented and tested on synthetic streams (validity gate, persistence and release on elapsed time, suspension not release on gaps, low-frame-rate abstention). Not validated on reviewed examples, so every rule stays disabled.
  - GB 402 visual coaching: implemented. One primary cue with readable text, separate tracking box, text for every voice cue. Headless Chrome check with a fake camera only.
  - GB 403 speech control: implemented and tested with a fake speech engine (cooldowns identical at 15/30/60 fps, priority replacement, stale drop, cancel on mute, stop, tracking loss, mode change, page hide). Not yet heard in a real browser.
  - GB 404 set summary: implemented and tested (completed, analyzed, issue-bearing reps, tracking coverage, one episode per event, overlap counted once, unique IDs, versions, not-analyzed reasons).
- Not met:
  - Entry requirement and exit criterion: reviewed recordings with annotated torso swing, arm drift, incomplete ROM and accepted-form examples. Without them no rule is enabled, false cues per minute are unmeasured, and the false-cue target is still to be chosen (proposal above, not adopted).
  - Sprint review demo with Ajay (curl set with deviations, mute, leave the view, final summary). In the default mode it can show tracking abstention, mute and the summary; persistence and cooldown cues show only in developer review mode, labelled unvalidated.
- Reviewer: `s4-validation`, independent agent review, two rounds. D1–D6 fixed.
- Carryover:
  - Reviewed recordings (at least three) and a chosen false-cue target before enabling any rule. Recording tooling is Sprint 7; until then the evidence must come from reviewed screen recordings with the Copy summary JSON output and cue log.
  - Real-browser speech check (Chrome, Safari, iOS) and a live session with a person.
  - Component/DOM tests for CameraView and the coaching panels.
  - Below about 7 fps no form analysis (reported as `low-frame-rate`); real-device frame rates unmeasured.
  - Sprint 3 carryover still open: annotated 20-curl counting recordings; thresholds from one participant.
- Delivered to Sprint 5: cue configuration (`feedback-1.0.0`, `docs/coaching-sprint-04.md`), issue event schema (`IssueEpisode`), summary definitions (`set-summary-1.0.0`, the workout payload candidate), globally unique rep and episode IDs (Sprint 3 D7 resolved). False-cue results: none yet (no reviewed recordings).
- Retrospective improvement: agree each module's full field names in the contract before parallel work, because most contract additions this sprint were naming gaps. Owner: the lead of the next sprint chat. Check at the Sprint 5 start.
- Component write-back: done in `c-exercises`, `c-feedback`, `c-camera-ui`, `c-validation` (2026-10-03). `s4-` agents stay active until the sprint closes.
- Branch and files: local branch `sprint-4` from `main` `d710228`, all changes uncommitted until Ajay approves the commit (message "Sprint 4 completed" only once the sprint is accepted; otherwise a work-in-progress message he chooses), push and merge. No AI co-author lines.
- Exact next action: Ajay runs a live session (`npm run dev` in `frontend/`, Start camera, calibrate, curl, mute, step out, Stop) to check speech and the summary in his browser, and decides on commit/merge. Then collect at least three reviewed recordings to evaluate rules in review mode.

## Sprint 4 extension (Ajay, 2026-10-04)

Ajay's request (2026-10-04, this thread), adopted as an extension of Sprint 4, curls only: (1) friendlier, actionable trainer feedback, with a rule/measurement audit and no invented observations, plus optional OpenAI wording grounded in deterministic results; (2) explicit output preference Text / Audio + text, natural OpenAI TTS voice with local fallbacks, caching, AI-voice disclosure, cost and latency notes; (3) faster calibration, measured before and after, without removing reliability checks; (4) explicit set lifecycle with Finish set; (5) end-of-set feedback and a transparent detector-based score (unavailable when unsupported); (6) OpenAI only through the backend with the key in local secret config; (7) tests (finalization, scoring, output modes, grounding, API failure, panel interactions), review, docs, setup steps and commit approval. Recording validation, the false-cue target, Sprint 3 counting evidence and real Chrome/Safari audio checks stay pending until actually done.

Scope change from the original Sprint 4 plan: the PDF's scope had no end-of-set score, set lifecycle, cloud voice or LLM wording, and no backend work. These are added at Ajay's request. The backend gains two coaching proxy endpoints only. There are no accounts or persistence, which remain Sprint 5.

### Extension contract (lead, 2026-10-04)

All values are unvalidated defaults.

**Lead-owned changes:**
- `frontend/package.json`: pinned dev dependencies `vitest@5.0.3`, `jsdom@30.1.1`, `@testing-library/react@16.3.3` and `@testing-library/dom@10.4.2`. `npm test` now runs the `node --test` suites and then `vitest run --environment jsdom tests/ui` (panel tests in `frontend/tests/ui/*.test.jsx`). `npm run test:ui` runs the UI tests alone.
- `vite.config.js`: dev proxy `/api/coach` → `127.0.0.1:8080`.

**Rule audit (lead):**
- Measured features (side view): elbow flexion, giving ROM and phase; torso deviation from the calibrated tilt; unsigned upper-arm drift from the calibrated tilt; elbow displacement; rep duration.
- Candidate rules: torso-swing (live), upper-arm-drift (live) and incomplete-rom (partial attempt, end of attempt). All three are disabled because no reviewed evidence exists.
- The "two cues" Ajay saw are the two live rules, visible only in developer review mode. Incomplete ROM appears only for a committed attempt that is not counted.
- Not observable side-on with generic landmarks: wrist position or rotation, grip, load, muscle activation, lateral elbow flare.
- Observable but without a rule or evidence: lowering tempo (eccentric speed) and top-of-rep shoulder shrug. They are not added: Ajay's condition is reviewed evidence, and none exists.
- Coverage therefore stays at three disabled candidate rules. Wording improves; detection does not change.

**Set lifecycle** — `frontend/src/exercises/setSession.js` (s4-exercises), pure:
- `createCurlSet({ analyzer, tracker })` takes the instances. Its state is `'calibrating' | 'active' | 'paused' | 'finished'`:
  - `'calibrating'`: no ready frame yet.
  - `'active'`: once a ready frame arrives.
  - `'paused'`: after `pause(reason, t)`, used when the camera is stopped. Counters are kept; ready frames resume it.
  - `'finished'`: after `finish(t, extras)`.
- `update(frame)` → `{ state, analyzerOutput, issueOutput }`. It ignores frames once finished.
- `interrupt(reason, t)` forwards the analyzer interrupt events to the tracker.
- `finish(t, { cueLog, mode, enabledRuleTypes, feedbackVersion })`:
  - Closes the attempt, ends the tracker and builds the summary and score exactly once.
  - Returns `{ summary, score, findings, alreadyFinished: false }`. Later calls return the same objects with `alreadyFinished: true`.
  - Each set has a unique `setId` (`set-<uid>`) and `index`.
- `startNext()` creates fresh counters through `analyzer.reset('next-set')` and `tracker.reset('next-set')` and keeps calibration.
- `getState()`.

Decisions:
- Stopping the camera pauses an active set and does not finish it. The UI says "Set paused — camera off".
- Changing the arm finishes the current set if it has any reps or attempts, otherwise resets it.
- Leaving the page discards the unfinished local set, as before; nothing persists.

**Score** — `frontend/src/exercises/setScore.js` (s4-exercises), pure: `scoreSet(summary)`, version `curl-score-1.0.0`.
- Form-only. Completion counts are reported separately and never feed the score.
- Rep score = 100 − Σ penalty over the distinct assessed live issue types present on that analyzed rep, floored at 0. Penalties: torso-swing 50, upper-arm-drift 50. Each type counts once per rep however many episodes overlap it.
- Set score = round(mean rep score over analyzed reps).
- It is available only when all of these hold:
  - at least one rule is assessed;
  - `analyzedReps >= 3`;
  - `analyzedReps / completedReps >= 0.5`.
- Otherwise it returns `{ available: false, reason }`, where reason is one of `no-validated-rules`, `no-completed-reps`, `too-few-analyzed-reps`, `low-coverage`.
- Review-mode scores carry `experimental: true`. Every score carries `label: 'GymBud detector-based summary, not a clinical or injury-risk assessment'`, plus `formula`, `inputs` and `version`.
- Partial attempts never enter the score, and missing observations never count as good form.

**Findings** — `frontend/src/exercises/setFindings.js` (s4-exercises), pure: `buildSetFindings(summary, score)` → `{ strengths: Finding[], improvements: Finding[], focus: Finding | null }`, with `Finding = { code, values }`. Only facts the data supports:
- **Strengths, each with a condition:**
  - `completed-reps` (completedReps ≥ 1): a completion fact, not form.
  - `steady-tracking` (coverage ≥ 0.9).
  - `clean-reps-<type>`: only for an assessed rule with analyzed reps, counting the reps without that type.
  - `full-range-completed`: every completed rep reached the calibrated top zone (true by definition of a completed rep). Worded as "every counted rep reached the top", not as form praise.
- **Improvements:**
  - `issue-<type>` for assessed issues, with the rep count.
  - `partial-attempts`: committed attempts that ended `partial` were not counted. This is a counting fact.
  - `low-tracking`: coverage < 0.8.
  - `tracking-interruptions`: tracking-loss attempts.
- **Focus:** one item. The first improvement by priority (assessed issues in `PRIORITY_POLICY` order, then partial attempts, then tracking), else null.
- No strength is ever produced from absent rules or missing tracking.

**Feedback wording and output** (s4-feedback):
- `cues.js` gains `FEEDBACK_CONFIG` `feedback-1.1.0`, with friendlier live cue text (≤ 60 characters on screen, ≤ 6 words spoken). For example torso: "Keep your chest tall and still" / "Chest tall and still".
- New `setFeedbackText.js`: `describeSetFeedback(findings, score, summary)` → deterministic `{ headline, strengths[], improvements[], focus, narration }`. It is friendly and specific and states only the values in the findings. The narration is ≤ 3 sentences.
- New `outputPreference.js`: `OUTPUT_MODES = ['text', 'audio-text']`. The default is `'text'` (no audio until the user opts in). Stored in `localStorage` with try/catch.
- New `voice.js`: `createVoice({ outputMode, speech (browser adapter), aiTts (client), cache })` → `{ speakCue(cue), speakNarration(text), stop(), setMuted, setVolume, setOutputMode, disclosure }`. Behaviour:
  - In `'text'` mode it never calls speech or TTS.
  - A live cue plays cached AI audio when available. Otherwise it plays the browser voice immediately and fetches AI audio in the background for next time.
  - Narration waits until no live cue is speaking, uses AI audio with a 6 s timeout, then falls back to the browser voice, then to text only.
  - There is one audio channel: starting anything cancels what was playing.
  - `stop()`, mute, tracking loss, a hidden tab and a mode change cancel both the audio element and browser speech.
  - `disclosure` is "Voice is AI-generated (OpenAI)" whenever AI audio is used.
  - The scheduler's cue speech goes through this (the scheduler keeps priority, cooldowns and queue).
- New `wording.js`: `requestAiWording(facts, { client, timeoutMs: 4000 })` → validated text or `null`. `validateAiWording(output, facts)` rejects the output when:
  - list counts differ from the findings;
  - any number does not appear in the facts;
  - it uses forbidden terms (grip, wrist, muscle, activation, load, weight, heavy, injury, pain, risk, clinical, posture score, perfect, flawless);
  - a field is too long (headline ≤ 80 characters, items ≤ 160, narration ≤ 400).
  On rejection the deterministic text is used. Both AI wording and AI voice are optional; with no backend key everything works locally.

**Backend** (s4-backend, `backend/**` plus `frontend/src/api/coach.js`):
- `GET /api/coach/status` → `{ tts: bool, wording: bool }`. These say whether a key is configured; the key is never returned.
- `POST /api/coach/tts` takes `{ text (1–300 characters), purpose: 'cue' | 'narration' }` and returns `audio/mpeg`. It uses model `OPENAI_TTS_MODEL` (default `gpt-4o-mini-tts`), voice `OPENAI_TTS_VOICE` (default `marin`) and fixed instructions for a friendly, clear trainer voice. There is an in-memory LRU cache (128 entries) keyed by model, voice, instructions and text.
- `POST /api/coach/wording` takes structured findings validated by Pydantic: only codes, numbers and the score, never frames or free text from the client. It calls the Responses API with `OPENAI_TEXT_MODEL` (default `gpt-6-luna`) and a JSON schema output, validates the result server-side with the same rules, and returns 422 or 503 on failure.
- Common rules:
  - Timeouts: 10 s for TTS, 8 s for wording. One retry is not allowed for TTS. Request bodies are capped.
  - A simple per-process rate limit: 30 TTS and 10 wording requests per minute.
  - The key never appears in logs.
  - Configuration lives in `backend/.env` (gitignored), with `backend/.env.example` holding placeholders. With no key both endpoints return 503 `{ detail: 'not-configured' }`.
  - Tests use pytest with a mocked OpenAI transport; no network.
- `frontend/src/api/coach.js`: `getCoachStatus()`, `fetchTts(text, purpose, { signal })` → Blob, `fetchWording(facts, { signal })`. It uses `fetch` with AbortController timeouts and never sends frames.

**Calibration** (s4-biomechanics, `frontend/src/biomechanics/engine.js`):
- First measure the current time-to-ready on seeded noisy replays at 15, 30 and 60 fps, plus a reset-cause breakdown.
- Then reduce unnecessary waiting while keeping the requirements: `calibrationMs` 1000 of stable valid observation, at least 8 frames, the same stability ranges, orientation and reliability gates. Candidate changes:
  - On instability, trim the window to the samples consistent with the newest sample rather than restarting from one sample.
  - Measure stability against a robust reference (median), not the first sample.
  - Keep the baseline through a tracking loss of up to `baselineHoldMs`, if the reposition check passes on reacquisition, instead of forcing recalibration.
- The calibration snapshot gains `blockedReason` (`'joints-not-visible:<joint>' | 'not-side-on' | 'moving' | 'arm-not-relaxed' | 'tracking-gap' | null`) and progress that never jumps backwards except on a real reset. `FEATURE_SCHEMA` becomes `1.2.0` (additive).
- Before/after numbers go in this record.

**UI** (s4-coaching-ui):
- Set state badge (Calibrating / Set active / Set paused — camera off / Set finished).
- Finish set button, enabled while a set has started.
- Start next set button.
- Output mode switch (Text / Audio + text) plus mute and volume. The AI voice toggle shows only when the backend reports TTS available, with the disclosure text.
- Calibration progress bar with the specific blocked instruction.
- End-of-set panel:
  - completed and analyzed reps, tracking coverage;
  - the score or "Form score unavailable" with its reason;
  - the experimental label in review mode;
  - strengths first, then improvements, then one focus;
  - "Improve wording with AI" only when available, labelled AI-worded.
  - In Audio + text mode it narrates once after the live cue ends, with Replay and Stop narration buttons.


## Codex catch-up intake — 2026-10-03

- User supplied **Sprint 4** with a pasted Claude-to-Codex takeover document. Preserved the full reference in [sprint-4-takeover-reference.md](sprint-4-takeover-reference.md), sourced from `/Users/prabh/.codex/attachments/b2ab41af-151b-4fe3-b146-7de9243548d1/Pasted text.txt`. This chat is the Sprint 4 lead for intake. Under the current user direction, the attachment's instruction to complete implementation is reference content; it does not independently resume the sprint. No implementation or specialist launch is authorized by this catch-up message.
- User-reported status remains: Sprints 1–3 completed, Sprint 4 mostly completed. Preserve the distinction between this progress report and acceptance evidence. The original Sprint 4 implementation has a historical lead result of 178/178 synthetic tests, clean lint and successful build plus two independent review rounds; these were not rerun here and do not establish the current extension's health. The extension contract and announced assignments are not proof of finished work.
- Read the master/project/workflow records, shared ownership maps, original Sprint 4 requirements, coaching guide, current Sprint 4 status and Sprint 3 handoff. Read-only Git/source inspection confirms substantial pre-existing uncommitted work. Extension lifecycle, scoring, findings, voice/output-preference, feedback-text and panel modules, backend coaching proxy/configuration/schemas/services and test files exist. Their presence does not prove correctness or integration. `CameraView.jsx` still uses the earlier direct analyzer/tracker/scheduler and browser-speech integration; it does not wire the new set lifecycle, output modes or extension panels. `frontend/src/biomechanics/engine.js` still publishes FeatureFrame 1.1.0, so the proposed 1.2.0 calibration changes and before/after timing evidence are not established.
- At intake, `frontend/src/api/coach.js`, `frontend/src/feedback/wording.js` and `frontend/tests/ui/` are absent. The package scripts include UI tooling with `--passWithNoTests`; tooling alone is not evidence of panel tests. Existing backend and extension test files were not executed or independently reviewed in this chat. This is a bounded inventory for continuity, not an exhaustive implementation audit.
- The reference restates the recorded curls-only extension: grounded friendly cues; Text / Audio + text; optional backend OpenAI TTS/wording with local fallbacks and bounded caching; measured calibration improvements; explicit pause/finish/fresh-set lifecycle; deterministic eligible scoring and factual end-of-set feedback; server-only secrets; meaningful mocked/integration/panel tests and independent review. It emphasizes that any arm change which finalizes a set must be explicit and visible. Preserve this clarification for a future authorized continuation rather than treating the earlier automatic-finish contract as sufficient.
- Preserve the three-rule audit: torso swing and unsigned upper-arm drift are live candidate rules; incomplete ROM is evaluated only at the end of a committed partial attempt, explaining why only two live cues may appear. All rules remain unvalidated and disabled for production. No new rule is justified by cue variety. No enabled rules/no detected issues cannot support perfect-form claims or unsupported praise. Production scoring must remain unavailable without validation/eligibility; review scores must be clearly experimental. Optional wording cannot invent observations or change deterministic counts, measurements or scores.
- Proposed model/voice defaults (`gpt-4o-mini-tts`, `marin`, `gpt-6-luna`) occur in the saved contract/configuration. Their official API availability and compatibility were not verified during intake and must be checked before adoption in resumed implementation. No key configuration, API calls, paid provisioning or secret inspection occurred.
- Acceptance gaps remain: reviewed recordings for rule enablement (at least three), measured false corrections and an agreed target (at most one per minute is still only a proposal), Sprint 3 annotated counting evidence, a live camera demonstration, Chrome/Safari/iOS audio behavior, extension integration and current automated verification/review, calibration timing evidence, and final setup/demo documentation. Historical extension headings dated 2026-10-04 are preserved as recorded; this intake uses the user's current local date, 2026-10-03, without silently redating earlier history.
- Intake changed only this Sprint 4 status record and the saved reference. Preserved all unrelated local changes. No application edits, test runs, new acceptance evidence, component ownership changes, specialist retirement/reactivation, commits, pushes, merges or later-sprint work occurred. Sprint 4 specialist records remain Active; that is saved workflow status, not a claim that processes are running.
- Next action: await an explicit request to resume Sprint 4. When authorized, use the saved component/sprint briefs, agree contracts and one writer per file, verify current work rather than repeating the historical 178-test baseline, and complete the existing extension before seeking any required commit approval.


## Authorized Codex continuation — 2026-10-03

- User explicitly resumed implementation and adopted the saved takeover requirements. Complete extension implementation/integration, automated verification and independent review before requesting the repository-required commit approval. Preserve all existing work; no commit/push/merge approval has yet been given.
- User confirms good-form and bad-form curl videos have been recorded. Independent labeling/review is not established. Prior statements that recordings do not exist are historical; current acceptance status is recordings available per user, labeling/review and measured outcomes pending. Do not enable rules on this report alone. Real-browser audio checks remain pending.
- Current writer assignments: `ui` instantiates s4-coaching-ui/c-camera-ui for components and `frontend/tests/ui/*`; `backend` instantiates s4-backend/c-backend and c-frontend-app transport for backend, backend tests, frontend/api/coach.js and backend README; `calibration` instantiates s4-biomechanics for biomechanics and dedicated calibration-extension tests/fixture. Lead explicitly takes s4-exercises/c-exercises and s4-feedback/c-feedback ownership plus remaining frontend tests, frontend package/Vite integration if needed, sprint status, reference guide and component knowledge writeback. Each specialist sends writeback text to the lead; no competing component-record writers. Independent s4-validation review follows settled changes.
- Contract decision: optional model wording is constrained to selecting approved paraphrases of each coded finding; unrestricted model prose cannot be reliably grounded by a number/term blacklist. Counts, measurements, issue attribution, scores and available findings remain deterministic. Frontend and backend validate the same approved options.


## Codex continuation result — 2026-10-03

### What existed and what was finished

- Existing Claude work: original issue tracker, scheduler, browser speech and summary integration; historical 178-test baseline and independent review. The extension had requirements/contracts, pinned UI test tooling, partial exercise/lifecycle/score/findings, feedback/voice/output/text modules, panels and backend proxy/tests. Announced assignments did not prove integration. On resumption the node baseline actually passed 213/215; two obsolete cue-version/text expectations failed. UI integration, transport/wording helper, calibration changes and extension panel tests were still missing.
- Finished: CameraView lifecycle/voice/backend/summary integration; explicit Finish/next and visible arm-switch finalization; progress blockers and less wasteful stable calibration; gated deterministic score/findings; text/audio modes and narration controls; safe bounded TTS with fallbacks; constrained approved wording; matching frontend transport, mocked API/voice/wording tests, actual CameraView/panel DOM tests, docs and component knowledge.
- Existing JSX remains JSX; no unrelated migration or separate TypeScript check was performed. No counting threshold changes, new form rules, accounts/persistence, paid infrastructure, provider calls or recording uploads. Production rules remain disabled, and production score unavailable. Existing unrelated local changes preserved.

### Final contracts and review fixes

- Feature schema 1.2.0; calibration retains the longest contiguous suffix satisfying the original stability gates and still requires 1000 ms plus eight valid frames. New relaxed-arm collection bound 45° is an unvalidated eligibility setting; auto initiation remains 40°. Baseline retention remains 250 ms, not an unreviewed longer hold. Synthetic seed-7 timing: 15 fps 1333→1067 ms, 30 fps 1167→1067 ms, 60 fps 8633→1017 ms; seeds 2026/42 remain 1000 ms. Replays and original numbers are persisted in calibration-extension tests/fixtures; not browser measurements.
- Set lifecycle closes measurements once; paused camera retains counts, fresh set gets new identifiers; interrupted attempts cannot complete from stale observations. Finish lets a current live cue end before narration while removing queued corrections. Arm-change finalization requires the displayed Finish-and-switch action. No implicit reset discards a used set.
- Score formula remains curl-score-1.0.0: each analyzed rep 100 minus 50 per distinct assessed live issue type, floored at zero, rounded set mean. Partial/unanalyzed reps excluded, repeated same-type episodes counted once; needs ≥3 analyzed reps and ≥0.5 analyzed/completed plus a scored assessed rule. Normal mode has no enabled validated rules and cannot receive a score. Experimental review is labeled visually and audibly. Full formula/inputs exposed in details.
- Independent review found/fixed: missing live features incorrectly earning form coverage/clean findings/100 score; canceled prefetch continuing later requests; experimental narration lacking audible qualification; stale async narration status; missing actual CameraView integration tests. Shared form coverage now conservatively requires every persistent feature finite and valid; a missing torso/arm observation never earns analyzed credit. Per-rule detection separately checks its validity flag.
- Frontend voice cancels pending/current output and entire async prefetch batches on stop/mute/loss/hidden/output/AI changes/new set/teardown. Cache bounded to 32 entries/8 MiB; watchdog 30 s. Text generates/plays no audio. AI opt-in/status gating and disclosure wired; configured does not mean verified provider access.
- AI wording chooses approved paraphrase indices rather than unchecked free text. Backend validates coded numeric findings and selections; client checks exact corresponding approved phrases and narration. Deterministic score and findings cannot be replaced by model output. Experimental prefixes shared by both implementations.
- Backend defaults verified against official docs linked in backend README: gpt-4o-mini-tts, marin, gpt-4.1-mini. gpt-6-luna was not established as a public API model. Provider requests are bounded/stream-capped/timed with zero retries and rate/cache limits. Secret-safe errors and backend-only config; `git check-ignore backend/.env` passed without printing/reading the secret file. No actual provider calls were made.

### Verification and independent review

| Check | Final result |
| --- | --- |
| frontend npm test | 247/247 Node logic tests + 11/11 Vitest/jsdom tests across two files |
| frontend npm run lint | clean |
| frontend npm run build | passes; 114 modules, pinned vision assets SHA-256 verified |
| backend .venv/bin/python -m pytest -q | 97/97 mocked tests; one existing Starlette/httpx TestClient deprecation warning |
| repository git diff --check | clean |

Lead and independent s4-validation reviewer both ran the final checks. Python compilation was also checked by s4-backend. Synthetic/DOM/mocked evidence proves implemented behavior under those fixtures, not detector accuracy, physical timing or audible-browser/provider readiness. Review report: [sprint-4-review.md](sprint-4-review.md), no unresolved implementation findings in reviewed scope. Initial failed expectations were updated for intended schema/cue changes; UI test scripts no longer allow a missing test suite to pass silently.

### Setup, demo, carryover and approval

- Exact server-only key/config and startup: [backend README](../../backend/README.md#optional-sprint-4-coaching), placeholder backend/.env.example. Edit backend/.env locally, leave OPENAI_API_KEY empty for fallback operation, never paste into chat or frontend. Restart backend after config changes. Local backend127.0.0.1:8080 and Vite127.0.0.1:5173, same-origin dev proxy; no paid cloud provisioning.
- User demo checklist: [coaching guide](../coaching-sprint-04.md#browser-demo-checklist-pending-evidence). Test camera calibration/curls, pause/restart, explicit Finish/fresh identifiers, arm consent, text/audio/mute/volume/Replay/Stop, hidden/loss cancellation and AI failure fallback in actual Chrome/Safari (iOS if supported).
- Recordings exist per latest user report, but independent labels/provenance/review and measured counts/cues are pending. Need ≥3 reviewed recordings; choose false-cue target before review (≤1 per minute still only proposed). Sprint3 annotated counting target, physical calibration stability/delay, live demo and live device/provider audio remain open. These prevent full Sprint4 acceptance; no rule enabled and no completion claim made.
- Knowledge writeback completed by lead in c-exercises, c-feedback, c-camera-ui, c-biomechanics, c-backend, c-frontend-app, c-validation, c-docs. Existing s4 specialist records remain Active because the sprint is not accepted; runtime agent memory is not continuity.
- Implementation/checks/review complete for this authorized continuation. No commit/push/merge made. Required next approval: commit the reviewed Sprint4 coaching implementation/extension with message `Finish Sprint 4 coaching extension` (not `Sprint 4 completed`). Scope is Sprint4 application/tests/setup/guide/status/review and relevant ownership records; exclude unrelated catch-up/master/workflow/earlier-sprint changes and all secrets/generated assets. Mixed shared records require staging only relevant Sprint4 hunks. Commit approval does not imply push or merge approval.

## Curl dataset pilot resumed — 2026-10-04

The user explicitly resumed implementation, including the interrupted video-to-model work. That work is part of Sprints 7–9. It does not accept Sprint 4, and it does not complete those later sprints. Detail, commands, exclusions, and the held-out metrics are in [curl-ml-pilot-STATUS.md](curl-ml-pilot-STATUS.md). The annotation review sheet is [curl-ml-annotation-review.md](curl-ml-annotation-review.md).

- Extraction caches for all eight videos were rechecked. Checksums match. The annotation audit was rerun after that check.
- Seven recordings still fail active-arm calibration or the side-view gate. The gates were not loosened. `rep-end-v2` can score human windows from side-on tracked angles without a calibration baseline. Live browser predictions still wait for a completed rep, which needs that baseline.
- A three-way split produced no model. `ml/outputs/model/curl-pilot-1.json` is an experimental fixed-threshold swinging prototype. Its held-out precision is 0.143 and recall is 0.25. It is not a validated detector. Production rules stay disabled, and the form score stays unavailable.
- On this resume, frontend `npm test` passed 265 logic tests and 15 UI tests, lint was clean, the production build succeeded, and backend pytest passed 97 tests. Those checks do not replace a live demo or reviewed cue evidence.

## Sprint 4 close-out check — 2026-10-04 (this Mac, `main` at 4c65ea9)

Ajay asked for Sprint 4 to be completed and confirmed done. The attached requirements docx matches `~/Downloads/GymBud_Master_and_Sprints_01-12/GymBud_Sprint_04_Real_Time_Form_Coaching.docx` and `sprint-4.md` word for word.

### Checks run (lead, this session)

| Check | Result |
| --- | --- |
| frontend `npm test` | 270/270 node tests (265 before this change + 5 new) and 15/15 Vitest UI tests |
| frontend `npm run lint` | clean |
| frontend `npm run build` | succeeds, vision asset SHA-256 verified |
| backend `.venv/bin/python -m pytest -q` | 97 passed, one existing Starlette/httpx warning |

### Exit criteria against the code

| Item | State | Evidence |
| --- | --- | --- |
| GB 401 persistent detection | Implemented, synthetic only | `curlRules.js` gates, 400/500 ms persistence on timestamps; all three rules `enabled: false` (`curlRules.js:72,88,101`) |
| GB 402 visual coaching | Implemented, DOM tests only | `CoachingPanel.jsx`; not yet seen with a real camera |
| GB 403 speech control | Implemented, fake speech only | scheduler cooldowns/cancel tests; not yet heard in Chrome/Safari/iOS |
| GB 404 set summary | Implemented and tested | `setSummary.js`, summary tests |
| Three reviewed recordings, cue within persistence + delay | **Not met** | Tool now exists (below). No independently reviewed side-view recordings with a calibration hold. Seven of the eight existing clips never calibrate the active arm (`curl-ml-pilot-STATUS.md`) |
| Isolated spikes produce no spoken correction | Synthetic pass only | `coaching-replay-eval.test.js` 200 ms spike; earlier seeds/fps sweep |
| False cues per minute recorded, target chosen before review | **Not met** | Target not chosen (≤ 1/min is still a proposal); no measurement on reviewed clips |
| Review demo (deviations, correct, mute, leave view, summary) | **Not met** | Needs Ajay on camera |

### Code finished this session

- `ml/coaching_eval.mjs`: replays an extracted pose cache through the camera page's tracking, biomechanics, auto-calibration, analyzer, issue tracker and scheduler (review mode, speech simulated on the frame clock) and scores cue delay against `issueStartMs` + persistence + 500 ms allowance, spoken-in-time count, false spoken cues per minute of calibrated `no-issue` time and of assessable time, labelled fraction and episodes. Acceptance eligibility needs a named reviewer, `independently-reviewed`, side view, calibrated time, and at least one issue and one `no-issue` window. Labels template `ml/coaching-labels.example.json`; usage in `docs/coaching-sprint-04.md`.
- `frontend/tests/coaching-replay-eval.test.js`: 5 synthetic tests (speech clock, sustained swing cued in 400–900 ms with the repeat held by the 10 s cooldown, 200 ms spike silent, evaluation arithmetic and overlap/allowance rejection, large-lean limit).
- Independent review (`s4-validation`, this session): 7 findings (4 medium, 3 low) on denominators, 0/0 passing, lenient eligibility, overlap double counting, swinging deadline, unchecked allowance, dropped interrupt output. All fixed and re-run.
- Synthetic finding recorded, thresholds unchanged: a lean above about 17° moves the shoulder past the 0.3-torso reposition check, so calibration resets instead of a torso cue.

### Decision needed and next actions

- **Decision (Ajay, 2026-10-04): false-cue target adopted, at most 1 false spoken correction per minute of accepted-form curling**, chosen before review. Use `--false-cue-target-per-min 1`.
- Video-file source added at Ajay's request (2026-10-04): the camera page can play a local video (for example from `video.assets/`) through the same pipeline instead of the live camera. Calibration still runs on each video, because it is a per-session baseline of that person's relaxed arm, not something the ML pilot learned. Clips without a relaxed still arm before the first curl will not calibrate. Checked by unit and UI tests; the in-app browser pane was hidden, so playback was not seen end to end.
- Ajay records at least three side-on clips with a 1 s relaxed hold, labels windows; a second person reviews them; run the tool.
- Live demo and Chrome/Safari (iOS if possible) audio by ear, using the checklist in `docs/coaching-sprint-04.md`.
- Sprint 4 is not marked complete. No rule is enabled. `s4-` agents stay Active. Not pushed.

### Continuous calibration — 2026-10-04 (Ajay's decision)

Ajay: "we cant rely on waiting for calibration... there has to be auto calibration setup for every frame everytime." Implemented `calibrationMode: 'continuous'` (default on the camera page; Hold still first stays selectable). Every valid side-on frame updates a rolling 6 s baseline from the lowest relaxed-eligible arm position, so counting starts on the first curl after the arm has been lowered once. All values are unvalidated defaults; form rules stay disabled.

Headless Chrome 153 on this Mac, video-file source, right arm, continuous mode (counts compared with the supplied, not independently reviewed annotation rows): `normal-swinging-sideangle` 4 (4 rows), `idealform-sideangle` 8 (8 rows), `excessive-swinging-sideangle` 3 (3 bounded rows + 1 `N/A` end; the video ends mid-rep), `idealform-45angle` 9 (9 rows), `normal-swinging-45angle` 0 (fails the side-on gate). Under hold mode only the first clip counted. Checks: `npm test` 277 node + 16 UI, lint clean.

Known limits: habitual partial lowering moves the rolling bottom, so incomplete ROM is not measured against a true relaxed arm in this mode; torso and arm references move with the user. Front-view clips still fail the side-on gate.

### Auto arm — 2026-10-04

Ajay reported the counter stayed at 0. Same dev server and code counted reps in headless Chrome with Track arm set to Right; the page default was Left, and his clips are right-arm. Track arm now defaults to Auto (arm nearest the camera by landmark visibility). Headless Chrome with default settings: `normal-swinging-sideangle` 4, `idealform-sideangle` 8, `excessive-swinging-sideangle` 3, `idealform-45angle` 9. `npm test` 279 node + 17 UI, lint clean, build ok.

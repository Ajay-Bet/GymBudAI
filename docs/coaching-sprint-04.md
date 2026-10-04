# Sprint 4 curl coaching guide

## Scope and status

Sprint 4 adds persistent issue detection, cue selection, speech and a local set summary on top of the Sprint 3 curl analyzer (`docs/curl-analyzer-sprint-03.md`). Movement analysis runs in the browser. Optional AI voice and wording use the local FastAPI coaching proxy; only approved cue text or coded numeric findings are sent. Nothing records or uploads camera frames.

**No form rule is validated.** The sprint's entry requirement asked for reviewed examples of torso swing, arm drift and incomplete ROM, and none exist. So every rule ships `enabled: false` and `validation: 'unvalidated'`. In the default mode the app shows tracking guidance and "Form coaching off: no rule has been validated yet", and the summary reports zero analyzed reps with reason `no-validated-rules`.

A developer-only review mode (off by default, switchable only while the camera is stopped) lets unvalidated rules cue, with every cue labelled "unvalidated rule". It exists to evaluate rules against reviewed recordings. It is not user coaching and makes no accuracy claim. Every number below is an unvalidated engineering default.

Code:
- `frontend/src/exercises/curlRules.js`: `CURL_RULES_CONFIG` (`curl-rules-1.0.0`), `createCurlIssueTracker`, `curlUnavailableReason`.
- `frontend/src/exercises/setSummary.js`: `buildSetSummary`, `SET_SUMMARY_CONFIG` (`set-summary-1.0.0`).
- `frontend/src/exercises/ids.js`: `createSessionUid`.
- `frontend/src/feedback/cues.js`: `FEEDBACK_CONFIG` (`feedback-1.0.0`), `PRIORITY_POLICY`, cue and tracking texts.
- `frontend/src/feedback/scheduler.js`: `createFeedbackScheduler`.
- `frontend/src/feedback/speech.js`: `createSpeechAdapter`.
- UI: `frontend/src/components/CoachingPanel.jsx`, `SetSummaryPanel.jsx`, wired in `CameraView.jsx`.

## Original coaching pipeline (historical baseline)

For every FeatureFrame: `analyzer.update(frame)` → `tracker.update(frame, analyzerOutput)` → `scheduler.update({ timestampMs, issueOutput })`.

- **Tracking loss, stale result or muted track:** `tracker.interrupt('tracking-loss', t, analyzerInterruptEvents)`, then speech is cancelled.
- **Recalibration:** `tracker.interrupt('recalibration', …)`.
- **Stop, camera ended, pose error or page hide:**
  1. close the analyzer attempt;
  2. `tracker.end(t, events)`, so open episodes end `'set-ended'`;
  3. `scheduler.stop()` and cancel speech;
  4. `buildSetSummary`.
- **Start, side change or Reset set:** reset analyzer, tracker and scheduler together.
- **Start camera:** primes speech inside the click (browser user-gesture rule).
- **Page hidden or unmount:** cancels speech.

## Rule configuration (`curl-rules-1.0.0`)

| Rule | Feature (side view) | Onset | Release | Cue |
|---|---|---|---|---|
| torso-swing | \|`torsoDeviationDeg`\|, relative to calibrated torso tilt | > 10° for ≥ 400 ms of continuous valid observation | ≤ 7° for ≥ 500 ms | "Keep your torso still" |
| upper-arm-drift | \|`upperArmDriftDeg`\|, relative to calibrated upper-arm tilt; unsigned, so forward and backward are not distinguished | > 20° for ≥ 400 ms | ≤ 15° for ≥ 500 ms | "Keep your upper arm still at your side" |
| incomplete-rom | ROM of a committed attempt that the analyzer ends as `partial` | evaluated once at the attempt end (instant episode) | n/a | "Curl all the way up" |

Values between the release and onset thresholds keep an open episode open (hysteresis). Wrist position and lateral flare are not assessed: the side view and generic landmarks don't support them.

After `end()` the tracker ignores frames; only `reset()` revives it.

**Validity gate.** A frame is assessable only when all of these hold:
- `ready` is true and `dropout` is not;
- the view is `side` and calibration is ready;
- the feature value is finite;
- the analyzer is not paused;
- the recent frame rate is high enough.

On a non-assessable frame:
- Pending onset evidence is discarded.
- An open episode is suspended, not released, and its release evidence is discarded.
- After 500 ms (`maxSuspendMs`) without an assessable frame, or on `interrupt()`, the episode ends `tracking-lost` (or `recalibration`), never `resolved`.

Evidence breaks if two assessable frames are more than 150 ms apart (`maxEvidenceGapMs`). When the lower median of the frame intervals over the last second exceeds 150 ms (about 7 fps), frames become non-assessable with reason `low-frame-rate`. The UI then says "Camera too slow for form analysis", rather than silently never coaching.

`unavailableReason` values:
- `tracking-dropout`
- `tracking-loss`
- `calibration-required`
- `unsupported-view`
- `recalibration`
- `low-frame-rate`

## Issue event schema

`IssueEpisode`:

```
{ id, type, startMs, endMs, peak, unit: 'deg', endReason, attemptIds,
  rulesVersion, analyzerVersion, enabled, validation }
```

- **One continuous episode is one event.** The tracker emits `issue-started` and `issue-ended` events.
- **`endReason`** is one of:
  - `resolved`: ends at the first frame of the release run.
  - `tracking-lost`, `recalibration`, `set-ended`, `reset`: end at the last assessable frame.
  - `evaluated-at-attempt-end`: instant incomplete-ROM episodes.
- **`attemptIds`** lists every committed attempt that overlapped the episode in time, including attempts the UI interrupted.
- **IDs:**
  - Episode IDs are `issue-<sessionUid>-<n>`.
  - Rep and attempt IDs are `curl-<sessionUid>-<n>`.
  - The session UID comes from `crypto.randomUUID()`, so IDs are unique across reloads.

## Cue scheduling (`feedback-1.1.0`)

- **Priority policy** (explicit, not a clinical severity ranking): torso-swing, then upper-arm-drift, then incomplete-rom.
  - Cues about the movement in progress come before cues about a finished attempt.
  - Torso swing comes first because torso movement also shifts the measured upper-arm angle.
- **One primary cue:** the highest-priority eligible active episode. Eligible means:
  - in `validated-only` mode, the rule is enabled;
  - in `review` mode, any rule;
  - the episode is active, not suspended.
- **Display timing:**
  - A cue stays on screen at least 1.5 s (`minCueDisplayMs`) before a higher-priority cue replaces it.
  - An incomplete-ROM cue shows for 3 s.
  - Non-assessable frames withdraw the text at once; the separate tracking box explains why.
- **Speech:**
  - At most one utterance speaking plus one queued.
  - Speech is decided once per cue, when it becomes primary.
  - Cooldowns, on elapsed timestamps: 10 s per issue type and 4 s global.
  - A cue held back by a cooldown stays as text and is not retried.
  - A queued cue is dropped as `replaced` by a newer primary cue, or as `stale` when its episode ends or it is older than 1.5 s.
  - An utterance whose end event never arrives is cancelled after 8 s.
  - A browser speech error gives back the cooldowns.
  - One episode keeps one cue ID and cue-log entry (`reshownCount`) and is not spoken twice. If a one-frame dropout cuts its utterance off, that episode stays text-only for the rest of its life.
- **Cancellation:** non-assessable frames, mute, mode change, stop, reset, page hide and unmount cancel current and queued speech. Text never depends on speech. Without speech synthesis the UI says "Voice unavailable; cues are shown as text".
- **Cue log (`getCueLog()`):** one entry per cue, with `{ cueId, issueType, episodeId, validation, mode, shownMs, spokenMs, suppressed, reshownCount }`.
  - `suppressed` is one of `muted`, `cooldown-issue`, `cooldown-global`, `speech-unavailable`, `replaced`, `stale`, `cancelled`.
  - The log is the source for false-cue-per-minute counting. Count entries, not reshows.

## Set summary definitions (`set-summary-1.0.0`)

The summary is built locally at **Finish set** and is the Sprint 5 workout payload candidate. Stop Camera pauses the current set. The panel's "Copy summary JSON" button exports it.

- **Completed reps:** the analyzer's completed reps.
- **Interrupted attempts:** `{ total, byReason }`.
- **Assessed rules:** enabled rules in `validated-only` mode; all rules in `review` mode.
- **Analyzed rep:** a completed rep with assessable coverage of at least 0.8 inside its [start, end] and at least one assessed rule.
- **`notAnalyzedReason`:** the first that applies of `no-validated-rules`, `no-completed-reps`, `low-coverage`; otherwise `null`.
- **Issue-bearing rep:** an analyzed rep overlapped by at least one episode of an assessed rule.
  - A rep counts once however many issue types or episodes overlap it, so overlapping issues don't inflate the bad-rep denominator.
  - Incomplete ROM never marks a completed rep.
- **`noIssueFraction`:** (analyzed − issue-bearing) / analyzed, or `null` when nothing was analyzed. Labelled "detector summary, not a form score".
- **Tracking coverage:** assessable time / session time.
- **Episode counts:** `episodeCountsByType` counts assessed episodes only. `unassessedEpisodeCountsByType` counts episodes detected by rules not assessed in this mode.
- **Versions:** the summary records the analyzer, rules, feedback and feature versions, plus the mode.
- **Missing values** are `null`, never 0.

## Enabling a rule

Set `enabled: true` only when all of these are done:
1. Reviewed recordings with annotated sustained issues and accepted-form examples are recorded in `CURL_RULES_CONFIG.rules[type].evidence` and in the sprint record.
2. The rule produces its cue within the configured persistence plus processing delay on at least three of them.
3. Isolated spikes produce no spoken correction.
4. False cues per minute is within a target chosen before the review.

Then bump the rules version.

## Evidence so far

All evidence so far is synthetic (`frontend/tests/coaching-*.test.js`). It shows the timing and arithmetic behave as specified. It does not show detection accuracy, false-cue rates or real browser speech behaviour. See `docs/sprints/sprint-4-STATUS.md`.


## Integrated Sprint 4 extension (2026-10-03)

This section supersedes the original stop/reset integration above. All detector rules remain disabled in normal mode. Recorded good-form and bad-form curl videos are available per the user; independent labels, review outcomes and false-cue measurements are pending. Availability is not validation.

### Sets and calibration

`setSession.js` coordinates the analyzer/tracker with states calibrating, active, paused and finished. Stop Camera, camera disconnection and page hide pause and preserve completed counts; restarting requires valid calibration and resumes the same set. Each interruption closes the in-flight attempt; it cannot finish from stale frames. **Finish set** closes the set once and freezes summary, score and findings. It removes queued cues, lets a currently playing cue end, then narrates if opted in. **Start next set** resets analyzer/tracker/scheduler and creates new set, rep and episode identifiers. Calibration can remain while the camera is running. A used-set arm change displays a **Finish set and switch** confirmation; its saved feedback remains labeled with the old arm, and the new arm starts only with a fresh set. Leaving/unmounting the application discards local data; there is no workout persistence yet.

FeatureFrame 1.2.0 adds `calibration.blockedReason`: missing joint name, not-side-on, moving, arm-not-relaxed, tracking-gap or null. Collection still needs at least 1000 ms of contiguous stable valid source-timestamp evidence and at least eight frames. Instability retains the longest contiguous suffix passing the original angle/position/scale checks rather than discarding the whole window. Display progress holds its high-water value below 100% until actual evidence qualifies; true invalidation resets it. A relaxed-arm collection bound of 45° is an unvalidated engineering setting, while automatic initiation still uses 40°. Baseline retention remains the existing 250 ms dropout grace; longer losses/repositioning require fresh calibration. No wider median tolerance or longer baseline hold was adopted.

Reproducible synthetic timing (`tests/fixtures/calibration-extension.js`, seed 7):

| FPS | Before ready | After ready | Before movement resets | After trims |
| --- | ---: | ---: | ---: | ---: |
| 15 | 1333 ms | 1067 ms | 1 | 1 |
| 30 | 1167 ms | 1067 ms | 1 | 1 |
| 60 | 8633 ms | 1017 ms | 40 | 1 |

Seeds 2026 and 42 remain at 1000 ms at all three rates. These synthetic jitter replays demonstrate less discarded evidence, not measured browser calibration speed. Physical stability and latency checks remain pending.

### Rules, score and factual feedback

The two live cue types are torso swing and unsigned upper-arm drift. Incomplete ROM appears only at the end of a committed partial attempt; it does not produce another continuous live correction. Production shows **Form coaching off** until rule-specific reviewed evidence is recorded. Cue wording comes from `feedback/cues.js`; historical `curlRules.js` cueText metadata is not the UI cue catalog. No wrist/grip/load/muscle/lateral-flare judgments were added.

Shared form coverage now requires both persistent rule features to be finite with true validity flags. A finite elbow angle can still count a rep while missing torso/arm features prevent form credit. Coverage is conservative across both live rules, even if only one is enabled later. Per-rule detection also checks its feature flag. Missing values never support a clean finding or perfect score.

`curl-score-1.0.0` computes each analyzed rep as max(0, 100 − 50 for torso swing − 50 for upper-arm drift), each distinct issue type once per rep. The set score is the rounded mean across analyzed reps only. Repeated episodes cannot penalize one type repeatedly; both observed types can remove 50 each. Unanalyzed reps and partial attempts are excluded. Eligibility needs a scored assessed rule, at least three analyzed reps, and analyzed/completed ≥ 0.5. The 50-point weights and eligibility thresholds are unvalidated engineering defaults. Independent arithmetic examples include [0, 50, 100, 100] → 63 and three observed 50s plus two missing reps → 50.

Normal mode has no validated enabled rules and displays **Form score unavailable** with the reason. Developer review scores are labeled experimental visually and audibly. Scores describe the GymBud detector, not clinical correctness or injury risk. Strengths report counted completion, measured tracking and absence of detected issues on eligible analyzed reps; no enabled rules/no issues cannot become form praise. Improvements and one next-set focus come from deterministic findings. The full formula, denominators, eligibility, versions and JSON export remain visible in set details.

### Output, grounding and failure behavior

**Text** is the default (stored safely in localStorage). It makes no audio-generation or playback calls. **Audio + text** opts into browser speech, with mute/volume, Replay and Stop narration. Optional Natural AI voice appears only when backend configuration reports TTS available and requires a separate opt-in. Status means configured, not verified provider access. Disclosure: **Voice is AI-generated (OpenAI)**.

Uncached live cues use device speech immediately and request reusable AI audio in the background; cached cues use AI audio. Narration waits for the current cue, then tries AI audio for at most six seconds, then device speech/text. Speech and audio share one channel. Tracking loss, camera stop, hidden tab, mute, output/AI changes, a new set and teardown cancel active/pending output; abort generations prevent late responses or a canceled prefetch batch from restarting audio/requests. Eligible cue prefetch happens once per active set. A 30-second playback watchdog releases missing end events. Frontend audio cache is LRU with 32 entries and 8 MiB; server bounds and deadlines are in the backend README. These are configured limits, not measured provider latency.

**Improve wording with AI** is optional and sends only supported finding codes/numbers and minimal score metadata. The model chooses indices among approved paraphrases; it cannot write arbitrary observations. Backend validates facts and selections; frontend separately checks each rendered field against its corresponding approved options, including exact derived narration. Deterministic score/labels are never reworded. Invalid, late, timed-out or failed results keep the local summary. Requests never include frames/landmarks or recordings. See [backend setup and official API references](../backend/README.md#optional-sprint-4-coaching) for server-only secrets, supported configurable models, cost notes and local commands.

### Measuring the exit criterion on recordings

`ml/coaching_eval.mjs` replays an extracted pose cache through the same tracking, biomechanics, auto-calibration, curl analyzer, issue tracker and cue scheduler that the camera page uses, in developer review mode, and compares the cue log with labelled windows. Speech is simulated on the frame clock, so it measures cue timing and suppression, not audio.

1. Record side-on curls with the curling arm relaxed and still for at least one second before the first rep (calibration needs it). Mix clean reps, sustained torso swing or arm drift, and half reps.
2. Extract poses: `python3 -m ml.extract --videos <folder> --output ml/outputs/extraction` (needs `ml/requirements-extraction.txt` in a virtual environment).
3. Copy `ml/coaching-labels.example.json` to `ml/outputs/coaching-labels.json`. For each recording give the arm, the view and windows in ms (`no-issue`, `torso-swing`, `upper-arm-drift`, `swinging`, `incomplete-rom`), with `issueStartMs` where a sustained issue becomes visible. A second person checks the windows and sets `reviewStatus` to `independently-reviewed` and `reviewer`.
4. Run `node ml/coaching_eval.mjs --labels ml/outputs/coaching-labels.json --false-cue-target-per-min <target>`. The report goes to `ml/outputs/coaching-eval/report.json`.

Definitions: a sustained issue passes when its intended cue is displayed within the rule's onset persistence (400 ms) plus a 500 ms processing allowance after `issueStartMs` (after the window end for incomplete ROM). Speech is reported separately, because the per-issue cooldown deliberately keeps a repeated cue silent. A false cue is a spoken correction outside every matching issue window. The report gives two rates and the target must hold for both: per minute of `no-issue` time while the camera was tracking and calibrated, and per minute of all assessable time (which also catches cues in unlabelled time). It also reports how much of the calibrated time is labelled, and the spoken-in-time count next to the displayed count. `no-issue` windows may not overlap other windows. A recording counts toward the three-recording criterion only when it is side-view, calibrated, has a named reviewer with `reviewStatus: independently-reviewed`, and has at least one issue window and one `no-issue` window. Not simulated: stale-frame drops and pose-error resets in the camera page, and the experimental model session.

Known limit found with this tool: the calibration reposition check resets the baseline when the shoulder moves more than 0.3 torso lengths, which on synthetic geometry is a lean of about 17° about the hip. A large swing therefore shows a recalibration prompt instead of a torso cue; the torso rule cues in roughly the 10–17° band. This is recorded, not changed, because no reviewed evidence supports a different threshold.

### Browser demo checklist (pending evidence)

1. Start backend and frontend using their READMEs. Leave the server key empty first. Start Camera, stand side-on and relax the selected arm; inspect calibration progress/blockers and counting.
2. Count curls, Stop Camera, verify **Set paused** and retained counts. Restart/recalibrate, then verify an interrupted lift cannot be completed from stale observations.
3. Press Finish set. Check completed/analyzed reps, coverage, unavailable production score and factual feedback. Start next set; counters and JSON identifiers must be fresh. Try arm switching during a lift and verify the visible finish-and-switch choice.
4. Select Audio + text and test device speech, mute/volume, Replay/Stop, tracking loss, hidden tab and output-mode cancellation. Recheck in Chrome and Safari; add iOS if supported. Record browser/version and observed outcome. Do not treat mocked tests as audio evidence.
5. Configure the key locally in backend/.env (never in chat/frontend), restart the backend, opt into Natural AI voice, inspect disclosure and Network requests, and test offline/late/provider failure fallbacks. Text mode must send no TTS calls. Optional approved wording must preserve findings and score.
6. Evaluate recordings with `ml/coaching_eval.mjs` (above) only after independent labels and a chosen false-cue target are recorded. Review mode is explicitly unvalidated. Preserve cue logs and independently compare counts/issues. At most one false spoken correction per minute remains a proposal, not an accepted or measured result.

Current automated results and independent review are in [Sprint 4 status](sprints/sprint-4-STATUS.md) and [review](sprints/sprint-4-review.md). Sprint 4 closed on 2026-10-04 on Ajay's attestation that the human checks passed (recordings, live demo, audio). No measured cue delays or false-cue rates are stored in the repository, so every form rule stays disabled until reviewed evidence is recorded with the replay tool above.

---
name: c-feedback
description: "Component owner for feedback: cue selection, persistence, cooldowns, text equivalents and speech."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `frontend/src/feedback/cues.js` (`FEEDBACK_CONFIG` feedback-1.1.0, `PRIORITY_POLICY`, cue catalog, tracking texts)
- `frontend/src/feedback/scheduler.js` (`createFeedbackScheduler`)
- `frontend/src/feedback/speech.js` (`createSpeechAdapter`)
- Guide: `docs/coaching-sprint-04.md` (shared with c-exercises)

## Contracts to keep

- One spoken cue at a time; per-issue and global cooldowns; cancel speech on mute, tracking loss or session end (see `docs/project-instructions.md`).
- `feedback-1.1.0` (unvalidated defaults): priority torso-swing > upper-arm-drift > incomplete-rom (explicit policy, not severity); global cooldown 4000 ms, per-issue 10000 ms; `maxQueueAgeMs` 1500; `minCueDisplayMs` 1500; `attemptEndCueDisplayMs` 3000; `maxSpeechMs` 8000 watchdog. All timing uses `update()` timestamps.
- `createFeedbackScheduler({ config, speech, mode, enabledRuleTypes })`: modes `validated-only` (default; only enabled rules cue) and `review` (developer; every cue labelled `unvalidated rule`). One primary cue; at most one speaking plus one queued; speech decided once per cue, a cooldown-suppressed cue is not retried; one cue ID and log entry per episode (`reshownCount`); speech error rolls back cooldowns, cancellation does not. Cancels speech on non-assessable frames, mute, mode change, stop and reset. Text never depends on speech.
- `createSpeechAdapter({ synthesis, Utterance })`: `available`, `prime()` (call in a user gesture), `speak`, `cancel`, `setMuted`, `setVolume`, `speaking`, `onEnd` (settles each utterance once).
- Tracking texts for every tracker `unavailableReason` plus `no-validated-rules` and `stopped` live in `cues.js`; the UI never words a reason.

## History

- Sprint 4 (`s4-feedback`) created the module; review fixes D3 (cue identity per episode), D4 (cooldown rollback on speech error) and D6 texts. Checked with a fake speech engine only.

## Open carryover

- Timing defaults and cue wording not checked against reviewed recordings; no false-cues-per-minute measurement yet.
- Speech not tested in real browsers (Chrome, Safari, iOS).

## Lessons learned

- `speechSynthesis.cancel()` fires `onend`, `onerror('interrupted'/'canceled')` or nothing depending on the browser; settle each utterance once and ignore events from utterances you cancelled. Keep a reference to the current utterance (Chromium can drop `onend` after garbage collection) (Sprint 4).
- Cue identity must follow the episode, not the frame, or dropouts make text flicker and inflate false-cue counts (Sprint 4 review D3).
- Cooldowns should count only speech that actually played; a `not-allowed` error must not use them up (Sprint 4 review D4).


## Sprint 4 extension continuity — 2026-10-03

- Owns `setFeedbackText.js`, `outputPreference.js`, `voice.js`, `wording.js` in addition to existing scheduler/speech/cues. Cue config now feedback-1.1.0; thresholds/scheduling unchanged; friendlier short guidance. No issue-free claim from absent measurements; clean findings say no issue detected rather than asserting unmeasured posture.
- Text default persists safely and never calls audio generation/playback. Opted-in Audio+text uses immediate device cues while uncached AI cues load for future reuse; narration waits for live cue, then AI≤6s→device→text. One channel, mute/volume, stop/replay. AI disclosure appears on opt-in/use.
- `createVoice` implements scheduler SpeechAdapter plus narration/prefetch/dispose. Frontend LRU32entries/8MiB; playback watchdog30s. stop/mute/loss/hidden/mode/AI/teardown cancel active and pending audio. Abort generations stop the entire prefetch batch, not just one request; URLs/listeners are released, late outputs ignored.
- Wording helper strips issue-type strings/metadata and sends coded numeric facts+minimal score. Model selects approved variants; frontend validates exact per-finding options and derived narration, backend independently validates selections/facts. Counts/issues/score never model-authored. Experimental review narration carries an audible unvalidated qualifier in deterministic and AI text.
- Voice tests are mocked/synthetic, including cancellation/no end event/autoplay rejection; Chrome/Safari/iOS and provider audio remain pending. Available recordings are not independently labeled/reviewed yet.
- Lessons: a term/number blacklist cannot ground semantic claims; constrained variants do. Cancellation must invalidate every async batch continuation, and experimental labels must reach audio as well as visuals. Knowledge writeback: lead from s4-feedback/review.

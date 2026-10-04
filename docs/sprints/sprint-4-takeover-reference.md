# Sprint 4 takeover document — catch-up reference

Received in the Sprint 4 catch-up chat on 2026-10-03 (user-local date).

This pasted document is reference content under the current catch-up direction. Its requests to take over, implement, verify, coordinate specialists and request commit approval are historical handoff instructions, not current authorization to resume work. The current chat request was “Sprint 4.” Status and reconciliation live in [sprint-4-STATUS.md](sprint-4-STATUS.md). Original wording follows unchanged.

---

Take over Sprint 4 from Claude Code and complete the remaining implementation in `/Users/prabh/GymBud_/GymBudAI`. Focus exclusively on dumbbell curls.

I have attached the Sprint 4 document. The master plan was supplied to the master chat; locate its repository copy or the project’s shared sources. Do not assume you can read another chat’s attachments. If it is unavailable, report that and continue work that does not depend on it.

Read `AGENTS.md`, `CLAUDE.md`, `docs/sprints/sprint-4-STATUS.md`, `docs/coaching-sprint-04.md`, and their referenced workflow, agent instructions, handoffs, and extension contracts. Follow the repository’s testing, documentation, attribution, commit, and merge approval rules.

HANDOFF FROM CLAUDE

Claude hit its usage limit during the Sprint 4 extension. Its last report said it:
- Re-read project records, code, and backend.
- Audited three candidate curl rules, all disabled because reviewed validation evidence is missing.
- Wrote an extension contract and added UI test tooling and agent instructions.
- Assigned work on calibration, set lifecycle and scoring, feedback and voice, backend integration, UI, and validation.

Those assignments were announced; they are not proof that implementation finished. Inspect Git status, diffs, new files, saved agent outputs, and test results to establish what actually exists. Preserve all uncommitted work. Do not reset, clean, overwrite, or recreate completed work unnecessarily.

Before the extension, the reported baseline was 178 passing tests, clean lint, and a successful build, all based on synthetic evidence. Verify the current state rather than reusing that result.

Claude proposed these defaults:
- Stopping the camera pauses the set; Finish set ends it.
- Changing arms finishes the current set.
- No new form rules without evidence.
- Production displays “Form score unavailable” while rules remain unvalidated; developer review mode may display a clearly labelled experimental score.
- Configurable OpenAI TTS and optional wording models.
- Cached cue audio, with local speech and text fallbacks.

Retain sensible implemented choices after reviewing them. In particular, finalizing a set on an arm change must be explicit and visible, not silently triggered. Claude proposed `gpt-4o-mini-tts`, voice `marin`, and `gpt-6-luna` for wording; verify current official API availability and compatibility before adopting those defaults.

REMAINING REQUIREMENTS

1. Natural, grounded coaching

Replace terse cues with friendly, clear, actionable language. Keep live cues brief; provide deeper explanation after the set.

Explain how the existing three candidate rules map to the cues users can see, and why only two cues were previously apparent. Check disabled rules, eligibility conditions, and UI wiring. Do not add rules simply to increase cue variety.

Deterministic movement analysis must determine issues and rep counts. An optional model may rewrite structured findings, but must not invent observations, change measurements, or determine form correctness. Do not claim to observe grip, wrist rotation, load, muscle activation, or unsupported movements.

2. Text and natural audio

Provide:
- Text: feedback text only, with no audio generation or playback.
- Audio + text: matching text and spoken feedback.

Implement a natural OpenAI TTS option through the backend using current official documentation. Preserve mute, volume, cue priority, per-issue/global cooldowns, and cancellation on camera stop, tracking loss, hidden tab, or output-mode change.

Avoid overlapping, stale, or late-arriving audio. Cache reusable cues with bounded storage. Do not make a request on every frame. Keep text immediate; provide appropriate device-speech and text fallbacks when the API fails.

Disclose that the voice is AI-generated. Document latency and cost considerations.

3. Faster reliable calibration

Inspect the current and partially modified calibration behavior. Measure timing on representative replays and reduce unnecessary delay while retaining stable, valid observation requirements.

Show progress and specific reasons calibration is blocked. Avoid unnecessary resets. Keep timing independent of frame rate and handle tracking gaps correctly.

Record before/after timing and distinguish synthetic replay measurements from browser observations. Do not remove reliability checks just to make calibration appear faster.

4. Explicit set lifecycle

Provide clear calibration, active, paused, and finished behavior, with a Finish set action separate from camera controls.

Finalize measurements exactly once, cancel live feedback, and display the summary. Starting another set must create fresh counters and identifiers.

Make camera-stop pause behavior and arm-change behavior clear. Never complete an interrupted rep across a tracking gap or pause using stale observations.

5. End-of-set feedback and score

After Finish set, display:
- Completed reps, analyzed reps, and tracking coverage.
- A score out of 100 only when evidence and eligibility support it.
- What the user did well first, based on actual observations.
- Specific constructive improvements.
- One simple focus for the next set.

Define a transparent deterministic scoring formula and verify it with independently calculated test cases. Do not treat missing tracking as good form, double-penalize overlapping issues, or let an LLM choose the score.

Label the score as a GymBud detector-based summary, not a clinical or injury-risk assessment. While rules are unvalidated, or data is insufficient, production must show “Form score unavailable” with an explanation. Developer review mode may show a clearly labelled experimental score.

“No enabled rules” and “no detected issues” must not automatically become perfect form or unsupported praise.

Text mode must show the summary without audio. Audio + text mode must also narrate a concise version, with Replay and Stop controls. Final narration must not overlap live cues.

6. Backend integration and secrets

Keep the OpenAI key exclusively on the server. I will configure it locally after you provide setup instructions.

Never ask me to paste it into chat. Never expose it through frontend environment variables, browser code, logs, or Git. Supply placeholder configuration and verify the real secret file is ignored.

Send only necessary structured measurements or approved feedback text. Do not upload camera frames or recordings for this feature.

Use bounded requests, timeouts, validated outputs, and deterministic fallbacks. Keep workout tracking functional without the API. Test using mocks before requesting key configuration. Do not provision paid cloud resources.

7. Integration, verification, and handoff

Continue from existing work and coordinate the specialists required by the repository workflow. Reuse saved findings and contracts; avoid duplicated whole-repository audits by every agent.

Add or finish meaningful tests for:
- Set finalization, pause/resume, and fresh-set resets.
- Scoring, missing data, and overlapping issues.
- Text/audio modes and cancellation of late responses.
- Grounded wording and API failure handling.
- Panel interactions.

Run the relevant frontend and backend checks, integrate the changes, and perform an independent review according to repository rules. Fix findings and update documentation.

Reviewed recordings, the false-cue target, Sprint 3 counting evidence, the live demo, and Chrome/Safari audio validation remain pending until actually performed. Claude proposed at most one false correction per minute; record this as a proposed target unless it has been agreed.

Complete all implementation and automated verification possible now. Do not mark Sprint 4 complete or claim real-browser evidence based on synthetic tests.

Start with a brief verified status and continuation plan, then proceed. Finish with:
- What Claude had actually completed and what you finished.
- Checks run and their results.
- Exact backend secret configuration and local startup instructions.
- A short browser-demo checklist.
- Remaining acceptance gaps.
- Commit approval request if required by the repository workflow.
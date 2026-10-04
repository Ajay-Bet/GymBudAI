# Sprint 4 — Real-time form coaching (requirements)

Source: `GymBud_Sprint_04_Real_Time_Form_Coaching.pdf`, attached by Ajay and read from `~/Downloads/` on his laptop (2026-10-03). Text below is the document's content, reformatted as Markdown. Status, evidence and handoff live in `sprint-4-STATUS.md`.

Two week working plan with backlog implementation and review criteria.

Provide useful curl corrections through persistent visual feedback and controlled speech while withholding feedback when the camera evidence is unreliable.

Dates and owners are assigned at sprint planning. Proposed acceptance targets are reviewed before implementation and are not claims of measured performance.

## Entry requirements

Sprint 3 counts curls and emits timestamped candidate issues. The team has reviewed examples of observable torso swing, forward arm drift, and incomplete calibrated ROM.

## Sprint scope

Enable a small set of validated curl rules, time-based persistence, cue selection, cooldowns, voice controls, and session summaries. This completes the camera-based prototype; accounts and saved history arrive in Sprint 5.

## Sprint backlog

### GB 401 Persistent issue detection

As a user, I receive corrections for sustained movement patterns instead of single noisy observations.

Acceptance criteria: Each rule has a validity gate, persistence interval, and clear condition. An invalid tracking gap cannot accumulate evidence or be interpreted as a resolved issue.

### GB 402 Visual coaching

As a user, I can understand the current cue without listening.

Acceptance criteria: One primary cue appears with readable text and a clear tracking state. All voice cues have text equivalents, and unavailable analysis is shown separately from form feedback.

### GB 403 Speech control

As a user, I can mute coaching and avoid repeated interruptions.

Acceptance criteria: Per-issue and global cooldowns limit repetition. Higher-priority eligible cues replace stale queued cues; stopping, muting, or losing tracking cancels queued speech.

### GB 404 Set summary

As a user, I can distinguish counted movement from analyzed form.

Acceptance criteria: Summary shows completed reps, analyzed reps, issue-bearing reps, and tracking coverage. One continuous issue episode is one event; overlapping issue types do not inflate the bad-rep denominator.

## Implementation and sprint review

### Technical plan

- **Rule configuration:** For each enabled issue, define the observed feature, supported camera view, baseline, threshold, minimum valid duration, release condition, and cue. Incomplete ROM is evaluated at rep completion rather than during an unfinished movement.
- **Feedback scheduling:** The feedback engine receives candidate events and tracking quality. Select one eligible cue according to an explicit priority policy, not a claimed clinical severity ranking. Use elapsed time for persistence and cooldowns to remain stable at different frame rates.
- **Speech lifecycle:** Use browser speech synthesis behind an adapter with mute, volume, and cancellation. Test browser availability and user-gesture requirements. Text remains functional if speech is unavailable; never let a long queue deliver outdated corrections.
- **Summary and data boundary:** Maintain a local session summary with unique rep and event IDs and analyzer version. This sprint does not upload camera frames. The resulting schema will become the workout payload in Sprint 5.

### Verification checklist

- Use short noisy spikes and sustained annotated issues to verify persistence and release behavior.
- Trigger two issues together; check that only the selected cue is spoken and both events remain available for the summary.
- Test cooldowns at different frame rates, long speech, mute, stop, and tracking loss.
- Use accepted-form examples to record false corrections and inspect unsupported-view behavior.
- Verify no issue detection, unavailable tracking, and overlapping issues produce correct summary denominators.

### Exit criteria

On at least three reviewed recordings, annotated sustained issues produce the intended cue within the configured persistence plus processing delay. Isolated noisy spikes produce no spoken correction. Record false cues per minute and detected issue episodes; choose an acceptable false-cue target before review.

### Sprint review demonstration

Run a curl set with controlled observable deviations, correct the movement, mute speech, and leave the camera view. Show persistence, cooldown, tracking abstention, and the final local summary.

### Risks and scope decisions

Aggressive thresholds can produce false coaching. Reduce the enabled rule set if examples do not support it. Wrist positioning and lateral flare remain disabled unless the available view and landmarks support those judgments.

### Handoff and review record

Deliver cue configuration, issue event schema, summary definitions, false-cue results, and the prototype demonstration to Sprint 5.

Review record: completed tickets, reviewer, evidence, results, defects, and carryover. Retrospective: one improvement, owner, and check date. Apply the master Definition of Done.

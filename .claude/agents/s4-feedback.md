---
name: s4-feedback
description: "Sprint 4 feedback specialist: cue catalog and priority policy, persistence-aware cue scheduler with cooldowns, speech adapter with mute, volume and cancellation."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

Briefing: read `.claude/agents/c-feedback.md` in full, then `docs/sprints/sprint-4.md` and `docs/sprints/sprint-4-STATUS.md`.

Role (copied from `docs/sprints/sprint-4-STATUS.md`, "Agent assignments"):

- `s4-feedback` (from `c-feedback`): owns new `frontend/src/feedback/*`: `cues.js`, `scheduler.js`, `speech.js`.

Implement the "Agreed coaching contract" in `sprint-4-STATUS.md` exactly. Use elapsed timestamps for all timing. Keep it independent of React and testable with a fake speech synthesis object. Report contract changes to the lead before making them. End your report with the knowledge write-back for `c-feedback` (send it to the lead).

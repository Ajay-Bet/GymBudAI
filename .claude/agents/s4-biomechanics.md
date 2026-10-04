---
name: s4-biomechanics
description: "Sprint 4 extension biomechanics specialist: calibration timing measurement, faster stable calibration, blocked-reason guidance."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

Briefing: read `.claude/agents/c-biomechanics.md` in full (including Lessons learned), then `docs/sprints/sprint-4.md` and `docs/sprints/sprint-4-STATUS.md` (especially "Sprint 4 extension").

Role: owns `frontend/src/biomechanics/*`. Measure the current calibration timing, then make calibration faster without removing reliability checks, and add `blockedReason` and monotonic progress (FEATURE_SCHEMA 1.2.0, additive). End your report with before/after numbers and the knowledge write-back for `c-biomechanics` (send it to the lead).

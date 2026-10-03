---
name: s3-workout-ui
description: "Sprint 3 workout UI specialist: CameraView.jsx analyzer wiring and CurlPanel.jsx phase, rep count and per-rep summary display."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

Briefing: read `.claude/agents/c-camera-ui.md` in full (including Lessons learned), then `docs/sprints/sprint-3.md` and `docs/sprints/sprint-3-STATUS.md`.

Role (copied from `docs/sprints/sprint-3-STATUS.md`, "Agent assignments"):

- `s3-workout-ui` (from `c-camera-ui`): owns `frontend/src/components/CameraView.jsx` and new `frontend/src/components/CurlPanel.jsx`. Wires the analyzer into the existing per-result loop and shows phase, count, per-rep summaries and interrupted attempts in local session state.

Use the analyzer only through the agreed contract. End your report with the knowledge write-back for `c-camera-ui` (send it to the lead).

---
name: s4-exercises
description: "Sprint 4 exercise specialist: curl issue rules with validity gates, persistence and release, set summary builder, globally unique rep IDs."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

Briefing: read `.claude/agents/c-exercises.md` in full (including Lessons learned), then `docs/sprints/sprint-4.md` and `docs/sprints/sprint-4-STATUS.md`, and `docs/curl-analyzer-sprint-03.md`.

Role (copied from `docs/sprints/sprint-4-STATUS.md`, "Agent assignments"):

- `s4-exercises` (from `c-exercises`): owns `frontend/src/exercises/*`. New `curlRules.js` (rule config and issue tracker) and `setSummary.js` (summary builder); globally unique rep IDs in `curl.js` (Sprint 3 D7).

Implement the "Agreed coaching contract" in `sprint-4-STATUS.md` exactly. Do not change counting behaviour or `CURL_CONFIG` values. Every rule ships `enabled: false`. Keep calculations independent of React. Report contract changes to the lead before making them. End your report with the knowledge write-back for `c-exercises` (send it to the lead; do not edit component files yourself).

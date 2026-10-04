---
name: c-docs
description: "Component owner for setup and reference documentation: READMEs, guides and contracts (not sprint records)."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `README.md`, `frontend/README.md`, `backend/README.md`
- `docs/*.md` guides such as `docs/vision-sprint-01.md` and `docs/biomechanics-sprint-02.md`

## Contracts to keep

- Sprint records (`docs/sprints/*`) belong to the sprint chat; master docs belong to the master chat.

## History

- Sprint 0 wrote the setup docs (`s0-docs`).
- Codex setup (2026-10-03, lead): added outer workspace `../AGENTS.md`, `.codex/WORKFLOW.md`, `.codex/AGENT-MAP.md`, and 28 routing briefs targeting the existing shared definitions. Added catch-up guidance to `AGENTS.md` and `docs/WORKFLOW.md`: incoming Sprint 1–4 documents are memory intake until implementation is explicitly requested. Canonical component knowledge remains in `.claude/agents/`.

- Sprint 4 close-out (2026-10-04): `docs/coaching-sprint-04.md` gained "Measuring the exit criterion on recordings".

## Open carryover

- None recorded.

## Lessons learned

- None yet.


## Sprint 4 extension continuity — 2026-10-03

- Coaching guide now distinguishes baseline history from integrated extension (Finish vs Stop, calibration1.2.0, score formula/gates, missing feature coverage, text/AI voice/approved wording, bounds/cancellation and pending browser checklist). Frontend/backend READMEs explain local startup and server-only secret configuration; official API references are linked.
- Existing curl videos are available per user, with independent review pending; previous absence statements are historical. Full sprint acceptance remains pending recordings/live demo/audio/physical evidence. Knowledge writeback: sprint lead from component specialists/reviewer.

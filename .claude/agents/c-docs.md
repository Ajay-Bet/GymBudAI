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

## Sprint 5 — 2026-10-04 (s5-docs)

- **Owns (added):** `docs/persistence-sprint-05.md` (identity design, API reference with examples captured from real responses, data model, idempotency, save queue, stored vs not stored, Cloud SQL pointer, accepted deviations, Sprint 6 handoff). READMEs cover local PostgreSQL, `alembic upgrade head`, DB env vars, Postgres-backed tests, sign-in, saving and history.
- **Resolved carryover (completion audit follow-up, 2026-10-04):** setup/reference docs now match recorded staging provisioning and 251-test persistence/browser verification (2026-10-04) and successful Backend/Frontend CI at main `e8cd228` (recorded 2026-10-05). These dates/results are historical evidence, not current cloud availability checks.
- **Lessons learned:** capture API examples from the running app, not the contract (it surfaced unstated behaviour); check sibling docs for statements made stale by user decisions.

## Completion audit fixes — 2026-10-04

- Root/backend READMEs, GCP setup and persistence reference distinguish completed staging provisioning from proposed Cloud Run deployment. Removed contradictory unprovisioned/unrun/pending acceptance statements; GCP save/reload runbook explicitly switches the API back to the application database after tests. No new cloud calls or provisioning.
- Persistence reference documents required summary rep/episode correspondence, event links, coverage ratio tolerance and exercise-supported views, agreed with c-backend. Valid payloads retain their summary/hash; interrupted attempt IDs do not become completed-rep links. c-validation owns regression evidence; the lead records final fresh test counts in the Sprint 5 handoff.
- Lesson: when appending verification evidence, reconcile every status table, handoff and setup paragraph; keep the application database separate from the destructive integration-test database in runbooks.

## Sprint 6 — 2026-10-04 (lead as documentation owner)

- **Owns (added):** `docs/analytics-sprint-06.md`, `docs/validation/sprint-6/**` (benchmark JSON, browser screenshots), frontend README analytics guidance. Requirements/status remain sprint lead owned.
- **Contracts:** guide defines observed ROM mean, raw-duration median, analyzed-rep detector denominator, episode/rep distinction, paired known-time weighted coverage and completeness; UTC storage/local workout-start day; exact stored configuration groups, explicit calibration/load/camera comparison limits. History uses stable nextCursor with legacy compatibility.
- **Evidence:** 328 backend, 322 Node, 48 DOM tests; lint/build/compile pass; local and rollback-isolated staging benchmarks saved, 1000 workouts/3000 reps under one second for the measured single-client request path. Browser production demo includes null ROM, low tracking, overlap, configuration separation and empty states; synthetic, not physical validation.
- **Carryover:** apply migration `0002_analytics_index` and restart existing app API for rollout; no staging application database was changed, no Cloud Run deployment or remote CI rerun. Earlier detector/device limitations retained.
- **Lesson:** unknown persisted configuration must remain distinct from an empty assessed-rule list. Save performance environment and query plans alongside timing; avoid rewriting earlier handoffs when resolving later carryover.

## Sprint 6 publication/activation — 2026-10-04

- User authorized main publication and activation. Handoff now records source9162b32, successful remote CI, actual staging app migration/index with preserved record counts, original-config API and frontend restart, active route/proxy verification. Previous benchmark rollback remains historical evidence. Rollout carryover is resolved; no deployed Cloud Run or authenticated real-user browser demo claimed.

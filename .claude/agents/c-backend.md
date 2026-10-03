---
name: c-backend
description: "Component owner for the FastAPI backend: API routes, schemas, models, services, database and migrations."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `backend/**` (FastAPI, Pydantic, SQLAlchemy, Alembic)

## Contracts to keep

- `GET /health` on `127.0.0.1:8080` returns `{"status":"ok"}`.
- Planned routes: `/api/auth`, `/api/users/me`, `/api/exercises`, `/api/workouts`, `/api/analytics/me`, with authenticated ownership on every read and write.

## History

- Scaffolded before Sprint 1 (`docs/backend-scaffold-handoff.md`). Accounts and persistence arrive in Sprint 5.

## Open carryover

- None recorded.

## Lessons learned

- None yet.

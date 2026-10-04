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


## Sprint 4 extension continuity — 2026-10-03

- Implemented optional `/api/coach/status`, `/tts`, `/wording` plus config/schemas/services and backend tests. Key only backend/.env/environment; .env Git-ignore verified without secret content inspection. Configuration booleans are not provider capability checks. No-key503 retains local operation.
- Supported configurable defaults gpt-4o-mini-tts/marin and gpt-4.1-mini Responses/strict schema per official links in backend README; proposed gpt-6-luna public API support not established. AI only selects approved variant indices; validates exact numeric finding schema/placement/thresholds/focus/score consistency. Never changes deterministic score. Review narration audibly experimental.
- Request caps2KiB TTS/8KiB wording; bounded streamed responses5MiB/256KiB, deadlines10s/8s, zero retries, process rate limits30/10perminute. Server TTS LRU128entries/16MiB with model/voice/purpose/instructions/text key. Public errors do not reveal provider content/key.
- 97 mocked pytest tests pass plus Python compilation; one existing Starlette TestClient/httpx deprecation warning. Real provider/audio not tested and no paid calls. Prototype runs loopback only; auth/persistence/deployment remain future sprint scope.
- Knowledge writeback: lead from s4-backend/review.

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

## Sprint 5 — 2026-10-04 (s5-backend)

- **Owns (added):** `backend/alembic.ini`, `backend/alembic/**` (head `0001_initial`, seeds `dumbbell-curl`).
- **Contracts:** routes `/api/auth/register|login|logout`, `/api/users/me`, `/api/exercises`, `/api/workouts` (create, `/{id}/sets`, `/{id}/finalize`, PATCH notes, list with `nextBefore`, detail). Errors `{"detail":{"code","message"}}`; non-owned workout → 404 `not-found`; 409 `conflict`/`workout-finalized`; 413 `request-too-large` (set 512 KiB, other writes 16 KiB); 422 without echoed input; 503 `database-unavailable` + `Retry-After: 5`. Full contract: `docs/sprints/sprint-5-STATUS.md`, reference `docs/persistence-sprint-05.md`.
- **Identity:** email + password, Argon2id (`argon2-cffi` 25.1.0, rehash on login), opaque bearer token stored as SHA-256, fixed 7-day expiry (`AUTH_SESSION_TTL_HOURS`), logout revokes the presented token; expired → `session-expired`, revoked/unknown → `not-authenticated`.
- **Config:** `DATABASE_URL`, `TEST_DATABASE_URL`, `DB_POOL_SIZE` 5, `DB_MAX_OVERFLOW` 2, `DB_POOL_TIMEOUT_S` 10, `CORS_ORIGINS`; statement timeout 10 s, connect timeout 5 s, sessions in UTC, `hide_parameters`.
- **Idempotency:** unique client ids per owner + `payload_sha256` of canonical JSON (sorted keys, UTC times, integral floats as ints); row lock per workout; IntegrityError → re-read and compare. Identical replay 200 even after finalize.
- **History:** Sprint 5 added accounts, SQLAlchemy 2.1 models, Alembic migration, workout persistence. 251 pytest pass on local PostgreSQL 18.4 (incl. s5-validation's ownership/idempotency/db-unavailable tests).
- **Open carryover:** no password reset/email verification; login rate limit per process and per email+IP only, register not limited; `request.client.host` is the proxy behind Cloud Run; list cursor can skip identical start times at a page boundary; timezone names pattern-checked only; 5-minute future-clock 422 is non-retryable; PATCH notes allowed after finalize.
- **Lessons learned:** Alembic `fileConfig` disables existing loggers (use `disable_existing_loggers=False`); `alembic check` needs a DB at head; set `timezone=UTC` on connections or replayed responses differ; FastAPI's default 422 echoes inputs including passwords; Python JSON accepts NaN, JSONB doesn't; tests refuse to drop a schema unless the DB name ends in `_test` (`ALLOW_TEST_SCHEMA_RESET=1`); changing the replay hash makes exact retries of older sets 409.

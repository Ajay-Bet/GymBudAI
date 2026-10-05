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

## Completion audit — 2026-10-04 (c-backend)

- **Evidence boundary:** inspected Sprint 5 requirements, saved staging/CI evidence and implementation. Ran schema-only crafted-request probes with `tests/conftest.py::make_set_payload(mode="review")` and `WorkoutSetIn.model_validate`; no database writes or cloud rerun. Historical completion evidence remains intact. These findings concern malformed requests, not demonstrated corruption from normal frontend saves.
- **Findings resolved after user-authorized follow-up:** `WorkoutSetIn` now requires typed summary rep/episode arrays and checks their unique IDs, shared row fields and event-to-rep links against the top-level rows. Linked episodes must be assessed, issue types must match those episodes, and issue-bearing flags require analyzed episode evidence. Partial episode `attemptIds` may still reference interrupted attempts without completed rep rows; low-coverage reps can retain observed issues without becoming issue-bearing. Coverage fraction must equal assessable/session time within `1e-9` relative/absolute tolerance, or be null when unknown/zero denominator prevents calculation. New submissions validate the view against the exercise's configured supported views; existing identical replays retain their behavior.
- **Compatibility and checks:** validation inspects the raw summary without rewriting it. Compared both real frontend wire fixtures against the pre-change schema from Git HEAD: accepted summaries and replay hashes are identical. Python compilation, crafted malformed-payload rejection probes and `git diff --check` passed. Independent `c-validation` review added 49 regressions and ran the full backend suite against an isolated disposable local database: **300 passed**, one existing Starlette warning; database removed. It verified the old schema accepted 29 malformed copy/coverage cases now rejected. No migration, paid operation or cloud rerun.
- **Next action:** lead records this fix and local evidence in the Sprint 5 handoff. Carry forward the existing recovery/rate-limit/pagination limitations; these validation defects are resolved.

## Sprint 6 analytics — 2026-10-04 (s6-backend)

- **Owns (added):** `app/api/analytics.py`, `app/schemas/analytics.py`, `app/services/analytics.py`, migration `0002_analytics_index` (composite owner/start/id index, existing owner/start index retained).
- **Contract:** authenticated `GET /api/analytics/me?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&timezone=IANA`; inclusive 1–366 local days converted to half-open UTC midnight boundaries with DST; session `startedAt` determines day. Invalid zone/date/cursor → 422; >2000 finalized sessions having any persisted set → 422 `range-too-large`, no truncation. Eligible UUID snapshot is captured before independent aggregates; concurrent newly finalized workouts appear on the next request. Excluded open/empty counts are advisory at query time.
- **Metrics:** SQL sums normalized set counts, SQL observed rep ROM average and duration median, independent assessed/unassessed episode counts (no linkage fanout), no-issue fraction=sum(noIssueReps)/sum(analyzedReps) or null. Duration input is currently mandatory; empty rep groups have null median. ROM count excludes nulls. Coverage sums only sets with both known time fields; no known pairs → null times/fraction; zero denominator → null fraction. `coverageKnownSets` and `coverageComplete` disclose partial observation. Counts zero are real counts; missing measurements remain null.
- **Comparability:** configuration groups include exercise/view/side/analyzer/feature/rules/schema/mode/sorted assessed-rule types/minimum form coverage and supported-view eligibility. Unknown legacy metadata stays null and cannot earn comparison eligibility; unsupported persisted views cannot earn it. Groups include per-workout points and group metrics; `comparisonEligible` requires known metadata, supported view and ≥2 points, while each metric still needs ≥2 observed points. Overall totals describe mixed sessions, never an improvement delta. Calibration targets, weight/load and camera placement are not stored; this endpoint cannot establish physical equivalence or detector accuracy. Feedback version does not affect the metric group key.
- **History:** `GET /api/workouts?cursor=<opaque base64url timestamp/id>` plus `nextCursor` extends existing `before`/`nextBefore`; cursor and before are mutually exclusive. Descending strict `(startedAt,id)` keyset handles ties; legacy before behavior retained. Set totals are aggregated only for the authenticated owner's bounded page. Cursor is navigation, never authorization.
- **Checks:** Python compilation, cursor extreme-date/null-metric probes and diff checks passed. Independent validator owns database/test evidence; final full backend suite **328 passed** in 24.86 s with one existing Starlette warning; disposable test database removed. No backend specialist cloud calls or commits. Lead performed the staging check below through the existing proxy.
- **Lessons:** session and set timestamps must have distinct SQL aliases; UTC conversion can overflow at extreme dates and must become 422. Keep event counts separate from rep aggregates to avoid counting a rep once per issue linkage. Freeze eligible IDs before bounded aggregate queries to avoid a new-finalization cap race.
- **Config validation follow-up:** optional typed `assessedRuleTypes` and `minFormCoverage` validate new summaries without rewriting raw JSON or replay hashes; SQL marks legacy non-string rule arrays and nonnumeric/out-of-range minimum coverage as unknown null. Such groups retain normalized descriptive counts but cannot earn comparison eligibility. Extreme-date cursor probe and empty-metric null probe passed.
- **Independent validation (s6-validation):** the old exact-response assertion was adjusted for the additive `nextCursor` key; independent config rejection/legacy sanitation/weighted-coverage regressions were added. Synthetic local PostgreSQL baseline (1000 owned finalized sessions/3000 reps): final config-sanitization build analytics 211.45–251.21 ms, history 4.14–4.82 ms; history plan uses backward index-only scan returning 20 rows. Actual rep aggregation EXPLAIN: 117.599 ms, 1002 grouped output rows, no disk spills. Evidence: `docs/validation/sprint-6/local-benchmark.json`. Independent source review found no remaining defects. Full-suite final count is tracked in Checks above.
- **Staging evidence (lead):** `docs/validation/sprint-6/staging-benchmark.json` records Mac arm64 local FastAPI TestClient → existing Cloud SQL Auth Proxy → staging PostgreSQL 18 `db-f1-micro`, `us-central1`, test database. Synthetic 1000 owned finalized workouts/1000 sets/3000 reps, three calls each: history 174.8–242.9 ms; analytics 559.3–701.8 ms, meeting the agreed <1 second target in this scope. Second-owner analytics stayed zero and another owner’s detail returned 404. New owner/start/id index used a backward index-only scan. Migration to `0002_analytics_index` plus Alembic model-drift check passed inside an outer rollback transaction. Before/after test DB remained exactly `0001_initial`, 1 workout, 0 sets, 0 reps. Single-client synthetic evidence does not measure deployed Cloud Run, browser/network transport or concurrent-load latency; no staging rollout occurred.

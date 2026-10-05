# Sprint 05 — User accounts and workout storage

Status: **completed 2026-10-04** on the evidence below (local and staging Cloud SQL). Push and merge pending Ajay's confirmation.
Last updated: 2026-10-04

## Scope and acceptance criteria

- User-supplied requirements: [sprint-5.md](sprint-5.md) (GB 501 authentication, GB 502 schema, GB 503 reliable saves, GB 504 owned history, verification checklist, exit criteria, review demo). Ajay's instructions for this chat (via the coordinator, 2026-10-04): follow `docs/WORKFLOW.md` and `AGENTS.md` exactly; build and test locally first; anything needing his Google account or billing is his to do, asked once in one short list; flag (not decide) conflicts between the master rules and the sprint doc; concise, detailed replies; commit with no co-author line, close message "Sprint 5 completed", push and merge to `main` approved at sprint close.
- Prerequisites and evidence (checked 2026-10-04 on this Mac, `main` at `4ee9ab3`):
  - Sprint 4 delivers `set-summary-1.0.0` (`frontend/src/exercises/setSummary.js`) with globally unique `set-`, rep (`curl-<uid>-<n>`) and episode (`issue-<uid>-<n>`) ids. The sprint doc calls it "validated"; it is unit-tested, and no form rule is enabled (Sprint 4 close).
  - The backend had no database code: no SQLAlchemy, Alembic or driver in `backend/requirements.txt`; only `/health` and the Sprint 4 `/api/coach/*` proxy. `backend/app/database` and `models` were empty packages.
  - Local PostgreSQL 18.4 (Homebrew) is running on this Mac. Docker is not installed.
  - The existing `LoginPage.jsx`/`RegisterBox.jsx` call a non-existent `http://localhost:8080/users/login` (leftover from the removed Java backend).
  - **Entry requirement (resolved during the sprint):** GCP project access, billing owner, Cloud SQL connection method and staging configuration are unset (Sprint 0 record, `c-infra`). These need Ajay's account. Local integration continues; the cloud deliverable stays open until the real Cloud SQL path is verified (sprint doc, "Risks").
- Out of scope (sprint doc): dataset uploads, complex profile settings, dashboard trends (Sprint 6). Also out: password reset by email, account deletion UI, OAuth/social login.

### Conflicts and gaps flagged (not decided by this chat)

- **Cloud SQL staging vs. no GCP access.** The exit criterion requires "staging Cloud SQL"; nothing is provisioned and the decisions are Ajay's. Flagged, not a rule conflict.
- **Identity choice.** The sprint doc asks for it "at sprint planning". Lead default (changeable by Ajay before close): a documented account implementation, below. A managed provider (Identity Platform / Firebase Auth) would need his GCP project.
- **Stack note, not new:** project instructions name TypeScript for the frontend; the existing app is JSX (unchanged since Sprint 0, recorded in `c-frontend-app`). Sprint 5 keeps JSX.

## Agent assignments and shared contracts

- Lead (this chat): contract, local Postgres setup, integration, sprint records, component write-back, handoff.
- `s5-backend` (from `c-backend`): `backend/app/**`, `backend/alembic/**`, `backend/alembic.ini`, `backend/requirements*.txt`, `backend/.env.example`, and backend tests `backend/tests/conftest.py`, `test_auth_api.py`, `test_workouts_api.py`, `test_migrations.py` (exception to `c-validation` ownership, as in Sprint 4).
- `s5-frontend` (from `c-frontend-app`): `frontend/src/api/auth.js`, `api/workouts.js`, `api/http.js`, `api/workoutPayload.js`, `api/saveQueue.js`, new `frontend/src/auth/*`, `App.jsx`, `pages/LoginPage.jsx`, `pages/RegisterPage.jsx`, new `pages/HistoryPage.jsx`, `vite.config.js`, and `components/LoginBox.jsx`, `RegisterBox.jsx`, `Navbar.jsx` (assigned this sprint).
- `s5-workout-ui` (from `c-camera-ui`): `frontend/src/components/CameraView.jsx` save wiring and new `components/SaveWorkoutPanel.jsx`.
- `s5-infra` (from `c-infra`): `.github/workflows/backend.yml`, new `infra/local/*`, new `infra/gcp/*` (proposed configuration only, nothing provisioned).
- `s5-validation` (from `c-validation`): independent tests `backend/tests/test_ownership.py`, `test_idempotency.py`, `test_db_unavailable.py`; frontend `frontend/tests/workout-payload.test.js`, `save-queue.test.js`, `auth-api.test.js`, `frontend/tests/ui/save-panel.test.jsx`; independent review of all Sprint 5 changes.
- `s5-docs` (from `c-docs`, after implementation): `backend/README.md`, `README.md`, `frontend/README.md`, new `docs/persistence-sprint-05.md` (API reference, identity design, retry semantics, recovery limitations).

### Agreed persistence contract (lead, 2026-10-04)

Full field names are fixed here before parallel work (Sprint 4 retrospective). JSON is camelCase on the wire; Python/SQL is snake_case. All times on the wire are ISO 8601 with offset; stored as UTC `timestamptz`. `*Ms` fields are durations or offsets in ms on the FeatureFrame clock, relative to the set start.

**Identity decision (GB 501):** email + password accounts implemented in FastAPI.
- Hashing: `argon2-cffi` 25.1.0 `PasswordHasher()` defaults (Argon2id); rehash on login when `check_needs_rehash`.
- Sessions: opaque random token (`secrets.token_urlsafe(32)`), sent as `Authorization: Bearer <token>`. The database stores only its SHA-256 hash in `auth_sessions`. Expiry 7 days from login (`AUTH_SESSION_TTL_HOURS`, default 168), no sliding renewal. Logout sets `revoked_at`; expired or revoked tokens give 401. Frontend keeps the token in `localStorage` (`gymbud.auth`) so closing and reopening the client stays signed in until expiry; logout deletes it and calls the API.
- Passwords 10–128 chars; email normalized to lower case, unique. Login failure is a uniform 401 `invalid-credentials` (no user enumeration). Per-process login rate limit 10/min per email+IP (prototype; not distributed).
- Recovery limitation: no password reset or email verification this sprint; a lost password needs a database operator.

**Errors:** `{"detail": {"code": "<kebab-code>", "message": "<text>"}}`. 401 `not-authenticated` / `invalid-credentials` / `session-expired`; 404 `not-found` for any workout not owned by the caller (never 403, no existence leak); 409 `conflict` (same client id, different content) or `workout-finalized`; 422 FastAPI validation; 503 `database-unavailable` when SQL cannot be reached (no stack traces).

**Database (Alembic `0001_initial`, PostgreSQL only):**
- `users`: `id` uuid pk, `email` text unique not null (lower-case check), `password_hash` text not null, `display_name` text null, `created_at`, `updated_at`.
- `auth_sessions`: `id` uuid pk, `user_id` fk users on delete cascade, `token_hash` char(64) unique, `created_at`, `expires_at`, `revoked_at` null; index on `user_id`.
- `exercises`: `id` text pk (`dumbbell-curl`), `name`, `supported_views` text[] (`{side}`), `analyzer_version` (`curl-1.1.0`), `active` bool. Seeded by the migration.
- `workout_sessions`: `id` uuid pk, `user_id` fk not null, `client_session_id` text not null, `exercise_id` fk exercises, `status` (`open`|`finalized`, check), `started_at`, `ended_at` null, `timezone` text null (IANA, display only), `notes` text null (≤ 1000), `created_at`, `updated_at`, `finalized_at` null. Unique (`user_id`, `client_session_id`). Check `ended_at >= started_at`.
- `workout_sets`: `id` uuid pk, `session_id` fk on delete cascade, `client_set_id` text not null, `set_index` int ≥ 1, `side` (`left`|`right`), `view` text, `mode` (`validated-only`|`review`), `started_at`, `ended_at`, `summary_schema_version`, `analyzer_version`, `feature_version`, `rules_version`, `feedback_version` null, `completed_reps`, `analyzed_reps`, `issue_bearing_reps`, `no_issue_reps` (ints ≥ 0), `no_issue_fraction` float null, `not_analyzed_reason` null, `tracking_assessable_ms`, `tracking_session_ms` (null allowed), `tracking_coverage` float null in [0,1], `interrupted_attempts` jsonb, `episode_counts_by_type` jsonb, `summary` jsonb (the full `set-summary-1.0.0` object without `cueLog`), `payload_sha256` char(64), `created_at`. Unique (`session_id`, `client_set_id`), unique (`session_id`, `set_index`). Checks: `analyzed_reps <= completed_reps`, `issue_bearing_reps <= analyzed_reps`, `no_issue_reps = analyzed_reps - issue_bearing_reps`.
- `reps`: `id` uuid pk, `set_id` fk on delete cascade, `client_rep_id` text, `rep_index` int ≥ 1, `start_ms`, `end_ms`, `duration_ms` (≥ 0), `min_flexion_deg`, `max_flexion_deg`, `rom_deg` (null allowed), `form_coverage` null in [0,1], `analyzed` bool, `issue_bearing` bool, `issue_types` text[]. Unique (`set_id`, `client_rep_id`), unique (`set_id`, `rep_index`). Check `end_ms >= start_ms`.
- `form_events`: `id` uuid pk, `set_id` fk on delete cascade, `client_event_id` text, `issue_type` text, `start_ms`, `end_ms` null (open at finish), `peak` float null, `peak_unit` text null, `assessed` bool, `rules_version` text. Unique (`set_id`, `client_event_id`).
- `form_event_reps`: (`form_event_id` fk, `rep_id` fk) pk, both cascade. Links only rows of the same set (enforced in the service, checked by tests).
- Client ids are scoped per owner through `workout_sessions.user_id`, so another user's id never collides or leaks.

**API:**
- `POST /api/auth/register` `{email, password, displayName?}` → 201 `{accessToken, tokenType:"bearer", expiresAt, user}`; 409 `email-taken`.
- `POST /api/auth/login` `{email, password}` → 200 same shape; 401 `invalid-credentials`; 429 `rate-limited`.
- `POST /api/auth/logout` → 204 (revokes the presented token).
- `GET /api/users/me` → `{id, email, displayName, createdAt}`.
- `GET /api/exercises` → `[{id, name, supportedViews, analyzerVersion}]` (auth not required).
- `POST /api/workouts` `{clientSessionId, exerciseId, startedAt, timezone?}` → 201 new or 200 existing (same owner, same `exerciseId`/`startedAt`); 409 `conflict` if different; 422 unknown exercise.
- `POST /api/workouts/{workoutId}/sets` (batch event submission, one set with its reps and form events, one transaction) → 201 created or 200 identical replay (matched by `clientSetId` and `payload_sha256` of the canonical JSON body); 409 `conflict` when the same `clientSetId` arrives with different content; 409 `workout-finalized`; 404 not owned.
- `POST /api/workouts/{workoutId}/finalize` `{endedAt}` → 200 workout detail; idempotent (repeat returns the same); `endedAt` must be ≥ `startedAt` and ≥ every set's `endedAt`.
- `PATCH /api/workouts/{workoutId}` `{notes}` → 200 (the edit path for ownership tests).
- `GET /api/workouts?limit=20&before=<ISO>` → `{items:[WorkoutListItem], nextBefore}`; limit 1–100, newest `started_at` first, owner only.
- `GET /api/workouts/{workoutId}` → `WorkoutDetail {id, clientSessionId, exerciseId, status, startedAt, endedAt, timezone, notes, totals:{sets, completedReps, analyzedReps, issueBearingReps}, sets:[SetDetail]}`; `SetDetail` = stored set columns + `summary` + `reps` + `formEvents` (each event lists `repClientIds`).
- `WorkoutListItem` = `{id, clientSessionId, exerciseId, status, startedAt, endedAt, totals}`. Totals are derived by SQL from `workout_sets` (consistent summary query for Sprint 6).

**Set payload (`WorkoutSetIn`, built by `frontend/src/api/workoutPayload.js` from the Sprint 4 summary and `analyzerSession.completedReps`):**
`{clientSetId, setIndex, startedAt, endedAt, summary, reps:[{clientRepId, repIndex, startMs, endMs, durationMs, minFlexionDeg, maxFlexionDeg, romDeg, formCoverage, analyzed, issueBearing, issueTypes}], formEvents:[{clientEventId, issueType, startMs, endMs, peak, peakUnit, assessed, rulesVersion, repClientIds}]}`
- `summary` is the `set-summary-1.0.0` object minus `cueLog` (the cue log stays local). `summary.setId` must equal `clientSetId`; `summary.exerciseId` must equal the workout's exercise.
- `startedAt`/`endedAt` (wall clock, UTC ISO): client sets `endedAt` = time of Finish set, `startedAt` = `endedAt − (summary.endedMs − summary.startedMs)`. Derived, recorded as such.
- Server validation (422): `summary.schemaVersion == "set-summary-1.0.0"`; `summary.units` equals the Sprint 4 units map for the keys the server reads; `analyzerVersion`, `featureVersion`, `rulesVersion` non-empty strings ≤ 64 chars matching `^[a-z0-9][a-z0-9._-]*$`; side/view/mode allowed values; times aware, `endedAt ≥ startedAt`, not more than 5 min in the future, not before 2020; rep and event ids unique in the payload, ≤ 128 chars; rep indices unique; `endMs ≥ startMs`; fractions in [0,1]; `trackingCoverage.assessableMs ≤ sessionMs`; `repClientIds` reference reps in the same payload; counts agree with the rows (`completedReps == len(reps)`, `analyzedReps`, `issueBearingReps`, `noIssueReps`, `episodeCountsByType` vs assessed events). Payload ≤ 512 KiB; ≤ 500 reps and ≤ 2000 events per set.

**Database configuration:** `DATABASE_URL` (SQLAlchemy URL, `postgresql+psycopg://`), default for local development `postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_dev`; tests use `TEST_DATABASE_URL` (default `.../gymbud_test`). Pool: `DB_POOL_SIZE` 5, `DB_MAX_OVERFLOW` 2, `DB_POOL_TIMEOUT_S` 10, `pool_pre_ping`, `pool_recycle` 1800, statement timeout 10 s. Cloud SQL (proposed): Cloud Run's built-in Unix socket `host=/cloudsql/<PROJECT:REGION:INSTANCE>` in the same `DATABASE_URL`, Cloud SQL Auth Proxy locally; password from Secret Manager. Connection budget: max instances × (pool + overflow) ≤ Cloud SQL `max_connections` − reserve. `CORS_ORIGINS` env (empty = none; dev uses the Vite proxy).

**Frontend modules (shared between `s5-frontend` and `s5-workout-ui`):**
- `api/http.js`: `apiRequest(path, {method, body, token, signal, timeoutMs=10000})` → parsed JSON; throws `ApiError {status, code, message, retryable}` (`retryable` true for network errors, timeouts, 5xx, 429).
- `auth/AuthContext.jsx`: `AuthProvider`, `useAuth()` → `{user, token, status:'loading'|'signed-in'|'signed-out', login(email,pw), register(email,pw,displayName), logout()}`; a 401 from any call signs out locally.
- `api/workouts.js`: `createWorkout`, `submitSet`, `finalizeWorkout`, `listWorkouts`, `getWorkout`, `updateWorkoutNotes` (each takes `token` and returns parsed JSON).
- `api/saveQueue.js`: `createSaveQueue({storage=localStorage, api, now})` persisted under `gymbud.pendingSaves.v1`: entries `{id: clientSetId, clientSessionId, exerciseId, workoutStartedAt, timezone, payload, status:'pending'|'saving'|'saved'|'failed', attempts, lastError, savedWorkoutId}`; `enqueue(entry)`, `save(id, token)` (create workout idempotently, then submit set; same ids on every retry), `retry(id, token)`, `dismiss(id)` (explicit, removes the entry), `list()`, `subscribe(fn)`. Failed entries survive reload. `finalize(clientSessionId, endedAt, token)`.
- `components/SaveWorkoutPanel.jsx` (s5-workout-ui): shown after Finish set. Signed out: "Sign in to save" link, summary kept in the queue. Signed in: auto-saves; states Saving / Saved (link to history) / Failed with reason, **Retry** and **Dismiss**. **Finish workout** finalizes the page's workout. One workout = all sets finished on the camera page since load or since the last Finish workout; `clientSessionId` = `workout-<uuid>`.
- `pages/HistoryPage.jsx` at `/history` (signed in): list with dates in the user's timezone, then detail showing every saved summary field with units and denominators.

## Progress and decisions

- 2026-10-04 lead: local role `gymbud` and databases `gymbud_dev`, `gymbud_test` created on Homebrew PostgreSQL 18.4 (local trust auth). Pinned `SQLAlchemy==2.1.3`, `alembic==1.20.0`, `psycopg[binary]==3.3.6`, `argon2-cffi==25.1.0`, `email-validator==2.3.0` installed in `backend/.venv`.

- 2026-10-04 Ajay: GCP project `gymbud-510623` (name GymBud), free trial ($300 credit). gcloud CLI not yet installed on this Mac; region and budget pending.

## Validation and review evidence

- Agent checks (2026-10-04, local PostgreSQL 18.4): `s5-backend` backend pytest 201 passed (97 coach + 104 new; 1 existing Starlette warning), `alembic check` no drift, uvicorn+curl smoke, 8 concurrent identical creates/submits → one 201 and seven 200, one row set. `s5-frontend`/`s5-workout-ui`: frontend `npm test` 279 node + 17 UI, lint clean, build ok. `s5-infra`: setup script no-op on this Mac, create/password paths on throwaway names, both YAML files parse; CI not run remotely, compose and GCP script not run. `s5-docs`: every documented command run; API examples captured from real responses.
- **Lead live review demo (2026-10-04, headless Chrome 153, Vite 5173 → FastAPI 8080 → `gymbud_dev`, video-file source, default settings):** user A registered and signed in through the UI. `idealform-sideangle.mp4` counted 8 reps, `normal-swinging-sideangle.mp4` 4 (same as Sprint 4). Finish set → auto-saved ("Saved"), Finish workout → finalized. A new tab ("reopen the client") stayed signed in; `/history` and `/history/<id>` showed the set, 8 reps with ROM/duration and every summary field. All 31 sent summary fields equal the stored ones (key-order-insensitive compare; `cueLog` intentionally not sent). Replaying the accepted set: 200, still 1 set and 4 reps, totals unchanged; re-creating the workout: 200. User B: detail 404 `not-found`, list 0 items, append 404. Script: scratchpad `e2e_save.mjs` (not in the repo).
- **Defect found live and fixed (lead):** `HistoryPage.jsx` `formatDate` passed `dateStyle`/`timeStyle` with `timeZoneName`, which `Intl.DateTimeFormat` rejects, so `/history` rendered blank whenever a workout existed. Fixed with explicit fields; DOM test requested from `s5-validation`. Lesson: agent unit runs missed it because no test rendered a populated history page.
- Lead change: `HomeHero.jsx` reads `useAuth()` instead of the dead `localStorage.token` key (Login link vs history avatar).
- Accepted deviations (lead): 413 `request-too-large` over 512 KiB (16 KiB for other writes); 422 without echoed input; `cueLog` dropped server-side; finalize repeat returns stored state; logout needs a valid token (frontend clears locally anyway); `/history/:workoutId`; expired → `session-expired`, revoked/unknown → `not-authenticated`; `Retry-After: 5` on 503; strict `before` paging cursor (identical start times at a page boundary may be skipped); PATCH notes allowed after finalize; registration not rate-limited.


- **Independent review (`s5-validation`, 2026-10-04):** 48 backend + 53 frontend tests added; no Critical/High. M1 (save queue entries had no owner on a shared browser), M2 (empty open workout left after a 422), L1 (multi-tab queue loss), L2 (unguarded test schema drop), L3 (1 vs 1.0 replay hash) fixed by the owners and re-tested; the M1 fix has a test that fails when scoping is removed. L4 (register/login rate limits, `email-taken` disclosure, proxy client IP) and L5 (future-clock 422) recorded as limitations. Mutation checks: removing the owner filter fails 6 tests, disabling replay hashing fails 6.
- **Final local checks (lead, branch `claude/project-thread-pj88q3`):** backend pytest 251 passed (1 existing Starlette warning); frontend `npm test` 319 node + 39 UI, lint clean, build ok, `git diff --check` clean.
- **Staging Cloud SQL (lead, 2026-10-04, Ajay's go):** `staging-cloudsql.sh` with `PROJECT_ID=gymbud-510623 REGION=us-central1` created `gymbud-staging-pg` (PG18 Enterprise `db-f1-micro`, PITR, deletion protection, RUNNABLE), `gymbud_staging`, `gymbud_staging_test`, user `gymbud` (password generated into Secret Manager only, never printed), secrets `gymbud-staging-db-password` and `gymbud-staging-database-url`, SA `gymbud-api-staging` (`cloudsql.client` + accessor on the two secrets). The budget step failed (Billing Budget API disabled); enabled it and created "GymBud staging" $25 with 50/90/100 % alerts (script fixed). Connected with Cloud SQL Auth Proxy v2.26.0 (`--gcloud-auth`, port 5433, SHA-256 `47c56cc8…c159`).
  - `alembic upgrade head` on empty `gymbud_staging` → `0001_initial`; `alembic check` no drift; upgrade re-run on the existing staging DB twice (API start-ups) → no-op.
  - Backend pytest against `gymbud_staging_test`: **251 passed** in 242 s.
  - Review demo against staging (FastAPI 8080 → proxy → Cloud SQL, headless Chrome, video source): `idealform-sideangle` 8 reps saved and finalized; all 31 summary fields round-trip; replay 200 with 1 set/8 reps unchanged; workout re-create 200; user B detail 404, list 0, append 404.
  - **Closed the application** (stopped FastAPI and quit Chrome), restarted both: the reopened client was still signed in and `/history` listed the 8-rep workout from staging.
  - **SQL unavailable:** stopped the proxy → `/api/exercises` 503 `database-unavailable` (no internals), `/health` 200; finishing a `normal-swinging-sideangle` set showed "Save failed — Saved workouts are temporarily unavailable" with Retry, entry kept as `failed`. Restarted the proxy, Retry → Saved (attempt 2), server holds 1 set / 4 reps, no duplicate. (Earlier the proxy also stopped on its own time limit; the API returned 503 the same way.)

## Handoff

- **Ticket status:**
  - GB 501 authentication: done. Email + password accounts (Argon2id), opaque bearer token stored hashed, fixed 7-day expiry, logout revokes; invalid, expired and revoked credentials give 401 (tests local and staging).
  - GB 502 schema: done. Alembic `0001_initial` creates users, auth sessions, exercises, workouts, sets, reps, form events and event→rep links with constraints; empty and existing staging databases verified.
  - GB 503 reliable saves: done. Client session/set/rep/event ids plus payload hash make retries idempotent (sequential, after-commit timeout, concurrent); failed saves stay visible with Retry/Dismiss and survive reload.
  - GB 504 owned history: done. Every query filters by the authenticated owner; cross-user read/list/append/edit/finalize → 404 (tests local and staging, plus browser demo).
- **Exit criteria:** signed-in save and reload from staging Cloud SQL after closing the application — met; duplicate submission creates no records — met; ownership tests pass — met; empty-database migration — met. Identity design and recovery limits recorded in `docs/persistence-sprint-05.md`.
- **Review demo:** run by the lead in headless Chrome against staging (above). Ajay has not watched it live; he can repeat it with the steps in `docs/persistence-sprint-05.md`.
- **Reviewer:** `s5-validation` (independent agent review). No human code review.
- **Limitations and carryover:** no password reset, email verification, account deletion or "sign out everywhere" (a lost password needs a database operator); login rate limit per process, register not limited; `localStorage` token is exposed to XSS; list cursor can skip identical start times at a page boundary; future client clock > 5 min → non-retryable 422; a dismiss in another tab can reappear; PATCH notes allowed after finalize; GitHub Actions `backend.yml` not yet run on GitHub; Cloud Run not deployed (Sprint 12); connection budget on `db-f1-micro` is at its limit with 2 Cloud Run instances plus a test run; staging instance costs trial credit while running (stop it with `gcloud sql instances patch gymbud-staging-pg --activation-policy=NEVER` if unused).
- **Delivered to Sprint 6:** migration files (`backend/alembic/`), authenticated API docs (`docs/persistence-sprint-05.md`), totals derived in SQL from `workout_sets`, rep rows with ROM/duration/coverage, retry semantics, staging evidence above. Validated-only saves have no event→rep links (rules disabled); analytics must not count empty open workouts.
- **Retrospective:** improvement — render every new page with real-shaped data in a DOM test before the live run (the blank `/history` crash passed all agent checks). Owner: Sprint 6 lead. Check at the Sprint 6 start. The Sprint 4 retrospective item (agree full field names before parallel work) was applied: no field-name mismatches between agents this sprint.
- **Agents:** `s5-` agents retired in `.claude/AGENT-MAP.md`; component files `c-backend`, `c-frontend-app`, `c-camera-ui`, `c-infra`, `c-validation`, `c-docs` updated.
- **Branch:** `claude/project-thread-pj88q3`, commit "Sprint 5 completed". `.claude/launch.json` (untracked before the sprint) is left uncommitted.
- **Exact next action:** Ajay confirms push and merge to `main`; then Sprint 6 (analytics) in a new chat.


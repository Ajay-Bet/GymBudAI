# Sprint 5 accounts and workout storage

This guide covers GymBud's accounts, saved workouts and workout history added in Sprint 5 (GB 501–504). It is the reference for the authenticated API, the database schema, retry and idempotency rules, and what the browser and the server store. Sprint status, decisions and acceptance evidence are kept in [sprint-5-STATUS.md](sprints/sprint-5-STATUS.md). The agreed contract is in "Agreed persistence contract" there, and the deviations accepted during implementation are listed [below](#accepted-deviations-from-the-agreed-contract).

## Status: what is implemented, tested and proposed

| Area | State (2026-10-04) |
|---|---|
| Email and password accounts, bearer sessions, logout | Implemented in FastAPI. Tested locally against PostgreSQL 18.4 (Homebrew) |
| Alembic migration `0001_initial` (empty database, upgrade, downgrade, upgrade again, no model drift) | Implemented. Tested locally (`backend/tests/test_migrations.py`) |
| Workout create, set submission, finalize, notes, list, detail with ownership checks and idempotent retries | Implemented. Tested locally (`backend/tests/test_workouts_api.py`, `test_auth_api.py`) |
| 503 `database-unavailable` when PostgreSQL cannot be reached | Implemented. Checked locally with an unreachable database URL |
| Browser sign-in, register, persisted save queue, save panel, history pages | Implemented in the React app. Independent frontend tests and the live browser walkthrough are tracked in the sprint record |
| Backend CI with a PostgreSQL service (`.github/workflows/backend.yml`) | Written. It has not yet run on GitHub |
| Staging Cloud SQL | **Provisioned and verified 2026-10-04** (`gymbud-510623:us-central1:gymbud-staging-pg`): migration, 251 backend tests, browser save/reload, replay, cross-user and outage checks passed through the Cloud SQL Auth Proxy. Cloud Run not deployed. See [Cloud SQL plan](#cloud-sql-plan-proposed) and `docs/sprints/sprint-5-STATUS.md` |

The Sprint 5 exit criterion requires a save and reload against staging Cloud SQL. That part stays open until the real Cloud SQL path has been verified.

## Identity design (GB 501)

GymBud uses one authentication method: email and password accounts implemented in FastAPI (`backend/app/services/auth.py`). No managed identity provider is used in Sprint 5. A managed provider (Identity Platform or Firebase Auth) would need the GCP project and remains a possible later change.

- **Password hashing.** Passwords are hashed with Argon2id using the defaults of `argon2-cffi` 25.1.0 `PasswordHasher()`. If those defaults change in a later library version, the hash is upgraded on the user's next successful login (`check_needs_rehash`). Passwords must be 10–128 characters. The password itself is never stored or logged.
- **Email.** Email addresses are validated at registration, trimmed and lower-cased, and must be unique. Login compares the lower-cased value, so `Ana@Example.com` and `ana@example.com` are the same account.
- **No user enumeration.** A wrong password and an unknown email both return the same 401 `invalid-credentials`. For an unknown email the server still runs a hash verification, so response timing does not show which emails exist. Registration with an existing email does return 409 `email-taken`; that is a known, accepted disclosure for this prototype.
- **Session tokens.** A successful register or login issues an opaque random token (`secrets.token_urlsafe(32)`, 43 characters). The client sends it as `Authorization: Bearer <token>`. The database stores only the token's SHA-256 hash (`auth_sessions.token_hash`), so a copy of the database does not contain usable tokens.
- **Expiry.** Each token expires a fixed 7 days after login (`AUTH_SESSION_TTL_HOURS`, default 168). There is no sliding renewal: using the app does not extend the session. An expired token returns 401 `session-expired`; a revoked or unknown token returns 401 `not-authenticated`.
- **Logout.** `POST /api/auth/logout` sets `revoked_at` on the presented token, so it cannot be used again. Other sessions of the same user (for example another browser) stay valid until they expire or are logged out. The endpoint needs a valid token. The frontend clears its local session first, so the browser is signed out even if the API call fails or the token had already expired.
- **Login rate limit.** Login is limited to 10 attempts per minute per email and client IP, in a sliding window held in the API process's memory. It returns 429 `rate-limited` with `Retry-After`. The limit is per process: it resets when the API restarts and is not shared between Cloud Run instances. It is a prototype safeguard, not a distributed lockout. Registration is not rate-limited.
- **Token storage in the browser.** The frontend keeps `{token, expiresAt, user}` in `localStorage` under `gymbud.auth`, so closing and reopening the browser keeps the user signed in until expiry. On load, an expired token is discarded and a stored one is checked with `GET /api/users/me` (a 401 signs out; a network failure keeps the stored session so the app works offline). Any 401 for the current token signs out locally, and a timer signs out when the token expires while the page is open.
- **XSS trade-off.** Any script running on the GymBud origin can read `localStorage`, so a cross-site scripting bug would expose the token for up to 7 days. An `HttpOnly` cookie would hide the token from scripts but needs CSRF protection and same-site deployment decisions that belong with the Sprint 12 deployment. For Sprint 5 this risk is accepted, mitigated by short fixed expiry, server-side revocation on logout, hashed storage, no third-party scripts in the app, and React's default output escaping.

### Recovery limitations

- **No password reset.** There is no "forgot password" flow and no email sending. A user who loses their password needs a database operator to help. The existing `/reset-password` page is a leftover design mock-up and is not connected to any API.
- **No email verification.** Anyone can register with any address they type; ownership of the address is not checked.
- **No account deletion or email change** through the UI or API. Deleting a `users` row removes that user's sessions and workouts through `ON DELETE CASCADE`, but this is a manual database operation.
- **No "sign out everywhere".** Each session is revoked individually.

## API reference

All routes are served by FastAPI (`backend/app/api/*`). The interactive schema is at <http://127.0.0.1:8080/docs> while the backend runs locally. In development the browser calls these routes through the Vite proxy on the same origin (`/api/auth`, `/api/users`, `/api/exercises`, `/api/workouts`), so no CORS setup is needed.

### Conventions

- JSON keys are camelCase on the wire. Request bodies reject unknown keys (422).
- Times on the wire are ISO 8601 with an offset (`2026-10-04T23:19:15Z`). They are stored as UTC `timestamptz`. Request times must be timezone-aware, not before 2020-01-01 and at most 5 minutes in the future.
- Fields ending in `Ms` are milliseconds on the browser's FeatureFrame clock, relative to the set; they are not wall-clock times.
- Authenticated routes need `Authorization: Bearer <token>`.
- Request body limits: 512 KiB for `POST /api/workouts/{workoutId}/sets`, 16 KiB for every other write under `/api/auth`, `/api/users`, `/api/exercises` and `/api/workouts`. Larger bodies get 413 `request-too-large` before parsing.

### Errors

Application errors use one shape:

```json
{"detail": {"code": "not-found", "message": "Workout not found."}}
```

| Status | `code` | When |
|---|---|---|
| 401 | `not-authenticated` | Missing, malformed, unknown or revoked token (`WWW-Authenticate: Bearer`) |
| 401 | `session-expired` | Token past its 7-day expiry |
| 401 | `invalid-credentials` | Login with a wrong email or password (one uniform answer) |
| 404 | `not-found` | The workout does not exist, belongs to another user, or the id is not a UUID. Never 403, so existence is not revealed |
| 409 | `email-taken` | Registration with an email already in use |
| 409 | `conflict` | A client id reused with different content, or a `setIndex` already used in this workout |
| 409 | `workout-finalized` | A new set submitted to a finalized workout |
| 413 | `request-too-large` | Body over the limit above |
| 422 | (FastAPI validation) | Invalid fields, see below |
| 429 | `rate-limited` | Too many login attempts (`Retry-After` in seconds) |
| 500 | `internal-error` | Unexpected database error (no stack trace or SQL in the body) |
| 503 | `database-unavailable` | PostgreSQL cannot be reached or the pool timed out (`Retry-After: 5`) |

422 responses keep FastAPI's list shape but leave out the `input` echo, so passwords and set payloads are never repeated back:

```json
{"detail": [{"type": "string_too_short", "loc": ["body", "password"], "msg": "String should have at least 10 characters", "ctx": {"min_length": 10}}]}
```

`GET /health` still answers 200 when the database is down; it only shows that the API process responds.

### `POST /api/auth/register`

Creates an account and signs it in. No authentication.

```json
{"email": "Ana@Example.com", "password": "correct-horse-battery", "displayName": "Ana"}
```

`displayName` is optional (up to 80 characters; blank becomes `null`). Response **201**:

```json
{
  "accessToken": "WXD5x9h991zw74qWmjoHvdvyVZ3HUxxQpabK7cHhLHY",
  "tokenType": "bearer",
  "expiresAt": "2026-10-11T23:49:15.733943Z",
  "user": {"id": "955731c8-32d6-4532-b6df-2c1474f8b194", "email": "ana@example.com", "displayName": "Ana", "createdAt": "2026-10-04T23:49:15.691398Z"}
}
```

Errors: 409 `email-taken`, 422 (invalid email, password length), 503.

### `POST /api/auth/login`

```json
{"email": "ana@example.com", "password": "correct-horse-battery"}
```

Response **200** with the same shape as register. Each login creates a new session; earlier sessions stay valid. Errors: 401 `invalid-credentials`, 429 `rate-limited`, 503.

### `POST /api/auth/logout`

Authenticated, no body. Response **204** with an empty body; the presented token is revoked. Calling it again with the same token returns 401 `not-authenticated`.

### `GET /api/users/me`

Authenticated. Response **200**:

```json
{"id": "955731c8-32d6-4532-b6df-2c1474f8b194", "email": "ana@example.com", "displayName": "Ana", "createdAt": "2026-10-04T23:49:15.691398Z"}
```

### `GET /api/exercises`

No authentication. Lists active exercises (seeded by the migration). Response **200**:

```json
[{"id": "dumbbell-curl", "name": "Dumbbell curl", "supportedViews": ["side"], "analyzerVersion": "curl-1.1.0"}]
```

### `POST /api/workouts`

Authenticated. Creates a workout, or returns the existing one for an idempotent retry.

```json
{"clientSessionId": "workout-3f6c2a9e-0d4b-4e7a-9a51-2b8f0c7d1e66", "exerciseId": "dumbbell-curl", "startedAt": "2026-10-04T23:19:15Z", "timezone": "America/Chicago"}
```

- `clientSessionId`: 1–128 characters, letters, digits and `._:-`, starting with a letter or digit. The browser uses `workout-<uuid>`.
- `timezone`: optional IANA name, stored for display only.

Response **201** (new) or **200** (same owner, same `clientSessionId`, same `exerciseId` and `startedAt`), body `WorkoutDetail`:

```json
{
  "id": "4e7fb869-41ce-4a6d-a7a5-16c50a5bb352",
  "clientSessionId": "workout-3f6c2a9e-0d4b-4e7a-9a51-2b8f0c7d1e66",
  "exerciseId": "dumbbell-curl",
  "status": "open",
  "startedAt": "2026-10-04T23:19:15Z",
  "endedAt": null,
  "totals": {"sets": 0, "completedReps": 0, "analyzedReps": 0, "issueBearingReps": 0},
  "timezone": "America/Chicago",
  "notes": null,
  "sets": []
}
```

Errors: 409 `conflict` (same `clientSessionId`, different `exerciseId` or `startedAt`), 422 `unknown_exercise` or field errors.

### `POST /api/workouts/{workoutId}/sets`

Authenticated. Batch-submits one finished set with its reps and form events in a single transaction. `workoutId` is the server `id` returned by create. The body (`WorkoutSetIn`) is built by `frontend/src/api/workoutPayload.js` from the Sprint 4 `set-summary-1.0.0` summary:

```json
{
  "clientSetId": "set-ba61f6db-75aa-4221-94eb-1a0364aee4b3",
  "setIndex": 1,
  "startedAt": "2026-10-04T23:48:08.953Z",
  "endedAt": "2026-10-04T23:48:15.854Z",
  "summary": {"schemaVersion": "set-summary-1.0.0", "setId": "set-ba61f6db-75aa-4221-94eb-1a0364aee4b3", "setIndex": 1, "exerciseId": "dumbbell-curl", "side": "left", "view": "side", "mode": "validated-only", "...": "rest of the set-summary-1.0.0 object"},
  "reps": [
    {"clientRepId": "curl-3c4f...-1", "repIndex": 1, "startMs": 1012.5, "endMs": 3012.75, "durationMs": 2000.25,
     "minFlexionDeg": 8.5, "maxFlexionDeg": 128.25, "romDeg": 119.75, "formCoverage": 0.95,
     "analyzed": false, "issueBearing": false, "issueTypes": []}
  ],
  "formEvents": [
    {"clientEventId": "issue-3c4f...-1", "issueType": "torso-swing", "startMs": 1312.5, "endMs": 2112.5,
     "peak": 14.2, "peakUnit": "deg", "assessed": false, "rulesVersion": "curl-rules-1.0.0",
     "repClientIds": ["curl-3c4f...-1"]}
  ]
}
```

The `...` entries are shortened for this guide. `endedAt` is the wall-clock time the user pressed **Finish set**; `startedAt` is derived as `endedAt − (summary.endedMs − summary.startedMs)`. A `cueLog` key inside `summary` is accepted and dropped by the server (see [what is stored](#what-is-and-is-not-stored)).

Server validation (422 on failure):

- `summary` must declare `schemaVersion` `set-summary-1.0.0`, its `setId` must equal `clientSetId`, and `setIndex` (when present) must equal `setIndex`. `summary.exerciseId` must equal the workout's exercise.
- `summary.units` must match the Sprint 4 units map for every key the server reads.
- Version strings (`analyzerVersion`, `featureVersion`, `rulesVersion`, optional `feedbackVersion`) are 1–64 characters of lower-case letters, digits and `._-`. `side` is `left` or `right`; `mode` is `validated-only` or `review`.
- `endedAt ≥ startedAt`. Rep and event ids are unique within the payload (up to 128 characters each), rep indices are unique, `endMs ≥ startMs`, `durationMs` equals `endMs − startMs` (within 1 ms), fractions lie in [0, 1], `trackingCoverage.assessableMs ≤ sessionMs`, and `repClientIds` refer to reps in the same payload. An issue-bearing rep must be analyzed and list its issue types.
- Counts must agree with the rows: `completedReps` equals the number of reps, `analyzedReps` and `issueBearingReps` equal the flagged reps, `noIssueReps = analyzedReps − issueBearingReps`, `noIssueFraction = noIssueReps / analyzedReps` (or `null` when no rep was analyzed), and `episodeCountsByType` equals the assessed form events per type.
- Numbers must be JSON numbers (no strings, booleans, NaN or Infinity). At most 500 reps and 2000 form events per set; body at most 512 KiB.

Response **201** (stored) or **200** (identical replay), body `SetDetail`: the stored columns (`id`, `clientSetId`, `setIndex`, `side`, `view`, `mode`, `startedAt`, `endedAt`, `summarySchemaVersion`, `analyzerVersion`, `featureVersion`, `rulesVersion`, `feedbackVersion`, `completedReps`, `analyzedReps`, `issueBearingReps`, `noIssueReps`, `noIssueFraction`, `notAnalyzedReason`, `trackingAssessableMs`, `trackingSessionMs`, `trackingCoverage`, `interruptedAttempts`, `episodeCountsByType`, `createdAt`), the stored `summary`, and `reps` and `formEvents` with server `id`s (each form event lists `repClientIds`).

Errors: 404 `not-found` (not owned), 409 `conflict` (same `clientSetId` with different content, or `setIndex` already used), 409 `workout-finalized` (new set after finalize), 413, 422.

### `POST /api/workouts/{workoutId}/finalize`

Authenticated. Marks the workout finished.

```json
{"endedAt": "2026-10-04T23:48:15.854Z"}
```

`endedAt` must be at or after the workout's `startedAt` and every saved set's `endedAt` (422 otherwise). Response **200** `WorkoutDetail` with `status: "finalized"`. Finalizing again returns the stored workout unchanged with 200, even if a different `endedAt` is sent. Errors: 404, 422.

### `PATCH /api/workouts/{workoutId}`

Authenticated. Edits the notes; this is also the edit path used by the ownership tests.

```json
{"notes": "Felt good"}
```

`notes` is up to 1000 characters, or `null` to clear. Notes can be edited before and after finalization. Response **200** `WorkoutDetail`. Errors: 404, 422.

### `GET /api/workouts?limit=20&before=<ISO time>`

Authenticated. Lists the caller's workouts, newest `startedAt` first. `limit` is 1–100 (default 20). Response **200**:

```json
{
  "items": [
    {"id": "4e7fb869-41ce-4a6d-a7a5-16c50a5bb352", "clientSessionId": "workout-3f6c2a9e-0d4b-4e7a-9a51-2b8f0c7d1e66",
     "exerciseId": "dumbbell-curl", "status": "open", "startedAt": "2026-10-04T23:19:15Z", "endedAt": null,
     "totals": {"sets": 1, "completedReps": 2, "analyzedReps": 0, "issueBearingReps": 0}}
  ],
  "nextBefore": null
}
```

To load the next page, pass `nextBefore` as `before` (URL-encoded). `nextBefore` is `null` on the last page. The cursor is strictly "started before", so if two workouts have the same `startedAt` exactly on a page boundary, the second can be skipped. This is an accepted limitation (workouts are created one at a time from one browser, so identical start times are unlikely).

### `GET /api/workouts/{workoutId}`

Authenticated. Response **200** `WorkoutDetail`: the list fields plus `timezone`, `notes` and `sets` (each a `SetDetail`, ordered by `setIndex`). Error: 404 `not-found` for a workout that does not exist or belongs to someone else.

## Data model (Alembic `0001_initial`)

The migration lives in `backend/alembic/versions/0001_initial.py`, PostgreSQL only. SQLAlchemy models are in `backend/app/models/`. Constraint names follow a naming convention (`pk_`, `fk_`, `uq_`, `ck_`).

| Table | Purpose and key columns | Constraints |
|---|---|---|
| `users` | `id` uuid, `email`, `password_hash` (Argon2id), `display_name`, `created_at`, `updated_at` | `email` unique and lower-case (check) |
| `auth_sessions` | `id`, `user_id`, `token_hash` char(64), `created_at`, `expires_at`, `revoked_at` | `token_hash` unique; FK to `users` on delete cascade; index on `user_id` |
| `exercises` | `id` text (`dumbbell-curl`), `name`, `supported_views` text[], `analyzer_version`, `active` | Seeded by the migration: `dumbbell-curl`, views `{side}`, `curl-1.1.0` |
| `workout_sessions` | `id`, `user_id`, `client_session_id`, `exercise_id`, `status`, `started_at`, `ended_at`, `timezone`, `notes`, `created_at`, `updated_at`, `finalized_at` | Unique (`user_id`, `client_session_id`); `status` in (`open`, `finalized`); `ended_at ≥ started_at`; notes ≤ 1000 characters; FK to `users` (cascade) and `exercises`; index (`user_id`, `started_at`) |
| `workout_sets` | One finished set: `client_set_id`, `set_index`, `side`, `view`, `mode`, wall-clock `started_at`/`ended_at`, version columns, rep counts, `no_issue_fraction`, `not_analyzed_reason`, tracking coverage (`tracking_assessable_ms`, `tracking_session_ms`, `tracking_coverage`), `interrupted_attempts` jsonb, `episode_counts_by_type` jsonb, `summary` jsonb, `payload_sha256` | Unique (`session_id`, `client_set_id`) and (`session_id`, `set_index`); `set_index ≥ 1`; counts ≥ 0; `analyzed_reps ≤ completed_reps`; `issue_bearing_reps ≤ analyzed_reps`; `no_issue_reps = analyzed_reps − issue_bearing_reps`; fractions in [0, 1]; assessable ≤ session ms; `ended_at ≥ started_at`; side and mode allowed values; FK to `workout_sessions` on delete cascade |
| `reps` | `client_rep_id`, `rep_index`, `start_ms`, `end_ms`, `duration_ms`, `min_flexion_deg`, `max_flexion_deg`, `rom_deg`, `form_coverage`, `analyzed`, `issue_bearing`, `issue_types` text[] | Unique (`set_id`, `client_rep_id`) and (`set_id`, `rep_index`); `rep_index ≥ 1`; `end_ms ≥ start_ms`; `duration_ms ≥ 0`; `form_coverage` in [0, 1]; FK to `workout_sets` on delete cascade |
| `form_events` | One continuous issue episode: `client_event_id`, `issue_type`, `start_ms`, `end_ms` (null if still open at Finish set), `peak`, `peak_unit`, `assessed`, `rules_version` | Unique (`set_id`, `client_event_id`); `end_ms ≥ start_ms` when present; FK to `workout_sets` on delete cascade |
| `form_event_reps` | Links a form event to the reps it affected (one event can affect several reps, one rep can have several events) | Primary key (`form_event_id`, `rep_id`); both FKs cascade; index on `rep_id`. Links only rows of the same set (checked by the service against the payload) |

Units: angles in degrees, `*_ms` in milliseconds on the set's FeatureFrame clock, fractions 0–1, counts are counts. Missing measurements are stored as `NULL`, never 0.

Client ids (`client_session_id`, `client_set_id`, `client_rep_id`, `client_event_id`) are unique within their owner's workout or set, not globally. Another user can send the same ids without colliding, and cannot learn that they exist.

Each workout write takes a row lock on its `workout_sessions` row (`SELECT … FOR UPDATE`), so two concurrent submissions to one workout are serialized. A duplicate that still reaches a unique constraint is re-read and compared, so a race returns the stored row or 409, not 500 or a duplicate. The engine uses a 10-second statement timeout and stores times in UTC.

## Retries and idempotency (GB 503)

The browser creates every id before the first network call and reuses the same ids and the same payload on every retry:

| Id | Created by | Format |
|---|---|---|
| `clientSessionId` | Camera page, on the first finished set of a workout | `workout-<uuid>` |
| `clientSetId` | Sprint 4 set lifecycle (`summary.setId`) | `set-<uuid>` |
| `clientRepId` | Curl analyzer | `curl-<analyzer session uid>-<n>` |
| `clientEventId` | Issue tracker | `issue-<analyzer session uid>-<n>` |

How the server answers a repeat:

- **Create workout.** Same owner and `clientSessionId` with the same `exerciseId` and `startedAt` → 200 with the existing workout. Different `exerciseId` or `startedAt` → 409 `conflict`.
- **Submit set.** The server computes `payload_sha256`, the SHA-256 of the canonical JSON of the validated body (sorted keys, no whitespace, `cueLog` removed). Same `clientSetId` and same hash → 200 with the stored set, and no new rows. Same `clientSetId` with a different hash → 409 `conflict`. A different `clientSetId` that reuses a stored `setIndex` → 409 `conflict`.
- **Replay after finalize.** An identical replay of an already stored set still returns 200 after the workout is finalized, so a retry that arrives late does not fail. A new set after finalize returns 409 `workout-finalized`.
- **Finalize.** Repeating finalize returns the stored workout with 200, unchanged.
- **Timeouts.** If a response is lost (for example a client timeout after the server committed), retrying with the same ids returns 200 and creates no duplicate rows. The tests check that session, set, rep and event counts stay the same after retries.

A transaction stores one set with all of its reps, events and links, or nothing. An invalid relationship (a rep id that is not in the payload, a set for someone else's workout) rejects the whole set.

## Save queue in the browser

`frontend/src/api/saveQueue.js` keeps finished sets in `localStorage` under `gymbud.pendingSaves.v1` until they are saved and the workout is finished, or until the user dismisses them. The camera page enqueues each set when the user presses **Finish set**; saving runs in the background and never blocks the camera loop.

| State | Meaning | What the user sees and can do |
|---|---|---|
| `pending` | Waiting to be sent (for example signed out) | "Not saved yet". Saved automatically after sign-in. **Dismiss** |
| `saving` | Create-workout then submit-set requests in flight | "Saving…" |
| `saved` | Server confirmed the set (201 or 200) | "Saved" and **View in history** |
| `failed` | The last attempt failed; `lastError` keeps the status, code and message | "Save failed" with the reason, **Retry** (signed in) and **Dismiss** |

- Each save calls `POST /api/workouts` (idempotent) and then `POST /api/workouts/{id}/sets` with the stored payload. Requests time out after 10 seconds.
- A failed entry stays visible until the user retries or dismisses it; there is no automatic retry loop. Network errors, timeouts, 5xx and 429 are marked retryable. 409 and 422 are marked "Retrying will not fix this". A 401 asks the user to sign in again, then retry.
- An entry that was `saving` when the page closed comes back as `pending` with the same ids, because the server may or may not have stored it. The next save is answered as a replay if it did.
- **Dismiss** asks for confirmation ("Discard this summary? It cannot be recovered.") and removes the local copy only.
- **Finish workout** finalizes the workout once all of its sets are saved, then removes their local copies. One workout is all the sets finished on the camera page since it loaded or since the last **Finish workout**. Sets left from an earlier page load appear as an "Earlier workout … (kept in this browser)" and can be retried, dismissed or finished separately.
- If the browser blocks storage (private mode or quota), the queue works in memory only and the panel warns that summaries are lost when the page closes.
- Signed out, the panel shows **Sign in to save**; the summaries stay in the queue until the user signs in.

The local queue is not encrypted and is readable by anyone using the same browser profile. It holds the same summaries the server stores.

## Pages

- `/login` and `/register`: sign in or create an account. They accept a same-site `?next=` path (default `/history`); absolute and protocol-relative URLs are ignored.
- `/history`: the signed-in user's workouts, newest first, 20 per page with **Load older workouts**. Dates use the browser's timezone and show its abbreviation.
- `/history/:workoutId`: one workout with every saved summary field, including units and denominators (for example "0 of 2 reps"). Missing values read "Not assessed", never 0 or good form. A **Sign out** button is on the history pages.
- The camera page shows the save panel after **Finish set**.

## What is and is not stored

Stored on the server, per set: the `set-summary-1.0.0` summary (counts, tracking coverage, interrupted attempts, episode counts, versions, units), rep measurements (timing, minimum and maximum elbow flexion, ROM, form coverage, analysis flags, issue types) and form-event episodes with their linked reps. Accounts store email, optional display name and the Argon2id password hash. Sessions store only token hashes.

Not stored on the server:

- **Camera frames, video and images.** They never leave the device.
- **Pose landmarks** and per-frame features.
- **The cue log** (spoken and displayed coaching cues). It stays in the browser; the server drops `summary.cueLog` before validation, hashing and storage.
- Optional AI voice audio or wording from Sprint 4 (served by `/api/coach/*`, not saved).
- Training datasets. Consented pose collection is Sprint 7 and separate from ordinary workouts.

Form rules are still disabled in the default mode (no validated rule), so most saved sets have `analyzedReps` 0 and `notAnalyzedReason` `no-validated-rules`. Saved issue episodes from review mode are unvalidated detector output, not form assessments.

## Cloud SQL plan (proposed)

Staging was provisioned on 2026-10-04 in Ajay's project `gymbud-510623` (`us-central1`) by `infra/gcp/staging-cloudsql.sh`; what exists is listed at the top of [`infra/gcp/README.md`](../infra/gcp/README.md). The Cloud Run part below is still proposed (Sprint 12). In outline:

- A Cloud SQL for PostgreSQL 18 staging instance with a separate integration-test database, automated backups and deletion protection.
- The same `DATABASE_URL` setting the backend already reads: the Cloud SQL Auth Proxy for local access, and Cloud Run's built-in Unix socket (`host=/cloudsql/PROJECT:REGION:INSTANCE`) when the API is deployed. The password lives in Secret Manager, never in the browser or Git.
- A connection budget: each API process opens at most `DB_POOL_SIZE` + `DB_MAX_OVERFLOW` = 7 connections, so Cloud Run max instances × 7 plus other clients must stay below the instance's `max_connections` minus a reserve.
- A runbook for running `alembic upgrade head` and the test suite against staging and for checking the SQL-unavailable behavior.

Budget alerts notify; they do not cap spending.

## Accepted deviations from the agreed contract

The lead accepted these differences between the agreed contract and the implementation:

- 413 `request-too-large` for bodies over 512 KiB on set submission and 16 KiB for other auth and workout writes (the contract named only the 512 KiB set limit).
- 422 responses leave out FastAPI's `input` echo.
- `summary.cueLog` is dropped by the server instead of being rejected.
- Repeating finalize returns the stored state, even with a different `endedAt`.
- Logout needs a valid token; the frontend clears its local session regardless.
- The detail page route is `/history/:workoutId`.
- 503 `database-unavailable` includes `Retry-After: 5`.
- An expired token gives 401 `session-expired`; a revoked or unknown token gives 401 `not-authenticated`.
- The list cursor is strictly "before", so identical start times on a page boundary may be skipped.

## Sprint 6 handoff

Sprint 6 builds history and progress views on top of this:

- **Migrations.** `backend/alembic/versions/0001_initial.py` is the base revision. Add new revisions with `python -m alembic revision -m "..."`, and keep `test_migrations.py` passing (upgrade, downgrade, upgrade again, no drift between models and migrations).
- **Consistent summary queries.** Workout totals (`sets`, `completedReps`, `analyzedReps`, `issueBearingReps`) are derived from `workout_sets` rows by SQL in `list_workouts` (`_totals_query` in `backend/app/services/workouts.py`) and summed from the same rows in the detail view. They are not stored on `workout_sessions`. Each set's counts are checked against its `reps` and `form_events` rows when the set is saved, and the database checks enforce `analyzed ≤ completed`, `issue-bearing ≤ analyzed` and `no-issue = analyzed − issue-bearing`. Analytics should aggregate from `workout_sets` (and `reps` / `form_events` for per-rep metrics) in the same way, rather than adding error counts to infer bad reps.
- **Denominators and comparisons.** A no-issue percentage is `no_issue_reps / analyzed_reps`, labeled a detector summary, and undefined when `analyzed_reps` is 0. Compare only sets with the same `exercise_id`, `view`, `analyzer_version`, `feature_version` and `rules_version`, and show tracking coverage beside results. Show "insufficient data" when a trend is unsupported.
- **Authenticated API.** Add `/api/analytics/me` with the same `Auth` dependency and owner filter as `/api/workouts`.
- **Retry semantics** are as described above; new write endpoints should follow the same client-id pattern.
- **Staging evidence** is still pending (Cloud SQL not provisioned). Record it in the Sprint 5 status file once the staging runbook has been run.

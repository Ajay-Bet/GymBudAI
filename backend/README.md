# GymBud backend

Python/FastAPI API for GymBud. Requires Python 3.10 or newer with `pip` and `venv` support (the lead's Mac and CI use 3.12), and from Sprint 5 a local PostgreSQL 18 server.

It provides `GET /health`, the optional Sprint 4 coaching proxy (`/api/coach/*`), and the Sprint 5 accounts and workout storage API (`/api/auth`, `/api/users/me`, `/api/exercises`, `/api/workouts`). The API reference, identity design and retry rules are in the [persistence guide](../docs/persistence-sprint-05.md).

## Dependencies and configuration

`requirements.txt` pins the direct runtime dependencies: FastAPI `0.142.2`, Uvicorn `0.54.0`, Pydantic `2.13.5`, httpx `0.28.1`, python-dotenv `1.2.4`, and for Sprint 5 SQLAlchemy `2.1.3`, Alembic `1.20.0`, `psycopg[binary]` `3.3.6`, `argon2-cffi` `25.1.0` and `email-validator` `2.3.0`. `requirements-dev.txt` adds pytest `9.1.1`. Pip also installs their required transitive dependencies. Use an isolated virtual environment; do not install into the system Python.

The application entry point is `app.main:app`. Local development uses `127.0.0.1:8080`, matching the frontend Vite proxy. `--reload` is for local development.

The API starts without a database, and `/health` and `/api/coach/*` work without one. Accounts and workouts need PostgreSQL with the migrations applied ([Database](#database-sprint-5)); without it those routes return 503 `database-unavailable`. The default settings match the local setup script, so no `.env` file is required. Optional coaching configuration is described below.

## Run locally

First set up the local database once ([Database](#database-sprint-5)). Then, from the repository root, on macOS/Linux:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

If `python3 --version` is older than 3.10, use an available newer interpreter (for example, `python3.12`) when creating the virtual environment.

On Windows PowerShell, select an installed Python 3.10+ version (this example uses 3.12). Calling the virtual environment's interpreter directly avoids activation policy changes:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

The database setup script is a Bash script for macOS and Linux; on Windows, create the role and databases listed in [Database](#database-sprint-5) with your PostgreSQL tools (not tested on Windows).

Stop the server with `Ctrl+C`. On macOS/Linux, leave the activated environment with `deactivate`.

## Check the running service

- Health check: <http://127.0.0.1:8080/health> should return HTTP 200 with `{"status":"ok"}`.
- Interactive API documentation: <http://127.0.0.1:8080/docs>.
- Start React in a second terminal using [frontend setup](../frontend/README.md), then open <http://127.0.0.1:5173/dev/health> and click **Check backend** to verify the browser-to-backend request.

The health endpoint confirms only that the API process responds; it does not check database or other service readiness. To check the database, run `python -m alembic current` (it should print `0001_initial (head)`) or call `GET /api/exercises`, which reads the database without signing in.

## Troubleshooting and boundaries

- If Python is too old, select a Python 3.10+ interpreter when creating `.venv`. Recreate an existing virtual environment if it was made with an older Python.
- If `app` cannot be imported, run Uvicorn from `backend/` with the virtual environment's Python.
- If port 8080 is occupied, stop the conflicting process you own. If you intentionally change the backend port, update the health proxy target in `frontend/vite.config.js` to match.
- A browser health-check failure with a working direct endpoint usually means the frontend is not running via `npm run dev` or its proxy target differs from the backend address. Restart Vite after changing its configuration.
- `503 database-unavailable` from account or workout routes means PostgreSQL is not running or `DATABASE_URL` is wrong. Start it (`brew services start postgresql@18` on macOS) and retry. A 500 `internal-error` or `relation "users" does not exist` in the server log usually means migrations were not applied: run `python -m alembic upgrade head`.
- `role "gymbud" does not exist` or `database "gymbud_dev" does not exist`: run `bash infra/local/setup-postgres.sh` from the repository root.
- `password authentication failed`: your server requires passwords; see "Authentication" in [`infra/local/README.md`](../infra/local/README.md).

`app/main.py` creates the application, registers the routers, the request body size limit and the database error handlers, and exposes the process health check. `app/api` holds the routes, `app/schemas` the Pydantic request and response models, `app/services` the coaching, account and workout logic, `app/models` the SQLAlchemy tables, `app/database` the engine and session factory, and `app/core` configuration and limits. Migrations are in `alembic/versions/`.

Browser requests use the same-origin Vite development proxy (`/api/health`, `/api/coach`, `/api/auth`, `/api/users`, `/api/exercises`, `/api/workouts`), so backend CORS configuration is not required locally. This is not production routing configuration. Deployment remains unconfigured.

## Database (Sprint 5)

Accounts and workouts are stored in PostgreSQL through SQLAlchemy, with the schema managed by Alembic. This has been implemented and tested locally on the lead's Mac (Homebrew PostgreSQL 18.4). Cloud SQL staging is proposed and not provisioned; see [`infra/gcp/README.md`](../infra/gcp/README.md).

### Set up the local database

1. Install and start PostgreSQL 18 (macOS: `brew install postgresql@18 && brew services start postgresql@18`). Docker users can use `infra/local/compose.yaml` instead; it has not been run on the lead's Mac.
2. From the repository root, create the local role and databases:
   ```sh
   bash infra/local/setup-postgres.sh
   ```
   It creates the role `gymbud` and the databases `gymbud_dev` (your data) and `gymbud_test` (tests) if they are missing, and leaves existing ones unchanged, so it is safe to run again. By default the role has no password and relies on the local server trusting local connections; see [`infra/local/README.md`](../infra/local/README.md) if your server requires a password.
3. Apply the migrations to `gymbud_dev`, from `backend/` with the virtual environment active:
   ```sh
   python -m alembic upgrade head
   python -m alembic current     # prints: 0001_initial (head)
   ```

`0001_initial` creates `users`, `auth_sessions`, `exercises` (seeded with `dumbbell-curl`), `workout_sessions`, `workout_sets`, `reps`, `form_events` and `form_event_reps` with their constraints. Run `python -m alembic upgrade head` again after pulling new migrations.

### Configuration

Settings come from environment variables, or from `backend/.env` (copy `.env.example`; the file is ignored by Git). Real environment variables take precedence. Restart Uvicorn after changes.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_dev` | SQLAlchemy URL (psycopg 3 driver) used by the API and Alembic |
| `TEST_DATABASE_URL` | `postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_test` | Database used by pytest. **The tests drop and recreate its `public` schema**; never point it at data you want to keep |
| `DB_POOL_SIZE` | `5` | Connections kept per API process |
| `DB_MAX_OVERFLOW` | `2` | Extra connections allowed under load (at most 7 per process with the defaults) |
| `DB_POOL_TIMEOUT_S` | `10` | Seconds to wait for a pooled connection before 503 |
| `AUTH_SESSION_TTL_HOURS` | `168` | Sign-in lifetime (7 days, fixed, no renewal) |
| `CORS_ORIGINS` | empty | Comma-separated browser origins allowed to call the API directly. Empty means none; local development uses the Vite proxy |

The engine also uses `pool_pre_ping`, recycles connections after 30 minutes, has a 5-second connect timeout and a 10-second statement timeout, and runs sessions in UTC (fixed in `app/core/config.py` and `app/database/engine.py`). The database URL can contain a password: keep it in `backend/.env` or a secret store, never in Git, frontend code or logs. The browser never connects to PostgreSQL; it only calls FastAPI.

The login rate limit (10 per minute per email and client IP) is held in process memory and is not shared between processes.

### Database tests

The persistence tests need a running PostgreSQL with the `gymbud_test` database. From `backend/` with the virtual environment active:

```sh
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
```

pytest resets `gymbud_test` and runs `alembic upgrade head` on it once per run. If PostgreSQL is not running, the database tests fail with connection errors (they are not skipped); the coaching tests do not need a database. On 2026-10-04 the full suite passed: 251 tests (coaching, accounts, workouts, migrations, ownership, idempotency, database-unavailable), both on local PostgreSQL 18.4 and on staging Cloud SQL through the Auth Proxy. `.github/workflows/backend.yml` runs the same migration and tests against a throwaway `postgres:18` service in GitHub Actions; it has not run on GitHub yet.

`backend/tests/test_migrations.py` checks upgrade, downgrade and upgrade again on an empty schema, that the models and migrations do not drift, and that the database itself enforces the constraints.

## Optional Sprint 4 coaching

The API implements `/api/coach/status`, `/api/coach/tts`, and `/api/coach/wording` (Sprint 4). These coaching routes do not use the database and do not require sign-in; no cloud deployment is configured, so run this prototype only on the documented loopback interface. Authentication of the coaching routes and deployment cost controls belong to later sprints.

Without `OPENAI_API_KEY`, status returns `{"tts":false,"wording":false}` and both POST endpoints return HTTP 503 `{"detail":"not-configured"}`. Local counting, deterministic summaries, text coaching and opted-in browser speech continue working.

To enable optional AI features locally, copy `.env.example` to `backend/.env` and fill in the key using your editor. That file is ignored by Git. Never put a key in a `VITE_*` variable, frontend code, screenshots, terminal commands, or logs. Restart Uvicorn after changing configuration. Environment variables override `.env` values.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | empty | Server-only OpenAI API key; empty disables both features |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | Speech model supporting voice instructions |
| `OPENAI_TTS_VOICE` | `marin` | Built-in voice |
| `OPENAI_TEXT_MODEL` | `gpt-4.1-mini` | Responses model supporting strict JSON schema |

The saved takeover proposed `gpt-6-luna`; its availability as a public API model was not established. The configurable conservative default is `gpt-4.1-mini`, whose official model page lists Responses and structured outputs. Model visibility is account-dependent; a configured key indicates configuration, not verified upstream availability. Invalid credentials, unavailable models, provider errors and offline operation all retain the local fallback.

- `GET /api/coach/status`: configuration booleans only; no key or upstream request.
- `POST /api/coach/tts`: `{ "text": "Chest tall and still", "purpose": "cue" }` (or purpose `narration`); 1–300 characters; response `audio/mpeg` with `X-AI-Generated: true`. The UI must disclose **Voice is AI-generated (OpenAI)**. Body cap 2 KiB, streaming response cap 5 MiB, total deadline 10 seconds, zero retries.
- TTS cache: per-process LRU, at most 128 entries and 16 MiB; key includes model, voice, fixed purpose instructions and text. Only uncached provider calls consume the per-process 30/minute limit.
- `POST /api/coach/wording`: `{ findings: { strengths: [{code, values}], improvements: [{code, values}], focus }, score }`. Values are numeric; issue `type` strings are removed by the frontend helper. Fields are strictly bounded and validated for finding placement, positive integral counts, tracking thresholds and denominator consistency. Focus must equal the first improvement. Score carries only `available`, `value`, `reason`, `experimental` and must be internally consistent. No arbitrary text, frames, landmarks or extra keys are accepted. Body cap 8 KiB; streaming upstream cap 256 KiB; total deadline 8 seconds; zero retries; per-process limit 10/minute.
- Wording grounding is constrained selection: the backend derives two approved paraphrases per finding and asks the Responses API to select integer indices. It rejects wrong lengths, bool/string/out-of-range indices, refusals, incomplete results and arbitrary prose. It then renders the approved text and derives at most three narration sentences (within the TTS character limit). The model cannot alter counts, invent findings, introduce unobserved body mechanics, or rewrite the score. Client validation independently checks the same approved alternatives. Failed wording keeps the deterministic summary.
- Successful POST responses use `Cache-Control: no-store`. Rate limit returns 429 with `Retry-After`; invalid request/model output returns 422; upstream timeout/error returns 503. Public errors are short codes. Upstream bodies, exception text, request content and authorization headers are not logged by this service.

The browser voice plays a live cue immediately while optional AI audio is fetched for later reuse; end-of-set narration has a shorter client deadline and falls back to browser speech/text. Cached cues avoid repeated paid generation. Limits and cache are process-local, not a production authorization or distributed cost cap. No camera frames leave the device through these endpoints. Browser-to-backend traffic remains same-origin through Vite's `/api/coach` proxy.

Official OpenAI references checked during implementation: [speech and supported voices](https://developers.openai.com/api/docs/guides/text-to-speech), [GPT-4o mini TTS model and pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts), [GPT-4.1 mini model and pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [strict structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). These describe model capabilities and current billing; this project has not made paid calls or measured provider latency. Timeouts are application deadlines, not promised response latency. Review provider prices and account budgets before enabling repeated use.

## Mocked coaching verification

From `backend/` with the virtual environment active (the same command also runs the database tests, which need the local PostgreSQL described in [Database tests](#database-tests)):

```sh
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
```

The coaching tests inject `httpx.MockTransport`; they cover no-key behavior, configuration, bounds, actual streamed-size rejection, overall/read deadlines, rate windows, LRU entry/byte limits, secret-safe errors, schema and semantic grounding, refusals and fallbacks without any provider calls. Real provider access and audible Chrome/Safari/iOS behavior remain unverified. The existing pinned Starlette TestClient emits an httpx deprecation warning; tests still pass, and a future dependency upgrade should migrate the test client together rather than adding an unreviewed runtime dependency here.

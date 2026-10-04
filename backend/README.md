# GymBud backend

Minimal Python/FastAPI scaffold. Requires Python 3.10 or newer with `pip` and `venv` support.

## Dependencies and configuration

`requirements.txt` pins the direct runtime dependencies: FastAPI `0.142.2` and Uvicorn `0.54.0`. Pip also installs their required transitive dependencies. Use an isolated virtual environment; do not install into the system Python.

The application entry point is `app.main:app`. Local development uses `127.0.0.1:8080`, matching the frontend Vite proxy. No `.env` file, secrets, database, or external service is required for local deterministic operation. Optional coaching configuration is described below. `--reload` is for local development.

## Run locally

From the repository root, on macOS/Linux:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

If `python3 --version` is older than 3.10, use an available newer interpreter (for example, `python3.12`) when creating the virtual environment.

On Windows PowerShell, select an installed Python 3.10+ version (this example uses 3.12). Calling the virtual environment's interpreter directly avoids activation policy changes:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

Stop the server with `Ctrl+C`. On macOS/Linux, leave the activated environment with `deactivate`.

## Check the running service

- Health check: <http://127.0.0.1:8080/health> should return HTTP 200 with `{"status":"ok"}`.
- Interactive API documentation: <http://127.0.0.1:8080/docs>.
- Start React in a second terminal using [frontend setup](../frontend/README.md), then open <http://127.0.0.1:5173/dev/health> and click **Check backend** to verify the browser-to-backend request.

The health endpoint confirms only that the API process responds; it does not check database or other service readiness.

## Troubleshooting and boundaries

- If Python is too old, select a Python 3.10+ interpreter when creating `.venv`. Recreate an existing virtual environment if it was made with an older Python.
- If `app` cannot be imported, run Uvicorn from `backend/` with the virtual environment's Python.
- If port 8080 is occupied, stop the conflicting process you own. If you intentionally change the backend port, update the health proxy target in `frontend/vite.config.js` to match.
- A browser health-check failure with a working direct endpoint usually means the frontend is not running via `npm run dev` or its proxy target differs from the backend address. Restart Vite after changing its configuration.

`app/main.py` creates the application and exposes a process health check. The `api`, `schemas`, `services`, and `core` packages implement optional coaching; `models` and `database` remain placeholders for future sprint work.

The local health request uses a same-origin Vite development proxy, so backend CORS configuration is not required for that check. This is not production routing configuration. Authentication, databases, migrations, and deployment remain unconfigured. The frontend still calls the removed `/users/login` and `/users/profile` endpoints; these features will not work until the planned authentication/persistence sprint implements and connects the replacement APIs.

## Optional Sprint 4 coaching

The API now implements `/api/coach/status`, `/api/coach/tts`, and `/api/coach/wording` in addition to `/health`. Runtime dependencies also pin Pydantic, httpx, and python-dotenv. No database, authentication, or cloud deployment is configured; run this prototype only on the documented loopback interface. Authentication and deployment cost controls belong to later sprints.

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

## Mocked verification

From `backend/` with the virtual environment active:

```sh
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
```

Tests inject `httpx.MockTransport`; they cover no-key behavior, configuration, bounds, actual streamed-size rejection, overall/read deadlines, rate windows, LRU entry/byte limits, secret-safe errors, schema and semantic grounding, refusals and fallbacks without any provider calls. Real provider access and audible Chrome/Safari/iOS behavior remain unverified. The existing pinned Starlette TestClient emits an httpx deprecation warning; tests still pass, and a future dependency upgrade should migrate the test client together rather than adding an unreviewed runtime dependency here.

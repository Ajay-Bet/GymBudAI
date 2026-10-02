# GymBud backend

Minimal Python/FastAPI scaffold. Requires Python 3.10 or newer with `pip` and `venv` support.

## Dependencies and configuration

`requirements.txt` pins the direct runtime dependencies: FastAPI `0.142.2` and Uvicorn `0.54.0`. Pip also installs their required transitive dependencies. Use an isolated virtual environment; do not install into the system Python.

The application entry point is `app.main:app`. Local development uses `127.0.0.1:8080`, matching the frontend Vite proxy. No `.env` file, environment variables, secrets, database, or external service is required. `--reload` is for local development.

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

`app/main.py` creates the application and exposes a process health check. The `api`, `models`, `schemas`, `services`, `database`, and `core` packages are empty placeholders for future sprint work.

The local health request uses a same-origin Vite development proxy, so backend CORS configuration is not required for that check. This is not production routing configuration. Authentication, databases, migrations, and deployment remain unconfigured. The frontend still calls the removed `/users/login` and `/users/profile` endpoints; these features will not work until the planned authentication/persistence sprint implements and connects the replacement APIs.

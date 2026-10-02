# Sprint 0 — Basic local connectivity checks

Status: complete for the three requested basic checks; no claim of broader Sprint 0 completion
Last updated: 2026-10-01

## Scope and acceptance criteria

User-supplied requirements:
- React and FastAPI both run locally.
- React successfully calls a simple FastAPI health endpoint.
- Backend configuration and dependencies are documented for teammates.

The existing frontend and FastAPI scaffold are the starting point. Database, accounts, deployment, camera/vision, and broad frontend migration are outside this request. This record does not imply completion of unspecified foundation requirements or later sprints.

## Assignments and contracts

- Lead: backend environment/startup, browser integration checks, review, and this handoff.
- Frontend specialist: development health page, API transport, route, and Vite proxy configuration.
- Documentation specialist: root/frontend/backend setup instructions and compatibility requirements.
- Contract: backend `GET /health` on `127.0.0.1:8080` returns `{"status":"ok"}`. React's development page at `/dev/health` calls `/api/health`, which the Vite development server at `127.0.0.1:5173` forwards to backend `/health`.

## Progress and evidence

- Created a local ignored `backend/.venv` using Python 3.12.11 and installed `backend/requirements.txt`. `python -m pip check` passed with no broken requirements.
- FastAPI started at `127.0.0.1:8080`; direct `/health` returned HTTP 200 with `{"status":"ok"}` and `/docs` responded successfully.
- Vite started at `127.0.0.1:5173` using Node 22.14.0 and npm 10.9.2. The React `/dev/health` page rendered in the browser.
- Clicking **Check backend** in React displayed **Connected to FastAPI. Backend status: ok.** The proxied `/api/health` request also returned `{"status":"ok"}` through HTTP.
- Stopped FastAPI, clicked again, and observed a visible HTTP 500 failure with startup/retry guidance. Restarted FastAPI and retried successfully. Neither page reload nor frontend restart was needed.
- `npm run lint` passed across the frontend. Targeted ESLint on the changed frontend files also passed.
- `npm run build` passed; it reported an existing outdated Browserslist dataset warning. No dependency upgrade was performed for that warning.
- `git diff --check` passed. Browser evidence: [successful React health check](../validation/sprint-00-health.png).
- Root, frontend, and backend READMEs document prerequisites, dependency installation, service addresses, health verification, configuration boundaries, and troubleshooting. The frontend specialist independently reviewed the documentation against the implementation and found no corrections needed; the lead reviewed the frontend integration.
- Windows setup commands are documented but were not executed on this Mac. No separate TypeScript check exists in the current JSX frontend.
- The health page and proxy are for development. Backend CORS, production routing, database connections, authentication, and deployment remain unconfigured. Existing JSX is retained; a broad TypeScript conversion is outside these checks.

## Handoff

Both local servers were left running after verification, with no startup-at-login service installed. If stopped, follow the root and backend README instructions to start them again. The project virtual environment is ignored by Git and must be recreated on other machines.

The existing login/profile frontend calls still await Sprint 5 replacement APIs. Do not start Sprint 1 automatically. Await the user's next sprint requirements after completing these checks.

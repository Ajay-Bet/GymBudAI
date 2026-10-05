# GymBud

Gym AI-powered app with computer vision to analyze exercise form. Also includes fitness split and calorie tracker.

## Local development

Prerequisites: Python 3.10+ (the lead's Mac and CI use 3.12), Node.js 22.12+ with npm, and PostgreSQL 18 for accounts and saved workouts. The frontend's Vite version also supports Node 20.19+ within the Node 20 release line. Clone this repository and run the two services in separate terminals.

1. **Database (once).** Install and start PostgreSQL 18 (macOS: `brew install postgresql@18 && brew services start postgresql@18`), then from the repository root create the local role and databases:

   ```sh
   bash infra/local/setup-postgres.sh
   ```

   It is safe to run again. See [local PostgreSQL](infra/local/README.md) for Linux, password-protected servers and the optional Docker Compose file.
2. **Backend.** Follow [backend setup](backend/README.md) to create a virtual environment, install the pinned dependencies, apply the migrations with `python -m alembic upgrade head`, and start FastAPI at <http://127.0.0.1:8080>.
3. **Frontend.** From the repository root, start the React/Vite frontend:

   ```sh
   cd frontend
   npm ci
   npm run dev
   ```

4. Open <http://127.0.0.1:5173> for the app, then <http://127.0.0.1:5173/dev/health> and click **Check backend**. A successful check confirms React received `{"status":"ok"}` from FastAPI through the Vite development proxy.
5. To try saving: create an account at <http://127.0.0.1:5173/register>, finish a curl set on the camera page, and open <http://127.0.0.1:5173/history>. See [frontend setup](frontend/README.md#accounts-saving-and-history).

The health page is available only in development. Camera tracking, counting and coaching work without the backend or database; signing in, saving and history need both. Stop each server with `Ctrl+C`.

Checks: `python -m pytest -q` in `backend/` (needs the local PostgreSQL) and `npm test`, `npm run lint`, `npm run build` in `frontend/`.

## Current scope

- **Camera prototype (Sprints 1–4):** browser pose tracking, side-on curl calibration, rep counting and coaching. Frames and landmarks stay on the device.
- **Accounts and saved workouts (Sprint 5):** email and password accounts, finished-set saving with visible retry, and workout history, backed by FastAPI and PostgreSQL. Implemented and tested locally; see the [persistence guide](docs/persistence-sprint-05.md) for the API, identity design, retry rules and limitations (no password reset or email verification yet).
- **Cloud:** GCP project `gymbud-510623` exists, but nothing has been provisioned in it. The Cloud SQL staging setup in [`infra/gcp/README.md`](infra/gcp/README.md) is a proposal, and no deployment is configured.

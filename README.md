# GymBud

Gym AI-powered app with computer vision to analyze exercise form. Also includes fitness split and calorie tracker.

## Local development

Prerequisites: Python 3.10+ and Node.js 22.12+ with npm. The frontend's Vite version also supports Node 20.19+ within the Node 20 release line. Clone this repository and run the two services in separate terminals.

1. Follow [backend setup](backend/README.md) to create a virtual environment, install the pinned dependencies, and start FastAPI at <http://127.0.0.1:8080>.
2. From the repository root, start the React/Vite frontend:

```sh
cd frontend
npm ci
npm run dev
```

3. Open <http://127.0.0.1:5173> for the app, then <http://127.0.0.1:5173/dev/health> and click **Check backend**. A successful check confirms React received `{"status":"ok"}` from FastAPI through the Vite development proxy.

The health page is available only in development. See [frontend setup](frontend/README.md) for the request path and troubleshooting. Stop each server with `Ctrl+C`.

## Current scope

The backend is a minimal Python/FastAPI scaffold with `GET /health`. No database, credentials, or environment file is needed for these local checks. Authentication, persistence, and deployment will be built in later sprints; the existing frontend login and profile calls are not connected to replacement endpoints yet.

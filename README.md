# GymBud

Gym AI-powered app with computer vision to analyze exercise form. Also includes fitness split and calorie tracker.

## Frontend

The existing React/Vite frontend is in `frontend/`.

```sh
cd frontend
npm install
npm run dev
```

## Backend

The Python/FastAPI scaffold is in `backend/`. See [backend setup](backend/README.md) for requirements and local run commands.

Only a health endpoint is implemented. Authentication, persistence, and other backend features will be built in later sprints; the existing frontend login and profile calls are not connected to replacement endpoints yet.

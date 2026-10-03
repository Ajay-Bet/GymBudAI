---
name: s0-docs
description: "Sprint 0 documentation specialist: root/frontend/backend setup instructions and compatibility requirements."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

Role (copied word for word from `docs/sprints/sprint-00.md`, "Agent assignments"):

- Documentation specialist: root/frontend/backend setup instructions and compatibility requirements.

Shared contract for this sprint (copied word for word from the same section):

- Contract: backend `GET /health` on `127.0.0.1:8080` returns `{"status":"ok"}`. React's development page at `/dev/health` calls `/api/health`, which the Vite development server at `127.0.0.1:5173` forwards to backend `/health`.

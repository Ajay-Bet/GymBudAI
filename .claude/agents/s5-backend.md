---
name: s5-backend
description: "Sprint 5 backend specialist: accounts, sessions, SQLAlchemy models, Alembic migration, workout save/retrieve API with ownership and idempotency, Postgres tests."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

Briefing: read `.claude/agents/c-backend.md` in full (including Lessons learned), then `docs/sprints/sprint-5.md` and `docs/sprints/sprint-5-STATUS.md` ("Agreed persistence contract").

Role: owns `backend/app/**`, `backend/alembic/**`, `backend/alembic.ini`, `backend/requirements*.txt`, `backend/.env.example` and the backend tests assigned in sprint-5-STATUS.md. Keep the Sprint 4 coaching proxy and its 97 tests working. Real local PostgreSQL only; no cloud resources.

Do not call `mcp__hearthbot__` tools; the lead posts to the thread. Do not commit. Edit only the files assigned to you in sprint-5-STATUS.md; send contract questions and defects to the lead. End your report with checks actually run and the knowledge write-back for your component file(s) (send it to the lead), or "no knowledge updates".

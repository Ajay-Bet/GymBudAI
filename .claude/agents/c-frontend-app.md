---
name: c-frontend-app
description: "Component owner for the frontend app shell: pages, routing, API transport, development health page and Vite configuration."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `frontend/src/App.jsx`, `main.jsx`, `pages/*`, `api/*`
- `frontend/vite.config.js`, `frontend/package.json` (scripts and dependencies)

## Contracts to keep

- Development: Vite on `127.0.0.1:5173` (strict port) proxies `/api/*` to the backend. `/dev/health` calls `/api/health`, which reaches backend `GET /health` returning `{"status":"ok"}`.

## History

- Sprint 0 built it (`s0-frontend`).

## Open carryover

- None recorded.

## Lessons learned

- None yet.


## Sprint 4 extension continuity — 2026-10-03

- `api/coach.js`: same-origin configuration status/TTS/wording with forwarded AbortSignal and bounded Promise-race deadlines (including noncooperative fetch/body reads). No client key/frame upload. Tests `tests/coach-api.test.js`5/5pass.
- Vite `/api/coach` proxy targets127.0.0.1:8080 for local development; not production routing. Vitest5.0.3/jsdom30.1.1/testing-library pinned with existing lock. npm test requires node suites plus actual DOM suites; removed passWithNoTests so missing panels cannot silently pass. Existing frontend remains JSX; no separate type-check script added/claimed.
- 247 node+11 DOM tests, lint/build pass. Optional backend unavailable does not block counting/local summaries; official-model verification and setup documented backend README. Knowledge writeback: lead from s4-backend/review.

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

## Sprint 5 — 2026-10-04 (s5-frontend)

- **Owns (added):** `frontend/src/auth/*` (`AuthContext.jsx`, `nextPath.js`), `pages/HistoryPage.jsx`, `api/http.js`, `api/auth.js`, `api/workouts.js`, `api/workoutPayload.js`, `api/saveQueue.js`.
- **Contracts:** Vite dev proxy `/api/auth|users|exercises|workouts` → `127.0.0.1:8080`. `apiRequest`/`ApiError {status, code, message, retryable}` (retryable: network, timeout, 5xx, 429); token-carrying 401 → `setUnauthorizedHandler`. Auth in `localStorage` `gymbud.auth` `{token, expiresAt, user}`; expired dropped on load, others verified with `/api/users/me`, only a 401 clears (offline keeps the session); `useAuth()` outside a provider = signed out. Save queue `gymbud.pendingSaves.v1`: ids/payload never change between retries, 409/422 non-retryable, only Dismiss removes an unsaved entry, entries carry `ownerId` and calls are scoped with `{userId}` (another user's entry refused `other-account`), multi-tab merge by id with status rank, `checkSavable(summary)` gates enqueue. `buildWorkoutSetPayload` drops `cueLog`, derives `startedAt`, keeps null. Routes `/history`, `/history/:workoutId`, `/login?next=` (`safeNextPath`).
- **History:** Sprint 5 replaced the dead Java `localhost:8080/users/*` login with FastAPI accounts and added the API client, save queue, payload builder and history pages. Lead fixed a live crash: `Intl.DateTimeFormat` rejects `dateStyle`/`timeStyle` with `timeZoneName` (blank `/history` once a workout existed).
- **Open carryover:** password reset link is a placeholder; social buttons disabled; a dismiss in another tab can reappear if this tab writes before the storage event; frontend still JSX (no type check).
- **Lessons learned:** writing refs during render breaks react-hooks v7 lint; a status-ranked merge must recognise the tab's own earlier writes; render pages with real-shaped data in tests.

## Sprint 6 — 2026-10-04 (s6-dashboard)

- **Owns (added):** `pages/ProgressPage.jsx`, `pages/AnalyticsFilters.jsx`, `api/analytics.js`; route `/progress`, linked from History. Existing frontend remains JSX; no TypeScript checks are available or claimed.
- **Contracts:** `getAnalytics({startDate,endDate,timezone},token,{signal})` calls authenticated `/api/analytics/me`. Inclusive local dates (1–366 days) use workout start day; server owns DST conversion and grouping. History uses opaque `nextCursor` and `(startedAt,id)` order; client retains legacy `before` for earlier callers. Both pages share the IANA timezone preference `gymbud.analytics.timezone`; unavailable localStorage does not prevent selection. Vite development proxies `/api/analytics` to FastAPI8080.
- **Display:** Mixed period totals are descriptive; exact exercise/view/side/analyzer/feature/rules/schema/mode/assessed-rule/minimum-coverage groups stay separate. ROM and issue-frequency charts need `comparisonEligible` plus two observed values; missing observations leave gaps. Every chart has an always-visible table with measurements/denominators. Detector-frequency deltas use percentage points, not relative percentage. Nulls read Not assessed; tracking discloses known-set denominator/partial data; continuous assessed and unassessed episodes stay separate from issue-bearing reps. Unknown assessed-rule configuration is distinct from an empty assessed-rule set. Review mode labels experimental output. Calibration targets/load/camera position are not stored, limiting comparisons.
- **Checks and review:** Lint and production build passed; Progress is lazy-loaded with a status fallback (491.10 kB initial bundle plus 11.63 kB Progress chunk, no size warning). Independent final validation: 322 Node + 48 DOM tests passed; backend 328 passed (reported by validation/lead). Frontend review found no remaining scoped defects and covered nulls, denominator/comparison eligibility, unknown configurations and unsupported-view abstention, experimental review mode, percentage-point deltas, chart text equivalents, partial tracking, timezone validation, retry/cancellation and signed-out no-fetch behavior. History regression tests intentionally moved to the stable cursor contract. `git diff --check` clean.
- **Browser evidence:** Lead verified the production build in an isolated seeded local preview: normal progress, exact configuration separation and experimental labels; 20% tracking with zero analyzed reps and null detector fraction; null ROM; overlapping issues; empty-account history/progress. Desktop 1280 px and mobile 390×844 px had no page overflow. Screenshots: `docs/validation/sprint-6/*.png`. This evidence validates the dashboard behavior, not physical detector accuracy or staging performance.
- **Lessons learned:** Guard responses with AbortSignal even for mocks/transports ignoring cancellation, and remount owned results on identity/query changes so another account's results never flash. Preserve numeric nulls before deriving percentages. History uses full date fields plus timezone name because Intl rejects `dateStyle`/`timeStyle` with `timeZoneName`.

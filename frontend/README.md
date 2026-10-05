# GymBud frontend

React/Vite frontend. Use Node.js 22.12+ and npm; the installed Vite version also supports Node 20.19+ within the Node 20 release line. Dependencies resolve from the committed `package-lock.json` using `npm ci`.

## Run locally

From the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The development server binds to `127.0.0.1` and uses a strict port: it exits if 5173 is occupied instead of silently choosing another port. Stop it with `Ctrl+C`.

## Verify React can reach FastAPI

1. Start FastAPI at `127.0.0.1:8080` in another terminal using [backend setup](../backend/README.md).
2. Open <http://127.0.0.1:5173/dev/health> and click **Check backend**.
3. Confirm the success state. The button sends `GET /api/health`; Vite forwards it to `http://127.0.0.1:8080/health`, and React validates the `{"status":"ok"}` response.

The request is same-origin from the browser's perspective, so this check needs no backend CORS setup. No frontend environment file or API key is needed. The health page is development-only, and this proxy is not a production deployment configuration. The same proxy forwards `/api/coach`, `/api/auth`, `/api/users`, `/api/exercises` and `/api/workouts` to FastAPI.

If the check fails, verify the direct health URL first, confirm both terminals are still running, and retry. If you change the backend port, update the proxy target in `vite.config.js` and restart Vite. If the frontend port is occupied, stop the conflicting process you own before restarting. Use `npm run dev` for this check, rather than the production preview command.

## Frontend checks

```sh
npm test
npm run lint
npm run build
```

These commands run node logic tests plus required Vitest/jsdom UI tests, source lint and production bundling. There is no separate TypeScript check configured in this existing JSX frontend. The browser check above separately verifies the live React-to-FastAPI integration.

## Camera and pose preview

The homepage camera section remains below the footer. Camera tracking runs entirely in the browser; no FastAPI service is needed for local counting, summaries or device speech. Optional AI voice and wording use FastAPI. Start and build automatically prepare pinned MediaPipe runtime/model assets (first model download is about 5.8 MB). `npm run vision:assets` also prepares or repairs them. Generated vendor files are excluded from Git.

Use localhost or HTTPS with a current desktop browser supporting workers, ImageBitmap and OffscreenCanvas. See the [Sprint 1 camera guide](../docs/vision-sprint-01.md) for asset versions, the observation contract, positioning guidance, privacy boundary and physical-camera review checklist.

## Biomechanics and calibration

The same camera section includes Sprint 2 side-on curl calibration and live joint measurements. See the [biomechanics guide](../docs/biomechanics-sprint-02.md) for units, validity, settings and remaining physical acceptance. The measurements are local; the Sprint 3 curl analyzer counts eligible repetitions and Sprint 4 adds local set lifecycle/feedback. Form rules remain disabled until reviewed validation exists.


## Sprint 4 coaching demo

Use the [coaching guide](../docs/coaching-sprint-04.md#integrated-sprint-4-extension-2026-10-03) for the set/audio workflow and browser checklist. **Stop Camera pauses** and retains counts; **Finish set** freezes feedback; **Start next set** clears counters and creates new identifiers. Arm switching with activity asks for an explicit finish-and-switch choice. Text is the default; Audio + text opts into speech. Optional AI requires only server configuration in [backend setup](../backend/README.md#optional-sprint-4-coaching), never a frontend key.

Production form scoring is unavailable while the rules remain unvalidated. Developer review mode labels cues and scores experimental. The interface shows completed and analyzed reps separately and preserves missing observations as not assessed. Good-form/bad-form recordings exist per the user but independent labeling/review and live audio checks are pending.

## Accounts, saving and history

Sprint 5 adds sign-in, workout saving and history. It needs FastAPI running with the local PostgreSQL database and migrations from [backend setup](../backend/README.md#database-sprint-5). Camera tracking, counting and coaching still work without them. The API, identity design, retry rules and limitations are in the [persistence guide](../docs/persistence-sprint-05.md).

- **Create an account or sign in** at `/register` or `/login` (email and a 10–128 character password). You stay signed in in this browser for 7 days from sign-in; the session does not renew. **Sign out** is on the history page and ends the session on the server and in this browser. There is no password reset or email verification yet; the `/reset-password` page is an unconnected mock-up.
- **Save a set.** After **Finish set** on the camera page, the **Save workout** panel lists each finished set. Signed in, it saves automatically and shows **Saving…**, **Saved** (with **View in history**) or **Save failed** with the reason, **Retry** and **Dismiss**. Signed out, it shows **Sign in to save** and keeps the summaries in this browser until you sign in. Failed and unsent summaries survive a reload. **Dismiss** asks before discarding a summary.
- **Retry is safe.** Each set keeps the same ids and payload on every retry, so a repeat never creates duplicate sets or reps on the server.
- **Finish workout** closes the workout on the server once all of its sets are saved. A workout is all the sets finished on the camera page since it loaded or since the last **Finish workout**.
- **History** at `/history` lists your saved workouts, newest first, with dates in your browser's timezone. `/history/:workoutId` shows every saved summary field with units and denominators; missing values read "Not assessed".

Only finished-set summaries are sent: counts, tracking coverage, rep measurements and detected episodes. Camera frames, pose landmarks and the cue log stay on this device. The sign-in token is kept in `localStorage` (`gymbud.auth`) and unsent summaries in `localStorage` (`gymbud.pendingSaves.v1`); anyone using the same browser profile can read them. See the persistence guide for the XSS trade-off of this choice.

Code: transport `src/api/http.js`, `auth.js`, `workouts.js`; payload builder `src/api/workoutPayload.js`; save queue `src/api/saveQueue.js`; sign-in state `src/auth/AuthContext.jsx`; save panel `src/components/SaveWorkoutPanel.jsx`; history `src/pages/HistoryPage.jsx`.

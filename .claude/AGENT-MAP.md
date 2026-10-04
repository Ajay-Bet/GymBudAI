# Claude agent map

Agents come in two layers (see `docs/WORKFLOW.md`). Component agents are the standing owners of each part of the codebase. Sprint agents exist only while their sprint is open; when it closes, the sprint chat updates the touched component files and marks its sprint agents retired here.

How Codex did it before: no standalone Codex agent `.md` files existed in this repository, its sprint folders, `~/.codex` or the downloaded sprint plans (checked 2026-10-02). Codex created specialists fresh in each sprint chat, defined only in the "Agent assignments" sections of the sprint records. The component layer was added at the user's request on 2026-10-03.

The "Lead" role in each sprint is the sprint chat itself, so it has no agent file.

## Component agents (standing)

| Agent | Owns |
| --- | --- |
| `c-vision` | `frontend/src/vision/*` except `CameraManager.js`; vision asset script |
| `c-biomechanics` | `frontend/src/biomechanics/*` |
| `c-camera-ui` | `frontend/src/components/CameraView.jsx`, `frontend/src/vision/CameraManager.js` |
| `c-frontend-app` | App shell, pages, `frontend/src/api/*`, Vite config, package scripts |
| `c-backend` | `backend/**` |
| `c-exercises` | `frontend/src/exercises/*` (from Sprint 3) |
| `c-feedback` | `frontend/src/feedback/*` (from Sprint 4) |
| `c-ml` | `ml/**` (from Sprint 7) |
| `c-infra` | CI workflows, Docker, `infra/**` |
| `c-docs` | READMEs and reference guides in `docs/` (not sprint records) |
| `c-validation` | `frontend/tests/**`, `backend/tests/**`; independent review |

## Sprint agents

| Agent | Sprint record | Role | Component | Status |
| --- | --- | --- | --- | --- |
| `s0-frontend` | `docs/sprints/sprint-00.md` | Frontend specialist | `c-frontend-app` | Retired |
| `s0-docs` | `docs/sprints/sprint-00.md` | Documentation specialist | `c-docs` | Retired |
| `s1-camera-ui` | `docs/sprints/sprint-01.md` | Camera/UI specialist | `c-camera-ui` | Retired |
| `s1-vision` | `docs/sprints/sprint-01.md` | Browser vision specialist | `c-vision` | Retired |
| `s1-validation` | `docs/sprints/sprint-01.md` | Independent validation specialist | `c-validation` | Retired |
| `s2-biomechanics` | `docs/sprints/sprint-02.md` | Biomechanics specialist | `c-biomechanics` (and `tracking.js` in `c-vision` for the dropout fix) | Retired |
| `s2-calibration-ui` | `docs/sprints/sprint-02.md` | Calibration UI specialist | `c-camera-ui` | Retired |
| `s2-validation` | `docs/sprints/sprint-02.md` | Independent validation specialist | `c-validation` | Retired |
| `s3-exercises` | `docs/sprints/sprint-3-STATUS.md` | Exercise analyzer specialist | `c-exercises` (and the additive `engine.js` field in `c-biomechanics`) | Retired |
| `s3-workout-ui` | `docs/sprints/sprint-3-STATUS.md` | Workout UI specialist | `c-camera-ui` | Retired |
| `s3-validation` | `docs/sprints/sprint-3-STATUS.md` | Independent validation specialist | `c-validation` | Retired |
| `s4-exercises` | `docs/sprints/sprint-4-STATUS.md` | Exercise rules and summary specialist | `c-exercises` | Retired |
| `s4-feedback` | `docs/sprints/sprint-4-STATUS.md` | Feedback and speech specialist | `c-feedback` | Retired |
| `s4-coaching-ui` | `docs/sprints/sprint-4-STATUS.md` | Coaching UI specialist | `c-camera-ui` | Retired |
| `s4-validation` | `docs/sprints/sprint-4-STATUS.md` | Independent validation specialist | `c-validation` | Retired |
| `s4-biomechanics` | `docs/sprints/sprint-4-STATUS.md` | Calibration specialist (extension) | `c-biomechanics` | Retired |
| `s4-backend` | `docs/sprints/sprint-4-STATUS.md` | Coaching proxy specialist (extension) | `c-backend`, `c-frontend-app` (`api/coach.js`) | Retired |

Sprints5–6 and10–12 have no sprint agents yet. The explicitly authorized curl ML pilot selects bounded parts of Sprints7–9 in this existing chat; it does not mark those full sprints complete.


## Authorized curl ML pilot specialists (partial Sprints 7–9)

| Agent | Record | Role | Status |
| --- | --- | --- | --- |
| `s7-data` | `docs/sprints/curl-ml-pilot-STATUS.md` | Dataset annotations/matching | Active |
| `s7-pose` | `docs/sprints/curl-ml-pilot-STATUS.md` | Local pose extraction and shared features | Active |
| `s8-training` | `docs/sprints/curl-ml-pilot-STATUS.md` | Grouped portable classifier training/evaluation | Active |
| `s9-browser` | `docs/sprints/curl-ml-pilot-STATUS.md` | Experimental rep-end model integration | Active |
| `s9-validation` | `docs/sprints/curl-ml-pilot-STATUS.md` | Independent pipeline review | Active |

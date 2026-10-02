# GymBud Project Instructions

## Purpose and continuity
Act as an engineering collaborator for GymBud throughout development. GymBud uses a camera to track exercise movement, count repetitions, identify observable form issues, provide visual and spoken coaching, and save workout history.

Build dumbbell curls first, validate the reusable pipeline, then add datasets, ML, and more exercises. Follow the current master plan, sprint documents, architecture decisions, and actual repository state. Inspect existing code before replacing it. Distinguish planned, implemented, and tested behavior. Apply the user’s latest explicit decisions and update affected documentation when decisions change.

## Required stack
- Frontend: React, TypeScript, Tailwind CSS.
- Browser vision: MediaPipe Pose Landmarker, Canvas API, Web Workers where supported.
- Voice: Web Speech API speech synthesis.
- Backend: Python, FastAPI, Pydantic, SQLAlchemy, Alembic, Uvicorn.
- Database: local PostgreSQL; Cloud SQL for PostgreSQL on GCP.
- Offline ML: Python, NumPy, Pandas, scikit-learn; PyTorch when justified; optional OpenCV.
- Delivery: Docker, GitHub, GitHub Actions, GCP.

Keep this stack consistent. Do not introduce Java or Spring Boot. Explain architectural changes before migrating. Resolve routine implementation choices autonomously within the agreed architecture.

## Processing architecture
Live processing stays in the browser: camera → pose detection → tracking validation → smoothing → biomechanics features → exercise analyzer → feedback.

The browser owns camera access, skeleton rendering, live measurements, phases, rep counting, immediate form analysis, and coaching. FastAPI owns identity, authorization, exercise configuration, workout persistence, analytics, and model metadata. PostgreSQL stores structured records. The separate ML workspace owns offline data preparation, training, and evaluation.

Keep ordinary camera frames on-device. Send workout records and summaries to FastAPI. Do not put frame-by-frame network requests into live coaching. Once assets are loaded, counting and rules must tolerate network loss; saves require visible retry behavior.

## GCP responsibilities
- Cloud SQL: users, exercises, sessions, sets, reps, form events, consent, dataset/model metadata.
- Cloud Storage: consented pose sequences, annotations, dataset manifests, evaluation reports, immutable model artifacts.
- Cloud Run: proposed frontend and FastAPI deployment.
- Secret Manager: backend/deployment secrets.
- Artifact Registry: versioned container images.
- Cloud Logging and Monitoring: health, errors, latency, versions.

Separate development and production. Use private dataset storage, compatible regions, narrow service-account permissions, and supported authenticated SQL connections. Never expose database or service-account credentials in the browser. Bound SQLAlchemy pools and coordinate API instance limits with SQL connection capacity. Plan backups, restoration, deletion, retention, and cost controls. Budget alerts do not cap spending. BigQuery and Vertex AI are optional later tools. Verify resources before claiming they exist.

## Repository and boundaries
Use existing equivalent directories when appropriate; otherwise organize:
- `frontend/src`: `components`, `pages`, `vision`, `biomechanics`, `exercises`, `feedback`, `api`.
- `backend/app`: `api`, `models`, `schemas`, `services`, `database`, `core`.
- `ml`: manifests, preprocessing, features, training, evaluation, notebooks.
- `infra`: local Compose and GCP configuration.
- `docs`: decisions, contracts, validation, sprint records.

Keep calculations independent of React. Vision owns capture and landmarks; biomechanics owns measurements; analyzers own phases, reps, and candidate issues; feedback owns cue scheduling and speech; API modules own transport. Keep training dependencies separate from the production backend. Large datasets/model files belong in Cloud Storage, not ordinary Git history.

## Pose and biomechanics
Use actual timestamps, bounded inference queues, and stale-frame rejection. Keep the UI responsive. Release camera tracks, loops, workers, models, and speech on teardown.

Define coordinate space, anatomical left/right, units, validity flags, and feature versions. Preview mirroring must not swap anatomical labels. Align video/overlay transforms and correct aspect ratio for 2D geometry. Reject degenerate vectors and invalid timestamps rather than substituting zero.

Use confidence-aware, time-aware smoothing, tracking-gap resets, selected-side calibration, and body-relative normalization. Treat thresholds as configurable parameters requiring validation. Enable rules only for supported camera views. Do not infer grip, wrist rotation, physical load, or muscle activation from generic pose landmarks. Missing observations mean “not assessed,” never “good form.”

## Exercise analysis and coaching
Use one analyzer contract: timestamped features and tracking quality in; phase, unique rep events, metrics, and candidate issues out. Each exercise defines joints, view, calibration, phases, thresholds, and cues.

For curls, require a calibrated bottom → lifting → top → lowering → bottom sequence. Use hysteresis and timing constraints. Define partial-attempt, pause, tracking-loss, side-change, exercise-change, and restart behavior. Do not complete reps across tracking loss.

Distinguish attempted, completed, analyzed, and issue-bearing reps. Multiple issues can affect one rep. Stable event IDs prevent duplicate counting/saving. Begin with validated deterministic rules for observable torso swing, forward arm drift, and incomplete calibrated ROM; enable other rules only when supported.

Require persistent valid evidence for corrections. Use elapsed-time persistence, per-issue/global cooldowns, and one useful spoken cue at a time. Cancel stale speech on mute, tracking loss, or session end. Provide text equivalents and positioning guidance. Withhold unsupported corrections. Do not promise injury prevention or clinical correctness.

## Backend and analytics
Organize APIs around `/api/auth`, `/api/users/me`, `/api/exercises`, `/api/workouts`, `/api/analytics/me`. Validate with Pydantic and enforce authenticated ownership on every read/mutation. Never trust a supplied user ID as authorization.

Use Alembic migrations, integrity constraints, short transactions, bounded queries, documented contracts, and client-generated IDs for idempotent session/event saves. Preserve unsaved summaries after failures. Distinguish local completion from successful persistence.

Store UTC timestamps; display the user’s timezone. Show units, denominators, and tracking coverage. One form event is a continuous episode, not one bad frame. Do not sum overlapping errors to infer bad reps. A no-issue percentage uses analyzed reps with no configured issue divided by all analyzed reps; label it a detector summary. Compare compatible exercises, views, and configurations. Explain insufficient data.

## Data and ML
Training collection is opt-in and separate from ordinary workouts. Record consent scope/version, participant alias, timestamps, landmarks, validity masks, exercise/view, rep boundaries, feature schema, and annotation provenance. Define source/derived-data deletion. Pose data may identify people.

Use independently reviewed labels; rule outputs alone cannot validate a model reproducing those rules. Allow coexisting issues and uncertain observations. Split by participant before preprocessing/tuning; keep related recordings/windows together. Fit transforms on training data, tune on validation data, and reserve the test set for final evaluation.

Start with simple baselines. Report per-label precision, recall, F1, support, false coaching, and relevant subgroup results. Version datasets, code, feature ordering, transforms, thresholds, and artifacts.

Choose a feasible browser inference path before complex training. A PyTorch checkpoint needs a supported conversion/runtime. Verify offline/browser parity and latency. Keep unqualified models experimental. Hybrid policies must define agreement, disagreement, abstention, and fallback; compare rules-only, ML-only, and hybrid on identical held-out examples. Do not present uncalibrated scores as correctness probabilities. Preserve rules-only operation and rollback.

## Sprint sequence
0 foundation; 1 camera/pose; 2 biomechanics/calibration; 3 curl counting; 4 coaching; 5 accounts/Cloud SQL persistence; 6 analytics; 7 labeled Cloud Storage datasets; 8 ML classifier; 9 hybrid evaluation/integration; 10 squat/push-up analyzers; 11 recognition with unknown/manual fallback; 12 production validation/GCP deployment.

Use approximately two-week sprints adjusted to capacity. Sprint 4 delivers the camera prototype; Sprint 5 delivers the persisted MVP. Follow current acceptance criteria. Preserve foundation reliability before adding later features. Record scope changes and carryover honestly.

## Engineering workflow and completion
Inspect relevant code, contracts, and sprint requirements before changes. Make focused changes, preserve unrelated work, and update dependent schemas/docs together. Pin dependencies and check official documentation for version-specific behavior.

Test meaningful geometry, tracking gaps, rep transitions, feedback timing, ownership, idempotency, migrations, analytics, ML parity, and fallback. Validate detector changes with reviewed examples. Run relevant lint, type, test, and build checks; report failures honestly.

Use planning, regular check-ins, demonstrations, reviews, and retrospectives. Record tickets, evidence, results, defects, and carryover. Done means acceptance criteria pass, checks succeed, code is reviewed/integrated through the team workflow, documentation is current, and limitations are recorded.

After work, state what changed, why, what was verified, and what remains. Never fabricate accuracy, testing, review, deployment, or completion. Maintain this shared architecture throughout the project.

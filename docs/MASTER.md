# GymBud Master Project Plan

Architecture and delivery roadmap using React TypeScript FastAPI Python and Google Cloud

We will build GymBud as a camera-based exercise assistant that counts repetitions, measures movement, and gives visual and spoken feedback. This document defines the shared architecture, data storage, delivery sequence, and team workflow. The first exercise is the dumbbell curl; additional exercises and machine learning follow a validated rules-based prototype.

Google Cloud Platform (GCP) will hold application data, training datasets, and model artifacts. The proposed deployment also uses GCP for the API and frontend. These are planning decisions, not resources already provisioned. The plan contains no Java or Spring Boot services.

## Product scope

- Core prototype by Sprint 4: select curls, enable the camera, obtain tracking guidance, count complete repetitions, and receive a small number of reliable coaching cues.

- Persisted MVP by Sprint 5: sign in, finish a workout, save its summary, and retrieve it later. Sprint 6 adds history and progress views.

- Research extension in Sprints 7 through 9: collect consented pose sequences, train a classifier, and evaluate whether combining it with rules improves coaching.

- Expansion in Sprints 10 through 12: add exercises, test automatic recognition, and prepare a monitored release.

## Technology ownership

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React, TypeScript, Tailwind | Camera, interface, measurements, reps, coaching |
| Vision | MediaPipe, Canvas, Web Workers | Pose detection and skeleton overlay |
| API | Python, FastAPI, Pydantic, Uvicorn | Identity, validation, workouts, analytics |
| Persistence | SQLAlchemy, Alembic, PostgreSQL | Data access and schema migrations |
| ML workspace | NumPy, Pandas, scikit-learn; PyTorch later | Offline features, training, evaluation |
| Delivery | Docker, GitHub Actions, GCP | Builds, checks, artifacts, deployment |

OpenCV is optional for offline processing. Browser speech synthesis supplies initial voice feedback. Browser model execution will require a supported runtime or a portable implementation; a PyTorch checkpoint cannot run directly in the frontend.

# Architecture and Google Cloud data storage

The browser owns the live loop: camera capture, pose detection, confidence checks, smoothing, feature extraction, exercise analysis, and feedback. FastAPI accepts authenticated workout summaries. PostgreSQL stores structured records. Offline ML scripts read approved datasets and publish versioned model artifacts.

| Service | GymBud use | Data boundary |
|---|---|---|
| Cloud SQL for PostgreSQL | Users, exercises, sessions, sets, reps, form events, consent and model metadata | Structured application records |
| Cloud Storage | Consented pose sequences, dataset manifests, evaluation reports, model files | Private objects organized by environment and version |
| Cloud Run | Proposed FastAPI service and frontend container | Stateless compute; persistent data lives elsewhere |
| Secret Manager | Database and signing secrets | Backend and deployment access only |
| Artifact Registry | Versioned container images | Release images rather than training datasets |
| Cloud Logging and Monitoring | Errors, service health, latency | Exclude video, tokens, and sensitive payloads |

## Data handling

- Camera frames stay on the device during ordinary workouts. Landmark buffers are temporary until a user explicitly opts into research collection.

- Cloud SQL stores measurements and relationships, not frame streams. Cloud Storage holds pose sequence files; SQL keeps their object identifiers and collection metadata.

- Training collection uses pseudonymous participant identifiers, recorded consent, and a documented deletion path. Pose data remains potentially identifying.

- Use separate development and production resources, private dataset buckets, and narrowly scoped service accounts. Never put cloud credentials in the browser.

- Choose compatible regions for the API, database, and storage. Review retention, backup, restoration, and deletion behavior before collecting participant data.

## Cost and scale controls

Start with local PostgreSQL for day-to-day development and small GCP staging resources when cloud validation is needed. Set budget alerts, storage lifecycle rules, Cloud Run instance limits, and a database connection budget. Budget alerts notify the team; they do not cap spending. BigQuery and Vertex AI are optional later additions, not MVP dependencies.

# Pose tracking and biomechanics

## Measurement pipeline

MediaPipe locates body landmarks. GymBud converts these observations into exercise measurements. Use timestamps for velocity and error persistence, check required landmark visibility, and discard stale frames. Move synchronous detection off the UI thread where supported and keep only a bounded queue of recent frames.

| Stage | Implementation | Failure behavior |
|---|---|---|
| Tracking | Camera orientation, visible joints, confidence gates | Show positioning help and pause analysis |
| Smoothing | Time-aware exponential or One Euro filter | Reset after prolonged tracking gaps |
| Features | Angles, normalized distances, velocity, ROM | Reject degenerate vectors and invalid timing |
| Exercise state | Phase transitions and rep lifecycle | Do not complete a rep across tracking loss |
| Feedback | Persistence, priority, cooldown, speech | Suppress corrections when evidence is weak |

## Coordinate conventions

Define camera-space and anatomical left/right explicitly. Mirroring the preview must not swap the underlying anatomical labels. Correct image aspect ratio before computing 2D angles. Use estimated world landmarks only where their stability has been evaluated. A joint angle is the angle between two vectors sharing that joint; range of motion is the observed angular span during an eligible repetition.

## Observable movement

Single-camera pose estimates depend on viewpoint and occlusion. A side view may support elbow flexion and forward arm drift but may hide lateral flare. Use a validated camera orientation for each rule. Camera distance states describe framing; they are not physical distance measurements. Generic pose landmarks do not establish wrist rotation, grip quality, load, or muscle activation.

## Calibration and rule thresholds

- Calibrate a comfortable starting posture and selected side before analysis. Normalize displacement to a stable body segment rather than pixels.

- Treat all initial angle and timing thresholds as tunable engineering parameters. Validate them with annotated examples before making coaching claims.

- Keep tracking status separate from form status. Use not assessed when required observations are missing; do not label missing data as good form.

- Store feature definitions, rule configuration versions, and units so saved measurements remain interpretable.

# Exercise analyzers and coaching

## Reusable analyzer contract

Each exercise analyzer receives timestamped features and tracking quality. It returns phase, rep events, observed metrics, and candidate form events. Exercise configuration specifies required joints, camera view, calibration, transition thresholds, rule persistence, and feedback wording. The registry chooses the analyzer for the selected exercise.

## Dumbbell curl behavior

Begin with a selected arm and one documented camera view. A complete rep progresses from a calibrated bottom position through lifting and the top position, then lowering back to the bottom. Hysteresis and minimum duration prevent threshold jitter from creating extra reps. Partial attempts, prolonged pauses, tracking loss, and exercise changes have explicit reset behavior.

- Record minimum and maximum elbow angles, measured ROM, rep duration, upper-arm displacement, torso movement, and tracking coverage.

- Introduce only rules visible from the supported view, such as sustained forward arm drift, torso swing, or incomplete calibrated ROM.

- Distinguish an attempted movement, a completed repetition, an analyzed repetition, and a repetition with detected issues. Multiple issues can coexist.

- Use completion events with unique IDs so UI rerenders or repeated processing cannot double count a rep.

## Feedback policy

Candidate issues must persist for a configured amount of valid observation time. Choose one useful cue, apply per-issue and global cooldowns, and cancel queued speech when tracking stops or the session ends. Provide text equivalents and a mute option. Explain the detected movement rather than claiming injury prevention or clinical correctness.

## Architecture boundaries

| Module | Owns | Does not own |
|---|---|---|
| vision | Capture, landmarks, timestamps, smoothing | Rep or coaching decisions |
| biomechanics | Angles, distances, movement features | User identity or persistence |
| exercises | Phases, reps, candidate errors | Speech queue or API transport |
| feedback | Cue selection, display and speech | Ground-truth labels |
| api | Save and load application data | Frame-by-frame pose estimation |
| ml | Dataset preparation, training, evaluation | Production account logic |

# Backend contracts and analytics

## Application data model

| Entity | Key contents |
|---|---|
| users | Identity provider subject or account credentials; profile and preferences |
| exercises | Stable exercise ID, supported view and analyzer configuration |
| workout_sessions | Owner, timestamps, status, client session ID and versions |
| sets and reps | Ordered events, duration, ROM, tracking coverage and eligibility |
| form_events | Issue type, start and end time, affected rep and detector version |
| model_versions | Feature schema, artifact reference, hash and evaluation status |
| dataset metadata | Participant alias, consent record and object references |

## API organization

- Use /api/auth, /api/users/me, /api/exercises, /api/workouts, and /api/analytics/me. Favor the authenticated user over arbitrary user IDs.

- Create a session, append or batch-save sets and reps, and finalize the workout. Validate event IDs and enforce ownership on every operation.

- Make session creation and event submission idempotent using client-generated identifiers. Failed saves retain a visible retry state.

- Keep database transactions short, restrict CORS to intended origins, and document request and response schemas with Pydantic.

## Metrics and interpretation

Report completed reps, analyzed reps, tracking coverage, issue-bearing reps, median rep duration, and ROM with units. A form event is one continuous episode; it is not one bad frame. Do not add error counts to infer bad reps, because multiple errors can affect one repetition.

If the team adds a quality percentage, define it as analyzed reps with no configured issue detected divided by all analyzed reps. Display the denominator and configuration version. This is a detector summary, not a validated clinical form score. Compare like exercises, views, and configurations; show insufficient data when a trend is unsupported.

## Storage connection

FastAPI accesses Cloud SQL through an authenticated supported connection method and a bounded SQLAlchemy pool. Choose Cloud SQL Auth Proxy or a connector for development and a documented Cloud Run connection for deployment. Check maximum API instances multiplied by per-instance pool size against the database connection budget.

# Dataset and machine learning plan

## Collection and annotation

Sprint 7 creates an opt-in collection mode separate from ordinary workouts. Save timestamped landmark sequences, validity masks, camera view, exercise, participant alias, rep boundaries, feature schema, and annotation provenance. Store immutable sequence objects in Cloud Storage and searchable metadata in Cloud SQL. Ground-truth labels require independent review; rule outputs alone cannot validate a model trained to reproduce those rules.

## Training and evaluation

- Begin with rep-level features and simple supervised baselines. Evaluate temporal models only when they address a demonstrated failure.

- Split by participant before feature scaling or tuning. Keep recordings and windows from one participant out of other splits.

- Treat coexisting errors as a multilabel problem where appropriate. Include ambiguous, low-quality, and unsupported observations instead of forcing every sample into good form.

- Report per-label precision, recall, F1, sample counts, false coaching events per minute, and performance by camera view and tracking quality.

- Freeze the test set until model and thresholds are chosen. Version dataset manifests, code, features, seeds, and model artifacts together.

## Browser deployment and hybrid analysis

Before training a complex model, choose a feasible browser inference route. A small supported model can be exported to an appropriate browser runtime; alternatively implement a simple model in TypeScript with verified prediction parity. If a model requires server inference, reserve it for delayed analysis unless measured latency supports the use case. The live rules engine must continue working without network access.

Hybrid analysis needs an explicit decision policy. Tracking quality gates both branches. Compare rules-only, ML-only, and hybrid results on the same evaluation set. Disagreement can produce abstention or reduced confidence. An ML output of 0.9 is not automatically calibrated 90 percent correctness; validate calibration before showing it as confidence.

## Model release contents

| Artifact | Required record |
|---|---|
| Model file | Immutable object path, checksum and runtime compatibility |
| Feature contract | Units, ordering, normalization and missing-data behavior |
| Evaluation report | Held-out results, known limits and comparison to rules |
| Release metadata | Dataset version, code revision, thresholds and rollback target |

# Scrum workflow and sprint roadmap

Use approximately two-week sprints. Dates, ticket owners, and capacity are assigned during planning. Twelve numbered sprints represent about 24 weeks after foundation work; they are a proposed sequence rather than a guaranteed semester schedule. Reassess scope after each review and preserve the curl MVP if time is limited.

## Team workflow

The product owner orders the backlog and clarifies value. The ScrumMaster maintains cadence and removes blockers. Developers choose a feasible sprint backlog together. Use Backlog, Sprint Ready, In Progress, Code Review, Testing, and Done. Hold brief regular stand-ups, a demonstration at review, and a retrospective with one concrete improvement.

## Definition of Done

A story is done when its acceptance criteria are met, code is reviewed and integrated, relevant checks pass, failure behavior works, required documentation is updated, and evidence is linked to the ticket. Detector changes require annotated examples; storage changes require migration and ownership checks. Known limitations must be recorded.

| Sprint | Goal | Review evidence |
|---|---|---|
| 0 | Foundation | Local frontend API database path and agreed backlog |
| 1 | Camera and pose detection | Skeleton and tracking recovery demo |
| 2 | Biomechanics | Stable validated measurements and calibration |
| 3 | Curl analyzer | Rep sequences and counter verification |
| 4 | Coaching | Persistent issues and controlled voice cues |
| 5 | Accounts and persistence | Authenticated save and reload using Cloud SQL |
| 6 | Analytics | History with consistent denominators and units |
| 7 | Dataset collection | Consented annotated sequences in Cloud Storage |
| 8 | ML classifier | Participant-separated evaluation and model artifact |
| 9 | Hybrid engine | Comparison against rules-only and browser inference |
| 10 | More exercises | Curl squat and push-up analyzers |
| 11 | Exercise recognition | Stable recognition with unknown and manual fallback |
| 12 | Release | GCP deployment restoration and rollback checks |

Separate documents cover Sprints 1 through 12. Sprint 0 remains in this master plan. The camera prototype finishes at Sprint 4; the saved-workout MVP finishes at Sprint 5. ML and automatic recognition are later milestones, so they do not block the early demonstration.

# Sprint 0 foundation and document use

## Foundation backlog

- Define the curl MVP, selected camera view, supported devices, measurable review criteria, and excluded features. Record decisions in the repository.

- Create frontend, backend, ml, infra, and docs directories. Use TypeScript in the browser and Python for the API and training pipeline.

- Run React, FastAPI, and local PostgreSQL. Add a health endpoint, initial SQLAlchemy model, Alembic migration, environment example, and development seed data.

- Configure formatting, linting, type checks, core test tools, pull request review, and GitHub Actions. Do not commit secrets or participant recordings.

- Plan GCP project access, billing responsibility, region, service accounts, Cloud SQL, private Cloud Storage buckets, and budget alerts. Record what is provisioned and what remains proposed.

- Write the initial API and feature schemas, user story template, Definition of Done, and sprint board. Leave dates and owners unset until team planning.

## Foundation acceptance

A teammate can clone the repository using the README, start all local services, apply a migration to an empty database, and send a successful frontend request to FastAPI. CI checks a pull request. The cloud data design names an owner for billing and explains access without browser credentials. Sprint 1 starts only after this development path works.

## Repository layout

| Path | Contents |
|---|---|
| frontend/src | components, pages, vision, biomechanics, exercises, feedback, api |
| backend/app | api, models, schemas, services, database, core |
| ml | datasets manifests, preprocessing, features, training, evaluation, notebooks |
| infra | Local Compose and GCP deployment configuration |
| docs | Architecture decisions, data contracts, tests and sprint review notes |

Large datasets and model binaries live in Cloud Storage rather than ordinary Git history. Keep only manifests and small approved fixtures in the repository. Each sprint document supplies a specific backlog, technical plan, verification checklist, and review record; the master plan governs shared definitions.

## Technical references

- Cloud SQL connections from Cloud Run
- Cloud Storage overview
- MediaPipe Pose Landmarker for Web
- Cloud Run secrets configuration
- Cloud Billing budgets and alerts

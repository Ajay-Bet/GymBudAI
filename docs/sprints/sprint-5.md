# Sprint 5 — User Accounts and Workout Storage (requirements)

Source: Ajay's attached `GymBud_Sprint_05_User_Accounts_and_Workout_Storage` (converted by the coordinator 2026-10-04), identical in wording to `~/Downloads/GymBud_Master_and_Sprints_01-12/GymBud_Sprint_05_User_Accounts_and_Workout_Storage.docx`. Saved word for word below; status, decisions and evidence are in [sprint-5-STATUS.md](sprint-5-STATUS.md).

Two week working plan with backlog implementation and review criteria
Persist authenticated workout sessions in Cloud SQL for PostgreSQL so a user can save a set, return later, and retrieve the same records safely.
Dates and owners are assigned at sprint planning. Proposed acceptance targets are reviewed before implementation and are not claims of measured performance.
## Entry requirements
Sprint 4 provides a validated local summary schema. GCP project access, billing ownership, Cloud SQL connection method, and staging configuration are established during planning.
## Sprint scope
Implement identity, ownership checks, migrations, workout save and retrieval, retries, and a small staging persistence demonstration. A single selected authentication approach is sufficient; dashboard trends start in Sprint 6.
## Sprint backlog
### GB 501 Authentication
As a user, I can sign in and out to access my saved workouts.
Acceptance criteria  Select a managed identity provider or a documented account implementation. The API validates identity, expired or invalid credentials fail, and logout removes the active frontend session.
### GB 502 Database schema
As a developer, I can create and update the workout database predictably.
Acceptance criteria  Alembic creates users, exercises, sessions, sets, reps, and form events with required constraints. The initial migration and upgrade path run on empty and existing staging databases.
### GB 503 Reliable saves
As a user, I can save a completed workout without duplicate reps when retrying.
Acceptance criteria  Client session and event IDs make retries idempotent. Transactions reject invalid relationships; failed saves remain visible and preserve the summary until retry or explicit dismissal.
### GB 504 Owned history
As a user, I can load my previous workouts.
Acceptance criteria  Retrieval and mutation always filter by the authenticated owner. User A cannot access or append to User B records, including by guessing workout IDs.

## Implementation and sprint review
### Technical plan
API contracts  Use /api/users/me, /api/exercises, and /api/workouts. Define create, batch event submission, finalization, and retrieval schemas. Validate timestamps, unique event IDs, units, exercise IDs, tracking coverage, and detector versions.
Cloud SQL connection  Use SQLAlchemy with a bounded pool and a supported authenticated Cloud SQL connection. Keep database and runtime regions compatible. Keep credentials in backend configuration or Secret Manager; the browser uses FastAPI rather than connecting to SQL directly.
Identity decision  Choose the identity provider or account approach at sprint planning and record the decision. If passwords are implemented, use a reviewed password-hashing library and documented session expiration. Do not build several authentication methods simultaneously.
Persistence semantics  Store rep records and issue episodes with stable foreign keys. Derive session summaries consistently, or store versioned summaries and verify them against the underlying records. Ordinary workout saves contain no frame stream or training dataset.
### Verification checklist
Register or provision two test users, authenticate them, and reject invalid and expired credentials.
Save a workout, refresh or reopen the client, and compare every saved summary field.
Repeat the same save after a simulated timeout and verify session and rep counts remain unchanged.
Attempt cross-user read, append, edit, and finalize requests; all must fail.
Run migrations and an integration test against staging Cloud SQL; inspect failure behavior when SQL is unavailable.
### Exit criteria
A signed-in user can save and reload a workout from staging Cloud SQL after closing the application. Duplicate submission creates no duplicate records, ownership tests pass, and the empty-database migration succeeds. Record the selected identity design and recovery limitations.
### Sprint review demonstration
Save a curl workout, close and reopen the client, reload the history, retry a previously accepted save, then show that a second user cannot retrieve the first user’s workout.
### Risks and scope decisions
Cloud access or billing setup may block staging. Continue local integration while resolving access, but do not mark the cloud deliverable done until the actual Cloud SQL path is verified. Dataset uploads and complex profile settings remain deferred.
### Handoff and review record
Deliver migration files, authenticated API documentation, consistent summary queries, retry semantics, and staging evidence to Sprint 6.
Review record: completed tickets, reviewer, evidence, results, defects, and carryover. Retrospective: one improvement, owner, and check date. Apply the master Definition of Done.

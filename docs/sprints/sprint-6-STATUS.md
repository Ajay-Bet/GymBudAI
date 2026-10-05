# Sprint 6 — Workout analytics and progress

Status: **complete (implementation and scoped acceptance verified 2026-10-04)**
Last updated: 2026-10-04

## Scope and acceptance criteria

- User selected Sprint 6, supplied the Word requirements and requested correct agents and execution. Adopted scope: [sprint-6.md](sprint-6.md), GB 601 history/detail, GB 602 metric definitions, GB 603 compatible comparisons, GB 604 efficient owned queries. Source requirements are distinguished from the user's authorization and master guidance.
- Entry evidence: Sprint 5 handoff records local/staging persistence acceptance. Its follow-up consistency fixes had 300 local tests and were already uncommitted on entry; preserved in place. Prior physical-camera/counting/coaching/device limitations were not treated as resolved by this sprint.
- Acceptance: deterministic pagination including ties; local display time, exercise/ROM/duration/reps/coverage/version detail; units, analyzed and observed denominators, explicit nulls; matching exercise/view/configuration trends with insufficiency notices; authenticated owner filtering, bounded/index-supported queries and independently calculated expected values.
- Proposed performance criterion adopted for scoped validation: each bounded history/summary request below one second, one client, seed of 1000 finalized workouts/1000 sets/3000 reps. Measured local and staging environments/results below; not a production-load claim.
- Out of scope: recommendations, clinical/composite scores, BigQuery, dataset/ML changes, enabling form rules, Cloud Run deployment, broad frontend language migration.

## Agent assignments and shared contracts

- Lead: guidance, scope/requirements/status, shared map/routing briefs, integration, documentation ownership (c-docs), staging validation and browser demonstration.
- `s6-backend` designated c-backend writer: backend routes/services/schemas/models/migrations, stable history; no test edits. Preserved pre-existing schema/service changes. Owns c-backend writeback.
- `s6-dashboard` designated c-frontend-app writer: history/progress UI, AnalyticsFilters.jsx, analytics/workouts API clients, App lazy route and Vite proxy; no test edits. Owns c-frontend-app writeback.
- `s6-validation` designated c-validation writer: analytics tests, performance seed/query plans, UI/client tests and independent review. Explicit reassignment: migration tests; history tests for cursor/timezone changes; one existing empty-list assertion for additive nextCursor, preserving its earlier local edits. Owns c-validation writeback.
- Three specialists plus lead respected the four-runtime limit. All were freshly instantiated from canonical shared briefs, full component history/lessons, master guidance and sprint records. No component memory persistence was assumed. Findings/contracts exchanged through agent messages; one writer per file. The sprint's agents are retired in the shared map after knowledge reconciliation.

### Agreed API and metric contract

- `GET /api/analytics/me`: required inclusive local startDate/endDate and validated IANA timezone; at most 366 days. Local midnight bounds become a UTC half-open interval. Day belongs to **workout session startedAt**, not set time or end time. Invalid UTC boundary conversion returns 422.
- Eligible: finalized workouts with saved sets. Empty finalized/open sessions counted as excluded; zero-rep saved sets remain descriptive. A capped, owner-filtered initial selection freezes at most 2000 workout IDs for subsequent aggregates; excess returns 422 range-too-large, never silent truncation.
- Response: range, descriptive totals, compatible groups with per-workout points, exclusions and units. Group configuration: exercise, anatomical side, view, analyzer/feature/rules/schema versions, analysis mode, sorted assessed rule set, minimum form coverage and supported-view status. Unknown/malformed legacy metadata becomes null and is not comparison eligible. At least two compatible measured points needed per metric.
- Counts/ROM/duration/events come from normalized rows. Independent set, rep and event SQL grouping prevents fanout. Average ROM uses observed completed-rep values (including unanalyzed reps), with observed count. Median duration is raw PostgreSQL percentile_cont, not median-of-medians. Detector no-issue fraction = total noIssueReps / total analyzedReps; null if none analyzed. Assessed and unassessed episodes are distinct; overlapping episodes do not multiply issue-bearing reps.
- Coverage uses summed assessable/session durations from sets with both known, with known-set count and completeness flag; never mean-of-fractions. Missing values remain null. Zero measurements/counts stay zero.
- History: additive opaque `(startedAt,id)` cursor / nextCursor, deterministic descending order. Legacy before/nextBefore retained for compatibility, with original timestamp-only limitation; new UI uses stable cursor. Page first, then page-scoped set totals. Migration `0002_analytics_index` adds owner/time/id index.
- Existing frontend remains JSX (recorded earlier stack deviation, no TypeScript compiler/check configured); no broad conversion claimed. Selected IANA timezone preference shared by history/progress; progress dates bounded, history all-time paged. Unknown calibration targets/load/camera placement limit physical comparability. Feedback version does not change arithmetic eligibility.

## Progress and decisions

- **GB 601 done:** predictable history pagination including identical timestamps, shared timezone selection, saved details with measurements/coverage/configuration versions.
- **GB 602 done:** metric guide, explicit denominators/units/nulls, detector summary label, separate episodes and issue-bearing reps, known coverage disclosure.
- **GB 603 done:** `/progress` with ROM/issue-frequency charts and accessible text tables, per-metric insufficiency, configuration notices and experimental review-mode labels; percentage-point deltas, no improvement claim across configurations.
- **GB 604 done:** authenticated owner-scoped SQL, date/workout caps, new index, migration/drift tests, independent seed calculations and query plans, scoped staging latency acceptance.
- Optional comparison metadata now typed on new saves without rewriting summary JSON or changing valid replay hashes. Legacy malformed arrays/numbers stay unknown.
- Progress route lazy-loaded to avoid enlarging initial camera bundle beyond its existing budget; production initial bundle 491.10 kB, Progress chunk 11.63 kB, no new bundle warning.
- Initial acceptance integrated full scope in the working tree before publication; no provisioning or deployed services. The later user-authorized publication/activation is recorded below.

## Validation and review evidence

### Automated checks

- Independent validator ran backend pytest against new disposable `gymbud_s6_validation_test`: **328 passed**, one existing Starlette TestClient/httpx deprecation warning, 24.86 s. Includes 28 new analytics/performance tests and 3 migration tests. Database removed afterward. Baseline before Sprint 6 was 300 backend tests.
- Frontend `npm test`: **322 Node + 48 DOM passed**, seven DOM suites. Includes new analytics transport/display cases, progress DOM and history selected-timezone/cursor cases. Existing synthetic detector safety tests still pass.
- Lead final `npm run lint`, `npm run build`, `backend/.venv/bin/python -m compileall -q backend/app backend/alembic` passed. `git diff --check` passed after final records. No separate TypeScript check exists or is claimed.
- Independent tests: overlapping issues, analyzed/unanalyzed/missing ROM, partial/weighted coverage, empty/open/zero-rep sessions, second-owner isolation, DST 23/25-hour days, UTC boundaries, session-start vs set-start membership, tied timestamps/cursor errors, every stored grouping field and rule-array order, unsupported legacy views/malformed config, 2001-workout rejection, nonconstant 3500 ms median, migration upgrade/downgrade/re-upgrade and model drift.
- Hand-calculated seed: 9 completed/4 analyzed/2 issue-bearing/2 no-issue reps = 50% detector summary; 7 assessed/3 unassessed episodes; average ROM 20° over 6 observed reps; duration median 2000.25 ms over 9; coverage 16451.3125/18801.5 ms = 87.5% across 2 known sets, third unknown makes coverage incomplete. Initial fixture expectation used 2500 ms gaps; corrected to actual 2500.25 ms, without changing product behavior.

### Query cost and staging

- [Final local benchmark](../validation/sprint-6/local-benchmark.json): macOS arm64, local PostgreSQL 18.4 Homebrew, local FastAPI TestClient/TCP; 1000 owned workouts/1000 sets/3000 reps, second-owner fixture. Three history requests **4.14–4.82 ms**, summaries **211.45–251.21 ms**. History backward index-only scan, 20 rows, 0.029 ms execution. Actual rep median aggregate plan 117.599 ms / 1002 grouping rows; sequential/hash/sort paths captured, no disk temp spill. Earlier simpler-metadata numbers 141–147 ms are superseded by final-code evidence.
- Read-only GCP check confirmed existing staging instance RUNNABLE, PG18, db-f1-micro, us-central1, activation ALWAYS. Existing Auth Proxy on TCP5433 used; no resources provisioned/reconfigured.
- [Staging benchmark](../validation/sprint-6/staging-benchmark.json): local FastAPI TestClient → existing Cloud SQL Auth Proxy → `gymbud_staging_test`; 1000 synthetic owned workouts/1000 sets/3000 reps. Three history requests **174.8–242.9 ms**, summary requests **559.3–701.8 ms**. Owner/time/id backward index-only scan, 20 rows, 0.093 ms execution. Second owner sees zero analytics and 404 for first owner's workout.
- Staging Alembic head upgrade + model drift check, seed and actual authenticated API requests ran inside one outer transaction with savepoints. Rolled back and verified original version `0001_initial`, one workout/zero sets/zero reps exactly preserved. No app database reset or persistent fixture/index/schema changes.
- Scoped proposed one-second target met. Single client, synthetic no-rule workload, local API transport with remote SQL; not concurrent load, browser request latency, or deployed Cloud Run performance. Staging full suite not repeated; local full suite plus targeted staging path used.

### Browser demonstration and independent review

- Production dist served on separate local preview5174 with API8081 and dedicated synthetic `gymbud_s6_demo_test`, preserving existing servers5173/8080 and app data.
- Browser skill used to sign into a disposable synthetic account and inspect rendered dashboard/detail. Compatible points show degrees/percentage points, text-table denominators and missing-data gaps; version change separated; 20% tracking set has zero analyzed reps/unavailable detector fraction; null ROM remains unavailable; overlapping two issues on one rep do not inflate issue-bearing count.
- Separate empty synthetic account shows clear empty history/progress with null measurement metrics. Desktop1280 and phone viewport390×844 checked; page width390 at mobile (tables scroll within their containers). Browser viewport reset. Browser-control date fill did not alter the native date fields; date selection behavior is covered in DOM tests rather than claimed from that interaction.
- Screenshots: [progress](../validation/sprint-6/progress-demo.png), [mobile](../validation/sprint-6/progress-mobile.png), [low coverage detail](../validation/sprint-6/low-coverage-detail.png), [empty history](../validation/sprint-6/empty-history.png), [empty progress](../validation/sprint-6/empty-progress.png). All synthetic; not physical exercise validation.
- Independent reviewer `s6-validation` found no unresolved scoped source defects after review; lead also reviewed contracts and integration. Fixed during review: duplicate set/session startedAt column, UTC-underflow 422 behavior, cap race from concurrent finalization, malformed comparison config handling, unknown-vs-empty rule display, review label, stale additive cursor test assertions. No human review or remote CI run is claimed.

## Handoff

- Temporary browser tab and isolated demo servers8081/5174 closed after verification; demo and validation databases removed. Existing app servers and Cloud SQL proxy left running unchanged. Screenshots/benchmark evidence retained.
- All GB 601–604 and scoped exit criteria met. Component knowledge reconciled in c-backend, c-frontend-app, c-validation and c-docs; s6 agents retired in canonical map, briefs kept as history.
- Rollout resolved during user-authorized activation below: migrated actual staging application database and restarted API/frontend. Sprint 5 follow-up fixes were included in the reviewed publication; local launch/settings files remain excluded and untouched.
- Retained limits: legacy timestamp-only before pagination, unknown physical calibration/load/camera consistency, advisory exclusion counts during concurrent finalization, 366-day/2000-workout bounds, existing JSX/no separate type check, no concurrent/deployed load test, remote CI not rerun, earlier camera/calibration/count/coaching/audio/device evidence gaps. Unvalidated form rules stay disabled in normal mode. No new accuracy claim.
- Branch after publication: `main`; initial implementation commit `9162b32` pushed to origin/main. No later sprint started. Dataset/ML pilot files untouched.
- Next action: sign in at the active `/progress` page; user opens Sprint 7 with requirements when ready. No new chat created automatically.
- Retrospective: agree response fields and fixture arithmetic before parallel implementation; independently exercise malformed legacy configuration before rendering it. Owner: next sprint lead; check at Sprint 7 planning.

## Publication and activation — 2026-10-04

- User explicitly authorized committing/pushing to main and restarting so analytics becomes active. Lead owns Git/frontend restart; fresh standing c-backend handles safe existing-database migration/API restart; c-validation audits staged scope and remote checks. Retired sprint briefs remain historical.
- Publish includes the already validated Sprint 5 consistency follow-up that analytics depends on, preserving its earlier evidence. Local .claude/launch.json and .claude/settings.local.json are excluded. Runtime credentials stay in memory/configuration and are never committed or printed.
- **Published:** commit `9162b32` (Sprint 6 completed), configured identity Ajay, no co-author trailer; pushed origin/main successfully. Related Sprint 5 follow-up consistency fixes/evidence included. Local-only launch/settings files remain untracked.
- **Remote checks:** [Backend CI](https://github.com/Ajay-Bet/GymBudAI/actions/runs/37252353312) successful: migration to head and 328 tests passed (one existing warning). [Frontend CI](https://github.com/Ajay-Bet/GymBudAI/actions/runs/37252353336) successful: 322 Node + 48 DOM passed, lint/build passed. Both verify exact source commit `9162b3294652d0b2ecbb43bb3ffd5482d54ea7f9`.
- **Actual application database:** preserved existing FastAPI runtime DATABASE_URL pointing to `gymbud_staging` through the existing Auth Proxy on 127.0.0.1:5433. Migration advanced `0001_initial` → `0002_analytics_index`; model drift check and index verification passed. Exact before/after counts unchanged: 3 users, 4 auth sessions, 2 workouts, 2 sets, 12 reps, 6 form events, 0 event-rep links. No reset or synthetic data inserted.
- **Restarted:** FastAPI old PID61293 → PID94317 on 127.0.0.1:8080 with same startup environment/effective backend configuration; coaching status unchanged (TTS/wording false). Existing Auth Proxy PID62720 left running. Frontend old Vite PID36195 → PID93815 on 127.0.0.1:5173; pinned vision assets verified at startup. Frontend runtime log is /tmp/gymbud-frontend-active.log; API stdout/stderr are directed to /dev/null, so no persistent API startup log is claimed. Runtime credentials were never written or printed.
- **Active verification:** API health200; OpenAPI contains analytics/auth routes; unauthenticated analytics/users requests401. Through restarted Vite, `/api/analytics/me` returns expected401 sign-in-required, proving proxy routing. `/progress` and its client module200; browser renders progress controls/sign-in gate without startup console errors. Read-only analytics against an existing owner on the actual app database returns saved workout data (1 workout/1 set/8 completed reps/1 group in selected Oct1–4 window), transaction rolled back, no data mutations.
- **Evidence boundary:** existing authenticated user's browser session was not available, so no new real-user sign-in or data mutation was performed. Previous synthetic browser demo and local/staging tests cover the signed-in UI; actual service/proxy/DB activation verified above. No Cloud Run deployment.
- **Knowledge reconciliation:** c-backend runtime/migration evidence, c-frontend-app running route, c-validation CI checks and c-docs activation note updated. Initial scoped acceptance and rollback benchmark remain historical; the actual application migration happened only after the explicit user instruction. Final documentation-only activation record is committed/pushed separately.

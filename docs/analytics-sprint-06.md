# Workout analytics (Sprint 6)

Analytics reads saved structured records in PostgreSQL through authenticated FastAPI. Live camera processing is unchanged. These measurements describe recorded movement and detector output; they do not establish form correctness, clinical benefit or injury prevention.

## Metric definitions

| Metric | Calculation | Unit and missing behavior |
| --- | --- | --- |
| Completed reps | Sum of stored completed rep counts | Reps; 0 is a real count |
| Analyzed reps | Completed reps eligible for configured rules and minimum form coverage | Reps; shown against completed reps |
| Issue-bearing reps | Analyzed reps with at least one configured issue | Reps; each rep counts once even with overlapping issues |
| No-issue fraction | Total no-issue reps / total analyzed reps | Fraction shown as percent; null when no analyzed reps; detector summary |
| Assessed issue episodes | Number of assessed continuous issue records | Episodes; separate from issue-bearing reps and from unassessed episodes |
| Average ROM | Sum of observed completed-rep ROM / number of observed ROM measurements | Degrees; null ROM omitted, never filled with 0; observed count shown |
| Median duration | PostgreSQL median over observed completed-rep durations | Milliseconds in API; seconds in UI; observed count shown |
| Tracking coverage | Sum of assessable ms / sum of session ms for sets with both durations known | Fraction; null for no positive denominator; known-set count and completeness shown |

A partial tracking aggregate describes the known sets only. It does not impute coverage for unknown sets. A zero-degree ROM and a zero duration remain recorded measurements, distinct from missing values.

For a hand-calculated example, 8 completed reps with 6 analyzed and 2 issue-bearing yield 4 no-issue reps and 4/6 = 66.7% no configured issue detected. Three issue episodes may overlap those same 2 reps; they do not imply 3 issue-bearing reps. ROM values 90°, 110° and null average to 100° over 2 observed reps, not 66.7° over 3. Durations 1000, 2000 and 4000 ms have a median of 2000 ms. Known tracking times 4000/5000 ms and 4000/5000 ms aggregate to 8000/10000 = 80%. These are synthetic arithmetic examples, not physical validation evidence.

## Time and eligibility

Store timestamps in UTC. The workout day is its session `startedAt`, rendered in the selected IANA timezone. The progress request specifies inclusive local start/end dates; FastAPI converts local midnight and midnight following the end date into a half-open UTC interval. Daylight-saving days can be 23 or 25 hours. Changing the display timezone can move a workout to another local day.

Trends use finalized workouts with at least one saved set. Open workouts and empty finalized workouts are excluded and reported separately. Completed sets with zero reps remain visible: missing metrics are explained rather than silently dropped. History continues to show saved open/empty workouts with their status.

Progress groups separate exercise, supported camera view, anatomical side, analyzer version, feature version, rules version, summary schema, analysis mode, assessed rule set and minimum form coverage. A single workout containing multiple configurations contributes a point to each relevant group. Overall totals describe the selected window; they are not a compatible longitudinal comparison.

At least two points with a measured metric in the same supported configuration are needed for that metric's comparison. Unknown or unsupported historical camera views are not eligible for comparisons. A version change is a configuration change, not evidence of improvement. Percentage changes in detector frequency are described in **percentage points**; 40% to 30% is −10 percentage points.

Persisted configuration compatibility cannot prove identical physical conditions: load, exact camera position and calibration targets are not stored. Charts show changes in recorded measurements, without asserting improvement. Review-mode detector output is experimental. Validated-only workouts currently have no enabled form rules, so analyzed/no-issue metrics can be unavailable while ROM/duration remain available.

## Bounded API and stable history

`GET /api/analytics/me?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&timezone=America%2FNew_York` requires authentication, a valid timezone and an ordered interval of at most 366 local days. More than 2000 eligible workouts yields an explicit range-too-large error; narrow the dates instead of relying on a truncated trend. Ownership comes from the bearer session; a caller-supplied user ID never selects another user's data.

The response includes range bounds, descriptive totals, compatible groups and per-workout points, exclusion counts and units. Each metric carries its observation or analysis denominator. All aggregates use structured set/rep/form-event records. Separate rep/event aggregation avoids multiplying counts when several episodes overlap a rep.

History adds an opaque cursor with both `startedAt` and workout ID. Requests use `cursor` and the response's `nextCursor`; tied timestamps retain deterministic descending ID ordering. Legacy `before` / `nextBefore` remain supported, with their original timestamp-only limitation. Clients must not combine cursor and before. Page aggregation is restricted to the authenticated owner's selected page.

## Validation and remaining limits

Sprint evidence, actual checks, query plans, performance environment, reviewer findings and handoff are recorded in [Sprint 6 status](sprints/sprint-6-STATUS.md). Synthetic database/UI checks do not resolve earlier physical-camera, independently reviewed counting/coaching or real-device limitations. Staging performance must be measured and recorded before claiming the proposed under-one-second target.

## Measured evidence and rollout

Final checks: 328 backend tests, 322 frontend logic tests and 48 DOM tests passed; lint, production build, Python compilation and diff checks passed. The independent arithmetic seed produces 9 completed/4 analyzed/2 issue-bearing/2 no-issue reps, 7 assessed and 3 unassessed episodes, 20° average over 6 measured ROMs, 2000.25 ms median over 9 durations, and 87.5% weighted tracking coverage from 2 known sets; a third unknown set keeps coverage incomplete. Additional tests verify a nonconstant 3500 ms median, weighted rather than mean-of-fractions coverage, DST boundaries, configuration separation and 2001-workout rejection.

For 1000 finalized workouts/1000 sets/3000 reps, final local requests measured 4.14–4.82 ms history and 211–251 ms summary; staging Cloud SQL requests measured 175–243 ms history and 559–702 ms summary. These are three observations each, using local FastAPI TestClient and respectively local PostgreSQL or the existing Auth Proxy to PG18 `db-f1-micro` in us-central1. They meet the proposed one-second target for this seed and single-client path. They do not measure browser transport, concurrent users or deployed Cloud Run. Full plans/environment are in [local benchmark](validation/sprint-6/local-benchmark.json) and [staging benchmark](validation/sprint-6/staging-benchmark.json).

Staging migration upgrade/model-drift checks and the seed/API benchmark ran in one rollback transaction on `gymbud_staging_test`. Original migration `0001_initial` and original record counts were verified unchanged afterward. Application data was not touched. For rollout, run backend `alembic upgrade head` with the intended application's `DATABASE_URL`, then restart FastAPI. Existing servers were not stopped or reconfigured by this sprint.

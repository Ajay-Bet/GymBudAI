# Sprint 6 — supplied requirements

Source: GymBud_Sprint_06_Workout_Analytics_and_Progress.docx. The user selected Sprint 6 and supplied this document as requirements on 2026-10-04. Master guidance takes precedence; document proposals remain proposals.

GymBud Sprint 6 Workout Analytics and Progress

Two week working plan with backlog implementation and review criteria

Present saved workout history and understandable movement trends with explicit units, denominators, and missing-data behavior.

Dates and owners are assigned at sprint planning. Proposed acceptance targets are reviewed before implementation and are not claims of measured performance.

Entry requirements

Sprint 5 reliably stores owned sessions, reps, form events, and configuration versions. The team has seed workouts with manually calculable expected analytics.

Sprint scope

Build workout history, session details, aggregate metrics, and a limited set of progress charts. Keep analytics in PostgreSQL and FastAPI initially. BigQuery, recommendations, and clinical scoring are outside this sprint.

Sprint backlog

GB 601 History and detail

As a user, I can review previous workouts and sets.

Acceptance criteria  History is paginated and ordered predictably. Session detail shows the exercise, local display time, reps, ROM, duration, tracking coverage, and relevant detector version.

GB 602 Metric definitions

As a user, I can understand what each number means.

Acceptance criteria  Completed and analyzed reps are distinct. Issue episodes and issue-bearing reps are labeled separately. Units and denominators are visible; missing measurements do not become zeros.

GB 603 Progress comparison

As a user, I can compare similar sessions over time.

Acceptance criteria  Compare matching exercises and supported views, and identify configuration changes. Show insufficient data when measurements or comparable sessions are unavailable; avoid unsupported improvement claims.

GB 604 Efficient owned queries

As a developer, I can serve analytics without leaking data or slowing down history.

Acceptance criteria  Aggregations filter by authenticated ownership. Relevant owner and date indexes are present, and seeded query results match independently calculated expectations.

Implementation and sprint review

Technical plan

Aggregation rules  Define formulas for completed reps, analyzed reps, issue-bearing reps, median duration, average ROM, and tracking coverage. Compute no-issue percentage only over analyzed reps, and label it as a detector summary rather than a validated form score.

Time and comparability  Store timestamps in UTC and render according to the user’s selected timezone. Define which timestamp determines a workout day. Group by exercise, camera view, analyzer version, and comparable eligibility rules before producing trends.

Dashboard design  Start with session history, a recent-workout detail view, and ROM or issue-frequency trends. Use accessible chart labels and text summaries. A percentage-point change must not be presented as the same quantity as relative percentage growth.

Cloud and performance  Query Cloud SQL through FastAPI with pagination and bounded date ranges. Keep an index-supported path for owner and session time. Introduce precomputed aggregates only after measured query cost justifies their maintenance complexity.

Verification checklist

Use hand-calculated fixtures with overlapping errors, unanalyzed reps, missing ROM, and empty history.

Compare API aggregates with expected counts, percentages, medians, and units.

Test UTC day boundaries, local daylight-saving transitions, and stable pagination.

Verify mixed camera views or detector versions are not silently shown as equivalent improvement.

Load a seeded larger history, inspect query plans, and repeat ownership checks for analytics endpoints.

Exit criteria

All agreed metrics match independent seed calculations. Empty and incomplete data are explained clearly. Proposed performance target: the bounded history and summary requests complete within one second in staging under the agreed seed size; record the environment and measured result.

Sprint review demonstration

Compare two compatible curl sessions, inspect a workout with poor tracking coverage, and show how overlapping issue types affect issue-bearing reps. Show an empty history and a configuration-change notice.

Risks and scope decisions

Attractive scores can mislead if the denominator or detector limits are hidden. Prefer concrete measurements and observed issue frequency. Recommendations, arbitrary composite scores, and large analytics infrastructure remain deferred.

Handoff and review record

Deliver metric definitions, seed calculations, dashboard screens, indexed queries, and known comparison limits to the dataset work in Sprint 7.

Review record: completed tickets, reviewer, evidence, results, defects, and carryover. Retrospective: one improvement, owner, and check date. Apply the master Definition of Done.

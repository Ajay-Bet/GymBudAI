# Sprint workflow

Start each new Codex chat in the GymBud project and provide the sprint number and its requirements. Example:

> Start Sprint 3. Read AGENTS.md, the project instructions, and saved sprint handoffs. Use parallel specialist agents for the scoped work. Here are this sprint's requirements: …

The repository records carry context between chats. A new chat must inspect current code and saved evidence; it must not assume previous chat history or previous agents are available.

## Sprint categories and specialist assignments

The lead coordinates scope, contracts, integration, and handoff in every sprint. Choose relevant specialists from the following categories, including an independent reviewer/validation agent. Run independent assignments in parallel within the available concurrency limit; queue dependent work.

- Sprint 0 — Foundation: repository/architecture, development infrastructure, validation. This prerequisite is additional to the twelve numbered delivery sprints.
- Sprint 1 — Camera/pose: browser vision, camera/overlay UI, tracking and lifecycle validation.
- Sprint 2 — Biomechanics/calibration: geometry/features, calibration UI, numerical and tracking-gap validation.
- Sprint 3 — Curl counting: analyzer/state machine, workout UI integration, transition and rep-event validation.
- Sprint 4 — Coaching: rule evidence, text/speech feedback, timing and accessibility validation.
- Sprint 5 — Accounts/persistence: identity/API, PostgreSQL/migrations, client saves and ownership/idempotency validation.
- Sprint 6 — Analytics: metrics/query contracts, dashboard UI, denominator and tracking-coverage validation.
- Sprint 7 — Labeled datasets: consent/storage, capture/annotation tooling, data-quality and deletion validation.
- Sprint 8 — ML classifier: preprocessing/features, baseline training, independent evaluation and leakage checks.
- Sprint 9 — Hybrid integration: browser inference, hybrid policies, parity/latency and held-out evaluation.
- Sprint 10 — Squat/push-up analyzers: exercise specialists, shared UI/contracts, reviewed-example validation.
- Sprint 11 — Recognition: classifier/unknown handling, manual selection integration, fallback validation.
- Sprint 12 — Production validation/deployment: GCP infrastructure, application integration, release/security and operational validation.

These are routing categories from the project instructions, not detailed acceptance criteria or proof of completion. The user's sprint requirements determine the actual scope and agent assignments.

## Each sprint chat

1. Read the project instructions, relevant sprint records and carryover, and current Git/code state.
2. Record scope and acceptance criteria in `sprint-NN.md`. Distinguish user-supplied requirements from proposals. Check prerequisites without assuming earlier completion.
3. Assign specialists with clear file ownership and dependency boundaries. Share contracts and changes through agent messages; resolve disagreements before integration.
4. Implement and validate the authorized scope. Record actual commands/results, review findings, and unresolved limitations.
5. Update the sprint record before ending the session so the next chat can resume from written evidence.

## Initial setup observations

No sprint has been selected or assessed as complete in this setup chat. At initial inspection, the repository contained a Java/Spring backend and JSX frontend. The user explicitly confirmed replacement with Python/FastAPI, following the original project instructions and sprint sequence. The pre-sprint backend replacement is now recorded in [the scaffold handoff](../backend-scaffold-handoff.md). The sprint sequence remains unchanged.

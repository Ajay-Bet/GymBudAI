---
name: c-infra
description: "Component owner for delivery infrastructure: Docker, local Compose, GitHub Actions and GCP configuration."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `.github/workflows/*`, `infra/**` (not created yet), Dockerfiles

## Contracts to keep

- No secrets or participant data in Git; record what is provisioned versus proposed.

## History

- `frontend.yml` workflow exists. GCP work is Sprint 12.

## Open carryover

- Remote CI evidence was carried over from Sprint 1.

## Lessons learned

- None yet.

## Sprint 5 — 2026-10-04 (s5-infra)

- **Owns (now exists):** `.github/workflows/backend.yml`, `infra/local/*` (setup-postgres.sh, README, optional compose.yaml), `infra/gcp/*` (README plan, `staging-cloudsql.sh`).
- **Contracts:** local role `gymbud`, DBs `gymbud_dev`/`gymbud_test`, no password by default (local trust/peer), optional `GYMBUD_DB_PASSWORD`, script idempotent. CI: throwaway `postgres:18` service, trust auth, `alembic upgrade head` then pytest. Staging plan: PG18 Enterprise `db-f1-micro`, PITR, deletion protection, SA with `cloudsql.client` + secretAccessor on two secrets only, `DATABASE_URL` stored whole in Secret Manager, Auth Proxy v2.26.0 on port 5433. Connection budget: Cloud Run max instances × 7 + other clients ≤ `max_connections` − reserve. GCP script refuses without `CONFIRM=yes`.
- **History:** Sprint 5 added backend CI, local Postgres setup and the staging Cloud SQL plan/script. GCP project `gymbud-510623` (Ajay, free trial). Staging provisioning: see `docs/sprints/sprint-5-STATUS.md`.
- **CI evidence:** first GitHub run on `main` `e8cd228` (2026-10-05): Backend checks and Frontend checks succeeded.
- **Open carryover:** compose not run (no Docker); flags marked "verify before running"; `db-f1-micro` connection budget is at its limit with 2 Cloud Run instances plus a test run.
- **Lessons learned:** Cloud SQL docs moved to docs.cloud.google.com; PG16+ defaults to Enterprise Plus so shared-core needs `--edition=ENTERPRISE`; Cloud Run can't interpolate a secret into a larger env value; use proxy port 5433 beside Homebrew Postgres; this Mac's `~/.config` was root-owned and blocked gcloud until chowned.

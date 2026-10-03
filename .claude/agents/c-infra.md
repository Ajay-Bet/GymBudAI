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

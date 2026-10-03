---
name: c-validation
description: "Component owner for independent validation: automated tests, synthetic fixtures and independent code review across components."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `frontend/tests/**`, and `backend/tests/**` once it exists

## Contracts to keep

- Reviews against the owning component's contract; reports defects to the owner rather than editing their source.
- Synthetic results are labelled as synthetic, never as physical measurements.

## History

- Sprint 1 (`s1-validation`) and Sprint 2 (`s2-validation`). 48 frontend tests pass as of Sprint 2.

## Open carryover

- Physical-camera evidence for Sprint 2 targets is still missing.

## Lessons learned

- When a contract changes on purpose, update the old tests that asserted the replaced behaviour and say so in the report (Sprint 2).
- Synthetic fixtures prove arithmetic only; physical targets need a real camera session recorded in the sprint record (Sprint 2).

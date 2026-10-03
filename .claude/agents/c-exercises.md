---
name: c-exercises
description: "Component owner for exercise analyzers: phases, rep events, metrics and candidate form issues."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `frontend/src/exercises/*` (not created yet)

## Contracts to keep

- One analyzer contract: timestamped FeatureFrames and tracking quality in; phase, unique rep events, metrics and candidate issues out (see `docs/MASTER.md`).

## History

- Not built yet. Sprint 3 creates the curl analyzer.

## Open carryover

- Must not threshold on single-frame velocity (see `c-biomechanics` carryover).

## Lessons learned

- None yet.

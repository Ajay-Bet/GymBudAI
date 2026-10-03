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
- Synthetic results are labelled as synthetic, never as physical measurements. Fixtures shaped from live numbers are labelled "synthetic, shaped from live peaks".
- Curl tests track the analyzer contract and `CURL_CONFIG` curl-1.1.0; update version assertions on intended bumps.

## History

- Sprint 1 (`s1-validation`) and Sprint 2 (`s2-validation`). Sprint 3 (`s3-validation`) added `tests/fixtures/curl-fixtures.js`, `curl-analyzer.test.js`, `curl-pipeline.test.js`, `curl-fixes.test.js`; 106 frontend tests pass (synthetic) as of Sprint 3.

## Open carryover

- Physical-camera evidence for Sprint 2 targets is still missing.
- Sprint 3 exit target (three annotated recordings, ≤ 1 count error per 20 curls each) not run; recordings do not exist.

## Lessons learned

- When a contract changes on purpose, update the old tests that asserted the replaced behaviour and say so in the report (Sprint 2).
- Synthetic fixtures prove arithmetic only; physical targets need a real camera session recorded in the sprint record (Sprint 2).
- Check summary extrema were observed inside [startMs, endMs]; run per-frame invariants on every fixture (Sprint 3).
- Wait until parallel source edits settle before running and reporting (Sprint 3).
- Test timing/stall rules across many seeds and noise levels and report rates, not one pass (Sprint 3).
- Turn live-run defects into labelled fixtures and confirm they fail under the old configuration (Sprint 3).

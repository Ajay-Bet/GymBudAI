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
- Coaching tests track `curl-rules-1.0.0`, `feedback-1.0.0` and `set-summary-1.0.0`; a test asserts every rule stays `enabled: false`/`unvalidated` until reviewed evidence is recorded.

## History

- Sprint 1 (`s1-validation`) and Sprint 2 (`s2-validation`). Sprint 3 (`s3-validation`) added `tests/fixtures/curl-fixtures.js`, `curl-analyzer.test.js`, `curl-pipeline.test.js`, `curl-fixes.test.js`; 106 frontend tests pass (synthetic) as of Sprint 3. Sprint 4 (`s4-validation`) added `tests/fixtures/coaching-fixtures.js`, `tests/fixtures/coaching-speech-fake.js` and `coaching-{rules,scheduler,speech,summary}.test.js` (72 tests), reviewed twice (D1–D6 fixed); 178 frontend tests pass (synthetic) as of Sprint 4. Sprint 4 close-out (2026-10-04): `coaching-replay-eval.test.js` (5 synthetic tests) for `ml/coaching_eval.mjs`, reviewed by `s4-validation` (7 findings fixed); 270 node + 15 UI tests pass.

## Open carryover

- Physical-camera evidence for Sprint 2 targets is still missing.
- Sprint 4 exit criterion (three independently reviewed recordings, false cues per minute) not run; the measuring tool `ml/coaching_eval.mjs` now exists, labelled and reviewed side-view recordings with a calibration hold are still needed.
- Synthetic finding (2026-10-04): a lean above about 17° about the hip moves the shoulder past the 0.3-torso reposition check, so calibration resets and no torso cue is given. Check on real recordings.
- Component/DOM coverage now exists; actual browser/device behavior remains unverified.
- No real-device evidence of the low-frame-rate behaviour.
- Sprint 3 exit target (three annotated recordings, ≤ 1 count error per 20 curls each) not run; independent review pending.

## Lessons learned

- When a contract changes on purpose, update the old tests that asserted the replaced behaviour and say so in the report (Sprint 2).
- Synthetic fixtures prove arithmetic only; physical targets need a real camera session recorded in the sprint record (Sprint 2).
- Check summary extrema were observed inside [startMs, endMs]; run per-frame invariants on every fixture (Sprint 3).
- Wait until parallel source edits settle before running and reporting (Sprint 3).
- Test timing/stall rules across many seeds and noise levels and report rates, not one pass (Sprint 3).
- Turn live-run defects into labelled fixtures and confirm they fail under the old configuration (Sprint 3).
- A false-cue rate needs a denominator of calibrated, coachable accepted-form time, plus a rate over all assessable time and the labelled fraction; 0/0 must never pass an acceptance check (Sprint 4).
- Assert persistence timing as ≥ persistence and < persistence + one frame interval from the first valid frame; report min/max per fps across seeds (Sprint 4).
- A fake speech synthesis must cover cancel firing end, error or nothing, plus late events (Sprint 4).
- Mutation-check safety gates in a scratch copy to confirm the tests catch them (Sprint 4).
- Test frame-rate edges explicitly; an evidence-gap rule silently disabled coaching below about 7 fps (Sprint 4 D1).
- Space scripted episodes past the scheduler's display hold, or tests misread the hold as a failure; count false cues per episode, not per log entry (Sprint 4).


## Sprint 4 extension continuity — 2026-10-03

- Added lifecycle/score/findings/feedback/output tests, calibration-extension replay, voice/wording/transport tests and UI integration/panel tests. Final247node+11DOM+97mockedbackend tests pass, lint/build/diff-check clean; no separate TypeScript script in existing JSX app. Evidence is synthetic/DOM/mocked. Independent review artifact docs/sprints/sprint-4-review.md.
- Review found/fixed missing torso feature earning analyzed coverage/100score, canceled prefetch batch continuing requests, inaudible experimental label, stale narration UI token and obsolete contract expectations. Reproduced missing-feature case after fix0analyzed/0coverage/unavailable.
- User confirms good/bad-form recordings exist; independently reviewed labels/outcomes and false-cue target+measurement pending. Live Chrome/Safari/iOS and provider audio, physical calibration and Sprint3 annotated counting criteria remain pending.
- Lesson: test missing-feature validity across tracker→summary→score; batch cancellation must prevent subsequent async requests; labels matter in every output modality. Knowledge writeback: lead from independent s4-validation; specialists remain Active pending sprint acceptance.

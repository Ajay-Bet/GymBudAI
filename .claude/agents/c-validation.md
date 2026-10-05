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

## Sprint 5 — 2026-10-04 (s5-validation)

- **Owns (added):** `backend/tests/fixtures/**`. `frontend/tests/fixtures/workout-payload-fixtures.js --write` regenerates `backend/tests/fixtures/frontend_set_payloads.json`; a node test checks drift.
- **History:** added backend `test_ownership.py`, `test_idempotency.py`, `test_db_unavailable.py`; frontend `workout-payload.test.js`, `save-queue.test.js`, `auth-api.test.js`, `ui/save-panel.test.jsx`, `ui/history-page.test.jsx`. Review: M1 (queue owner on shared browser), M2 (empty workout after a 422), L1 (multi-tab loss), L2 (unguarded test schema drop), L3 (1 vs 1.0 hash) fixed; L4/L5 recorded as limitations. Evidence local (PostgreSQL 18.4, SYNTHETIC frames, jsdom).
- **Open carryover:** L4 register/login rate limits and enumeration; L5 future-clock 422; I1 validated-only saves have no event→rep links (Sprint 6 must not expect them).
- **Lessons learned:** run payloads from the real frontend builder through the real backend; model "still working when the client retries" with a row lock held from another connection; mutation-check ownership filters and replay hashing (the row lock alone was not load-bearing — unique constraints + re-read are); check client-side storage for owner and tab isolation; render pages with real-shaped data.

## Sprint 5 follow-up validation — 2026-10-04

- Added `backend/tests/test_summary_consistency.py` (49 tests) for duplicate/missing/mutated summary reps and episodes, shared record fields and links, coverage ratio/null/zero semantics, configured exercise views, API rejection followed by valid identical retry, partial-attempt preservation, and episode rules-version fallback. All 29 malformed duplicate-record/coverage mutation inputs were accepted by the untouched HEAD schema in an isolated in-memory module; fixed schema rejects them.
- Corrected valid fixtures rather than weakening cross-checks: conftest event links now follow summary rep `episodeIds` exactly as the frontend builder does; numeric-equivalence and conflicting-peak retry tests change both copies consistently.
- Final backend suite: **300 passed**, one existing Starlette warning, in 18.09 s on a newly created isolated local PostgreSQL database, removed afterward. Actual frontend payload round trips and idempotency tests pass. Backend owner independently compared HEAD/new validation on both real frontend fixture modes: raw summaries and payload hashes unchanged. Source/contract review found no additional defects within this scope; cloud availability and remote CI were not rerun.
- Remaining physical-camera, independently reviewed counting/coaching, device/audio, and provider validation boundaries above remain open. Synthetic/API checks do not resolve them.

## Sprint 6 — 2026-10-04 (s6-validation)

- **Owns (added):** `backend/tests/test_analytics.py`, `test_analytics_performance.py`, `frontend/tests/analytics-api.test.js`, `frontend/tests/ui/progress-page.test.jsx`. Updated migration head/index downgrade/no-drift tests for `0002_analytics_index`, the old workout-list exact empty-response assertion for additive `nextCursor`, and history DOM expectations for the intentional cursor/shared-display-timezone contract. Preserved pre-existing Sprint 5 follow-up tests.
- **Independent seed:** three finalized sets: 9 completed, 4 analyzed, 2 issue-bearing, 2 no-issue (50% over analyzed reps); assessed episodes 7 (torso 2/drift 3/incomplete 2), unassessed 3; ROM 10/null/30 per set gives 20° over 6 observed reps; median duration 2000.25 ms over 9. Two known tracking pairs sum 16451.3125/18801.5 ms = 87.5%, third unknown means partial data. Open/empty workouts excluded; another owner's rows never enter totals. Separate nonconstant seed verifies median 3500 ms and weighted tracking 25% rather than unweighted 20%.
- **Checks actually run:** final full backend `pytest backend/tests -q -s` **328 passed**, one existing Starlette deprecation warning, 24.86 s, new disposable local PostgreSQL `gymbud_s6_validation_test` created and removed. Frontend `npm test`: **322 node + 47 DOM**; final DOM run after added timezone regression: **48 passed** across 7 suites. `git diff --check` passed. Evidence is synthetic/API/jsdom, not physical detector validation.
- **Regressions:** auth ownership, null ROM/empty/zero-rep measurements, assessed episodes counted without overlapping-rep fanout, all stored configuration boundaries and sorted assessed-rule order, unsupported legacy views, malformed new configuration 422 / malformed persisted legacy metadata explicit unknown, 366-day bounds/UTC underflow, spring/fall DST 23/25-hour intervals, session-start day across set midnight, tied timestamp stable UUID cursor pages, cap 2001 rejects rather than truncates. UI checks units/denominators, missing values, configuration notices, experimental mode, comparison abstention, chart text equivalents and percentage points, retries/abort, signed-out no-fetch and selected timezone.
- **Local performance:** 1000 owned workouts/sets, 3000 reps, separate second owner. macOS arm64/PostgreSQL 18.4 Homebrew, FastAPI TestClient + local TCP database, three calls: history 4.14–4.82 ms, analytics 211.45–251.21 ms on final configuration sanitization code. Owner/date/time/UUID history index scans backward, 20 rows, 0.029 ms EXPLAIN execution. Actual captured ROM/median aggregation plan: 117.599 ms, 1002 grouped rows, no temp-disk spill. Full plans/timings: `docs/validation/sprint-6/local-benchmark.json`; importable transaction-only synthetic seed helper in performance tests.
- **Lead-reported staging evidence inspected/recorded:** existing Cloud SQL PostgreSQL 18 `db-f1-micro`, us-central1, Auth Proxy + local Mac TestClient; 1000 owned workouts/sets, 3000 reps, three calls: history 174.8–242.9 ms, analytics 559.3–701.8 ms; history index-only backward scan 20 rows, 0.093 ms. Lead ran temporary migration/seed/API checks in an outer transaction then rolled back; prior migration `0001_initial` and 1 workout/0 sets/0 reps preserved. Second owner analytics empty and detail 404. Artifact `docs/validation/sprint-6/staging-benchmark.json`. This establishes the proposed seed-size staging database target through local TestClient/RPC overhead; it does not establish deployed HTTP-service or concurrent-load performance.
- **Review/lessons:** no unresolved defects found in independent analytics/backend/dashboard scope after fixes. Test expected counts independently; make denominators nonconstant so an incorrect unweighted average or median-of-medians fails. Observe the actual aggregate query as well as the history index plan. New safety checks for JSON configuration affect aggregate cost, so benchmark final code. Stored calibration targets/load/camera position are absent: matching metadata cannot establish equivalent physical conditions or better form. All earlier physical-camera/device/recording acceptance carryover remains unchanged.

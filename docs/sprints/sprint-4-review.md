# Sprint 4 independent implementation review

Reviewed 2026-10-03 by the current chat's `s4-validation` specialist after the lead declared application source settled. This is an independent source and automated review of the coaching extension, not a reviewed-recording or audible-browser assessment. Existing unrelated workspace changes were preserved. No commit, provider call, secret inspection or recording upload occurred.

## Result

No unresolved implementation defect found in the reviewed scope after the fixes below. Automated implementation review passes. Sprint acceptance remains pending the human-recording and live-device evidence listed below; this report does not enable a rule or establish detector accuracy.

Reviewed the saved takeover requirements, component contracts, and current implementation of CameraView integration, set lifecycle, scoring/findings, calibration, issue-tracker coverage, scheduler/speech/voice cancellation, optional wording/transport, and FastAPI proxy/configuration/schema/service. The new integration tests exercise actual analyzer, tracker, lifecycle and voice modules with mocked camera/pose/biomechanics/speech/provider interfaces; they do not run MediaPipe or a physical camera.

## Findings addressed before the final checks

1. **P2 — missing rule observations incorrectly supported analyzed reps and favorable scores.** The shared issue-tracker coverage interval originally used only the global ready/view/tracking gate. Ready synthetic frames with absent torso measurements still yielded full form coverage, analyzed reps, and clean findings. Reviewer reproduction using the real tracker and synthetic completed-rep windows produced four analyzed reps and a score of 100 with `torsoDeviationDeg=null` and validity false throughout. The lead changed shared coverage to require every live rule feature to be finite and explicitly valid, and independently checks each rule's validity flag. The identical reviewer reproduction now yields zero analyzed reps, zero assessable milliseconds, and unavailable score (`low-coverage`). Missing-observation summary regressions cover null and invalid-flag cases. This conservative shared-coverage policy can withhold a valid rule's summary when another live feature is missing; it avoids inferring clean form from absent evidence.
2. **P2 — cancellation allowed a sequential prefetch batch to start later requests.** Aborting the first pending prefetch resolved it to null, then the loop proceeded because AI output remained enabled. The lead added a cancellation generation checked between requests and aborts on stop/mute/mode/disposal. A deferred three-cue test now verifies that Stop aborts the first request and starts none of the remainder.
3. **P2 — spoken review scores lacked their experimental qualification.** Deterministic review narration and the approved frontend/backend AI headline variants now begin with an experimental/unvalidated qualifier. Both variants are checked independently; optional AI wording cannot remove that qualification, add arbitrary claims, or alter the deterministic score.
4. **P3 — late narration could republish stale UI status after a new set or cancellation.** The UI owner centralized cancellation/token invalidation and guards completion callbacks by token and mounted state. A deferred narration test verifies an old cancellation cannot replace a fresh set's narration status. Late wording is also aborted and ignored after starting the next set.
5. **Verification gap — leaf-panel tests did not cover CameraView integration.** The UI owner added seven CameraView integration tests alongside four panel tests. They cover pause/restart with retained reps, explicit exactly-once finish, ignored post-finish frames, fresh next-set counters, visible arm-change consent, hidden-page interruption, StrictMode subscription cleanup, text default/no implicit AI audio, local offline fallback, late wording/narration, and narration waiting for an existing live cue. Bounded prefetch is wired only for an active set with explicit Audio + text and AI output enabled.

The initial pre-settled test run exposed four obsolete version/wording assertions. The lead updated them for the intended FeatureFrame 1.2.0 and feedback-1.1.0 contracts; the final run below includes those tests.

## Independent final command evidence

All commands ran against the settled application source in the shared checkout.

| Working directory | Command | Result |
| --- | --- | --- |
| `frontend/` | `npm test` | Exit 0: 247 Node tests passed; 11 Vitest DOM tests passed across 2 files; no failed, skipped or canceled Node tests. |
| `frontend/` | `npm run lint` | Exit 0; ESLint clean. |
| `frontend/` | `npm run build` | Exit 0; Vite production build succeeded, 114 modules transformed. MediaPipe 0.10.32 assets and Pose Landmarker Lite float16/1 SHA-256 verified by the existing preparation script. |
| `backend/` | `.venv/bin/python -m pytest -q` | Exit 0: 97 mocked tests passed; one existing Starlette/httpx TestClient deprecation warning. |
| Repository root | `git diff --check` | Exit 0; no whitespace errors in tracked diff. |

Backend verification uses mocked transport and includes no-key behavior, structured facts/approved indices, experimental qualification, secret-safe error handling, timeouts, streamed body/response caps, rate limits, LRU entry/byte bounds and malformed provider output. Local rules and counting remain independent of the backend. Provider readiness booleans indicate key configuration only, not verified credentials or model availability.

Calibration retains the original relaxed-arm, reliability, orientation, stability, 1000 ms and eight-frame gates. Its changed algorithm retains the longest contiguous stable suffix rather than skipping invalid observations. The seeded synthetic report covers 15/30/60 fps and three seeds; it is not a physical measurement. Longer baseline retention remains deferred; the existing 250 ms grace and reposition invalidation remain in effect.

## Acceptance evidence still pending

- The user reports recorded good-form and bad-form curls. Their independent labels, human review, recording-level count/coaching results and annotation provenance are not established.
- At least three reviewed recordings, persistence/delay measurements, and false spoken correction rates remain pending. The proposed one-false-correction-per-minute target remains a proposal until adopted before review.
- All production coaching rules remain disabled/unvalidated with no reviewed evidence. Production form scores remain unavailable; developer review scores and related narration are experimental.
- Physical-camera calibration stability/delay targets, broader counting evidence and device/frame-rate behavior remain unverified.
- Live Chrome/Safari/iOS audio, autoplay/unlock, mute/volume, tracking-loss/page-hide teardown, AI/device fallback and cue/narration transitions remain unverified by audible browser testing.
- No actual OpenAI model request, credential check, cost or latency measurement was performed. No workout persistence or Sprint 5 implementation is implied.

Knowledge write-back sent to the lead for `c-validation`: update synthetic/DOM/mocked check counts; replace historical "recordings do not exist" with user-reported recordings awaiting independent labeling/review; record the missing-feature coverage, canceled batch, audible qualification and stale UI-token regression lessons. Component/status files remain owned by the lead and were not edited by this reviewer.

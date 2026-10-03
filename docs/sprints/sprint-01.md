# Sprint 01 — Camera and pose detection

Status: complete for the user-accepted local Sprint 1 scope; quantitative benchmark and remote CI evidence remain carryover
Last updated: 2026-10-03

## Scope and acceptance criteria

- User adopts the master plan and Sprint 1 document supplied in Downloads, and requests completion of remaining camera/pose work.
- GB 101: safe Start/Stop/retry, actionable permission/device errors, cancellation while permission is pending, navigation cleanup, release every acquired stream.
- GB 102: one-person MediaPipe Pose Landmarker, correctly aligned Canvas skeleton at different sizes and mirror settings; reject unreliable landmarks and preserve anatomical labels.
- GB 103: model/camera/tracking states, positioning guidance, no-person/partial/lost recovery without stale observations.
- GB 104: bounded worker processing, distinct capture FPS / analyzed FPS / inference latency, teardown of model, loops, worker and streams.
- Keep CameraView at the bottom of the existing HomePage and preserve design and unrelated local edits.
- Browser memory only: no camera/pose uploads or persistence. Rep counting, biomechanics, coaching, accounts, workouts, datasets and training are excluded.
- Proposed document target: 15 analyzed FPS on an agreed reference device during a five-minute session; actual hardware evidence is required before claiming success.
- Sprint 0 evidence covers local frontend/API connectivity only. CI, broader foundation completion, camera view and reference-device acceptance are not assumed complete.

## Agent assignments and shared contracts

- Lead: repository inspection, pinned dependencies and reproducible local assets, integration, documentation and browser validation.
- Camera/UI specialist: CameraView.jsx and vision/CameraManager.js; lifecycle, controls, overlay surface, status and timing UI.
- Browser vision specialist: vision/PoseEngine.js, pose.worker.js, tracking.js and drawPose.js; bounded detection, worker resource ownership, quality and drawing helpers.
- Independent validation specialist: frontend/tests; race/error/tracking tests and independent implementation review.
- Engine interface: createPoseEngine callbacks; async start(), process(video, timestampMs), close(). Results include timestampMs, normalized landmarks, worldLandmarks, original sourceWidth/sourceHeight and inferenceMs. Only one frame may be pending. See [the camera guide](../vision-sprint-01.md) for coordinate and quality semantics.

## Progress and decisions

- Inspected the user's current CameraView. It correctly stops a redundant stream before attaching it, but does not yet cancel a pending permission request after Stop or navigation.
- Existing uncommitted changes: frontend/package-lock.json, HomePage.jsx, Playground.jsx, and new CameraView.jsx. Preserve unrelated work.
- Retain existing JSX UI for this scoped sprint; use documented observation contracts. TypeScript remains the project target; no broad migration in this camera change.
- Use downloaded pinned, same-origin model/runtime assets generated during setup; exclude binaries from Git. GCP remains planned for later sprints.
- Implemented camera stream ownership with generation-based cancellation, serialized pending requests, restart, inline error guidance, disconnect/mute handling and stopped-track rejection before attachment.
- Implemented worker-only MediaPipe VIDEO inference with 640px maximum bitmap width, one pending frame, stale-frame rejection, initialization/stall timeouts and resource disposal.
- Implemented natural-aspect video/Canvas overlay, shared mirroring, anatomical arm selection, active/partial/lost tracking and developer capture/analyzed FPS, inference and overlay timing.
- Pinned MediaPipe 0.10.32 plus matching runtime and Lite float16/1 model. Asset preparation runs before dev/build, validates the model SHA-256 and stores no model binaries in Git.
- Added 17 node tests, two isolated development diagnostic pages, setup/contract/review documentation, and a frontend GitHub Actions workflow for install/tests/lint/build. No remote CI run is claimed.
- Source downloads and review: user-adopted Master Project Plan and Sprint 1 DOCX read with textutil; MediaPipe API/runtime behavior checked against the [official web guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js).

## Validation and review evidence

- `npm test`: **17 passed, 0 failed** after final lifecycle changes. Covers duplicate starts, pending permission cancellation and serialized restart, denial/playback errors, track interruption, already-ended acquisition, pending playback from obsolete sessions, bounded frame work, late bitmap cleanup, stale results, model cancellation/error, quality loss/recovery and canvas coordinate scaling/mirroring.
- Final `npm run lint`, `npm run build` and `git diff --check`: passed. Build emits a classic pose worker and includes the prepared vendor assets.
- Early test command accidentally matched no `.mjs` tests; fixed the script to `.test.js` and reran real tests. A later disconnected-track guard exposed incomplete mock track states; corrected mocks to represent live/ended states and added a regression case. The final 17-test result supersedes those intermediate runs.
- Real model/runtime smoke in Codex in-app browser: `/tests/vision-smoke.html` loaded local model/WASM in the worker and processed generated blank video with zero landmarks. Stop ended the generated track; restart succeeded. Observed individual inference samples 16–19 ms, not a reference-device performance benchmark.
- Real CameraView integration in React StrictMode via `/tests/camera-smoke.html`: simulated Start/Stop/restart, active unmount/remount, Stop while permission pending followed by late success, pending unmount followed by late success, permission denial with guidance and successful retry, no-device/busy-device messages, and simulated track disconnection all passed visible-state checks. Final diagnostic: 9 requests, 6 acquired streams, **0 live tracks, 6 ended tracks**.
- The same diagnostic ran the actual worker on 1280×720 generated blank video: no-person guidance displayed; an observed sample showed 20 capture FPS / 20 analyzed FPS and 17 ms latest inference. This does not exercise the human landmark stage and does not satisfy the five-minute target.
- Browser DOM geometry at 1280px viewport: video and canvas both 768×432 at the same position. At 480px viewport: both 417×234.5625 at the same position. Shared mirror transform toggled from horizontal reflection to none. This verifies layout alignment, not skeleton alignment on a person.
- Original homepage camera placement verified below its existing footer. Starting real camera access reached the pending permission state; Stop returned the UI to off. No successful physical-camera capture or native permission decision was observed.
- Saved [synthetic lifecycle evidence](../validation/sprint-01-camera-lifecycle.png); image contains the test UI, not a camera recording.
- Camera, vision and independent validation specialists reviewed the implementation; no blocking findings in those reviews. Minor stale-metrics reset was applied. Lead completed final disconnected-track regression and browser integration verification after specialist execution became unavailable due to the session usage limit.
- `npm audit` reported **16 dependency advisories (3 low, 2 moderate, 11 high)** in other frontend packages; MediaPipe was not reported. No broad dependency upgrades were made in this sprint. Existing homepage React DOM-property warnings were observed and remain outside this change.
- Not independently run by the agent: successful physical webcam allow/deny/retry, physical unplug/reconnect, reviewed human pose/occlusion examples, actual route navigation with live physical webcam, five-minute reference-device performance, cross-browser certification, remote GitHub Actions. The subsequent user acceptance below is separate evidence, not an agent-observed test result.

## User acceptance — 2026-10-02

- After receiving the final checklist (start/stop/restart and navigation cleanup, permission denial/retry, tracking loss/recovery, overlay resizing/mirroring, and a responsive five-minute session), the user replied: **“i confirm its good”**.
- Record this as user-reported acceptance of the local Sprint 1 experience and readiness to proceed to Sprint 2. Combined with the automated checks and specialist review above, the scoped local sprint is accepted.
- The user did not supply browser/OS/hardware details or numerical FPS/latency measurements. Do not claim that the proposed 15 analyzed FPS reference-device target was measured or achieved. Preserve quantitative benchmarking, physical unplug evidence, cross-browser coverage, dependency advisories and remote CI verification as explicit carryover.
- Clarified UI behavior: the skeleton displays both arms; Left/Right selects the anatomical shoulder/elbow/wrist/hip used for tracking quality. It does not restrict whole-body detection or perform curl analysis.

## Handoff

- **Next action:** the user opens a new project chat with **Sprint 2** and its requirements. That chat must read project guidance, this handoff, the camera guide and current repository state before planning or changing code. Do not automatically start Sprint 2 or create a new chat.
- Proposed review view: one person, camera at torso height, selected arm facing the camera, shoulder through hip plus the whole arm visible. This is not a validated curl-analysis camera view; Sprint 2 calibration/biomechanics remain out of scope.
- Review status: GB 101–103 implemented, reviewed, tested as described above and user-accepted locally. GB 104 bounded processing implemented and smoke-tested; responsiveness user-accepted, numerical five-minute reference-device benchmark not recorded.
- No backend, GCP, authentication, workout storage, biomechanics, reps, coaching or training work was added. Existing HomePage/Playground edits were preserved. The user requested GitHub publication with commit message **Sprint 1 completed**. Publication target: `Ajay-Bet/GymBudAI`, `main`, from local branch `codex/initial-setup`. The unrelated unused CameraView import in Playground remains a local edit outside this sprint commit.
- Files: CameraView is the UI; vision/CameraManager owns capture; vision/PoseEngine and pose.worker own detection; tracking and drawPose own quality/display; scripts/prepare-vision-assets.mjs owns reproducible asset preparation; tests own repeatable checks and development diagnostics. package/lockfile, ignore/lint configuration and frontend README support these additions. `.github/workflows/frontend.yml` adds checks but awaits a remote run.
- Full source/contract/setup explanation and beginner-friendly camera-to-pose flow: [camera guide](../vision-sprint-01.md). No test videos, frames or landmark datasets were stored.
- Retrospective improvement: keep a deterministic browser camera harness alongside lifecycle unit tests. Owner: lead; verify it again before the next camera lifecycle change. Check date: next camera lifecycle change or Sprint 2 integration review.

## Open items against the source document — 2026-10-03

Setup-only pass from a Claude Code Sprint 1 chat. No app code was changed. Each item is checked against the converted requirements below and the evidence above.

- **Entry requirements not evidenced:** remote CI has never run (`.github/workflows/frontend.yml` exists, no run recorded); the curl camera view and test devices are proposals, not team-agreed.
- **Exit criterion not measured:** five-minute session on a reference device with capture FPS, analyzed FPS and inference latency. No device is named and no numbers are recorded.
- **Verification checklist gaps:** physical unplug/reconnect, physical permission allow/deny/retry observed by an agent, reviewed human pose and partial-occlusion examples.
- **Handoff gap:** the document asks for supported-device notes for Sprint 2. The [camera guide](../vision-sprint-01.md) lists browser capability requirements but no tested browser/OS/device.
- **Other carryover:** 16 `npm audit` advisories in other frontend packages, cross-browser coverage, existing homepage React DOM-property warnings.
- **Agents:** `s1-camera-ui`, `s1-vision` and `s1-validation` in `.claude/agents/` match the roles in "Agent assignments" above and are indexed in `.claude/AGENT-MAP.md`.
- **Record layout:** per `docs/WORKFLOW.md`, Sprint 1 keeps this single record, so there is no separate `sprint-1.md` or `sprint-1-STATUS.md`.

## Source requirements (converted from DOCX)

Converted with pandoc from `~/Downloads/GymBud_Master_and_Sprints_01-12/GymBud_Sprint_01_Camera_and_Pose_Detection.docx` on 2026-10-03. Headings demoted; text unchanged.

Deliver a live camera view with a correctly aligned skeleton, visible tracking status, and reliable recovery when the user or camera disappears.

Dates and owners are assigned at sprint planning. Proposed acceptance targets are reviewed before implementation and are not claims of measured performance.

### Entry requirements

Sprint 0 is complete. React and FastAPI run locally, CI works, and the team has agreed on the curl prototype camera view and initial test devices.

### Sprint scope

Support one person and one selected camera. Include camera permission states, a mirrored preview, landmark drawing, tracking quality, and a bounded processing loop. Exercise counting and form judgments start in later sprints.

### Sprint backlog

### GB 101 Camera lifecycle

As a user, I can start and stop my camera so I control when GymBud captures my image.

Acceptance criteria Allow, deny, missing-device, and device-in-use cases show actionable text. Stop and navigation release every media track; retry never creates duplicate streams.

### GB 102 Pose overlay

As a user, I can see detected joints and a skeleton so I know whether my body is being tracked.

Acceptance criteria Overlay and video share the same crop, aspect ratio, and mirror transform. Anatomical left and right remain correct, and unavailable landmarks are not drawn as reliable observations.

### GB 103 Tracking status

As a user, I receive positioning guidance when tracking is incomplete.

Acceptance criteria Required landmarks determine active, partial, and lost states. Leaving and returning to view clears stale observations and restores tracking without reloading the page.

### GB 104 Responsive processing

As a developer, I can measure pose processing without freezing the interface.

Acceptance criteria Capture FPS and inference latency separately. Run detection outside the UI thread where supported, bound pending work, and dispose of worker and model resources on teardown.

### Implementation and sprint review

### Technical plan

**Module boundaries** CameraManager owns device selection and stream cleanup. PoseEngine produces timestamped observations. PoseCanvas draws them. A developer panel shows timing and landmark visibility; user-facing status uses plain positioning instructions.

**Capture and rendering** Initialize MediaPipe once per active engine, use video mode, and process new video frames rather than repeatedly analyzing the same frame. Render at the display cadence while detection runs at a measured rate; discard obsolete queued input.

**Quality semantics** Choose required joints for the upcoming curl view. Configure visibility thresholds and consecutive valid observation time. Display a quality state rather than treating a visibility value as a calibrated probability of correct pose.

**Data and GCP boundary** Keep frames and pose results in temporary browser memory. This sprint creates no dataset uploads or workout writes. Host model assets through an approved asset route and record the pinned model and package versions.

### Verification checklist

- Exercise permission allow, denial, retry, no camera, and unplugging or stopping the device.

- Check overlay alignment at multiple window sizes and with mirroring enabled and disabled.

- Leave the frame, partly hide the selected arm, return, and confirm no stale skeleton remains.

- Start and stop repeatedly; verify only one stream and inference loop remain active.

- Run a five-minute session on the agreed reference device and record inference latency and capture rate.

### Exit criteria

Proposed target: at least 15 analyzed frames per second on the reference device with responsive controls, no growing queue, and clean recovery after tracking loss. Record actual results and adjust the target during planning if the device cannot sustain it.

### Sprint review demonstration

Allow the camera, show the skeleton, change the window size, leave and return, deny permission after restarting, then stop capture. Show timing evidence and confirm ordinary frames were not uploaded.

### Risks and scope decisions

Slow devices may require a lighter model or reduced input size. If worker support blocks delivery, document a measured fallback and keep the UI responsive. Multiple people and mobile browser certification remain outside this sprint.

### Handoff and review record

Provide the timestamped landmark contract, camera-view instructions, supported-device notes, and tracking-state behavior to Sprint 2.

Review record: completed tickets, reviewer, evidence, results, defects, and carryover. Retrospective: one improvement, owner, and check date. Apply the master Definition of Done.

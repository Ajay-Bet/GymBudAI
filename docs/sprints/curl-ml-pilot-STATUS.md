# Curl dataset/classifier/browser pilot — parts of Sprints 7–9

Status: authorized implementation and execution in progress; no full sprint acceptance claimed.
User-local date: 2026-10-03

## Scope and acceptance

The user explicitly authorizes local recorded-video extraction, human-annotation matching, preprocessing, grouped classifier training/evaluation, versioned portable export and experimental browser integration. Requirements: curl-ml-pilot-requirements.md. Sprint4 code and pending recording/live-audio evidence preserved. No commit approval has been given; no upload, paid resources, push or merge authorized.

Success means a runnable reproducible pipeline, actual local extraction/data audit/training execution where usable inputs exist, shared offline/browser features and prediction parity, clear evidence and independent review. Missing labels/boundaries/metadata may block credible fitting; deliver runnable implementation and exact missing inputs rather than a fabricated trained model. No production rule/model is enabled without acceptance evidence.

## Verified input state and decisions

- Initial backend/annotations.csv was a UTF-8 BOM CSV; video.assets is a directory in the repository immediately above backend, containing8MP4 recordings. Initial schema recording_id,rep_id,start_seconds,end_seconds,label,severity,notes.42rep rows plus1recording-level incomplete-ROM row. All initial time boundaries empty; participant,selectedarm,explicitview/review/consentmetadata absent. Filename clues do not establish verified metadata.
- User updated the source: it is now an Apple Numbers archive despite the .csv suffix. Recovered its sole annotation table locally to ignored ml/outputs/annotations-frame.csv with pinned numbers-parser4.18.5; original untouched.46attempt rows,44bounded,2N/A ends. Exact source/output checksums are in annotations-frame.provenance.json. User confirmed zero-based indices with end frame included. Exact decoded PTS conversion is now running; out-of-range boundaries remain excluded. Reader will support both with exact decoded PTS mapping rather than fps approximations.
- User defines swinging as composite shoulder raising/upper-arm movement and/or torso movement. Preserve this composite; do not translate positive swinging into specific torso/arm labels. Normal severity is not good form. Explicit per-issue scope is required before no_issue_observed supplies negative targets; unannotated or unassessed observations remain unknown.
- Model2 architecture: independent portable binary logistic heads at rep/attempt end, no live causal claim from fullrep features. Fixed seeds and train-only standardization; participant grouping if established, recording-group pilot only explicitly labeled experimental if participant metadata inadequate. Validation thresholds and reserved test split; unknown targets masked. No classifier fitted from missing boundaries/unreviewed guesses.
- Rep-end shared feature schema/order is agreed with extraction/browser/training owners before dependent edits. Offline measurement reuses actual browser JS biomechanics/tracking/calibration rather than independent approximations. MediaPipe assets/versions pinned and local processing only.

## Specialists and one-writer assignments

- Lead: requirements/status/ownership records, input clarification, integration, docs/ignore policy and final verification. Lead takes c-docs/c-infra for pilot continuity. No duplicate extraction.
- ml_data_training: s7-data/s8-training from c-ml; annotations.py,dataset.py,train.py,evaluate.py,training requirements,ML README and assigned Python tests.
- ml_extraction: s7-pose from c-ml/c-biomechanics/c-vision; extract.py,measure.mjs,extraction requirements/tests,frontend/ml/repFeatures.js and its test. Owns actual extraction/replay execution and reusable outputs/overlays.
- ml_browser: s9-browser from c-camera-ui/c-exercises/c-feedback; model.js/modelSession.js,ExperimentalModelPanel,CameraView integration,assigned model/UI tests. Also designated writer for model-only cue/scheduler extensions after lead reassignment; preserve default rule priority and production gates.
- Independent s9-validation follows settled changes. All component/status writeback is lead-owned; agents send findings/contracts/knowledge through messaging. No sidebar chats created.

## Evidence, blockers and next steps

Actual extraction, coverage, training status and tests will be appended as executed. Current credible training blocker: missing annotation frame/time boundaries; composite label and negative scope need explicit mapping. Participant/view/side/review metadata must be established or expressly marked unknown/experimental. Continue independent pipeline and browser implementation while clarifications are pending.

## Actual local execution — updated annotations

- MediaPipe Lite extraction processed all8recordings:7921decoded source frames with original PTS and upright display transform. Pose presence on every frame is not tracking/form accuracy evidence. Specialist inspected overlays for rotation/skeleton alignment only; independent form review remains pending.
- Shared browser JS tracking/calibration/biomechanics replay ran both anatomical arms separately as exploratory hypotheses, never confirmed metadata. Only normal-swinging-sideangle/right yielded active calibrated motion (689ready frames,4automatic completed candidates). idealform-45angle/left calibrated the idle arm (1299ready frames,0candidates); all other arm/clip combinations had0ready frames. Production calibration/view gates were preserved.
- Updated frame annotations resolve the prior empty-boundary issue for44rows, but two end frames remainN/A. Frame convention is confirmed; selected arm/view, participant grouping, independent review and per-label negative assessment scope remain unconfirmed. Candidate events are not matched by ordinal number.
- No credible classifier can be fitted from a single qualified positive recording with no qualified negative class. Actual pipeline/audit execution continues and will produce an explicit blocked report rather than a fake artifact. Additional side-view recordings need stable relaxed calibration before movement, confirmed metadata, bounded independently reviewed attempts and both classes across independent groups.

## Resumed execution — 2026-10-04

Cursor is the lead for this resumed request. The feature contract crosses annotations, measurements, training, and browser loading, so this chat kept one writer on those files instead of launching parallel specialists onto the same paths. `s7`–`s9` specialist records stay active. No commit, push, merge, upload, or paid resource was used.

### Annotations

- Original Numbers document remains `backend/annotations.csv` (ZIP/Numbers bytes, unchanged). Recovered CSV is `ml/outputs/annotations-frame.csv`, with provenance in `ml/outputs/annotations-frame.provenance.json`.
- Confirmed convention, recorded in that provenance: zero-based indexes, inclusive end, mapped through decoded presentation timestamps.
- Audit rerun after checksum-verified extraction (`ml/outputs/frame-times.json`, 8 recordings, 7,921 frames): 46 rows; 43 with usable bounds; labels 26 `no_issue_observed`, 16 `swinging`, 4 `incomplete_rom`. No duplicate rep IDs and no overlapping bounded windows.
- Excluded from bounded tasks, without truncation: `excessive-swinging-sideangle` `rep_04` and `normal-swinging-frontangle` `rep_04` (`N/A` end); `idealform-frontangle` `rep_09` end index 1432 (decoded indexes end at 1431). An earlier audit marked `rep_08` out of range because `idealform-frontangle` frame times were still the stale 1,300-frame copy. The verified cache has 1,432 frames, so `rep_08` is in range and is excluded later by the side-view gate.
- Review sheet: `docs/sprints/curl-ml-annotation-review.md`.

### Cache and provenance

- All eight extraction manifests match `poses.jsonl` and `frames.jsonl` checksums, the pinned pose-model SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`, and the source-video checksums. Dataset export copies those checksums into `extractionProvenance`. A mismatched or partial cache raises instead of being reused.
- The stale embedded frame-time list for `idealform-frontangle` was replaced by the verified cache and named in `staleEmbeddedFrameTimesReplaced`.

### Why seven recordings did not calibrate the active arm

The replay kept the production gates and tried both arms as an unconfirmed hypothesis. This is not an implementation defect in the stability checks.

| Recording | What the gates did | What is still required |
| --- | --- | --- |
| `idealform-sideangle` | Right arm is side-on (median shoulder-width ratio about 0.12) but never holds a relaxed still arm for 1 s (`moving`, `arm-not-relaxed`). Left elbow is not visible. | One second with the curling arm down and still, then the curls, true side view. |
| `excessive-swinging-sideangle` | Same pattern on the right arm. Left elbow is not visible. | Same relaxed hold before the swinging attempts. |
| `idealform-45angle` | Left arm calibrates because it stays relaxed, and it does not curl. Right arm curls and never holds still. The orientation gate passes (median ratio about 0.37, near the 0.45 limit). | A relaxed hold of the curling arm, and a true side view if side-view features are required. The filename is not treated as a view label. |
| `normal-swinging-45angle` | Mostly `not-side-on` (median ratio about 0.48). Annotated windows stay under 0.8 geometry coverage. | Rerecord from the side. |
| `idealform-frontangle` | `not-side-on` (median ratio about 0.63). | Rerecord from the side. Also replace end index 1432. |
| `normal-swinging-frontangle` | `not-side-on`. | Rerecord from the side. Also supply the missing end frame. |
| `half-reps-frontangle` | `not-side-on`. This clip holds all four `incomplete_rom` rows. | Rerecord the half reps from the side, with the same human bounds. |

`normal-swinging-sideangle` right is the only active arm that reaches calibration (689 ready frames, 4 analyzer candidates). Those candidates were not used as training labels.

### Features and training

- `rep-end-v2` aggregates side-on tracked smoothed angles inside each human window. Torso and upper-arm features are ranges during the attempt, not deviations from a calibration baseline. Coverage below 0.8 is excluded. The live calibration gates in `engine.js` are unchanged.
- Browser equivalence: `aggregateWindowFeatures` is the function the experimental session calls when a rep completes. Completing a rep in the live analyzer still requires the calibration hold and tracking gates. The vector itself does not use future frames beyond the rep end and does not use the baseline.
- Derived arm, unconfirmed: right for the four recordings below, from mean elbow ROM at least 40° and at least 20° above the other arm when both arms had full coverage. Participant IDs were not invented. Review status is `supplied-human-unreviewed`. `no_issue_observed` is a negative only for `swinging` and `incomplete-rom`, because those are the issue labels present in the table.
- Eligible rows: 24. Excluded: 22. Eligible recordings are `idealform-sideangle` (8 negative), `idealform-45angle` (9 negative), `normal-swinging-sideangle` (4 positive), `excessive-swinging-sideangle` (3 positive).
- Three-way recording split is blocked (`ml/outputs/model-grouped/training-report.json`, no model file). Validation contains only `normal-swinging-sideangle`, so `swinging` has no validation negative. `incomplete-rom` has negatives and no positives.
- Fixed-threshold prototype `curl-pilot-1` was written to `ml/outputs/model/curl-pilot-1.json` (SHA-256 `a97d037f0731c94500126b2f9949b8915d3396061e28a70ec039c108dcc5598c`). Threshold is the predeclared 0.5. Train: `idealform-45angle` and `excessive-swinging-sideangle`. Test: `idealform-sideangle` and `normal-swinging-sideangle`. Only the `swinging` head is exported.
- Held-out `swinging` on 12 reps: precision 0.143, recall 0.25, F1 0.182, 1 true positive, 6 false positives, 3 false negatives, 2 true negatives. That is an experimental artifact with a poor held-out result, not a validated detector. Python and browser scores matched on all 24 eligible rows. `publication-plan.json` is a dry run; nothing was uploaded.
- Production form rules remain `enabled: false`. Form score unavailable stays in place. Experimental mode can load the JSON from the existing model-file control; predictions are labelled experimental and do not change the deterministic score.

### Checks on this resume

- `python3 -m unittest` for annotations, dataset, train, and frame times: pass, except `test_extract` orientation needs NumPy. `ml/.venv-extraction/bin/python -m unittest ml.tests.test_extract ml.tests.test_annotations ml.tests.test_frame_times`: pass.
- Frontend `npm test`: 265 logic tests and 15 UI tests passed. `npm run lint` was clean. `npm run build` succeeded (118 modules, vision asset SHA-256 verified).
- `backend/.venv/bin/python -m pytest -q` from `backend/`: 97 passed, one existing Starlette/httpx warning.
- These are automated checks. They are not reviewed recording acceptance, a live demo, or live-audio evidence.

### Still required before production or Sprint 4 acceptance

- Confirmed participant IDs, or enough separately identified people for a participant split.
- A second review of the bounds and of what `no_issue_observed` assessed.
- Confirmed anatomical arm and camera view.
- End frames for the two `N/A` rows, and a corrected end index for `idealform-frontangle` `rep_09`.
- Side-view recordings of incomplete range. The current four labels are front-view only.
- A relaxed one-second hold before movement on the side-view clips that never calibrated, if live rules or live model predictions should run there.
- At least three recording groups per class in train, validation, and test before a tuned threshold is meaningful. Four groups cannot do that without dropping a partition.
- The original Sprint 4 acceptance gaps: reviewed cue evidence, a chosen false-cue target, a live camera demo, and real-browser audio.
- This work is part of Sprints 7–9. Those sprints are not complete.

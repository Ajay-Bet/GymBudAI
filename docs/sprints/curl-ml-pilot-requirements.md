# Authorized curl ML pilot scope — parts of Sprints 7–9

User adopted this pasted request on 2026-10-03. This is execution authorization, not catch-up intake. It does not authorize commit, push, merge, paid resources or recording uploads. Full sprints and Sprint4 acceptance remain open.

Continue GymBud in `/Users/prabh/GymBud_/GymBudAI`.

Sprint 4 implementation is reportedly finished and independently reviewed, but recording validation and live-browser checks remain pending. Preserve all existing work and follow `AGENTS.md`, the repository workflow, and its commit/merge approval requirements. My previous commit approval request has not been answered; this prompt authorizes further implementation, not an automatic commit, push, or merge.

I now explicitly authorize the curl dataset, classifier training, and browser integration work needed to produce a versioned model we can test. This advances the relevant parts of Sprints 7–9; document that scope without marking entire sprints complete.

DATA LOCATIONS

- Human annotations: `backend/annotations.csv`.
- Videos: `video.assets` in the folder immediately above `backend`.

Verify these paths and whether `video.assets` is a directory or another kind of asset reference. Inspect the actual CSV schema and video filenames before implementing. Do not assume the annotations contain all required metadata.

GOAL

Build this complete pipeline:

Recorded videos → timestamped frames → Model 1 pose landmarks → biomechanics measurements → match human annotations → preprocessing → train and evaluate Model 2 → export a versioned model → load it in the frontend → test curl issue predictions and feedback.

Proceed through actual implementation and execution, not just a plan or documentation update.

1. Audit and validate the supplied data

Inspect timestamps, rep identifiers, issue labels, camera views, counts, and missing values. Produce a clear coverage report.

Our annotations may contain labels such as `no_issue_observed`, `swinging`, and `incomplete_rom`, with swinging severity described as `normal` or `excessive`.

Do not silently interpret ambiguous “swinging” as torso swing or forward arm drift. Establish explicit label definitions and mappings supported by the videos. Preserve original labels and notes. “Normal swinging” does not mean correct form.

Keep rep completion separate from form issues. Do not reject an otherwise completed rep solely because it swings. Do not treat unannotated intervals as confirmed good form or assign a rep-level label indiscriminately to every frame.

Identify participant IDs and independent review status if present. Do not invent them. Ask for missing semantic decisions or evidence only when necessary; continue building the independent pipeline while awaiting them. Do not upload recordings externally without explicit authorization.

2. Extract poses and measurements

Use the appropriate MediaPipe pose model as Model 1, with pinned package/model versions and current official documentation.

Decode videos locally into frames and preserve original timestamps. Initially process the available frames where practical; make sampling configurable. Record missing/low-quality tracking instead of fabricating positions.

Reuse the existing biomechanics definitions where feasible: angles, normalized arm/torso displacement, velocity, calibration, and validity flags. Ensure offline and browser features use matching definitions, units, and preprocessing.

Save reusable extraction outputs so retraining does not repeatedly process videos. Validate overlays on selected frames to inspect pose alignment and extraction quality.

3. Match annotations and prepare training examples

Build a CSV reader that maps recording IDs or filenames, rep IDs, and time intervals to extracted observations. Document time-boundary conventions.

Begin with a simple rep-level classifier for supported issues. If developing live within-rep predictions, create a separate dataset of trailing time windows with genuinely time-aligned labels. Do not train live predictions using future frames or full-rep measurements unavailable at prediction time.

Keep incomplete-ROM assessment at rep completion. Preserve unknown/not-assessable targets and exclude or mask them appropriately.

4. Train and evaluate Model 2

Implement reproducible Python training scripts with fixed seeds, a versioned feature schema, and simple supervised baselines supporting coexisting issues.

Split by participant before fitting preprocessing or tuning. Keep all clips, reps, and overlapping windows from a participant in the same split. Fit transformations only on training data.

If participant metadata or participant count is inadequate, state that limitation explicitly. You may produce a clearly marked experimental pilot model using a documented recording-group split, but do not claim participant-independent validation. Never randomly mix adjacent frames from the same video across training and testing.

Run training on the supplied usable data. Report per-issue precision, recall, F1, sample counts, class coverage, and comparison with the existing rules. For live predictors, also report false cues per minute and detection delay on annotated recordings.

Choose thresholds using validation data; reserve test data for evaluation. Report failure cases and unsupported views. Do not present model scores as calibrated correctness probabilities without testing calibration.

5. Export a versioned, browser-compatible model

Choose a feasible browser execution route before committing to the classifier architecture: supported ONNX export/runtime or a simple portable model implemented in TypeScript.

Verify prediction parity between Python and browser inference on shared fixtures.

Export the model with:
- Model and dataset versions.
- Source revision and manifest.
- Feature order, units, normalization, and missing-data handling.
- Supported labels and camera views.
- Thresholds and evaluation status.
- Checksums, dependencies, and known limitations.

Produce the artifacts locally first. Prepare the Cloud Storage publication/loading path, but do not provision paid resources, upload recordings, or claim deployment occurred without the necessary authorization and configuration.

6. Integrate for browser testing

Add an explicit experimental model mode that loads the versioned artifact and runs predictions locally in the browser.

Route eligible predictions through the existing tracking gates, persistence, priorities, and cooldowns. Keep live counting operational without the model or network. Reuse the backend only for optional wording/audio and workout persistence.

Show the active model version and experimental status. Provide deterministic fallback behavior if loading or inference fails.

Do not simply remove “Form score unavailable” or flip validation flags. Production checks may be enabled only for specific rules/models/views whose recorded acceptance evidence supports them. Experimental mode may show clearly labelled predictions and an experimental detector-based score, with insufficient-data handling.

7. Verification and delivery

Use the required specialist workflow without duplicating extraction or conflicting file edits. Test annotation matching, data leakage prevention, feature consistency, export parity, browser inference, feedback gating, and scoring eligibility.

Run the relevant existing checks and independently review the implementation.

Finish with:
- The actual trained model artifact and its version.
- Dataset coverage and evaluation results.
- Whether it is experimental or eligible for production, with reasons.
- Exact extraction, training, evaluation, and frontend test commands.
- A short live curl demo checklist.
- Remaining evidence needed to enable production form assessment.

Start with a brief verified status and plan, then implement and execute the pipeline. If data blocks credible training, complete the runnable pipeline and explain the exact missing inputs rather than manufacturing a successful model.
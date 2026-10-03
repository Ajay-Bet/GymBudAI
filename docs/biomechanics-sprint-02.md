# Sprint 2 biomechanics and calibration guide

## Scope and review

The homepage camera section converts timestamped pose observations into local measurements and calibration readiness. Start the camera, select your anatomical arm, choose the supported side-on view, and follow calibration guidance. Preview mirroring changes only the display. Nothing is recorded, uploaded or saved. FastAPI is not required.

This is a measurement foundation for Sprint 3. Readiness means that the configured tracking, orientation and calibration checks passed; it does not mean good exercise form, clinical correctness or validated camera perspective. No repetitions or form corrections are produced.

## Coordinate space

The engine uses original unmirrored 2D image coordinates. Normalized x is multiplied by source width / source height; y is unchanged. Both axes therefore use image-height units, with x rightward and y downward. These are projected image measurements, not meters or centimeters. Source dimensions come from the original camera frame, not CSS size or the resized inference bitmap. Anatomical side indices are unchanged by the preview transform.

Elbow interior angle is the angle between shoulder-minus-elbow and wrist-minus-elbow: a straight arm is 180 degrees. Elbow flexion is 180 minus the interior angle. Coincident or non-finite vectors yield unavailable values. Perspective and occlusion can make even mathematically correct projected angles misleading. World landmarks, grip, wrist rotation, load and muscle activation are not assessed.

## Physical acceptance still required

Synthetic coordinate tests validate arithmetic and state transitions. They cannot establish landmark accuracy, orientation detection quality or calibration usability on a person. The user-supplied sprint document proposes stationary elbow variation below 5 degrees and added smoothing delay below 150 ms on a chosen reviewed recording. A reference setup and approved recording have not been provided; these targets remain unverified.

For the physical review, record browser/OS/device, lighting, camera height and distance, side and source dimensions. Keep a stationary arm visible, calibrate, flex and extend, then hide a required joint and leave/re-enter frame. Compare raw and smoothed angle variation and movement response. Repeat on both sides, with preview mirroring toggled and different framing. Missing evidence must display unavailable and require a new baseline after tracking loss. Do not treat a single participant as threshold validation.

Recording is a separate opt-in action; this sprint adds no recording mechanism. A reviewer can observe locally without storing video. If an approved recording is later used, document consent, provenance, measured variation and delay definition before claiming the proposed targets passed.

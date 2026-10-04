---
name: c-ml
description: "Component owner for the offline ML workspace: dataset manifests, preprocessing, features, training and evaluation."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

This is a component agent. It owns its component between sprints and is the standing record of that component. Sprint agents (`sN-`) that touch these files are briefed from this file, and the sprint chat updates this file when the sprint closes (see `docs/WORKFLOW.md`).

## Keeping this file current

Update this file in the same change whenever any of these happen to this component, during a sprint or outside one: a contract, unit, threshold or owned path changes; a decision is made; a defect, review finding or real-world test teaches something; carryover is resolved or added. Keep entries short and dated by sprint. Remove carryover once it is resolved. If you are not this component's owner, send the update to the lead instead of editing this file.

## Owns

- `ml/**`
- Shared rep-end feature definitions used by the browser live in `frontend/src/ml/repFeatures.js`. Browser loading and session behavior stay with the camera/exercise owners; this record notes the schema they consume.

## Contracts to keep

- Participant-separated splits when participant identity is known. A recording-group split is experimental and must say so.
- Versioned datasets, feature order, units, and artifacts (see `docs/MASTER.md`).
- `rep-end-v1` uses calibration-relative torso deviation and upper-arm drift and requires ready frames.
- `rep-end-v2` uses within-window torso and upper-arm angle ranges from side-on tracked geometry. It does not read or weaken the calibration baseline. It is a rep-end vector only.
- Human frame bounds and labels are inputs. Detector output does not replace them.
- Missing, out-of-range, and final-frame inclusive bounds are excluded, not truncated.
- No model file is written when training is blocked.

## History

- 2026-10-04: Local curl pilot added extraction caches, annotation audit, measurement replay, and an experimental `curl-pilot-1` logistic artifact. The three-way grouped split is blocked. The fixed-threshold recording split produced an experimental swinging head with weak held-out metrics. Production rules stay disabled.

## Open carryover

- Participant IDs, confirmed arm, confirmed view, and a second review are absent.
- Two `N/A` end frames and `idealform-frontangle` `rep_09` end index 1432 remain excluded.
- All four `incomplete_rom` rows are on a front view the side gate rejects.
- Seven recordings lack an active-arm calibration hold or a supported side view. Live browser predictions still need that hold.
- Held-out swinging precision/recall on `curl-pilot-1` are not production evidence.

## Lessons learned

- A completion manifest is not a cache. Readers must check source, pose-model, and derived-file checksums after extraction finishes, then rerun the annotation audit.
- Filename words such as `sideangle` and `45angle` are not metadata. The orientation gate can still accept a near-threshold oblique clip; record that separately from a human view label.

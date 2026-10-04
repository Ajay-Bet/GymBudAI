# Curl annotation review

Supplied labels and frame bounds are inputs. This sheet does not replace them with detector output.
Frame indices are zero-based and the end frame is included. `swinging` stays a composite of shoulder/upper-arm movement and/or torso movement.
Severity text such as "normal" or "excessive" is preserved. Normal swinging is not good form.

## Counts

- Annotation rows: 46
- Rows with usable decoded bounds: 43
- Rows that declare integer frame bounds: 44
- Label counts: {'no_issue_observed': 26, 'swinging': 16, 'incomplete_rom': 4}
- Boundary exclusions: {'frame_index_out_of_range': 1, 'missing_end_frame': 2}

## Rows held out of bounded tasks

- line 27: idealform-frontangle rep_09 frames 1321–1432 label no_issue_observed: frame_index_out_of_range
- line 31: excessive-swinging-sideangle rep_04 frames 538–N/A label swinging: missing_end_frame
- line 43: normal-swinging-frontangle rep_04 frames 635–N/A label swinging: missing_end_frame

## Unresolved, not invented

- Participant identities are absent. Recordings are not treated as separate people.
- No second-reviewer status is recorded. The table is a supplied human annotation, not an independent review.
- Anatomical arm and camera view are not columns in the table. Filename words are not metadata.
- `no_issue_observed` does not name which issues were assessed. An experimental training run may treat it as a negative only for labels that actually appear in this table (`swinging`, `incomplete_rom`). That assumption is not a review protocol.
- The two `N/A` end frames stay out until a reviewer supplies the inclusive end index.
- An end index past the decoded sequence stays out. It is not shortened to the last frame.
- An inclusive end on the final decoded frame stays out until the following presentation timestamp is known.

## Label meaning

- `swinging`: composite shoulder raising/upper-arm movement and/or torso movement. It does not say which part moved.
- `incomplete_rom`: annotated range issue. A completed curl can still carry another form label.
- `no_issue_observed`: the annotator did not record one of the issue labels on that attempt. It is not a clinical clearance.


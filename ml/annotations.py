"""Human annotation intake; timestamp intervals are [start,end), frames use explicit basis."""
import argparse
import csv
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

LABELS = ('torso-swing', 'upper-arm-drift', 'incomplete-rom', 'swinging')


def read_annotations(path, frame_times=None, frame_basis=None, end_inclusive=None):
    if Path(path).read_bytes().startswith(b'PK'):
        raise ValueError('invalid-source-format: ZIP/Apple Numbers document requires explicit local conversion to CSV')
    with Path(path).open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        fields = set(reader.fieldnames or [])
        required = {'recording_id', 'rep_id', 'label'}
        if not required.issubset(fields):
            raise ValueError('Missing required columns: ' + ', '.join(sorted(required - fields)))
        seconds = {'start_seconds', 'end_seconds'}.issubset(fields)
        frames = {'start_frame', 'end_frame'}.issubset(fields)
        if not seconds and not frames:
            raise ValueError('Explicit timestamp or frame boundary columns required')
        rows = []
        for line, original in enumerate(reader, 2):
            if None in original:
                raise ValueError(f'Unexpected columns on CSV line {line}')
            errors, start, end = [], None, None
            if frames and (str(original.get('start_frame') or '').strip() or str(original.get('end_frame') or '').strip()):
                errors.extend(_frame_errors(original, frame_times, frame_basis, end_inclusive))
                if not errors:
                    times = frame_times[original['recording_id']]
                    first = int(str(original['start_frame']).strip()) - frame_basis
                    stop = int(str(original['end_frame']).strip()) - frame_basis + int(end_inclusive)
                    start, end = times[first], times[stop]
            else:
                try:
                    start, end = float(original.get('start_seconds', '')) * 1000, float(original.get('end_seconds', '')) * 1000
                except (ValueError, TypeError):
                    errors.append('missing_or_invalid_interval')
            if start is not None and end is not None and (not all(map(math.isfinite, (start, end))) or start < 0 or end <= start):
                errors.append('missing_or_invalid_interval')
                start = end = None
            if not original['recording_id']:
                errors.append('missing_recording_id')
            if not original['rep_id']:
                errors.append('clip_level_annotation_requires_rep_boundaries')
            rows.append({'line': line, 'original': original, 'startMs': start, 'endMs': end, 'errors': errors})
        return rows


def _token(value):
    return str(value or '').strip()


def _missing_frame_token(value):
    return _token(value).lower() in {'n/a', 'na'}


def _frame_errors(original, frame_times, frame_basis, end_inclusive):
    """Flag incomplete or illegal bounds. Never clamp an index into the decoded sequence."""
    start_text, end_text = _token(original.get('start_frame')), _token(original.get('end_frame'))
    if _missing_frame_token(end_text) or not end_text:
        return ['missing_end_frame']
    if _missing_frame_token(start_text) or not start_text:
        return ['missing_start_frame']
    if frame_basis not in (0, 1) or not isinstance(end_inclusive, bool):
        return ['invalid_frame_interval: Frame index basis and end convention required']
    times = (frame_times or {}).get(original.get('recording_id'))
    if times is None:
        return ['invalid_frame_interval: Decoded frame timestamps required']
    try:
        start_index = int(start_text) - frame_basis
        end_index = int(end_text) - frame_basis
    except ValueError as exc:
        return ['invalid_frame_interval: ' + str(exc)]
    count = len(times)
    if start_index < 0 or start_index >= count or end_index < 0 or end_index >= count or end_index < start_index:
        return ['frame_index_out_of_range']
    if end_inclusive and end_index + 1 >= count:
        return ['inclusive_end_needs_following_timestamp']
    if not end_inclusive and end_index == start_index:
        return ['frame_index_out_of_range']
    return []


def targets_for(original, assessed_labels=()):
    """Unknown issues remain masked. Swinging is a composite; severity never implies good."""
    result = {label: None for label in LABELS}
    tokens = [token.strip() for token in original['label'].split('|')]
    for token in tokens:
        if token == 'no_issue_observed':
            for label in assessed_labels:
                if label in result:
                    result[label] = 0
        else:
            mapped = {'incomplete_rom': 'incomplete-rom'}.get(token, token)
            if mapped in result:
                result[mapped] = 1
    if 'no_issue_observed' in tokens and any(value == 1 for value in result.values()):
        raise ValueError('Contradictory positive and negative label')
    return result


def _has_frame_bounds(original):
    try:
        start, end = float(original.get('start_frame', '')), float(original.get('end_frame', ''))
        return math.isfinite(start) and math.isfinite(end) and start.is_integer() and end.is_integer() and 0 <= start < end
    except (ValueError, TypeError):
        return False


def audit(path, videos, metadata=None, **frame_args):
    rows = read_annotations(path, **frame_args)
    files = sorted(Path(videos).glob('*.mp4'))
    indexed = {file.stem: file for file in files}
    metadata = metadata or {}
    records = []
    for recording_id in sorted({row['original']['recording_id'] for row in rows}):
        selected = [row for row in rows if row['original']['recording_id'] == recording_id]
        info = metadata.get(recording_id, {})
        records.append({'recordingId': recording_id, 'filename': indexed[recording_id].name if recording_id in indexed else None,
                        'annotationRows': len(selected), 'boundedRows': sum(not row['errors'] for row in selected),
                        'participantId': info.get('participantId'), 'view': info.get('view'), 'arm': info.get('arm'),
                        'reviewStatus': info.get('reviewStatus', 'unknown'), 'assessedLabels': info.get('assessedLabels', []),
                        'labels': dict(Counter(row['original']['label'] for row in selected))})
    return {'schemaVersion': 'annotation-audit-v1', 'annotationSha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
            'annotationRows': len(rows), 'repRows': sum(bool(row['original']['rep_id']) for row in rows),
            'boundedRepRows': sum(not row['errors'] for row in rows),
            'declaredFrameBoundsRows': sum(_has_frame_bounds(row['original']) for row in rows), 'recordings': records,
            'unannotatedVideos': [file.name for file in files if file.stem not in {record['recordingId'] for record in records}],
            'labelCounts': dict(Counter(row['original']['label'] for row in rows)),
            'missingMetadata': [record['recordingId'] for record in records if not all(record.get(key) for key in ('participantId', 'view', 'arm')) or record['reviewStatus'] != 'independently-reviewed'],
            'rows': rows, 'overlaps': _overlaps(rows), 'duplicateRepIds': _duplicate_rep_ids(rows),
            'boundaryExclusions': dict(Counter(error for row in rows for error in row['errors'] if error in {
                'missing_end_frame', 'missing_start_frame', 'frame_index_out_of_range', 'inclusive_end_needs_following_timestamp'})),
            'limitations': ['No metadata inferred from filenames.', 'Rep completion independent of form labels.', 'Unannotated intervals unknown.', 'Swinging composite; no decomposition into torso/arm labels.',
                            'Rows with missing, out-of-range, or final-frame inclusive bounds stay excluded. Indices are not truncated.']}


def _duplicate_rep_ids(rows):
    seen, duplicates = {}, []
    for row in rows:
        original = row['original']
        key = (original.get('recording_id'), original.get('rep_id'))
        if key in seen:
            duplicates.append({'recordingId': key[0], 'repId': key[1], 'lines': [seen[key], row['line']]})
        else:
            seen[key] = row['line']
    return duplicates


def _overlaps(rows):
    findings = []
    grouped = {}
    for row in rows:
        if row['errors'] or row['startMs'] is None:
            continue
        grouped.setdefault(row['original']['recording_id'], []).append(row)
    for recording_id, selected in grouped.items():
        ordered = sorted(selected, key=lambda row: (row['startMs'], row['endMs'], row['line']))
        for index, row in enumerate(ordered):
            for other in ordered[index + 1:]:
                if other['startMs'] >= row['endMs']:
                    break
                findings.append({'recordingId': recording_id, 'repIds': [row['original']['rep_id'], other['original']['rep_id']],
                                 'lines': [row['line'], other['line']]})
    return findings


def render_review(audit):
    """Human review sheet. It records unresolved facts; it does not invent them."""
    lines = ['# Curl annotation review', '',
             'Supplied labels and frame bounds are inputs. This sheet does not replace them with detector output.',
             'Frame indices are zero-based and the end frame is included. `swinging` stays a composite of shoulder/upper-arm movement and/or torso movement.',
             'Severity text such as "normal" or "excessive" is preserved. Normal swinging is not good form.',
             '', '## Counts', '',
             f"- Annotation rows: {audit['annotationRows']}",
             f"- Rows with usable decoded bounds: {audit['boundedRepRows']}",
             f"- Rows that declare integer frame bounds: {audit['declaredFrameBoundsRows']}",
             f"- Label counts: {audit['labelCounts']}",
             f"- Boundary exclusions: {audit.get('boundaryExclusions', {})}",
             '']
    if audit.get('duplicateRepIds'):
        lines += ['## Duplicate rep IDs', '']
        for item in audit['duplicateRepIds']:
            lines.append(f"- {item['recordingId']} {item['repId']} on lines {item['lines']}")
        lines.append('')
    if audit.get('overlaps'):
        lines += ['## Overlapping bounded reps', '']
        for item in audit['overlaps']:
            lines.append(f"- {item['recordingId']} {item['repIds']} lines {item['lines']}")
        lines.append('')
    lines += ['## Rows held out of bounded tasks', '']
    held = [row for row in audit['rows'] if row['errors']]
    if not held:
        lines.append('- None.')
    for row in held:
        original = row['original']
        lines.append(f"- line {row['line']}: {original.get('recording_id')} {original.get('rep_id')} "
                     f"frames {original.get('start_frame')}–{original.get('end_frame')} label {original.get('label')}: {', '.join(row['errors'])}")
    lines += ['', '## Unresolved, not invented', '',
              '- Participant identities are absent. Recordings are not treated as separate people.',
              '- No second-reviewer status is recorded. The table is a supplied human annotation, not an independent review.',
              '- Anatomical arm and camera view are not columns in the table. Filename words are not metadata.',
              '- `no_issue_observed` does not name which issues were assessed. An experimental training run may treat it as a negative only for labels that actually appear in this table (`swinging`, `incomplete_rom`). That assumption is not a review protocol.',
              '- The two `N/A` end frames stay out until a reviewer supplies the inclusive end index.',
              '- An end index past the decoded sequence stays out. It is not shortened to the last frame.',
              '- An inclusive end on the final decoded frame stays out until the following presentation timestamp is known.',
              '', '## Label meaning', '',
              '- `swinging`: composite shoulder raising/upper-arm movement and/or torso movement. It does not say which part moved.',
              '- `incomplete_rom`: annotated range issue. A completed curl can still carry another form label.',
              '- `no_issue_observed`: the annotator did not record one of the issue labels on that attempt. It is not a clinical clearance.',
              '']
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--annotations', required=True)
    parser.add_argument('--videos', required=True)
    parser.add_argument('--metadata')
    parser.add_argument('--output', required=True)
    parser.add_argument('--review', help='Write a readable review sheet for unresolved rows')
    parser.add_argument('--frame-times', help='JSON recordingId -> original decoded PTS milliseconds array')
    parser.add_argument('--frame-basis', type=int, choices=(0, 1))
    parser.add_argument('--frame-end', choices=('inclusive', 'exclusive'))
    args = parser.parse_args()
    result = audit(args.annotations, args.videos, json.loads(Path(args.metadata).read_text()) if args.metadata else None,
                   frame_times=json.loads(Path(args.frame_times).read_text()) if args.frame_times else None,
                   frame_basis=args.frame_basis, end_inclusive=(args.frame_end == 'inclusive') if args.frame_end else None)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    if args.review:
        Path(args.review).parent.mkdir(parents=True, exist_ok=True)
        Path(args.review).write_text(render_review(result))
    summary = {key: result[key] for key in ('annotationRows', 'repRows', 'boundedRepRows', 'declaredFrameBoundsRows', 'labelCounts', 'missingMetadata', 'boundaryExclusions')}
    summary['overlaps'] = len(result['overlaps'])
    summary['duplicateRepIds'] = len(result['duplicateRepIds'])
    print(json.dumps(summary))

if __name__ == '__main__':
    main()

"""Rep-level annotation matching. Never creates frame targets from rep labels."""
import argparse
import json
import math
import os
import shutil
import subprocess
from pathlib import Path
try:
    from .annotations import audit, targets_for
    from .frame_times import read_frame_times
except ImportError:
    from annotations import audit, targets_for
    from frame_times import read_frame_times

WINDOW_ORDER = ['durationMs', 'minFlexionDeg', 'maxFlexionDeg', 'romDeg', 'torsoRangeDeg', 'upperArmRangeDeg', 'medianAbsVelocityDegS', 'geometryCoverage']
WINDOW_UNITS = ['ms', 'deg', 'deg', 'deg', 'deg', 'deg', 'deg/s', 'fraction']
ACCEPTED_REVIEW = {'independently-reviewed', 'supplied-human-unreviewed'}


def match_observations(row, observations):
    if row['errors']:
        return []
    start, end = row['startMs'], row['endMs']
    return [item for item in observations if start <= item['timestampMs'] < end]


def build_dataset(coverage, rep_features, metadata, feature_order, units, feature_schema='rep-end-v1'):
    """Only exact human-bounded rep aggregates are eligible; analyzer-derived boundaries insufficient."""
    rows, excluded = [], []
    lookup = {}
    for rep in rep_features:
        key = (rep['recordingId'], rep['startMs'], rep['endMs'])
        if key in lookup:
            raise ValueError('Duplicate extracted rep interval')
        lookup[key] = rep
    grouped = {}
    for annotation in coverage['rows']:
        original = annotation['original']
        key = (original['recording_id'], original['rep_id'])
        grouped.setdefault(key, []).append(annotation)
    for (recording_id, rep_id), annotations in grouped.items():
        info = metadata.get(recording_id, {})
        errors = sorted({error for annotation in annotations for error in annotation['errors']})
        intervals = {(annotation['startMs'], annotation['endMs']) for annotation in annotations}
        if len(intervals) != 1:
            errors.append('conflicting_rep_boundaries')
        if info.get('reviewStatus') not in ACCEPTED_REVIEW:
            errors.append('independent_review_not_confirmed')
        if info.get('view') != 'side':
            errors.append('unknown_or_unsupported_view')
        if info.get('arm') not in ('left', 'right'):
            errors.append('selected_arm_not_confirmed')
        start, end = next(iter(intervals))
        rep = lookup.get((recording_id, start, end))
        if not rep:
            errors.append('no_exact_bounded_feature_aggregate')
        features = rep.get('features', []) if rep else []
        if len(features) != len(feature_order) or not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in features):
            errors.append('missing_or_invalid_features')
        for coverage_name, reason in (('formCoverage', 'insufficient_form_coverage'), ('geometryCoverage', 'insufficient_geometry_coverage')):
            if coverage_name in feature_order and len(features) == len(feature_order):
                coverage_value = features[feature_order.index(coverage_name)]
                if coverage_value is None or not isinstance(coverage_value, (int, float)) or isinstance(coverage_value, bool) or coverage_value < .8:
                    errors.append(reason)
        targets = {label: None for label in targets_for({'label': ''})}
        for annotation in annotations:
            current = targets_for(annotation['original'], info.get('assessedLabels', []))
            for label, value in current.items():
                if value is not None and targets[label] is not None and targets[label] != value:
                    errors.append('contradictory_rep_targets')
                elif value is not None:
                    targets[label] = value
        if not any(value is not None for value in targets.values()):
            errors.append('no_assessable_target')
        if errors:
            excluded.append({'recordingId': recording_id, 'repId': rep_id, 'reasons': sorted(set(errors)), 'annotations': annotations})
        else:
            rows.append({'recordingId': recording_id, 'repId': rep_id, 'startMs': start, 'endMs': end,
                         'participantId': info.get('participantId'), 'view': info['view'], 'reviewStatus': info['reviewStatus'],
                         'arm': info.get('arm'), 'armConfirmed': info.get('armConfirmed', True), 'armSource': info.get('armSource'),
                         'viewSource': info.get('viewSource'), 'features': features, 'targets': targets,
                         'rulePredictions': rep.get('rulePredictions', {}),
                         'annotations': [annotation['original'] for annotation in annotations]})
    return {'schemaVersion': 'curl-dataset-v1', 'featureSchemaVersion': feature_schema, 'featureOrder': feature_order,
            'units': units, 'annotationSha256': coverage['annotationSha256'], 'rows': rows, 'excluded': excluded,
            'status': 'ready' if rows else 'blocked', 'coverage': {'eligibleReps': len(rows), 'excludedReps': len(excluded)},
            'metadata': metadata}


def aggregate_measurements(coverage, measurements, metadata):
    """Invoke the actual browser aggregate implementation on human-bounded observations."""
    executable = os.environ.get('GYMBUD_NODE') or shutil.which('node')
    if not executable:
        raise ValueError('Node.js required to reuse browser rep feature implementation')
    module = (Path(__file__).resolve().parent.parent / 'frontend/src/ml/repFeatures.js').as_uri()
    reps = []
    for annotation in coverage['rows']:
        original = annotation['original']
        recording_id = original['recording_id']
        arm = metadata.get(recording_id, {}).get('arm')
        if annotation['errors'] or arm not in ('left', 'right'):
            continue
        path = Path(measurements) / recording_id / arm / 'frames.jsonl'
        if not path.exists():
            path = Path(measurements) / Path(recording_id).stem / arm / 'frames.jsonl'
        if not path.exists():
            continue
        frames = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        frames = match_observations(annotation, frames)
        if len(frames) < 2:
            continue
        # Shared feature window closes at last observed timestamp, like browser rep completion.
        bounds = {'startMs': annotation['startMs'], 'endMs': frames[-1]['timestampMs']}
        if bounds['endMs'] <= bounds['startMs']:
            continue
        script = "import fs from 'node:fs'; const {aggregateRepFeatures}=await import(process.argv[1]); const x=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(JSON.stringify(aggregateRepFeatures(x.frames,x.bounds)));"
        result = subprocess.run([executable, '--input-type=module', '-e', script, module],
                                input=json.dumps({'frames': frames, 'bounds': bounds}), capture_output=True, text=True, check=True)
        aggregate = json.loads(result.stdout)
        rep = {'recordingId': recording_id, 'startMs': annotation['startMs'], 'endMs': annotation['endMs'],
               'features': aggregate['vector'], 'featureWindow': bounds}
        if not any((item['recordingId'], item['startMs'], item['endMs']) == (recording_id, rep['startMs'], rep['endMs']) for item in reps):
            reps.append(rep)
    return reps


def _node_json(script, payload):
    executable = os.environ.get('GYMBUD_NODE') or shutil.which('node')
    if not executable:
        raise ValueError('Node.js required to reuse browser rep feature implementation')
    module = (Path(__file__).resolve().parent.parent / 'frontend/src/ml/repFeatures.js').as_uri()
    result = subprocess.run([executable, '--input-type=module', '-e', script, module],
                            input=json.dumps(payload), capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise ValueError(result.stderr.strip() or 'Browser feature aggregation failed')
    return json.loads(result.stdout)


def _load_measurement_frames(measurements, recording_id, arm):
    path = Path(measurements) / recording_id / arm / 'frames.jsonl'
    if not path.exists():
        path = Path(measurements) / Path(recording_id).stem / arm / 'frames.jsonl'
    if not path.exists():
        return None, None
    frames = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    report_path = path.parent / 'report.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    return frames, report


def aggregate_window_features(coverage, measurements, recording_arms):
    """Batch the shared browser window aggregate. Annotation endMs is exclusive."""
    script = ("import fs from 'node:fs'; const {aggregateWindowFeatures}=await import(process.argv[1]);"
              "const job=JSON.parse(fs.readFileSync(0,'utf8'));"
              "process.stdout.write(JSON.stringify(job.windows.map((window)=>({id:window.id, aggregate:aggregateWindowFeatures(job.frames,{startMs:window.startMs,endMs:window.endMs,endExclusive:true})})))) ;")
    grouped = {}
    for annotation in coverage['rows']:
        if annotation['errors']:
            continue
        original = annotation['original']
        grouped.setdefault(original['recording_id'], []).append(annotation)
    reps = []
    for recording_id, annotations in grouped.items():
        for arm in recording_arms.get(recording_id, []):
            frames, report = _load_measurement_frames(measurements, recording_id, arm)
            if frames is None:
                continue
            windows = [{'id': annotation['original']['rep_id'], 'startMs': annotation['startMs'], 'endMs': annotation['endMs']} for annotation in annotations]
            aggregates = {item['id']: item['aggregate'] for item in _node_json(script, {'frames': frames, 'windows': windows})}
            for annotation in annotations:
                aggregate = aggregates.get(annotation['original']['rep_id'])
                if not aggregate:
                    continue
                reps.append({'recordingId': recording_id, 'repId': annotation['original']['rep_id'], 'arm': arm,
                             'startMs': annotation['startMs'], 'endMs': annotation['endMs'], 'features': aggregate['vector'],
                             'values': aggregate['values'], 'measuredFramesSha256': report.get('measuredFramesSha256'),
                             'orientation': 'engine-side-gate'})
    return reps


def choose_active_arm(reps):
    """Pick one anatomical arm per recording from elbow ROM. This is a hypothesis, not confirmed metadata."""
    by_recording = {}
    for rep in reps:
        by_recording.setdefault(rep['recordingId'], {}).setdefault(rep['arm'], []).append(rep)
    chosen = {}
    for recording_id, arms in by_recording.items():
        scores = {}
        for arm, rows in arms.items():
            usable = [row for row in rows if isinstance(row['values'].get('geometryCoverage'), (int, float)) and row['values']['geometryCoverage'] >= .8
                      and isinstance(row['values'].get('romDeg'), (int, float)) and math.isfinite(row['values']['romDeg'])]
            if len(usable) != len(rows):
                continue
            scores[arm] = sum(row['values']['romDeg'] for row in usable) / len(usable)
        ranked = sorted(scores, key=lambda arm: scores[arm], reverse=True)
        if not ranked or scores[ranked[0]] < 40:
            continue
        if len(ranked) > 1 and scores[ranked[0]] < scores[ranked[1]] + 20:
            continue
        chosen[recording_id] = {'arm': ranked[0], 'armConfirmed': False, 'armSource': 'derived-elbow-rom-v1',
                                'meanElbowRomDeg': scores[ranked[0]], 'otherArmMeanElbowRomDeg': scores[ranked[1]] if len(ranked) > 1 else None}
    return chosen


def extraction_provenance(extraction_root):
    """Refuse a cache whose completion marker does not match the decoded streams."""
    times = read_frame_times(extraction_root)
    records = {}
    for directory in sorted(Path(extraction_root).iterdir()):
        if not directory.is_dir():
            continue
        manifest = json.loads((directory / 'manifest.json').read_text())
        recording = Path(manifest['recordingId']).stem
        records[recording] = {'sourceSha256': manifest.get('sourceSha256'), 'modelSha256': manifest.get('modelSha256'),
                              'posesSha256': manifest.get('posesSha256'), 'framesSha256': manifest.get('framesSha256'),
                              'extractorVersion': manifest.get('extractorVersion'), 'mediapipeVersion': manifest.get('mediapipeVersion'),
                              'decodedFrames': manifest.get('decodedFrames'), 'displayRotationDeg': manifest.get('displayRotationDeg'),
                              'frameIndexConvention': manifest.get('frameIndexConvention')}
    return times, records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--annotations', required=True)
    parser.add_argument('--videos', required=True)
    parser.add_argument('--metadata', required=True)
    parser.add_argument('--features', required=True, help='JSON containing schema, original frame_times and explicit frame convention; optional reps')
    parser.add_argument('--measurements', help='Optional measured-frame root; directly aggregates confirmed selected arm with shared browser implementation')
    parser.add_argument('--extraction', help='Verified pose-cache root. Its decoded timestamps replace a stale embedded frame-time copy.')
    parser.add_argument('--feature-schema', choices=('rep-end-v1', 'rep-end-v2'), default='rep-end-v1')
    parser.add_argument('--allow-derived-arm', action='store_true')
    parser.add_argument('--allow-unreviewed-experimental', action='store_true')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    metadata = json.loads(Path(args.metadata).read_text())
    features = json.loads(Path(args.features).read_text())
    frame_args = {key: features[key] for key in ('frame_times', 'frame_basis', 'end_inclusive') if key in features}
    provenance = None
    if args.extraction:
        verified_times, provenance = extraction_provenance(args.extraction)
        stale = sorted(recording for recording, times in frame_args.get('frame_times', {}).items() if times != verified_times.get(recording))
        frame_args['frame_times'] = verified_times
    else:
        stale = []
    if args.feature_schema == 'rep-end-v2':
        if frame_args.get('frame_basis') != 0 or frame_args.get('end_inclusive') is not True:
            parser.error('rep-end-v2 requires confirmed zero-based inclusive frame bounds in the feature JSON')
        order, units = WINDOW_ORDER, WINDOW_UNITS
    else:
        order, units = features['featureOrder'], features['units']
    coverage = audit(args.annotations, args.videos, metadata, **frame_args)
    hypotheses = {}
    if args.feature_schema == 'rep-end-v2':
        if not args.measurements:
            parser.error('rep-end-v2 requires --measurements')
        recording_ids = sorted({row['original']['recording_id'] for row in coverage['rows']})
        recording_arms = {}
        for recording_id in recording_ids:
            confirmed = metadata.get(recording_id, {}).get('arm')
            if confirmed in ('left', 'right'):
                recording_arms[recording_id] = [confirmed]
            elif args.allow_derived_arm:
                recording_arms[recording_id] = ['left', 'right']
        window_reps = aggregate_window_features(coverage, args.measurements, recording_arms)
        hypotheses = choose_active_arm(window_reps) if args.allow_derived_arm else {}
        reps = []
        for rep in window_reps:
            info = metadata.get(rep['recordingId'], {})
            selected = info.get('arm') if info.get('arm') in ('left', 'right') else hypotheses.get(rep['recordingId'], {}).get('arm')
            if rep['arm'] == selected and not any(item['recordingId'] == rep['recordingId'] and item['repId'] == rep['repId'] for item in reps):
                reps.append({key: rep[key] for key in ('recordingId', 'repId', 'startMs', 'endMs', 'features')})
        if args.allow_unreviewed_experimental:
            for recording_id in recording_ids:
                current = dict(metadata.get(recording_id, {}))
                hypothesis = hypotheses.get(recording_id)
                if hypothesis and current.get('arm') not in ('left', 'right'):
                    current.update(hypothesis)
                elif current.get('arm') in ('left', 'right') and 'armConfirmed' not in current:
                    current['armConfirmed'] = True
                    current['armSource'] = current.get('armSource', 'metadata')
                if current.get('reviewStatus') not in ACCEPTED_REVIEW:
                    current['reviewStatus'] = 'supplied-human-unreviewed'
                if current.get('view') != 'side' and current.get('arm') in ('left', 'right'):
                    current['view'] = 'side'
                    current['viewSource'] = 'biomechanics-orientation-gate'
                if not current.get('assessedLabels'):
                    current['assessedLabels'] = ['swinging', 'incomplete-rom']
                current['negativeScope'] = 'annotation-vocabulary-assumption'
                metadata[recording_id] = current
    else:
        reps = aggregate_measurements(coverage, args.measurements, metadata) if args.measurements else features.get('reps', [])
    result = build_dataset(coverage, reps, metadata, order, units, args.feature_schema)
    result['sourceCoverage'] = {key: coverage[key] for key in ('annotationRows', 'declaredFrameBoundsRows', 'boundedRepRows', 'labelCounts', 'missingMetadata', 'boundaryExclusions', 'overlaps')}
    result['featureWindowConvention'] = 'rep-end-v2 uses the half-open decoded interval [start, next PTS). rep-end-v1 closes at the last included observed timestamp.'
    result['staleEmbeddedFrameTimesReplaced'] = stale
    result['armHypotheses'] = hypotheses
    result['negativeScope'] = 'no_issue_observed is a negative only for swinging and incomplete-rom, because those labels occur in the supplied table. This is not a confirmed review protocol.' if args.allow_unreviewed_experimental else None
    result['extractionProvenance'] = provenance
    result['measurementCoverage'] = json.loads((Path(args.measurements) / 'coverage.json').read_text()) if args.measurements and (Path(args.measurements) / 'coverage.json').exists() else None
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print(json.dumps(result['coverage']))

if __name__ == '__main__':
    main()

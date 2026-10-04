"""Deterministic dependency-free multilabel logistic baseline with grouped holdout."""
import argparse
import hashlib
import json
import math
import platform
import random
import subprocess
import shutil
import os
from pathlib import Path
try:
    from .evaluate import evaluate, metrics, sigmoid
except ImportError:
    from evaluate import evaluate, metrics, sigmoid


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def browser_canonical(value):
    """Use ECMAScript number serialization exactly; Python JSON float text differs."""
    executable = os.environ.get('GYMBUD_NODE') or shutil.which('node')
    if not executable:
        raise ValueError('Node.js is required for browser-compatible canonical model checksums; set GYMBUD_NODE')
    script = "const fs=require('fs'); const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v; process.stdout.write(JSON.stringify(sort(JSON.parse(fs.readFileSync(0,'utf8')))));"
    result = subprocess.run([executable, '-e', script], input=canonical(value), capture_output=True, check=True)
    return result.stdout


FEATURE_SCHEMAS = {
    'rep-end-v1': {'order': ['durationMs', 'minFlexionDeg', 'maxFlexionDeg', 'romDeg', 'maxAbsTorsoDeg', 'maxAbsDriftDeg', 'medianAbsVelocityDegS', 'formCoverage'],
                   'units': ['ms', 'deg', 'deg', 'deg', 'deg', 'deg', 'deg/s', 'fraction']},
    'rep-end-v2': {'order': ['durationMs', 'minFlexionDeg', 'maxFlexionDeg', 'romDeg', 'torsoRangeDeg', 'upperArmRangeDeg', 'medianAbsVelocityDegS', 'geometryCoverage'],
                   'units': ['ms', 'deg', 'deg', 'deg', 'deg', 'deg', 'deg/s', 'fraction']},
}


def split_rows(rows, seed=2026, allow_recording_split=False, fixed_threshold_pilot=False):
    if not rows:
        raise ValueError('No usable independently-reviewed bounded reps')
    participants = {row.get('participantId') for row in rows}
    if None not in participants and '' not in participants and len(participants) >= 3 and not fixed_threshold_pilot:
        strategy = 'participant'
    elif allow_recording_split or fixed_threshold_pilot:
        if fixed_threshold_pilot and not allow_recording_split:
            raise ValueError('Fixed-threshold pilot requires an explicit recording-group split')
        strategy = 'recording-group'
    else:
        raise ValueError('At least three confirmed participants required; explicit --allow-recording-split permits an experimental pilot')
    # Even in recording pilot, known participants never cross partitions.
    def group(row):
        return row.get('participantId') or row['recordingId'] if strategy == 'recording-group' else row['participantId']
    groups = sorted({group(row) for row in rows})
    if fixed_threshold_pilot:
        if len(groups) < 4:
            raise ValueError('At least four recording groups are required for a fixed-threshold train/test pilot')
        random.Random(seed).shuffle(groups)
        half = len(groups) // 2
        partition = {'test': set(groups[:half]), 'validation': set(), 'train': set(groups[half:])}
    else:
        if len(groups) < 3:
            raise ValueError('At least three independent groups required for train/validation/test')
        random.Random(seed).shuffle(groups)
        size = max(1, len(groups) // 5)
        partition = {'test': set(groups[:size]), 'validation': set(groups[size:2 * size]), 'train': set(groups[2 * size:])}
    return {name: [row for row in rows if group(row) in selected] for name, selected in partition.items()}, strategy


def standardize(rows, width):
    if width == 0:
        raise ValueError('Empty feature schema')
    mean = [sum(row['features'][index] for row in rows) / len(rows) for index in range(width)]
    scale = [math.sqrt(sum((row['features'][index] - mean[index]) ** 2 for row in rows) / len(rows)) or 1.0 for index in range(width)]
    return {'mean': mean, 'scale': scale}


def fit_head(rows, label, preprocessing, iterations=1200):
    selected = [row for row in rows if row['targets'].get(label) in (0, 1)]
    if {row['targets'][label] for row in selected} != {0, 1}:
        return None
    vectors = [[(value - mean) / scale for value, mean, scale in zip(row['features'], preprocessing['mean'], preprocessing['scale'])] for row in selected]
    weights, intercept = [0.0] * len(preprocessing['mean']), 0.0
    for _ in range(iterations):
        errors = [sigmoid(sum(weight * value for weight, value in zip(weights, vector)) + intercept) - row['targets'][label] for row, vector in zip(selected, vectors)]
        weights = [weight - .1 * (sum(error * vector[index] for error, vector in zip(errors, vectors)) / len(selected) + .01 * weight) for index, weight in enumerate(weights)]
        intercept -= .1 * sum(errors) / len(selected)
    return {'name': label, 'issueType': label if label != 'swinging' else None, 'coefficients': weights, 'intercept': intercept, 'threshold': .5}


def train(dataset, model_version, seed=2026, allow_recording_split=False, source=None, allow_unreviewed=False, fixed_threshold_pilot=False):
    rows = dataset.get('rows', [])
    schema = FEATURE_SCHEMAS.get(dataset.get('featureSchemaVersion'))
    if schema is None or dataset.get('featureOrder') != schema['order'] or dataset.get('units') != schema['units']:
        raise ValueError('Unsupported rep-end feature schema/order/units')
    accepted_review = {'independently-reviewed', 'supplied-human-unreviewed'} if allow_unreviewed else {'independently-reviewed'}
    width = len(dataset['featureOrder'])
    if len(set(dataset['featureOrder'])) != width:
        raise ValueError('Duplicate feature names')
    for row in rows:
        if row.get('reviewStatus') not in accepted_review or row.get('view') != 'side':
            raise ValueError('Unreviewed or unsupported-view row')
        if not isinstance(row.get('startMs'), (int, float)) or not isinstance(row.get('endMs'), (int, float)) or not math.isfinite(row['startMs']) or not math.isfinite(row['endMs']) or not 0 <= row['startMs'] < row['endMs']:
            raise ValueError('Invalid rep boundary')
        if len(row['features']) != width or not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in row['features']):
            raise ValueError('Missing/nonfinite feature')
        if any(value is not None and value not in (0, 1) for value in row['targets'].values()):
            raise ValueError('Invalid target')
    if len({(row['recordingId'], row['repId']) for row in rows}) != len(rows):
        raise ValueError('Duplicate rep IDs')
    splits, strategy = split_rows(rows, seed, allow_recording_split, fixed_threshold_pilot)
    preprocessing = standardize(splits['train'], width)
    model = {'schemaVersion': 'gymbud-logistic-1', 'modelVersion': model_version,
             'datasetVersion': 'sha256:' + hashlib.sha256(canonical(dataset)).hexdigest(),
             'sourceRevision': (source or {}).get('revision', 'unknown'), 'sourceManifest': source or {},
             'trained': True, 'experimental': True, 'featureSchemaVersion': dataset['featureSchemaVersion'],
             'featureOrder': dataset['featureOrder'], 'units': dataset['units'], 'preprocessing': preprocessing,
             'labels': [], 'supportedViews': ['side'], 'predictionTiming': 'rep-end',
             'missingDataHandling': 'abstain', 'dependencies': {'python': platform.python_version(), 'canonicalJson': 'ECMAScript JSON.stringify via Node.js', 'trainer': 'stdlib-gradient-logistic-v1'},
             'knownLimitations': ['Experimental and uncalibrated.', 'Rep-end only; full-rep features are not a live prediction.',
                                  'Only the engine side-orientation gate and human-bounded attempts.',
                                  'Composite swinging does not identify torso or shoulder mechanism.', 'No production acceptance evidence.']}
    if dataset.get('featureSchemaVersion') == 'rep-end-v2':
        model['knownLimitations'].append('Features are within-window angle ranges. They do not use the live calibration baseline. Browser inference computes the same ranges when a rep completes.')
    if any(row.get('reviewStatus') == 'supplied-human-unreviewed' for row in rows):
        model['knownLimitations'].append('Labels are the supplied annotation table. A second independent review is not recorded.')
    if any(row.get('armConfirmed') is False for row in rows):
        model['knownLimitations'].append('Active arm is a derived elbow-ROM hypothesis, not confirmed metadata.')
    if any(row.get('viewSource') == 'biomechanics-orientation-gate' for row in rows):
        model['knownLimitations'].append('Camera view was not confirmed by a person. Inclusion follows the existing side-orientation gate, which can accept a near-threshold oblique recording.')
    excluded = {}
    labels = sorted({label for row in rows for label in row['targets']})
    try:
        from .evaluate import predict
    except ImportError:
        from evaluate import predict
    for label in labels:
        head = fit_head(splits['train'], label, preprocessing)
        if head is None:
            excluded[label] = 'training_split_requires_observed_positive_and_negative'
            continue
        if fixed_threshold_pilot:
            test_rows = [row for row in splits['test'] if row['targets'].get(label) in (0, 1)]
            if {row['targets'][label] for row in test_rows} != {0, 1}:
                excluded[label] = 'test_split_requires_observed_positive_and_negative'
                continue
            head['threshold'] = .5
            model['labels'].append(head)
            continue
        validation = [row for row in splits['validation'] if row['targets'].get(label) in (0, 1)]
        if {row['targets'][label] for row in validation} != {0, 1}:
            excluded[label] = 'validation_split_requires_observed_positive_and_negative'
            continue
        probe = dict(model, labels=[head])
        scores = [predict(probe, row['features'])[label] for row in validation]
        # Deterministic predeclared threshold grid; no test data consulted.
        candidates = [index / 20 for index in range(1, 20)]
        head['threshold'] = max(candidates, key=lambda threshold: (metrics([row['targets'][label] for row in validation], [int(score >= threshold) for score in scores])['f1'] or 0, -abs(threshold - .5), threshold))
        model['labels'].append(head)
    if not model['labels']:
        raise ValueError('No trainable label heads: ' + json.dumps(excluded, sort_keys=True))
    model['evaluation'] = {'status': 'experimental', 'splitStrategy': strategy, 'seed': seed,
                           'groupAssignments': {name: sorted({row.get('participantId') or row['recordingId'] for row in selected}) for name, selected in splits.items()},
                           'testRepIds': [[row['recordingId'], row['repId']] for row in splits['test']],
                           'excludedLabels': excluded,
                           'splitCoverage': {name: {label: {'positive': sum(row['targets'].get(label) == 1 for row in selected), 'negative': sum(row['targets'].get(label) == 0 for row in selected), 'unknown': sum(row['targets'].get(label) is None for row in selected)} for label in labels} for name, selected in splits.items()},
                           'test': evaluate(model, splits['test'])}
    if strategy != 'participant':
        model['knownLimitations'].append('Participant-independent validation unavailable; unknown participant overlap may leak across recordings.')
    if fixed_threshold_pilot:
        model['knownLimitations'].append('Decision threshold is the predeclared value 0.5. There is no validation split because four recording groups cannot fill train, validation, and test with both classes.')
        model['evaluation']['thresholdPolicy'] = 'predeclared-0.5'
    else:
        model['evaluation']['thresholdPolicy'] = 'validation-f1-grid'
    model['checksumSha256'] = hashlib.sha256(browser_canonical(model)).hexdigest()
    return model


def source_manifest():
    root = Path(__file__).resolve().parent.parent
    def git(*args):
        return subprocess.run(['git', *args], cwd=root, text=True, capture_output=True, check=False).stdout.strip()
    files = list(Path(__file__).resolve().parent.glob('*.py')) + list(Path(__file__).resolve().parent.glob('*.mjs')) + list(Path(__file__).resolve().parent.glob('requirements*.txt'))
    for directory in ('ml', 'biomechanics', 'vision', 'exercises', 'feedback'):
        folder = root / 'frontend/src' / directory
        files.extend(file for file in folder.rglob('*') if file.is_file() and file.suffix in ('.js', '.ts', '.json'))
    files.extend(file for file in (root / 'frontend/package.json', root / 'frontend/package-lock.json') if file.exists())
    return {'revision': git('rev-parse', 'HEAD'), 'dirty': bool(git('status', '--porcelain')),
            'files': {str(file.relative_to(root)): hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(files)}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--model-version', default='curl-pilot-1')
    parser.add_argument('--seed', type=int, default=2026)
    parser.add_argument('--allow-recording-split', action='store_true')
    parser.add_argument('--allow-unreviewed-experimental', action='store_true')
    parser.add_argument('--fixed-threshold-pilot', action='store_true')
    args = parser.parse_args()
    dataset = json.loads(Path(args.dataset).read_text())
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    try:
        model = train(dataset, args.model_version, args.seed, args.allow_recording_split, source_manifest(), args.allow_unreviewed_experimental, args.fixed_threshold_pilot)
    except ValueError as exc:
        report = {'status': 'blocked', 'modelProduced': False, 'reason': str(exc), 'datasetCoverage': dataset.get('coverage'),
                  'excluded': dataset.get('excluded', []), 'requirements': ['Human rep boundaries mapped to decoded timestamps.', 'Confirmed view and selected anatomical arm.',
                  'Independent review with assessed negative scope.', 'Confirmed participant groups or explicit recording pilot.', 'Positive and negative class support in training and validation.']}
        (output / 'training-report.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
        print(json.dumps({'status': 'blocked', 'reason': str(exc)}))
        return 2
    filename = args.model_version + '.json'
    (output / filename).write_text(json.dumps(model, indent=2, ensure_ascii=False, allow_nan=False) + '\n')
    (output / 'training-report.json').write_text(json.dumps(model['evaluation'], indent=2, allow_nan=False) + '\n')
    try:
        from .evaluate import predict
    except ImportError:
        from evaluate import predict
    fixtures = [{'features': row['features'], 'scores': predict(model, row['features'])} for row in dataset['rows'][:12]]
    (output / 'parity-fixtures.json').write_text(json.dumps({'modelVersion': model['modelVersion'], 'fixtures': fixtures}, indent=2) + '\n')
    (output / 'publication-plan.json').write_text(json.dumps({'status': 'dry-run-only', 'uploadPerformed': False,
        'localArtifact': filename, 'checksumSha256': model['checksumSha256'],
        'objectPath': f'models/curls/{args.model_version}/{filename}', 'requiredConfiguration': ['private bucket', 'approved project/region', 'authenticated narrow service account'],
        'rawRecordingsIncluded': False}, indent=2) + '\n')
    print(json.dumps({'status': 'experimental', 'artifact': str(output / filename), 'checksumSha256': model['checksumSha256']}))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())

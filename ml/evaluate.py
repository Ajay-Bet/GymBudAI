"""Per-label metrics over observed targets only; abstentions retain explicit counts."""
import argparse
import json
import math
from pathlib import Path


def sigmoid(value):
    if value >= 0:
        return 1 / (1 + math.exp(-value))
    exp = math.exp(value)
    return exp / (1 + exp)


def predict(model, features):
    transformed = [(value - mean) / scale for value, mean, scale in zip(features, model['preprocessing']['mean'], model['preprocessing']['scale'])]
    if len(features) != len(model['featureOrder']) or not all(math.isfinite(value) for value in transformed):
        raise ValueError('Feature schema mismatch or nonfinite input')
    return {head['name']: sigmoid(sum(weight * value for weight, value in zip(head['coefficients'], transformed)) + head['intercept']) for head in model['labels']}


def metrics(targets, predictions):
    pairs = [(target, prediction) for target, prediction in zip(targets, predictions) if target is not None and prediction is not None]
    tp = sum(target == 1 and pred == 1 for target, pred in pairs)
    fp = sum(target == 0 and pred == 1 for target, pred in pairs)
    fn = sum(target == 1 and pred == 0 for target, pred in pairs)
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None
    return {'precision': precision, 'recall': recall, 'f1': f1, 'support': len(pairs),
            'positives': sum(target == 1 for target, _ in pairs), 'negatives': sum(target == 0 for target, _ in pairs),
            'falsePositives': fp, 'falseNegatives': fn, 'unassessed': len(targets) - len(pairs)}


def evaluate(model, rows):
    scores = [predict(model, row['features']) for row in rows]
    result = {}
    for head in model['labels']:
        label = head['name']
        targets = [row['targets'].get(label) for row in rows]
        outputs = [int(score[label] >= head['threshold']) for score in scores]
        rules = [row.get('rulePredictions', {}).get(label) for row in rows]
        result[label] = {'model': metrics(targets, outputs), 'rules': metrics(targets, rules),
                         'hybrid': {'status': 'not-evaluated', 'reason': 'No validated hybrid policy in this rep-end pilot'}}
    return {'issues': result, 'predictionTiming': 'rep-end', 'liveFalseCuesPerMinute': None, 'liveDetectionDelayMs': None,
            'limitations': ['Rep-end predictions do not measure live cue rate or detection delay.', 'Scores are uncalibrated logistic outputs.']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    model = json.loads(Path(args.model).read_text())
    dataset = json.loads(Path(args.dataset).read_text())
    if dataset['featureOrder'] != model['featureOrder'] or dataset['featureSchemaVersion'] != model['featureSchemaVersion']:
        raise ValueError('Dataset/model feature schema mismatch')
    # Only exported held-out IDs; evaluation cannot tune any model field.
    heldout = set(tuple(item) for item in model['evaluation']['testRepIds'])
    rows = [row for row in dataset['rows'] if (row['recordingId'], row['repId']) in heldout]
    result = evaluate(model, rows)
    Path(args.report).write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')

if __name__ == '__main__':
    main()

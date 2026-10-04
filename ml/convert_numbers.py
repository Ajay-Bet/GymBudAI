"""Recover an annotation table locally without modifying its Numbers source."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import shutil
import tempfile


def convert(source, output):
    from numbers_parser import Document
    source, output = Path(source), Path(output)
    if source.resolve() == output.resolve():
        raise ValueError('Output must differ from the original source')
    with tempfile.TemporaryDirectory(prefix='gymbud-annotations-') as directory:
        package = Path(directory) / 'source.numbers'
        shutil.copyfile(source, package)
        document = Document(package)
        tables = [table for sheet in document.sheets for table in sheet.tables]
        matching = [table for table in tables if table.rows(values_only=True)[0][:4]
                    == ['recording_id', 'rep_id', 'start_frame', 'end_frame']]
        if len(matching) != 1:
            raise ValueError('Expected exactly one frame-annotation table')
        rows = matching[0].rows(values_only=True)
    for row in rows[1:]:
        for column in (2, 3):
            value = row[column]
            if isinstance(value, float) and value.is_integer():
                row[column] = int(value)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('w', newline='', encoding='utf-8') as handle:
        csv.writer(handle).writerows(rows)
    provenance = {
        'source': str(source), 'sourceFormat': 'Apple Numbers',
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'output': str(output), 'outputSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'parser': 'numbers-parser 4.18.5', 'repRows': len(rows) - 1,
        'frameBasis': 'unknown', 'endInclusive': 'unknown', 'independentReview': 'unknown',
    }
    output.with_suffix('.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    return provenance


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print(json.dumps(convert(args.source, args.output)))

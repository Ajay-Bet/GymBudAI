"""Read complete, checksummed decoded-frame caches for annotation matching."""
import argparse
import hashlib
import json
import math
from pathlib import Path


def read_frame_times(root):
    result = {}
    for directory in sorted(Path(root).iterdir()):
        if not directory.is_dir():
            continue
        manifest_path = directory / 'manifest.json'
        if not manifest_path.exists():
            raise ValueError(f'Incomplete extraction: {directory.name}')
        manifest = json.loads(manifest_path.read_text())
        content = (directory / 'frames.jsonl').read_bytes()
        if hashlib.sha256(content).hexdigest() != manifest['framesSha256']:
            raise ValueError(f'Frame cache checksum mismatch: {directory.name}')
        frames = [json.loads(line) for line in content.splitlines() if line.strip()]
        if len(frames) != manifest['decodedFrames']:
            raise ValueError(f'Incomplete frame cache: {directory.name}')
        times = [frame['timestampMs'] for frame in frames]
        if not times or any(not isinstance(t, (int, float)) or isinstance(t, bool) or not math.isfinite(t) for t in times):
            raise ValueError(f'Invalid decoded timestamps: {directory.name}')
        if any(b <= a for a, b in zip(times, times[1:])):
            raise ValueError(f'Non-increasing decoded timestamps: {directory.name}')
        if any(frame['frameIndex'] != index for index, frame in enumerate(frames)):
            raise ValueError(f'Non-contiguous source frame indices: {directory.name}')
        recording = Path(manifest['recordingId']).stem
        if recording in result:
            raise ValueError(f'Duplicate recording: {recording}')
        result[recording] = times
    if not result:
        raise ValueError('No complete extraction caches')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = read_frame_times(args.input)
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, allow_nan=False) + '\n')
    print(json.dumps({'recordings': len(result), 'decodedFrames': sum(map(len, result.values()))}))

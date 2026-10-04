import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from ml.frame_times import read_frame_times


class FrameTimeTests(unittest.TestCase):
    def test_checksum_and_partial_caches_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            clip = root / 'clip'
            clip.mkdir()
            frames = (json.dumps({'frameIndex': 0, 'timestampMs': 0}) + '\n').encode()
            manifest = {'recordingId': 'clip.mp4', 'decodedFrames': 1, 'framesSha256': hashlib.sha256(frames).hexdigest()}
            (clip / 'frames.jsonl').write_bytes(frames)
            (clip / 'manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(read_frame_times(root)['clip'], [0])
            (clip / 'frames.jsonl').write_bytes(frames + b'{}\n')
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                read_frame_times(root)
            (clip / 'manifest.json').unlink()
            with self.assertRaisesRegex(ValueError, 'Incomplete extraction'):
                read_frame_times(root)

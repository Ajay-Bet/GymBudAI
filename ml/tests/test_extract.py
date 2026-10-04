import importlib.util
from pathlib import Path
import unittest
from fractions import Fraction
from types import SimpleNamespace
from unittest.mock import patch
import tempfile

spec=importlib.util.spec_from_file_location('extract',Path(__file__).resolve().parents[1]/'extract.py')
extract=importlib.util.module_from_spec(spec);spec.loader.exec_module(extract)

class ExtractionTests(unittest.TestCase):
    def test_source_pts_preserves_origin_and_variable_spacing(self):
        self.assertEqual(extract.source_timestamp_ms(SimpleNamespace(pts=90,time_base=Fraction(1,30))),3000)
        self.assertEqual(extract.source_timestamp_ms(SimpleNamespace(pts=101,time_base=Fraction(1,30))),101000/30)
        self.assertIsNone(extract.source_timestamp_ms(SimpleNamespace(pts=None,time_base=Fraction(1,30))))

    def test_orientation_uses_display_matrix(self):
        import numpy as np
        image=np.arange(6).reshape(2,3)
        self.assertEqual(extract.orient(image,-90).tolist(),[[3,0],[4,1],[5,2]])

    def test_interrupted_replacement_keeps_complete_streams_and_removes_marker(self):
        class Video:
            def __enter__(self): return self
            def __exit__(self,*args): return False
            def decode(self,**args): raise RuntimeError('decode failed')
        class Detector:
            def __enter__(self): return self
            def __exit__(self,*args): return False
        fake_mp=SimpleNamespace(tasks=SimpleNamespace(BaseOptions=lambda **kwargs:None,vision=SimpleNamespace(
            PoseLandmarkerOptions=lambda **kwargs:None,RunningMode=SimpleNamespace(VIDEO='video'),
            PoseLandmarker=SimpleNamespace(create_from_options=lambda options:Detector()))))
        with tempfile.TemporaryDirectory() as temporary:
            output=Path(temporary)
            for name in ('frames.jsonl','poses.jsonl'): (output/name).write_text('old complete stream')
            (output/'manifest.json').write_text('{}')
            with patch.dict('sys.modules',{'av':SimpleNamespace(open=lambda path:Video()),'mediapipe':fake_mp}), \
                 patch.object(extract,'checksum',return_value=extract.MODEL_SHA), \
                 patch.object(extract,'probe',return_value=({'width':960,'height':540},-90)), \
                 patch.object(extract.importlib.metadata,'version',return_value='pinned'):
                with self.assertRaisesRegex(RuntimeError,'decode failed'):
                    extract.extract(Path('video.mp4'),output,Path('model.task'),force=True)
            self.assertEqual((output/'poses.jsonl').read_text(),'old complete stream')
            self.assertEqual((output/'frames.jsonl').read_text(),'old complete stream')
            self.assertFalse((output/'manifest.json').exists())

if __name__=='__main__':unittest.main()

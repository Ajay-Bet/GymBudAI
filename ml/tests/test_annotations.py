import tempfile
import unittest
from pathlib import Path
from ml.annotations import read_annotations, targets_for

class AnnotationTests(unittest.TestCase):
    def write(self, content):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / 'labels.csv'
        path.write_text(content, encoding='utf-8-sig')
        return path

    def test_bom_missing_interval_preserved(self):
        path = self.write('recording_id,rep_id,start_seconds,end_seconds,label,severity,notes\na,rep1,,,swinging,normal,human note\n')
        row = read_annotations(path)[0]
        self.assertIn('missing_or_invalid_interval', row['errors'])
        self.assertEqual(row['original']['notes'], 'human note')
        self.assertEqual(targets_for(row['original'])['swinging'], 1)
        self.assertIsNone(targets_for(row['original'])['torso-swing'])

    def test_negative_scope_and_coexisting(self):
        self.assertTrue(all(value is None for value in targets_for({'label': 'no_issue_observed'}).values()))
        self.assertEqual(targets_for({'label': 'no_issue_observed'}, ['swinging'])['swinging'], 0)
        targets = targets_for({'label': 'swinging|incomplete_rom'})
        self.assertEqual(targets['swinging'], 1)
        self.assertEqual(targets['incomplete-rom'], 1)

    def test_frame_mapping_requires_explicit_convention_and_pts(self):
        path = self.write('recording_id,rep_id,start_frame,end_frame,label\na,r1,1,3,swinging\n')
        self.assertTrue(read_annotations(path)[0]['errors'])
        row = read_annotations(path, {'a': [0, 31, 80, 110]}, frame_basis=1, end_inclusive=True)[0]
        self.assertEqual((row['startMs'], row['endMs']), (0, 110))
        self.assertFalse(row['errors'])

    def test_missing_end_is_excluded_without_a_guessed_bound(self):
        path = self.write('recording_id,rep_id,start_frame,end_frame,label,severity\na,r1,538,N/A,swinging,excessive\n')
        row = read_annotations(path, {'a': [0, 16, 32]}, frame_basis=0, end_inclusive=True)[0]
        self.assertEqual(row['errors'], ['missing_end_frame'])
        self.assertIsNone(row['startMs'])
        self.assertIsNone(row['endMs'])

    def test_out_of_range_index_is_not_truncated(self):
        times = [index * 10 for index in range(1432)]
        path = self.write('recording_id,rep_id,start_frame,end_frame,label\na,r,1321,1432,no_issue_observed\n')
        row = read_annotations(path, {'a': times}, frame_basis=0, end_inclusive=True)[0]
        self.assertEqual(row['errors'], ['frame_index_out_of_range'])
        self.assertIsNone(row['endMs'])
        self.assertNotEqual(row['endMs'], times[-1])

    def test_inclusive_final_frame_needs_the_next_timestamp(self):
        times = [0, 16, 32]
        path = self.write('recording_id,rep_id,start_frame,end_frame,label\na,r,0,2,swinging\n')
        row = read_annotations(path, {'a': times}, frame_basis=0, end_inclusive=True)[0]
        self.assertEqual(row['errors'], ['inclusive_end_needs_following_timestamp'])
        self.assertIsNone(row['startMs'])

    def test_bad_intervals_and_binary(self):
        for start,end in [('nan','2'),('2','1'),('-1','2')]:
            row = read_annotations(self.write(f'recording_id,rep_id,start_seconds,end_seconds,label\na,r,{start},{end},swinging\n'))[0]
            self.assertTrue(row['errors'])
        path = self.write('archive')
        path.write_bytes(b'PK archive')
        with self.assertRaisesRegex(ValueError, 'invalid-source-format'):
            read_annotations(path)

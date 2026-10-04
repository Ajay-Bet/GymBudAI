import unittest
from ml.dataset import build_dataset, match_observations, aggregate_measurements

class DatasetTests(unittest.TestCase):
    def setUp(self):
        self.row = {'original': {'recording_id':'a','rep_id':'r','label':'swinging','notes':'retained'}, 'startMs': 10, 'endMs': 20, 'errors': []}
        self.coverage = {'rows':[self.row], 'annotationSha256':'abc'}
        self.metadata = {'a': {'view':'side','arm':'left','reviewStatus':'independently-reviewed','participantId':'p'}}
        self.features = [{'recordingId':'a','startMs':10,'endMs':20,'features':[5]}]

    def test_half_open_and_no_frame_targets(self):
        self.assertEqual([x['timestampMs'] for x in match_observations(self.row,[{'timestampMs':value} for value in [9,10,19,20]])], [10,19])
        result = build_dataset(self.coverage,self.features,self.metadata,['rom'],['deg'])
        self.assertEqual(result['rows'][0]['targets']['swinging'],1)
        self.assertIsNone(result['rows'][0]['targets']['torso-swing'])
        self.assertEqual(result['rows'][0]['annotations'][0]['notes'],'retained')

    def test_review_view_and_exact_boundaries(self):
        for change in [{'reviewStatus':'unknown'},{'view':'front'},{'arm':None}]:
            self.metadata['a'].update(change)
            self.assertEqual(build_dataset(self.coverage,self.features,self.metadata,['rom'],['deg'])['status'],'blocked')
        self.metadata['a'].update(view='side',arm='left',reviewStatus='independently-reviewed')
        self.features[0]['endMs']=21
        self.assertEqual(build_dataset(self.coverage,self.features,self.metadata,['rom'],['deg'])['status'],'blocked')

    def test_bridge_uses_last_included_frame_without_future(self):
        import json
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / 'a' / 'left'
            folder.mkdir(parents=True)
            frames = []
            for timestamp, flexion in [(10, 5), (15, 10), (19, 20), (20, 999)]:
                values = {'elbowFlexionDeg': flexion, 'torsoDeviationDeg': 2, 'upperArmDriftDeg': 3, 'elbowAngularVelocityDegS': 4}
                frames.append({'timestampMs': timestamp, 'ready': True, 'trackingState': 'active', 'values': values, 'validity': {key: True for key in values}})
            (folder / 'frames.jsonl').write_text('\n'.join(json.dumps(frame) for frame in frames))
            reps = aggregate_measurements(self.coverage, directory, self.metadata)
            self.assertEqual(reps[0]['featureWindow']['endMs'], 19)
            self.assertEqual(reps[0]['features'][0], 9)
            self.assertEqual(reps[0]['features'][2], 20)

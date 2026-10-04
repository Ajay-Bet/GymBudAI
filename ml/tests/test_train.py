import hashlib
import unittest
from ml.train import canonical, browser_canonical, split_rows, standardize, train
from ml.evaluate import metrics, predict


def dataset():
    rows=[]
    for person in range(6):
        for rep in range(6):
            target=rep%2
            rows.append({'recordingId':f'clip{person}','repId':f'r{rep}','participantId':f'p{person}',
                         'startMs':rep*1000,'endMs':(rep+1)*1000,'view':'side','reviewStatus':'independently-reviewed',
                         'features':[target*10+person/100,4,120,116,3,4,40,.9], 'targets':{'swinging':target,'incomplete-rom':None}, 'rulePredictions':{}})
    return {'rows':rows,'featureOrder':['durationMs','minFlexionDeg','maxFlexionDeg','romDeg','maxAbsTorsoDeg','maxAbsDriftDeg','medianAbsVelocityDegS','formCoverage'],'units':['ms','deg','deg','deg','deg','deg','deg/s','fraction'],'featureSchemaVersion':'rep-end-v1'}

class TrainingTests(unittest.TestCase):
    def test_participant_disjoint_and_deterministic(self):
        rows=dataset()['rows']
        splits,strategy=split_rows(rows)
        self.assertEqual(strategy,'participant')
        ids=[{row['participantId'] for row in selected} for selected in splits.values()]
        self.assertTrue(all(not left & right for i,left in enumerate(ids) for right in ids[i+1:]))
        self.assertEqual(split_rows(rows),split_rows(rows))

    def test_unknown_groups_require_explicit_pilot(self):
        rows=dataset()['rows']
        for row in rows: row['participantId']=None
        with self.assertRaises(ValueError): split_rows(rows)
        self.assertEqual(split_rows(rows,allow_recording_split=True)[1],'recording-group')

    def test_train_only_preprocess_constant_checksum_and_mask(self):
        data=dataset()
        splits,_=split_rows(data['rows'])
        model=train(data,'fixture-only')
        self.assertEqual(model['preprocessing'],standardize(splits['train'],8))
        self.assertEqual(model['preprocessing']['scale'][1],1)
        self.assertEqual([head['name'] for head in model['labels']],['swinging'])
        checksum=model.pop('checksumSha256')
        self.assertEqual(checksum,hashlib.sha256(browser_canonical(model)).hexdigest())
        self.assertGreater(predict(model,[10,4,120,116,3,4,40,.9])['swinging'],predict(model,[0,4,120,116,3,4,40,.9])['swinging'])
        self.assertEqual(model['labels'][0]['issueType'],None)

    def test_test_values_do_not_change_preprocessing_or_threshold(self):
        original=dataset()
        splits,_=split_rows(original['rows'])
        heldout={row['participantId'] for row in splits['test']}
        before=train(original,'test')
        for row in original['rows']:
            if row['participantId'] in heldout: row['features'][0]=999999
        after=train(original,'test')
        self.assertEqual(before['preprocessing'],after['preprocessing'])
        self.assertEqual(before['labels'],after['labels'])

    def test_no_model_without_class_support_or_data(self):
        data=dataset()
        for row in data['rows']: row['targets']['swinging']=1
        with self.assertRaisesRegex(ValueError,'No trainable'): train(data,'none')
        data['rows']=[]
        with self.assertRaisesRegex(ValueError,'No usable'): train(data,'none')

    def test_browser_canonical_float_representation(self):
        self.assertEqual(browser_canonical({'b': 1e-7, 'a': 2000.0}), b'{"a":2000,"b":1e-7}')

    def test_shared_parity_fixture(self):
        import json
        from pathlib import Path
        fixture = json.loads((Path(__file__).parent / 'fixtures/parity.json').read_text())
        for item in fixture['fixtures']:
            actual = predict(fixture['model'], item['features'])
            self.assertAlmostEqual(actual['swinging'], item['scores']['swinging'], places=14)

    def test_recording_groups_stay_together_and_unreviewed_rows_fail_closed(self):
        rows=[]
        for recording, target in (('a', 1), ('b', 0), ('c', 1), ('d', 0)):
            rows.append({'recordingId':recording,'repId':'r','participantId':None,'startMs':0,'endMs':1000,'view':'side',
                         'reviewStatus':'supplied-human-unreviewed','armConfirmed':False,'features':[target*10,4,120,116,3,4,40,.9],
                         'targets':{'swinging':target},'rulePredictions':{}})
        data={'rows':rows,'featureSchemaVersion':'rep-end-v1','featureOrder':dataset()['featureOrder'],'units':dataset()['units']}
        with self.assertRaisesRegex(ValueError,'Unreviewed'): train(data,'blocked',allow_recording_split=True,fixed_threshold_pilot=True)
        model=train(data,'pilot',allow_recording_split=True,allow_unreviewed=True,fixed_threshold_pilot=True)
        assignments=model['evaluation']['groupAssignments']
        self.assertFalse(set(assignments['train']) & set(assignments['test']))
        self.assertEqual(model['evaluation']['thresholdPolicy'],'predeclared-0.5')
        self.assertEqual(model['labels'][0]['threshold'],.5)
        self.assertTrue(any('derived elbow-ROM' in item for item in model['knownLimitations']))

    def test_unknown_metrics(self):
        result=metrics([1,0,None],[1,1,0])
        self.assertEqual(result['support'],2)
        self.assertEqual(result['precision'],.5)
        self.assertEqual(result['unassessed'],1)

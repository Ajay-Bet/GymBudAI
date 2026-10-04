import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRepFeatures, aggregateWindowFeatures } from '../src/ml/repFeatures.js';
import { replay } from '../../ml/measure.mjs';
const frame = (t, flex, ready = true) => ({timestampMs:t, ready, trackingState:ready?'active':'lost',
  values:{elbowFlexionDeg:flex,torsoDeviationDeg:-3,upperArmDriftDeg:4,elbowAngularVelocityDegS:-20},
  validity:{elbowFlexionDeg:true,torsoDeviationDeg:true,upperArmDriftDeg:true,elbowAngularVelocityDegS:true}});
test('rep aggregation clips future observations and preserves units/order',()=>{
  const r=aggregateRepFeatures([frame(0,5),frame(100,25),frame(200,10),frame(300,150)],{startMs:0,endMs:200});
  assert.deepEqual(r.vector,[200,5,25,20,3,4,20,1]);
});
test('coverage uses valid elapsed time; dropped samples cannot look good',()=>{
  const r=aggregateRepFeatures([frame(0,5),frame(100,25,false),frame(200,10)],{startMs:0,endMs:200});
  assert.equal(r.values.formCoverage,0);
  assert.equal(aggregateRepFeatures([],{startMs:0,endMs:200}).values.maxAbsTorsoDeg,null);
});
test('gap and invalid feature flags withhold evidence; duplicates do not invent time',()=>{
  const invalid=frame(100,25); invalid.validity.torsoDeviationDeg=false;
  const r=aggregateRepFeatures([frame(0,5),frame(0,99),invalid,frame(300,10)],{startMs:0,endMs:300});
  assert.equal(r.values.formCoverage,0);assert.equal(r.frameCount,3);
  assert.throws(()=>aggregateRepFeatures([],{startMs:5,endMs:5}),/bounds/);
});
test('cross-arm or cross-view observations cannot form one example',()=>{
  assert.throws(()=>aggregateRepFeatures([{...frame(0,5),side:'left'},{...frame(100,25),side:'right'}],{startMs:0,endMs:100}),/Mixed rep side/);
});
test('offline replay calibrates only after browser tracking and contiguous relaxed evidence',()=>{
  const points=Array.from({length:33},()=>({x:.45,y:.25,visibility:1,presence:1}));
  for(const [s,e,w,h,x]of[[11,13,15,23,.45],[12,14,16,24,.48]]) {
    points[s].x=x;points[e]={...points[e],x,y:.45};points[w]={...points[w],x,y:.63};points[h]={...points[h],x,y:.65};
  }
  const poses=Array.from({length:50},(_,i)=>({timestampMs:i*50,frameIndex:i,landmarks:points,sourceWidth:1000,sourceHeight:1000}));
  const result=replay(poses,{side:'right',view:'side'});
  assert.equal(result.frames[5].trackingState,'partial');
  assert.equal(result.frames[25].ready,false);
  assert.equal(result.frames[30].ready,true);
  assert.equal(result.report.completedCandidates,0);
  assert.equal(result.report.trainingEligible,false);
  const missing=replay([...poses,{timestampMs:3000,frameIndex:50,landmarks:[],sourceWidth:1000,sourceHeight:1000}],{side:'right',view:'side'});
  assert.equal(missing.frames.at(-1).ready,false);
  assert.equal(missing.frames.at(-1).values.elbowFlexionDeg,null);
});
const geometry = (t, flex, torso, arm, valid = true) => ({ timestampMs: t, ready: false, trackingState: 'active', view: 'side', side: 'right',
  orientation: { valid }, dropout: false, smoothed: { elbowFlexionDeg: flex, torsoTiltDeg: torso, upperArmTiltDeg: arm },
  values: { elbowFlexionDeg: flex, torsoTiltDeg: torso, upperArmTiltDeg: arm, torsoDeviationDeg: 99, upperArmDriftDeg: 99, elbowAngularVelocityDegS: 12 } });
test('window features use side-on geometry and ignore calibration-relative fields', () => {
  const result = aggregateWindowFeatures([geometry(0, 20, 1, 4), geometry(100, 80, 9, 20), geometry(200, 30, 3, 8)], { startMs: 0, endMs: 200 });
  assert.equal(result.schemaVersion, 'rep-end-v2');
  assert.equal(result.values.romDeg, 60);
  assert.equal(result.values.torsoRangeDeg, 8);
  assert.equal(result.values.upperArmRangeDeg, 16);
  assert.equal(result.values.maxAbsTorsoDeg, undefined);
  assert.equal(result.values.geometryCoverage, 1);
});
test('window features abstain across an unsupported view or a tracking gap', () => {
  const hidden = aggregateWindowFeatures([geometry(0, 20, 1, 4, false), geometry(100, 80, 2, 5, false)], { startMs: 0, endMs: 100 });
  assert.equal(hidden.values.romDeg, null);
  assert.equal(hidden.values.geometryCoverage, 0);
  const gap = aggregateWindowFeatures([geometry(0, 10, 0, 0), geometry(400, 90, 5, 5)], { startMs: 0, endMs: 400 });
  assert.equal(gap.values.geometryCoverage, 0);
  assert.equal(gap.values.romDeg, 80);
  const exclusive = aggregateWindowFeatures([geometry(0, 10, 0, 0), geometry(100, 40, 2, 2), geometry(200, 999, 0, 0)], { startMs: 0, endMs: 200, endExclusive: true });
  assert.equal(exclusive.values.maxFlexionDeg, 40);
  assert.equal(exclusive.frameCount, 2);
});

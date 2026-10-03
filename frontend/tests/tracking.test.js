import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackingValidator, isReliableLandmark } from '../src/vision/tracking.js';
import { drawPose } from '../src/vision/drawPose.js';

const pose = () => Array.from({ length: 33 }, () => ({ x: 0.25, y: 0.75, visibility: 0.9, presence: 0.9 }));

test('tracking requires sustained visibility and recovers after person loss', () => {
  const tracker = createTrackingValidator();
  assert.equal(tracker.update(pose(), 0).state, 'partial');
  assert.equal(tracker.update(pose(), 300).state, 'active');
  // Losing the person while active is a graced dropout; past graceMs (250 ms) tracking is lost.
  assert.equal(tracker.update([], 400).state, 'partial');
  assert.equal(tracker.update([], 500).dropout, true);
  assert.equal(tracker.update([], 700).state, 'lost');
  assert.equal(tracker.update(pose(), 800).state, 'partial');
  assert.equal(tracker.update(pose(), 1100).state, 'active');
});

test('low confidence, frame gaps, and invalid timestamps reset stable tracking', () => {
  const tracker = createTrackingValidator();
  tracker.update(pose(), 0);
  assert.equal(tracker.update(pose(), 300).state, 'active');
  const occluded = pose();
  occluded[13].visibility = 0.1;
  assert.equal(tracker.update(occluded, 400).state, 'partial');
  // Occlusion longer than graceMs (250 ms) resets stability.
  assert.equal(tracker.update(occluded, 700).state, 'partial');
  assert.equal(tracker.update(pose(), 800).state, 'partial');
  assert.equal(tracker.update(pose(), 1100).state, 'active');
  assert.equal(tracker.update(pose(), 1700).state, 'partial');
  assert.equal(tracker.update(pose(), 1700).state, 'lost');
  assert.equal(tracker.update(pose(), Number.NaN).state, 'lost');
});

test('side change uses anatomical joints and starts a new settling window', () => {
  const tracker = createTrackingValidator();
  const points = pose();
  points[14].visibility = 0.1;
  tracker.update(points, 0);
  assert.equal(tracker.update(points, 300).state, 'active');
  tracker.setSide('right');
  assert.equal(tracker.update(points, 400).state, 'partial');
  assert.equal(tracker.update(pose(), 500).state, 'partial');
  assert.equal(tracker.update(pose(), 800).state, 'active');
});

test('unusable coordinates and confidence never count as reliable observations', () => {
  for (const patch of [{ x: -0.1 }, { y: 1.1 }, { x: NaN }, { visibility: undefined }, { visibility: 0.1 }, { presence: 0.1 }]) {
    assert.equal(isReliableLandmark({ ...pose()[0], ...patch }), false);
  }
});

test('canvas mapping scales and mirrors normalized coordinates without changing anatomical data', () => {
  const calls = [];
  const context = Object.fromEntries(['clearRect', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'arc', 'fill'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const canvas = { width: 640, height: 360, getContext: () => context };
  const point = pose()[0];
  drawPose(canvas, [point]);
  assert.deepEqual(calls.find(call => call[0] === 'arc').slice(1, 3), [160, 270]);
  calls.length = 0;
  canvas.width = 480;
  canvas.height = 640;
  drawPose(canvas, [point], { mirrored: true });
  assert.deepEqual(calls.find(call => call[0] === 'arc').slice(1, 3), [360, 480]);
  assert.equal(point.x, 0.25);
  calls.length = 0;
  drawPose(canvas, []);
  assert.deepEqual(calls, [['clearRect', 0, 0, 480, 640]]);
});

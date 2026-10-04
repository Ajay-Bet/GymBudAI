import test from 'node:test';
import assert from 'node:assert/strict';
import { createNearArmDetector } from '../src/vision/armSelect.js';

const pose = (leftVis, rightVis) => Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5,
  visibility: [11, 13, 15].includes(i) ? leftVis : [12, 14, 16].includes(i) ? rightVis : 0.9, presence: 1 }));

test('picks the clearly more visible arm after the minimum frames', () => {
  const d = createNearArmDetector();
  for (let i = 0; i < 9; i += 1) assert.equal(d.update(pose(0.3, 0.95)), null);
  assert.equal(d.update(pose(0.3, 0.95)), 'right');
  assert.equal(d.update(pose(0.99, 0.1)), 'right'); // decision is sticky
  d.reset();
  for (let i = 0; i < 10; i += 1) d.update(pose(0.9, 0.2));
  assert.equal(d.update(pose(0.9, 0.2)), 'left');
});

test('ambiguous visibility still decides by the maximum frame count; missing landmarks are ignored', () => {
  const d = createNearArmDetector({ maxFrames: 20 });
  assert.equal(d.update([]), null);
  let pick = null;
  for (let i = 0; i < 20; i += 1) pick = d.update(pose(0.8, 0.82));
  assert.equal(pick, 'right');
});

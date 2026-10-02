import { isReliableLandmark } from './tracking.js';

// MediaPipe's 33-landmark pose topology. Coordinates stay unmirrored in data.
export const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

export function clearPose(canvas) {
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}

export function drawPose(canvas, landmarks, { mirrored = false, confidence = 0.5 } = {}) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks?.length) return;
  const point = (p) => [(mirrored ? 1 - p.x : p.x) * canvas.width, p.y * canvas.height];
  ctx.save();
  ctx.lineWidth = Math.max(2, canvas.width / 250);
  ctx.strokeStyle = '#4ade80';
  for (const [a, b] of POSE_CONNECTIONS) {
    if (!isReliableLandmark(landmarks[a], confidence) || !isReliableLandmark(landmarks[b], confidence)) continue;
    ctx.beginPath();
    ctx.moveTo(...point(landmarks[a]));
    ctx.lineTo(...point(landmarks[b]));
    ctx.stroke();
  }
  ctx.fillStyle = '#facc15';
  for (const landmark of landmarks) {
    if (!isReliableLandmark(landmark, confidence)) continue;
    ctx.beginPath();
    ctx.arc(...point(landmark), Math.max(3, canvas.width / 160), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

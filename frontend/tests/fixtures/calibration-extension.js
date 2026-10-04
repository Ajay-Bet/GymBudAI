// Seeded synthetic observations, not reviewed recordings or physical accuracy evidence.
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
export function calibrationPose(timestampMs, { flexion = 20, shift = 0, visibility = 1, jitter = () => 0 } = {}) {
  const landmarks = Array(33).fill(null);
  const point = (x, y) => ({ x: x + jitter(), y: y + jitter(), visibility, presence: 1 });
  for (const [s, e, w, h, x] of [[11, 13, 15, 23, .45], [12, 14, 16, 24, .48]]) {
    const a = flexion * Math.PI / 180;
    landmarks[s] = point(x + shift, .25); landmarks[h] = point(x + shift, .65);
    landmarks[e] = point(x + shift, .45);
    landmarks[w] = point(x + shift + .18 * Math.sin(a) * 720 / 1280, .45 + .18 * Math.cos(a));
  }
  return { timestampMs, landmarks, sourceWidth: 1280, sourceHeight: 720 };
}
export function measureCalibration(createEngine, { fps, seed = 2026, endMs = 12000 } = {}) {
  const random = seeded(seed), engine = createEngine();
  engine.calibrate();
  let lastProgress = 0, resets = 0, movingFrames = 0;
  for (let i = 0; i <= endMs * fps / 1000; i += 1) {
    const timestampMs = i * 1000 / fps;
    // Bounded landmark jitter plus +/- 5 degree raw elbow estimation noise.
    const input = calibrationPose(timestampMs, { flexion: 20 + (random() - .5) * 10,
      jitter: () => (random() - .5) * .001 });
    const frame = engine.update(input);
    if (frame.calibration.progress < lastProgress) resets += 1;
    if (frame.calibration.message.startsWith('Movement detected')) movingFrames += 1;
    lastProgress = frame.calibration.progress;
    if (frame.ready) return { fps, seed, readyMs: +timestampMs.toFixed(3), progressRegressions: resets, movingFrames };
  }
  return { fps, seed, readyMs: null, progressRegressions: resets, movingFrames };
}

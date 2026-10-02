// Anatomical sides are the model's sides, independent of preview mirroring.
export const REQUIRED_JOINTS = {
  left: [11, 13, 15, 23],
  right: [12, 14, 16, 24],
};

export function isReliableLandmark(point, confidence = 0.5) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    && Number.isFinite(point.visibility) && point.visibility >= confidence
    && (point.presence === undefined || point.presence >= confidence));
}

export function createTrackingValidator({ side = 'left', confidence = 0.5, stableMs = 300 } = {}) {
  let stableSince = null;
  let lastTimestamp = null;
  function reset() {
    stableSince = null;
    lastTimestamp = null;
  }
  return {
    reset,
    setSide(nextSide) {
      if (!REQUIRED_JOINTS[nextSide]) throw new Error('Choose left or right anatomical side.');
      side = nextSide;
      reset();
    },
    update(landmarks, timestampMs) {
      const result = (state, message) => ({ state, message, side, confidence });
      if (!Number.isFinite(timestampMs) || (lastTimestamp !== null && timestampMs <= lastTimestamp)) {
        reset();
        return result('lost', 'Waiting for a fresh camera frame.');
      }
      if (lastTimestamp !== null && timestampMs - lastTimestamp > 500) stableSince = null;
      lastTimestamp = timestampMs;
      if (!landmarks?.length) {
        stableSince = null;
        return result('lost', 'No person detected. Step into view.');
      }
      const required = REQUIRED_JOINTS[side] || REQUIRED_JOINTS.left;
      if (!required.every((index) => isReliableLandmark(landmarks[index], confidence))) {
        stableSince = null;
        return result('partial', `Keep your ${side} shoulder, elbow, wrist and hip visible. Improve lighting or step back.`);
      }
      stableSince ??= timestampMs;
      return timestampMs - stableSince >= stableMs
        ? result('active', `Tracking active — ${side} side visible.`)
        : result('partial', 'Person detected. Hold position while tracking settles.');
    },
  };
}

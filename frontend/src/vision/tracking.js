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

/**
 * Tracking validator with confidence hysteresis and a short dropout grace period.
 * Acquiring requires every required joint at >= confidence for stableMs. Once active, joints
 * only need >= releaseConfidence. A failure while active is a dropout: state 'partial' with
 * dropout true; recovery within graceMs returns 'active' immediately. A dropout longer than
 * graceMs loses the active state and acquisition starts over. All values are unvalidated
 * engineering defaults.
 */
export function createTrackingValidator({ side = 'left', confidence = 0.5, releaseConfidence = 0.3,
  stableMs = 300, graceMs = 250 } = {}) {
  const release = Math.min(releaseConfidence, confidence);
  let stableSince = null;
  let lastTimestamp = null;
  let active = false;
  let dropoutSince = null;
  function loseActive() {
    stableSince = null;
    active = false;
    dropoutSince = null;
  }
  function reset() {
    loseActive();
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
      const result = (state, message, dropout = false) => ({ state, message, side, confidence, dropout });
      if (!Number.isFinite(timestampMs) || (lastTimestamp !== null && timestampMs <= lastTimestamp)) {
        reset();
        return result('lost', 'Waiting for a fresh camera frame.');
      }
      if (lastTimestamp !== null && timestampMs - lastTimestamp > 500) loseActive();
      lastTimestamp = timestampMs;
      if (active && dropoutSince !== null && timestampMs - dropoutSince > graceMs) loseActive();
      const required = REQUIRED_JOINTS[side] || REQUIRED_JOINTS.left;
      const threshold = active ? release : confidence;
      const empty = !landmarks?.length;
      const ok = !empty && required.every((index) => isReliableLandmark(landmarks[index], threshold));
      if (!ok) {
        const message = empty ? 'No person detected. Step into view.'
          : `Keep your ${side} shoulder, elbow, wrist and hip visible. Improve lighting or step back.`;
        if (active) {
          dropoutSince ??= timestampMs;
          return result('partial', message, true);
        }
        stableSince = null;
        return result(empty ? 'lost' : 'partial', message);
      }
      dropoutSince = null;
      if (active) return result('active', `Tracking active — ${side} side visible.`);
      stableSince ??= timestampMs;
      if (timestampMs - stableSince >= stableMs) {
        active = true;
        return result('active', `Tracking active — ${side} side visible.`);
      }
      return result('partial', 'Person detected. Hold position while tracking settles.');
    },
  };
}

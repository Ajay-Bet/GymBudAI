// Pick the arm nearest the camera in a side view from landmark visibility. The far arm is usually
// occluded, so its shoulder/elbow/wrist visibility is lower. Unvalidated engineering defaults.
const ARMS = Object.freeze({ left: [11, 13, 15], right: [12, 14, 16] });

const armScore = (landmarks, indices) => {
  const values = indices.map((i) => landmarks?.[i]).map((p) => (p ? Math.min(p.visibility ?? 0, p.presence ?? 1) : 0));
  return values.every(Number.isFinite) ? Math.min(...values) : 0;
};

/**
 * @param {{minFrames?: number, maxFrames?: number, margin?: number}} [options]
 * @returns {{update(landmarks: Object[]): 'left'|'right'|null, reset(): void}} update returns the
 *   chosen arm once decided (then keeps returning it), otherwise null.
 */
export function createNearArmDetector({ minFrames = 10, maxFrames = 45, margin = 0.1 } = {}) {
  let frames = 0, left = 0, right = 0, decided = null;
  return {
    update(landmarks) {
      if (decided) return decided;
      if (!Array.isArray(landmarks) || landmarks.length < 17) return null;
      frames += 1;
      left += armScore(landmarks, ARMS.left);
      right += armScore(landmarks, ARMS.right);
      const diff = (right - left) / frames;
      if ((frames >= minFrames && Math.abs(diff) >= margin) || frames >= maxFrames) decided = diff >= 0 ? 'right' : 'left';
      return decided;
    },
    reset() { frames = 0; left = 0; right = 0; decided = null; },
  };
}

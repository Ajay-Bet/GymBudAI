const EPSILON = 1e-8;
export function distance(a, b) {
  return a && b && [a.x, a.y, b.x, b.y].every(Number.isFinite) ? Math.hypot(a.x - b.x, a.y - b.y) : null;
}
export function toAspectPoint(point, width, height) {
  if (!point || ![point.x, point.y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x: point.x * width / height, y: point.y };
}
export function angleDegrees(a, b, c) {
  const ab = distance(a, b);
  const cb = distance(c, b);
  if (ab === null || cb === null || ab < EPSILON || cb < EPSILON) return null;
  const cosine = ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (ab * cb);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}
export function signedTiltDegrees(top, bottom) {
  const length = distance(top, bottom);
  if (length === null || length < EPSILON) return null;
  return Math.atan2(top.x - bottom.x, bottom.y - top.y) * 180 / Math.PI;
}

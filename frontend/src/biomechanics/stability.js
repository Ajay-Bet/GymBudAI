// Development-mode stability and smoothing-delay measurements. Pure JavaScript, no React.
// These summarise observed frames; they do not validate the proposed review targets.

function summarize(values) {
  if (values.length < 2) return { range: null, sd: null };
  const min = Math.min(...values), max = Math.max(...values);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { range: max - min, sd: Math.sqrt(variance) };
}

/**
 * Rolling raw/smoothed variation of one FeatureFrame geometry key over the last windowMs.
 * Invalid frames, missing values or non-increasing timestamps clear the window.
 * @param {{windowMs?: number, key?: string}} [options]
 */
export function createStabilityTracker({ windowMs = 2000, key = 'elbowFlexionDeg' } = {}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('Invalid stability window.');
  let samples = [];
  function result() {
    const spanMs = samples.length < 2 ? null : samples[samples.length - 1].timestampMs - samples[0].timestampMs;
    return { windowMs, samples: samples.length, spanMs,
      raw: summarize(samples.map((s) => s.raw)), smoothed: summarize(samples.map((s) => s.smoothed)) };
  }
  function reset() { samples = []; return result(); }
  function update(frame) {
    const timestampMs = frame?.timestampMs;
    const raw = frame?.raw?.[key], smoothed = frame?.smoothed?.[key];
    const last = samples[samples.length - 1];
    if (!Number.isFinite(timestampMs) || !Number.isFinite(raw) || !Number.isFinite(smoothed)
      || (last && timestampMs <= last.timestampMs)) return reset();
    samples.push({ timestampMs, raw, smoothed });
    samples = samples.filter((s) => timestampMs - s.timestampMs <= windowMs);
    return result();
  }
  return { update, reset };
}

/**
 * Delay (ms) between the raw and smoothed series first reaching
 * start + threshold * (end - start), where start/end are the first/last raw values.
 * Returns null for invalid input, a zero-size step, or when either series never crosses.
 * @param {{timestampMs: number, raw: number, smoothed: number}[]} samples
 * @param {{threshold?: number}} [options]
 * @returns {number|null}
 */
export function measureStepDelay(samples, { threshold = 0.5 } = {}) {
  if (!Array.isArray(samples) || samples.length < 2 || !Number.isFinite(threshold)
    || threshold <= 0 || threshold > 1) return null;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (![s?.timestampMs, s?.raw, s?.smoothed].every(Number.isFinite)) return null;
    if (i > 0 && s.timestampMs <= samples[i - 1].timestampMs) return null;
  }
  const start = samples[0].raw, end = samples[samples.length - 1].raw;
  if (end === start) return null;
  const level = start + threshold * (end - start);
  const crossed = (value) => (end > start ? value >= level : value <= level);
  const rawHit = samples.find((s) => crossed(s.raw));
  const smoothHit = samples.find((s) => crossed(s.smoothed));
  if (!rawHit || !smoothHit) return null;
  return smoothHit.timestampMs - rawHit.timestampMs;
}

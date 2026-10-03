/**
 * Dumbbell curl analyzer (Sprint 3). Pure JavaScript, independent of React.
 *
 * Consumes biomechanics FeatureFrames (schema >= 1.1.0, which supplies
 * calibration.baselineElbowFlexionDeg) for one selected arm in the side view and returns phase,
 * unique rep events, per-rep metrics and candidate issues. See docs/curl-analyzer-sprint-03.md.
 *
 * @typedef {import('./analyzer.js').AnalyzerOutput} AnalyzerOutput
 * @typedef {import('./analyzer.js').RepEvent} RepEvent
 * @typedef {import('./analyzer.js').RepSummary} RepSummary
 * @typedef {import('./analyzer.js').InterruptedAttempt} InterruptedAttempt
 * @typedef {import('./analyzer.js').CandidateIssue} CandidateIssue
 */

export const CURL_EXERCISE_ID = 'dumbbell-curl';

/**
 * Detector configuration. EVERY number below is an unvalidated engineering default: none has
 * been checked against reviewed, annotated recordings. They must be tuned with annotated examples
 * before any counting-accuracy or coaching claim. Angles are degrees of elbow flexion
 * (0 = straight arm) relative to the calibrated relaxed-arm baseline B
 * (calibration.baselineElbowFlexionDeg). Times are milliseconds of frame timestamps.
 *
 * Zones (hysteresis: entry and exit boundaries differ):
 *   bottom entered at flexion <= B + bottomEnterOffsetDeg, left at > B + bottomExitOffsetDeg.
 *   top entered at flexion >= B + topEnterOffsetDeg, left at < B + topExitOffsetDeg.
 *   an attempt is only created (ID assigned) once flexion >= B + attemptCommitOffsetDeg, so small
 *   oscillations around the bottom exit boundary never create attempts.
 */
export const CURL_CONFIG = Object.freeze({
  version: 'curl-1.1.0',
  exerciseId: CURL_EXERCISE_ID,
  supportedView: 'side',
  // Zone boundaries relative to the calibrated baseline (deg).
  bottomEnterOffsetDeg: 15,
  bottomExitOffsetDeg: 30,
  attemptCommitOffsetDeg: 45,
  // curl-1.1.0: top zone raised from 80/65 after Ajay's live run 1 (one participant, one session;
  // a half curl peaking about 80-88 deg above B counted under 1.0.0). Not validated.
  topExitOffsetDeg: 80,
  topEnterOffsetDeg: 95,
  // Minimum angular span (max - min flexion) for a completed rep (deg).
  minRomDeg: 80,
  // Windowed direction: least-squares slope of smoothed flexion over valid frames in the window.
  directionWindowMs: 200,
  directionMinSamples: 3,
  directionMinSpanMs: 80,
  directionThresholdDegS: 20,
  // Rep start: lowest bottom-phase frame within this time before lift-off (ms).
  startLookbackMs: 500,
  // Minimum time in a phase before it may be left (ms).
  minBottomMs: 100,
  minLiftingMs: 150,
  minTopMs: 50,
  minLoweringMs: 150,
  // No stallProgressDeg of progress for this long while lifting/lowering interrupts (ms).
  pauseTimeoutMs: 4000,
  // Progress-based stall: the stall timer restarts only when smoothed flexion has moved at least
  // this far from the anchor recorded when the timer started (deg).
  stallProgressDeg: 8,
  // Holding at the top longer than this interrupts the attempt (ms).
  topHoldTimeoutMs: 10000,
  // Gap between processed frames that counts as tracking loss (matches engine maxGapMs) (ms).
  maxFrameGapMs: 500,
  // Only intervals between consecutive ready frames up to this length count as observed time (ms).
  coverageGapMs: 150,
  // Minimum fraction of the rep duration with valid (ready) observation for a completed rep.
  minCoverage: 0.8,
  // Candidate issues: |value| above threshold for at least persistMs of valid observation.
  torsoSwingDeg: 10,
  torsoSwingPersistMs: 250,
  upperArmDriftDeg: 20,
  upperArmDriftPersistMs: 250,
});

const ORDERED_OFFSETS = ['bottomEnterOffsetDeg', 'bottomExitOffsetDeg', 'attemptCommitOffsetDeg', 'topExitOffsetDeg', 'topEnterOffsetDeg'];

const UNITS = Object.freeze({
  startMs: 'ms', topMs: 'ms', endMs: 'ms', durationMs: 'ms', validObservedMs: 'ms',
  minFlexionDeg: 'deg', maxFlexionDeg: 'deg', romDeg: 'deg', coverage: 'fraction (0-1)',
  maxAbsUpperArmDriftDeg: 'deg', maxElbowDisplacement: 'torso-lengths', maxAbsTorsoDeviationDeg: 'deg',
});

const ISSUE_RULES = [
  { type: 'torso-swing', key: 'torsoDeviationDeg', threshold: 'torsoSwingDeg', persist: 'torsoSwingPersistMs' },
  { type: 'upper-arm-drift', key: 'upperArmDriftDeg', threshold: 'upperArmDriftDeg', persist: 'upperArmDriftPersistMs' },
];

const INTERRUPT_REASONS = ['tracking-loss', 'recalibration'];

// Page-wide session counter: every analyzer instance and every reset takes a new number, so
// IDs of the form curl-<session>-<n> never repeat within a page lifetime.
let sessionCounter = 0;

const finite = (value) => (Number.isFinite(value) ? value : null);
const maxOrNull = (current, value) => (value === null ? current : current === null ? value : Math.max(current, value));
const minOrNull = (current, value) => (value === null ? current : current === null ? value : Math.min(current, value));
const absOrNull = (value) => (value === null ? null : Math.abs(value));

function validateConfig(settings) {
  for (const [key, value] of Object.entries(settings)) {
    if (key === 'version' || key === 'exerciseId' || key === 'supportedView') continue;
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid curl config: ${key}`);
  }
  for (let i = 1; i < ORDERED_OFFSETS.length; i += 1) {
    if (!(settings[ORDERED_OFFSETS[i - 1]] < settings[ORDERED_OFFSETS[i]])) {
      throw new Error(`Invalid curl config: ${ORDERED_OFFSETS[i - 1]} must be below ${ORDERED_OFFSETS[i]}`);
    }
  }
  if (settings.minCoverage > 1) throw new Error('Invalid curl config: minCoverage must be at most 1');
  if (settings.directionMinSamples < 2) throw new Error('Invalid curl config: directionMinSamples must be at least 2');
}

/** Least-squares slope (deg/s) of samples [{t, v}]; null when the window is insufficient. */
function windowSlope(samples, minSamples, minSpanMs) {
  if (samples.length < minSamples) return null;
  const span = samples[samples.length - 1].t - samples[0].t;
  if (span < minSpanMs) return null;
  const t0 = samples[0].t;
  const n = samples.length;
  let st = 0, sv = 0;
  for (const s of samples) { st += s.t - t0; sv += s.v; }
  const mt = st / n, mv = sv / n;
  let num = 0, den = 0;
  for (const s of samples) { const dt = s.t - t0 - mt; num += dt * (s.v - mv); den += dt * dt; }
  return den > 0 ? (num / den) * 1000 : null;
}

/**
 * Create a curl analyzer.
 * @param {{config?: Object}} [options] Overrides merged onto CURL_CONFIG (all validated).
 */
export function createCurlAnalyzer({ config = {} } = {}) {
  const settings = Object.freeze({ ...CURL_CONFIG, ...config });
  validateConfig(settings);

  let sessionSeq, attemptSeq, phase, phaseSinceMs, lastTimestamp, lastReady, directionSamples, attempt,
    bottomSamples, validClockMs, completedReps, interruptedAttempts, emittedIds, side, view, featureVersion, lastOutput;

  function clearSession() {
    sessionCounter += 1;
    sessionSeq = sessionCounter; attemptSeq = 0;
    phase = 'idle'; phaseSinceMs = null; lastTimestamp = null; lastReady = false; directionSamples = [];
    attempt = null; bottomSamples = []; validClockMs = 0; completedReps = []; interruptedAttempts = []; emittedIds = new Set();
    side = null; view = null; featureVersion = null;
    lastOutput = null;
  }

  const copyIssue = (issue) => ({ ...issue });

  function setPhase(next, t) {
    if (phase === next) return;
    // Entering or leaving the top restarts the stall timer (top holds have their own timeout). Noise-driven
    // lifting/lowering flips do not, so they cannot keep a stalled attempt alive.
    if (attempt && (next === 'top' || phase === 'top')) attempt.stallAnchor = null;
    phase = next; phaseSinceMs = t;
  }

  /**
   * Accumulators for a (pending or committed) attempt. The attempt starts at the lowest-flexion
   * bottom-phase frame within startLookbackMs before lift-off (latest on ties), so the observed
   * minimum lies inside [startMs, endMs]. Valid time is measured from that frame.
   */
  function startAttempt(t, flex) {
    let start = null;
    for (const sample of bottomSamples) if (t - sample.t <= settings.startLookbackMs && (!start || sample.v <= start.v)) start = sample;
    attempt = { id: null, startMs: start ? start.t : t, topMs: null, reachedTop: false,
      minFlex: minOrNull(start ? start.v : null, flex), maxFlex: maxOrNull(start ? start.v : null, flex),
      validObservedMs: start ? validClockMs - start.clock : 0, stallAnchor: null,
      maxAbsDrift: null, maxDisplacement: null, maxAbsTorso: null,
      issues: [], issueState: Object.fromEntries(ISSUE_RULES.map((r) => [r.type, { since: null, peak: null, open: null, lastAboveMs: null }])) };
  }

  function closeIssues() {
    if (!attempt) return;
    for (const rule of ISSUE_RULES) {
      const state = attempt.issueState[rule.type];
      if (state.open) state.open.endMs = state.lastAboveMs;
      state.since = null; state.peak = null; state.open = null; state.lastAboveMs = null;
    }
  }

  function trackIssues(values, t) {
    for (const rule of ISSUE_RULES) {
      const state = attempt.issueState[rule.type];
      const magnitude = absOrNull(finite(values?.[rule.key]));
      if (magnitude === null || magnitude <= settings[rule.threshold]) {
        if (state.open) state.open.endMs = state.lastAboveMs;
        state.since = null; state.peak = null; state.open = null; state.lastAboveMs = null;
        continue;
      }
      state.since ??= t;
      state.peak = maxOrNull(state.peak, magnitude);
      state.lastAboveMs = t;
      if (!state.open && t - state.since >= settings[rule.persist]) {
        state.open = { type: rule.type, startMs: state.since, endMs: null, peak: state.peak, unit: 'deg', configVersion: settings.version };
        attempt.issues.push(state.open);
      }
      if (state.open) state.open.peak = state.peak;
    }
  }

  function attemptCoverage(endMs) {
    const duration = endMs - attempt.startMs;
    return duration > 0 ? Math.min(1, attempt.validObservedMs / duration) : null;
  }

  function nextId() { attemptSeq += 1; return `curl-${sessionSeq}-${attemptSeq}`; }

  /** End the current attempt as interrupted. Emits an event only for committed attempts. */
  function endAttempt(reason, endMs, events) {
    if (!attempt) return;
    closeIssues();
    bottomSamples = [];
    if (attempt.id !== null && !emittedIds.has(attempt.id)) {
      const romDeg = attempt.maxFlex !== null && attempt.minFlex !== null ? attempt.maxFlex - attempt.minFlex : null;
      const issues = attempt.issues.map(copyIssue);
      if (reason === 'partial') {
        issues.push({ type: 'incomplete-rom', startMs: attempt.startMs, endMs, peak: romDeg, unit: 'deg', configVersion: settings.version });
      }
      const record = { id: attempt.id, status: 'interrupted', reason, startMs: attempt.startMs, endMs,
        maxFlexionDeg: attempt.maxFlex, romDeg, coverage: attemptCoverage(endMs), candidateIssues: issues, configVersion: settings.version };
      emittedIds.add(attempt.id);
      interruptedAttempts.push(record);
      events.push({ type: 'attempt-interrupted', id: record.id, attempt: structuredCloneSafe(record) });
    }
    attempt = null;
  }

  function complete(endMs, events) {
    closeIssues();
    bottomSamples = [];
    const romDeg = attempt.maxFlex - attempt.minFlex;
    const coverage = attemptCoverage(endMs);
    if (romDeg < settings.minRomDeg) { endAttempt('partial', endMs, events); return; }
    if (coverage === null || coverage < settings.minCoverage) { endAttempt('low-coverage', endMs, events); return; }
    if (emittedIds.has(attempt.id)) { attempt = null; return; }
    const rep = { id: attempt.id, index: completedReps.length + 1, status: 'completed', side, view,
      startMs: attempt.startMs, topMs: attempt.topMs, endMs, durationMs: endMs - attempt.startMs,
      minFlexionDeg: attempt.minFlex, maxFlexionDeg: attempt.maxFlex, romDeg,
      validObservedMs: attempt.validObservedMs, coverage,
      maxAbsUpperArmDriftDeg: attempt.maxAbsDrift, maxElbowDisplacement: attempt.maxDisplacement,
      maxAbsTorsoDeviationDeg: attempt.maxAbsTorso, candidateIssues: attempt.issues.map(copyIssue),
      configVersion: settings.version, featureVersion, units: UNITS };
    emittedIds.add(rep.id);
    completedReps.push(rep);
    events.push({ type: 'rep-completed', id: rep.id, rep: structuredCloneSafe(rep) });
    attempt = null;
  }

  function output(timestampMs, events, { paused = false, pauseReason = null, flex = null, direction = null } = {}) {
    lastOutput = { exerciseId: settings.exerciseId, configVersion: settings.version, timestampMs, phase, paused, pauseReason,
      repCount: completedReps.length,
      attempt: attempt && attempt.id !== null ? { id: attempt.id, startMs: attempt.startMs, phase } : null,
      events,
      live: { elbowFlexionDeg: flex, directionDegS: direction },
      candidateIssues: attempt && attempt.id !== null ? attempt.issues.map(copyIssue) : [] };
    return lastOutput;
  }

  function goIdle(t) { attempt = null; directionSamples = []; bottomSamples = []; setPhase('idle', t); }

  /**
   * Process one FeatureFrame.
   * @param {Object} frame FeatureFrame from the biomechanics engine.
   * @returns {AnalyzerOutput}
   */
  function update(frame) {
    const t = finite(frame?.timestampMs);
    // Duplicate, out-of-order or missing timestamps: no state change and no event.
    if (t === null || (lastTimestamp !== null && t <= lastTimestamp)) {
      return lastOutput ? { ...lastOutput, events: [] } : output(null, []);
    }
    const events = [];
    // Side or view change without an explicit reset: start a fresh session (GB 301).
    if ((side !== null && frame.side !== side) || (view !== null && frame.view !== view)) {
      endAttempt('reset', lastTimestamp ?? t, events);
      clearSession();
    }
    const gap = lastTimestamp === null ? null : t - lastTimestamp;
    const wasReady = lastReady;
    lastTimestamp = t;
    side = frame.side ?? null; view = frame.view ?? null; featureVersion = frame.version ?? null;

    const baseline = finite(frame.calibration?.baselineElbowFlexionDeg);
    const flex = finite(frame.values?.elbowFlexionDeg);
    const usable = frame.ready === true && baseline !== null && flex !== null && frame.view === settings.supportedView;

    if (!usable) {
      lastReady = false;
      directionSamples = [];
      if (frame.ready !== true && frame.dropout === true && attempt) {
        // Short engine dropout: keep the attempt, count the time as uncovered, never advance a phase.
        closeIssues();
        return output(t, events, { paused: true, pauseReason: 'tracking-dropout' });
      }
      if (frame.ready !== true && frame.dropout === true) {
        return output(t, events, { paused: true, pauseReason: 'tracking-dropout' });
      }
      endAttempt('tracking-loss', t, events);
      goIdle(t);
      const reason = frame.calibration?.status !== 'ready' ? 'calibration-required'
        : frame.view !== settings.supportedView ? 'unsupported-view' : 'tracking-loss';
      return output(t, events, { paused: true, pauseReason: reason });
    }

    // Gap too long between processed frames counts as tracking loss.
    if (gap !== null && gap > settings.maxFrameGapMs) {
      endAttempt('tracking-loss', t, events);
      goIdle(t);
    } else if (wasReady && gap !== null && gap <= settings.coverageGapMs) {
      validClockMs += gap;
      if (attempt) attempt.validObservedMs += gap;
    }
    lastReady = true;

    directionSamples.push({ t, v: flex });
    while (directionSamples.length && t - directionSamples[0].t > settings.directionWindowMs) directionSamples.shift();
    const direction = windowSlope(directionSamples, settings.directionMinSamples, settings.directionMinSpanMs);
    const rising = direction !== null && direction >= settings.directionThresholdDegS;
    const falling = direction !== null && direction <= -settings.directionThresholdDegS;
    const relative = flex - baseline;
    const inPhaseMs = phaseSinceMs === null ? 0 : t - phaseSinceMs;

    if (attempt) {
      attempt.minFlex = minOrNull(attempt.minFlex, flex);
      attempt.maxFlex = maxOrNull(attempt.maxFlex, flex);
      attempt.maxAbsDrift = maxOrNull(attempt.maxAbsDrift, absOrNull(finite(frame.values?.upperArmDriftDeg)));
      attempt.maxAbsTorso = maxOrNull(attempt.maxAbsTorso, absOrNull(finite(frame.values?.torsoDeviationDeg)));
      attempt.maxDisplacement = maxOrNull(attempt.maxDisplacement, finite(frame.values?.elbowDisplacement));
      trackIssues(frame.values, t);
      if (attempt.id === null && relative >= settings.attemptCommitOffsetDeg) attempt.id = nextId();
      // Progress-based stall timer for the pause timeout. Anchor and progress both use the mean
      // flexion of the valid frames in the direction window, so single-frame noise cannot restart
      // it; only movement of that mean by at least stallProgressDeg from the anchor does.
      const windowMean = directionSamples.reduce((sum, sample) => sum + sample.v, 0) / directionSamples.length;
      if (!attempt.stallAnchor || Math.abs(windowMean - attempt.stallAnchor.v) >= settings.stallProgressDeg) {
        attempt.stallAnchor = { t, v: windowMean };
      }
    }

    switch (phase) {
      case 'idle':
        if (relative <= settings.bottomEnterOffsetDeg) setPhase('bottom', t);
        break;
      case 'bottom':
        // Rising slope, or (slow tempo) flexion already past the commit angle on a valid frame.
        if (relative > settings.bottomExitOffsetDeg && inPhaseMs >= settings.minBottomMs
          && (rising || relative >= settings.attemptCommitOffsetDeg)) {
          startAttempt(t, flex);
          trackIssues(frame.values, t);
          if (relative >= settings.attemptCommitOffsetDeg) attempt.id = nextId();
          setPhase('lifting', t);
        }
        break;
      case 'lifting':
        if (relative <= settings.bottomEnterOffsetDeg) {
          if (attempt?.id) endAttempt('partial', t, events); else attempt = null;
          setPhase('bottom', t);
        } else if (attempt?.id === null && falling) {
          // Uncommitted rise that turns back: not an attempt (hysteresis against boundary jitter).
          attempt = null; setPhase('bottom', t);
        } else if (relative >= settings.topEnterOffsetDeg && inPhaseMs >= settings.minLiftingMs && attempt?.id) {
          attempt.reachedTop = true; attempt.topMs = t; setPhase('top', t);
        } else if (falling && inPhaseMs >= settings.minLiftingMs) {
          setPhase('lowering', t);
        }
        break;
      case 'top':
        // Below the top exit boundary is lowering regardless of slope (slow tempo).
        if (relative < settings.topExitOffsetDeg && inPhaseMs >= settings.minTopMs) setPhase('lowering', t);
        break;
      case 'lowering':
        if (relative <= settings.bottomEnterOffsetDeg && inPhaseMs >= settings.minLoweringMs) {
          if (attempt?.reachedTop) complete(t, events);
          else if (attempt?.id) endAttempt('partial', t, events);
          else attempt = null;
          setPhase('bottom', t);
        } else if (attempt?.reachedTop && relative >= settings.topEnterOffsetDeg) {
          setPhase('top', t);
        } else if (!attempt?.reachedTop && rising) {
          setPhase('lifting', t);
        }
        break;
      default:
        break;
    }

    // Pause timeouts (a stalled pending rise simply returns to the bottom phase without an event).
    if (attempt) {
      const stalled = attempt.stallAnchor !== null && t - attempt.stallAnchor.t >= settings.pauseTimeoutMs;
      const heldTop = phase === 'top' && t - phaseSinceMs >= settings.topHoldTimeoutMs;
      if ((phase === 'lifting' || phase === 'lowering') && stalled) {
        if (attempt.id) { endAttempt('pause-timeout', t, events); goIdle(t); } else { attempt = null; setPhase('bottom', t); }
      } else if (heldTop) {
        endAttempt('pause-timeout', t, events); goIdle(t);
      }
    }
    if (phase === 'bottom') {
      bottomSamples.push({ t, v: flex, clock: validClockMs });
      while (bottomSamples.length && t - bottomSamples[0].t > settings.startLookbackMs) bottomSamples.shift();
    }
    return output(t, events, { flex, direction });
  }

  /**
   * Interrupt from outside the frame stream (e.g. the UI sees tracking loss or starts recalibration).
   * A committed attempt ends with this reason; a pending one is dropped. Phase becomes 'idle', so a
   * valid bottom is needed before a new attempt. Completed reps and the count are kept. The
   * timestamp ordering used by update() is not changed.
   * @param {'tracking-loss'|'recalibration'} reason
   * @param {number} [timestampMs] End time; the last processed timestamp when not finite (or when earlier).
   * @returns {AnalyzerOutput}
   */
  function interrupt(reason, timestampMs) {
    if (!INTERRUPT_REASONS.includes(reason)) throw new Error(`Unsupported interrupt reason: ${reason}`);
    const given = finite(timestampMs);
    const endMs = given === null ? lastTimestamp : lastTimestamp === null ? given : Math.max(given, lastTimestamp);
    const events = [];
    if (attempt && endMs !== null) endAttempt(reason, endMs, events);
    goIdle(endMs);
    lastReady = false;
    return output(endMs, events, { paused: true, pauseReason: reason });
  }

  /**
   * Clear phase, attempt, completed reps and count (exercise change, side change, restart).
   * A committed attempt in progress is reported once as interrupted with reason 'reset'.
   * @param {string} [reason]
   * @returns {AnalyzerOutput}
   */
  function reset(reason = 'reset') {
    const events = [];
    endAttempt('reset', lastTimestamp ?? attempt?.startMs ?? 0, events);
    clearSession();
    const result = output(null, events);
    result.resetReason = String(reason);
    return result;
  }

  function getSession() {
    return { exerciseId: settings.exerciseId, configVersion: settings.version, featureVersion, side,
      completedReps: completedReps.map(structuredCloneSafe), interruptedAttempts: interruptedAttempts.map(structuredCloneSafe) };
  }

  clearSession();
  return { exerciseId: settings.exerciseId, config: settings, update, interrupt, reset, getSession };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

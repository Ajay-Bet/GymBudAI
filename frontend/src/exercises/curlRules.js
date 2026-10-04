/**
 * Curl form-issue rules and issue tracker (Sprint 4, GB 401). Pure JavaScript, independent of React.
 *
 * The tracker turns the per-frame curl analyzer output plus the FeatureFrame it came from into
 * persistent issue episodes: one continuous episode is one event. Persistence and release use
 * elapsed FeatureFrame timestamps (ms), never frame counts, so behaviour does not depend on frame
 * rate. An invalid tracking gap can neither accumulate evidence nor read as a resolved issue.
 * See "Agreed coaching contract" in docs/sprints/sprint-4-STATUS.md.
 *
 * Episodes are detector outputs. Whether a rule may coach a user is decided by `enabled`, and every
 * rule ships disabled: no rule has been validated against reviewed, annotated examples.
 *
 * @typedef {import('./analyzer.js').AnalyzerOutput} AnalyzerOutput
 * @typedef {import('./analyzer.js').IssueType} IssueType
 * @typedef {import('./analyzer.js').IssueEpisode} IssueEpisode
 * @typedef {import('./analyzer.js').IssueEvent} IssueEvent
 * @typedef {import('./analyzer.js').ActiveIssue} ActiveIssue
 * @typedef {import('./analyzer.js').IssueOutput} IssueOutput
 * @typedef {import('./analyzer.js').IssueSession} IssueSession
 */
import { createSessionUid } from './ids.js';

/**
 * Rule configuration. EVERY number is an unvalidated engineering default: none has been checked
 * against reviewed, annotated recordings. A rule may be set `enabled: true` only with reviewed
 * evidence recorded in `evidence` and in the sprint record. Angles are degrees, times are ms of
 * FeatureFrame timestamps.
 *
 * Continuous rules (`kind: 'persistent'`) use |values[feature]|, which the biomechanics engine
 * already reports relative to the calibration baseline:
 *   onset   |value| > onsetDeg on every assessable frame for >= onsetPersistMs (continuous valid time);
 *   release |value| <= releaseDeg on every assessable frame for >= releasePersistMs.
 * Values between releaseDeg and onsetDeg keep an open episode open (hysteresis).
 *
 * `incomplete-rom` (`kind: 'attempt-end'`) has no threshold of its own: it is evaluated once when the
 * analyzer emits `attempt-interrupted` with reason 'partial' (a committed attempt that returned to the
 * bottom without reaching the top zone B + topEnterOffsetDeg, or with ROM below minRomDeg; see
 * CURL_CONFIG). It is an instant episode at the attempt end and its peak is the achieved ROM.
 *
 * maxSuspendMs: longest non-assessable time (measured from the episode's last assessable frame)
 * an open episode survives as 'suspended'; beyond it the episode ends 'tracking-lost'.
 * maxEvidenceGapMs: longest interval between consecutive assessable frames that still counts as
 * continuous observation (same value as CURL_CONFIG.coverageGapMs). A longer interval discards onset
 * and release evidence, so a low frame rate cannot bridge unobserved time. Not in the agreed
 * contract table; proposed in the Sprint 4 report.
 * Low frame rate (unavailableReason 'low-frame-rate'): the tracker keeps the intervals between
 * consecutive frames that both passed the other gates and that ended within the last
 * frameRateWindowMs. When at least two are present and their (lower) median exceeds maxEvidenceGapMs,
 * the frame is not assessable: onset/release evidence is discarded and open episodes are suspended,
 * exactly as for any other invalid frame. The lower median means a single long interval (a stall)
 * never flips the state on its own; it only breaks evidence continuity. Without this, a stream below
 * about 7 fps would read as assessable while no correction could ever start.
 */
export const CURL_RULES_CONFIG = Object.freeze({
  version: 'curl-rules-1.0.0',
  maxSuspendMs: 500,
  maxEvidenceGapMs: 150,
  frameRateWindowMs: 1000,
  rules: Object.freeze({
    'torso-swing': Object.freeze({
      type: 'torso-swing',
      kind: 'persistent',
      feature: 'torsoDeviationDeg',
      measure: 'absolute value',
      supportedView: 'side',
      baseline: 'calibration torso tilt (torsoDeviationDeg is already baseline-relative)',
      onsetDeg: 10,
      onsetPersistMs: 400,
      releaseDeg: 7,
      releasePersistMs: 500,
      cueText: 'Keep your torso still',
      enabled: false,
      validation: 'unvalidated',
      evidence: Object.freeze([]),
    }),
    'upper-arm-drift': Object.freeze({
      type: 'upper-arm-drift',
      kind: 'persistent',
      feature: 'upperArmDriftDeg',
      measure: 'absolute value (unsigned: forward and backward drift are not distinguished side-on)',
      supportedView: 'side',
      baseline: 'calibration upper-arm tilt (upperArmDriftDeg is already baseline-relative)',
      onsetDeg: 20,
      onsetPersistMs: 400,
      releaseDeg: 15,
      releasePersistMs: 500,
      cueText: 'Keep your upper arm still at your side',
      enabled: false,
      validation: 'unvalidated',
      evidence: Object.freeze([]),
    }),
    'incomplete-rom': Object.freeze({
      type: 'incomplete-rom',
      kind: 'attempt-end',
      feature: 'romDeg',
      measure: "ROM of a committed attempt that the analyzer ended with reason 'partial'",
      supportedView: 'side',
      baseline: 'calibration baselineElbowFlexionDeg (via the analyzer zones)',
      trigger: Object.freeze({ event: 'attempt-interrupted', reason: 'partial' }),
      cueText: 'Curl all the way up',
      enabled: false,
      validation: 'unvalidated',
      evidence: Object.freeze([]),
    }),
  }),
});

/** Issue types in configuration order. */
export const CURL_ISSUE_TYPES = Object.freeze(Object.keys(CURL_RULES_CONFIG.rules));

const INTERRUPT_END_REASONS = Object.freeze({ 'tracking-loss': 'tracking-lost', recalibration: 'recalibration' });
const PAUSE_REASONS = ['tracking-dropout', 'tracking-loss', 'calibration-required', 'unsupported-view', 'recalibration'];

const finite = (value) => (Number.isFinite(value) ? value : null);
const maxOrNull = (current, value) => (value === null ? current : current === null ? value : Math.max(current, value));
const copy = (value) => JSON.parse(JSON.stringify(value));

/** Merge overrides onto CURL_RULES_CONFIG (per rule, shallow) and validate. */
function buildConfig(overrides = {}) {
  const ruleOverrides = overrides.rules ?? {};
  for (const type of Object.keys(ruleOverrides)) {
    if (!CURL_RULES_CONFIG.rules[type]) throw new Error(`Unknown curl rule: ${type}`);
  }
  const rules = Object.fromEntries(CURL_ISSUE_TYPES.map((type) => [type,
    Object.freeze({ ...CURL_RULES_CONFIG.rules[type], ...ruleOverrides[type], type })]));
  const settings = Object.freeze({ ...CURL_RULES_CONFIG, ...overrides, rules: Object.freeze(rules) });
  for (const key of ['maxSuspendMs', 'maxEvidenceGapMs', 'frameRateWindowMs']) {
    if (!Number.isFinite(settings[key]) || settings[key] <= 0) throw new Error(`Invalid curl rules config: ${key}`);
  }
  for (const rule of Object.values(rules)) {
    if (typeof rule.enabled !== 'boolean') throw new Error(`Invalid curl rules config: ${rule.type}.enabled`);
    if (rule.kind !== 'persistent') continue;
    for (const key of ['onsetDeg', 'onsetPersistMs', 'releaseDeg', 'releasePersistMs']) {
      if (!Number.isFinite(rule[key]) || rule[key] <= 0) throw new Error(`Invalid curl rules config: ${rule.type}.${key}`);
    }
    if (!(rule.releaseDeg <= rule.onsetDeg)) throw new Error(`Invalid curl rules config: ${rule.type}.releaseDeg must not exceed onsetDeg`);
  }
  return settings;
}

/**
 * Frame-level validity gate (GB 401) without the frame-rate check, which needs the tracker's history
 * (the tracker adds 'low-frame-rate'). Returns null when the frame passes, else the reason.
 * @param {Object} frame FeatureFrame.
 * @param {AnalyzerOutput|null|undefined} analyzerOutput
 * @returns {IssueOutput['unavailableReason']}
 */
export function curlUnavailableReason(frame, analyzerOutput) {
  if (frame?.dropout === true) return 'tracking-dropout';
  if (frame?.calibration?.status !== 'ready' || finite(frame?.calibration?.baselineElbowFlexionDeg) === null) return 'calibration-required';
  if (frame?.view !== 'side') return 'unsupported-view';
  if (frame?.ready !== true) return 'tracking-loss';
  if (analyzerOutput?.paused) return PAUSE_REASONS.includes(analyzerOutput.pauseReason) ? analyzerOutput.pauseReason : 'tracking-loss';
  return null;
}

/**
 * Create a curl issue tracker.
 * @param {{config?: Object}} [options] Overrides merged onto CURL_RULES_CONFIG; `rules` is merged per
 *   rule, e.g. `{ rules: { 'torso-swing': { onsetPersistMs: 600 } } }`. Validated.
 */
export function createCurlIssueTracker({ config = {} } = {}) {
  const settings = buildConfig(config);
  const persistentRules = Object.values(settings.rules).filter((rule) => rule.kind === 'persistent');
  const romRule = settings.rules['incomplete-rom'];

  let sessionUid, episodeSeq, episodes, ruleState, intervals, openInterval, startedMs, lastMs, endedMs, ended, lastOutput,
    lastGateMs, frameIntervals;

  function clearSession() {
    sessionUid = createSessionUid(); episodeSeq = 0; episodes = [];
    // Per persistent rule: pending onset evidence, the open episode (with its internal bookkeeping)
    // and the timestamp of the last frame on which the rule was assessable.
    ruleState = Object.fromEntries(persistentRules.map((rule) => [rule.type, { pending: null, open: null, lastValidMs: null }]));
    intervals = []; openInterval = null;
    startedMs = null; lastMs = null; endedMs = null; ended = false; lastOutput = null;
    lastGateMs = null; frameIntervals = [];
  }

  /**
   * Record the interval to this frame when it and the previous processed frame both passed the other
   * gates, and report whether the recent frame rate is too low for continuous evidence.
   */
  function lowFrameRate(t, passedGate) {
    if (!passedGate) { lastGateMs = null; return false; }
    if (lastGateMs !== null) frameIntervals.push({ endMs: t, gapMs: t - lastGateMs });
    lastGateMs = t;
    while (frameIntervals.length && t - frameIntervals[0].endMs > settings.frameRateWindowMs) frameIntervals.shift();
    if (frameIntervals.length < 2) return false;
    const gaps = frameIntervals.map((interval) => interval.gapMs).sort((x, y) => x - y);
    return gaps[Math.floor((gaps.length - 1) / 2)] > settings.maxEvidenceGapMs;
  }

  function newEpisode(rule, startMs, peak, attemptIds, analyzerVersion) {
    episodeSeq += 1;
    const episode = { id: `issue-${sessionUid}-${episodeSeq}`, type: rule.type, startMs, endMs: null, peak, unit: 'deg',
      endReason: null, attemptIds: [...attemptIds], rulesVersion: settings.version, analyzerVersion: analyzerVersion ?? null,
      enabled: rule.enabled, validation: rule.validation };
    episodes.push(episode);
    return episode;
  }

  const addId = (list, id) => { if (typeof id === 'string' && id && !list.includes(id)) list.push(id); };

  /** Close an open continuous episode. */
  function closeOpen(state, endReason, endMs, events) {
    const { episode } = state.open;
    episode.endMs = endMs;
    episode.endReason = endReason;
    state.open = null;
    events.push({ type: 'issue-ended', episode: copy(episode) });
  }

  /** End every open episode with a non-resolved reason at its last assessable frame; drop all evidence. */
  function endAllOpen(endReason, events) {
    for (const rule of persistentRules) {
      const state = ruleState[rule.type];
      if (state.open) closeOpen(state, endReason, state.open.lastObservedMs, events);
      state.pending = null; state.lastValidMs = null;
    }
  }

  function closeInterval() {
    if (openInterval) intervals.push(openInterval);
    openInterval = null;
  }

  function trackInterval(t, assessable, continuous) {
    if (!assessable) { closeInterval(); return; }
    if (openInterval && continuous) openInterval.endMs = t;
    else { closeInterval(); openInterval = { startMs: t, endMs: t }; }
  }

  /** One frame of a persistent rule. `value` is |feature| or null when the rule is not assessable. */
  function stepRule(rule, t, value, attemptId, analyzerVersion, events) {
    const state = ruleState[rule.type];
    // Too long without assessable observation: the open episode ends as tracking lost, never resolved.
    if (state.open && t - state.open.lastObservedMs > settings.maxSuspendMs) closeOpen(state, 'tracking-lost', state.open.lastObservedMs, events);
    const continuous = state.lastValidMs !== null && t - state.lastValidMs <= settings.maxEvidenceGapMs;
    if (value === null) {
      // Invalid frame: discard onset evidence; suspend (not release) an open episode and drop its release evidence.
      state.pending = null;
      state.lastValidMs = null;
      if (state.open) {
        state.open.state = 'suspended';
        state.open.releaseSinceMs = null;
        addId(state.open.episode.attemptIds, attemptId);
      }
      return;
    }
    if (!continuous) {
      state.pending = null;
      if (state.open) state.open.releaseSinceMs = null;
    }
    state.lastValidMs = t;
    if (state.open) {
      const open = state.open;
      open.state = 'active';
      open.lastObservedMs = t;
      open.episode.peak = maxOrNull(open.episode.peak, value);
      addId(open.episode.attemptIds, attemptId);
      if (value <= rule.releaseDeg) {
        open.releaseSinceMs ??= t;
        // Resolved: the issue ended when the release run began.
        if (t - open.releaseSinceMs >= rule.releasePersistMs) closeOpen(state, 'resolved', open.releaseSinceMs, events);
      } else {
        open.releaseSinceMs = null;
      }
      return;
    }
    if (value > rule.onsetDeg) {
      state.pending ??= { sinceMs: t, peak: null, attemptIds: [] };
      state.pending.peak = maxOrNull(state.pending.peak, value);
      addId(state.pending.attemptIds, attemptId);
      if (t - state.pending.sinceMs >= rule.onsetPersistMs) {
        const episode = newEpisode(rule, state.pending.sinceMs, state.pending.peak, state.pending.attemptIds, analyzerVersion);
        state.open = { episode, state: 'active', lastObservedMs: t, releaseSinceMs: null };
        state.pending = null;
        events.push({ type: 'issue-started', episode: copy(episode) });
      }
    } else {
      state.pending = null;
    }
  }

  /**
   * Attach an ended analyzer attempt (completed rep or interrupted attempt) to every continuous
   * episode, open or closed, that overlaps [startMs, endMs] in time, and to pending onset evidence.
   */
  function attachAttempt(id, startMs, endMs) {
    if (typeof id !== 'string' || finite(startMs) === null || finite(endMs) === null) return;
    for (const episode of episodes) {
      if (!settings.rules[episode.type] || settings.rules[episode.type].kind !== 'persistent') continue;
      const episodeEnd = episode.endMs ?? Infinity;
      if (episode.startMs < endMs && episodeEnd > startMs) addId(episode.attemptIds, id);
    }
    for (const rule of persistentRules) {
      const { pending } = ruleState[rule.type];
      if (pending && pending.sinceMs < endMs) addId(pending.attemptIds, id);
    }
  }

  /** attachAttempt for every rep-completed / attempt-interrupted analyzer event in the list. */
  function attachEvents(analyzerEvents) {
    for (const event of Array.isArray(analyzerEvents) ? analyzerEvents : []) {
      if (event?.type === 'rep-completed') attachAttempt(event.id, event.rep?.startMs, event.rep?.endMs);
      if (event?.type === 'attempt-interrupted') attachAttempt(event.id, event.attempt?.startMs, event.attempt?.endMs);
    }
  }

  function activeIssues() {
    const active = [];
    for (const rule of persistentRules) {
      const open = ruleState[rule.type].open;
      if (!open) continue;
      const { episode } = open;
      active.push({ type: episode.type, episodeId: episode.id, startMs: episode.startMs, peak: episode.peak, unit: episode.unit,
        state: open.state, enabled: episode.enabled, validation: episode.validation });
    }
    return active;
  }

  function output(timestampMs, assessable, unavailableReason, events) {
    lastOutput = { timestampMs, assessable, unavailableReason, active: activeIssues(), events };
    return lastOutput;
  }

  function repeatLast() {
    return lastOutput ? { ...lastOutput, active: lastOutput.active.map((issue) => ({ ...issue })), events: [] } : output(null, false, null, []);
  }

  /**
   * Process one FeatureFrame together with the analyzer output produced from it.
   * Duplicate, out-of-order or missing timestamps are ignored (previous output, no events). After
   * end(), frames are ignored until reset().
   * @param {Object} frame FeatureFrame.
   * @param {AnalyzerOutput} analyzerOutput
   * @returns {IssueOutput}
   */
  function update(frame, analyzerOutput) {
    const t = finite(frame?.timestampMs);
    if (ended || t === null || (lastMs !== null && t <= lastMs)) return repeatLast();
    const previousMs = lastMs;
    startedMs ??= t;
    lastMs = t;
    const events = [];
    const gateReason = curlUnavailableReason(frame, analyzerOutput);
    const unavailableReason = lowFrameRate(t, gateReason === null) ? 'low-frame-rate' : gateReason;
    const assessable = unavailableReason === null;
    const attemptId = typeof analyzerOutput?.attempt?.id === 'string' ? analyzerOutput.attempt.id : null;
    const analyzerVersion = analyzerOutput?.configVersion ?? null;
    const frameContinuous = previousMs !== null && t - previousMs <= settings.maxEvidenceGapMs && openInterval?.endMs === previousMs;
    // Shared form coverage is conservative: every live measurement must be observed.
    // A valid elbow angle alone cannot turn absent torso/arm evidence into clean form.
    const formObserved = assessable && persistentRules.every((rule) => Number.isFinite(frame.values?.[rule.feature])
      && frame.validity?.[rule.feature] === true);
    trackInterval(t, formObserved, frameContinuous);

    for (const rule of persistentRules) {
      const magnitude = assessable && frame.validity?.[rule.feature] === true ? finite(frame.values?.[rule.feature]) : null;
      stepRule(rule, t, magnitude === null ? null : Math.abs(magnitude), attemptId, analyzerVersion, events);
    }

    attachEvents(analyzerOutput?.events);
    for (const event of analyzerOutput?.events ?? []) {
      if (event?.type !== 'attempt-interrupted') continue;
      const attempt = event.attempt ?? {};
      // incomplete-rom: evaluated once at the end of a committed attempt that ended 'partial'.
      const rom = finite(attempt.romDeg);
      const endMs = finite(attempt.endMs) ?? t;
      if (romRule && attempt.reason === romRule.trigger.reason && assessable && rom !== null) {
        const episode = newEpisode(romRule, endMs, rom, [event.id], analyzerVersion);
        episode.endMs = endMs;
        episode.endReason = 'evaluated-at-attempt-end';
        events.push({ type: 'issue-started', episode: copy(episode) });
        events.push({ type: 'issue-ended', episode: copy(episode) });
      }
    }
    return output(t, assessable, unavailableReason, events);
  }

  /**
   * Interrupt from outside the frame stream: the UI saw tracking loss or starts recalibration.
   * Open episodes end with 'tracking-lost' or 'recalibration' at their last assessable frame and all
   * onset/release evidence is discarded. Does not change update()'s timestamp ordering.
   * Pass the events of the matching analyzer.interrupt() output so the attempt it ended is attached
   * (by time overlap, as in update()) to the episodes before they close.
   * @param {'tracking-loss'|'recalibration'} reason
   * @param {number} [timestampMs] Output timestamp; the last processed one when not finite or earlier.
   * @param {Object[]} [analyzerEvents] RepEvents from analyzer.interrupt() (optional).
   * @returns {IssueOutput}
   */
  function interrupt(reason, timestampMs, analyzerEvents = []) {
    const endReason = INTERRUPT_END_REASONS[reason];
    if (!endReason) throw new Error(`Unsupported interrupt reason: ${reason}`);
    const events = [];
    attachEvents(analyzerEvents);
    endAllOpen(endReason, events);
    closeInterval();
    lastGateMs = null; frameIntervals = [];
    const given = finite(timestampMs);
    const at = given === null ? lastMs : lastMs === null ? given : Math.max(given, lastMs);
    return output(at, false, reason, events);
  }

  /**
   * End the set (Stop). Open episodes end 'set-ended' at their last assessable frame. Later frames
   * are ignored until reset().
   * @param {number} [timestampMs] Session end; the last processed timestamp when not finite or earlier.
   * @param {Object[]} [analyzerEvents] RepEvents from an analyzer.interrupt() made at Stop (optional);
   *   attached by time overlap before the episodes end 'set-ended'.
   * @returns {IssueOutput}
   */
  function end(timestampMs, analyzerEvents = []) {
    const events = [];
    if (!ended) {
      attachEvents(analyzerEvents);
      endAllOpen('set-ended', events);
      closeInterval();
      const given = finite(timestampMs);
      endedMs = given === null ? lastMs : lastMs === null ? given : Math.max(given, lastMs);
      ended = true;
    }
    return output(endedMs, false, null, events);
  }

  /**
   * Start a new session (new session UID, no episodes). Open episodes of the old session end 'reset';
   * their events are in the returned output.
   * @param {string} [reason]
   * @returns {IssueOutput & {resetReason: string}}
   */
  function reset(reason = 'reset') {
    const events = [];
    if (!ended) endAllOpen('reset', events);
    clearSession();
    const result = output(null, false, null, events);
    result.resetReason = String(reason);
    return result;
  }

  /** @returns {IssueSession} Copies; open episodes have endMs null and endReason null. */
  function getSession() {
    const all = openInterval ? [...intervals, openInterval] : intervals;
    return { sessionId: sessionUid, rulesVersion: settings.version, episodes: episodes.map(copy),
      assessableIntervals: all.map((interval) => ({ ...interval })), startedMs, lastMs, endedMs };
  }

  clearSession();
  return { config: settings, update, interrupt, end, reset, getSession };
}

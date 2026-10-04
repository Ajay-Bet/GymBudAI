/**
 * Feedback scheduler (Sprint 4). Pure JavaScript, independent of React.
 *
 * Turns the issue tracker's per-frame IssueOutput into one primary text cue, a tracking state and
 * controlled speech, following the "Agreed coaching contract" in docs/sprints/sprint-4-STATUS.md.
 * All timing uses the timestamps passed to update() (FeatureFrame.timestampMs clock), never frame
 * counts or the wall clock, so behaviour is the same at 15, 30 or 60 fps. Text cues never depend on
 * speech: with speech unavailable or muted every decision except speaking is identical.
 *
 * Policy summary:
 *  - Eligible issue: listed in config.priority and in the cue catalog, state 'active' (not
 *    'suspended'), and enabled === true in 'validated-only' mode (any rule in 'review' mode).
 *    Attempt-end issues (incomplete-rom) arrive as instant episodes in IssueOutput.events and stay
 *    eligible for attemptEndCueDisplayMs after the frame that reported them.
 *  - Primary cue: the highest-priority eligible issue (ties: earlier startMs, then episode ID). A
 *    shown cue is kept at least minCueDisplayMs (anti-flicker), even if its episode ends or a
 *    higher-priority issue appears. It is removed at once when its issue is suspended or no longer
 *    allowed by the mode, and on every non-assessable frame.
 *  - One cue ID and one cue-log entry per episode. A non-assessable frame withdraws the text; when
 *    the same episode becomes primary again its cue is reshown (same ID, log.reshownCount + 1,
 *    new sinceMs) and speech is not requested again.
 *  - Speech is decided once per cue, when it first becomes primary. A cue held back by a cooldown
 *    is shown as text only and is not retried. A browser speech error rolls back the cooldowns. Gates in order: speech unavailable,
 *    muted, per-issue cooldown, global cooldown (both measured from the last spoken cue's
 *    timestamp). If an utterance is still speaking the cue is queued (one slot; a newer primary cue
 *    replaces the queued one). A queued cue is dropped as 'stale' when its episode is no longer
 *    eligible or it is older than maxQueueAgeMs, and the gates are checked again before it speaks.
 *  - A non-assessable frame, setMuted(true), setMode(), stop() and reset() cancel current and
 *    queued speech. An utterance whose end event never arrives is cancelled after maxSpeechMs.
 *
 * @typedef {import('./speech.js').SpeechAdapter} SpeechAdapter
 *
 * @typedef {Object} Cue
 * @property {string} id Unique: cue-<sessionUid>-<n>.
 * @property {string} issueType
 * @property {string} episodeId
 * @property {string} text On-screen text.
 * @property {string} speechText Spoken text.
 * @property {string} validation Rule validation status copied from the issue ('unvalidated', ...).
 * @property {string|null} label 'unvalidated rule' unless validation === 'validated'.
 * @property {number} sinceMs Timestamp at which the cue (most recently) became primary.
 *
 * @typedef {Object} FeedbackState
 * @property {'validated-only'|'review'} mode
 * @property {'coaching'|'watching'|'unavailable'|'off'} status
 * @property {Cue|null} primaryCue
 * @property {{assessable: boolean, reason: string|null, text: string}} tracking reason is the
 *   tracker's unavailableReason, 'no-validated-rules' (assessable but no rule may cue in this mode),
 *   'stopped' after stop(), or null.
 * @property {string|null} spokenCueId Cue currently being spoken.
 * @property {boolean} cancelledSpeech True when speech was cancelled since the previous update.
 *
 * @typedef {Object} CueLogEntry
 * @property {string} cueId
 * @property {string} issueType
 * @property {string} episodeId
 * @property {string} validation
 * @property {'validated-only'|'review'} mode
 * @property {number} shownMs Timestamp the cue was first shown.
 * @property {number} reshownCount Times the same episode's cue was shown again after being withdrawn.
 * @property {number|null} spokenMs Timestamp speech started; null if it never started or the browser failed.
 * @property {null|'muted'|'cooldown-issue'|'cooldown-global'|'speech-unavailable'|'replaced'|'stale'|'cancelled'} suppressed
 *   With spokenMs !== null, 'cancelled' means the utterance started and was cut off.
 */
import { ATTEMPT_END_ISSUE_TYPES, FEEDBACK_CONFIG, UNVALIDATED_LABEL, getCueText, getTrackingText } from './cues.js';

export const FEEDBACK_MODES = Object.freeze(['validated-only', 'review']);

const TIME_KEYS = ['globalCooldownMs', 'perIssueCooldownMs', 'maxQueueAgeMs', 'minCueDisplayMs', 'attemptEndCueDisplayMs', 'maxSpeechMs'];

const NULL_SPEECH = Object.freeze({
  available: false,
  muted: false,
  prime: () => false,
  speak: () => false,
  cancel: () => {},
  setMuted: () => {},
  setVolume: () => {},
  volume: 0,
  speaking: () => false,
  onEnd: () => () => {},
});

function validateConfig(settings) {
  for (const key of TIME_KEYS) {
    if (!Number.isFinite(settings[key]) || settings[key] < 0) throw new Error(`Invalid feedback config: ${key}`);
  }
  const { priority } = settings;
  if (!Array.isArray(priority) || priority.length === 0 || new Set(priority).size !== priority.length
    || priority.some((type) => typeof type !== 'string')) {
    throw new Error('Invalid feedback config: priority must be a non-empty list of unique issue types');
  }
}

function validateMode(mode) {
  if (!FEEDBACK_MODES.includes(mode)) throw new Error(`Invalid feedback mode: ${mode}`);
  return mode;
}

function newSessionUid() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * Create a feedback scheduler.
 * @param {{config?: Object, speech?: SpeechAdapter|null, mode?: 'validated-only'|'review',
 *   enabledRuleTypes?: string[]}} [options]
 *   config: overrides merged onto FEEDBACK_CONFIG (validated). speech: adapter from
 *   createSpeechAdapter (omitted or null = text only). enabledRuleTypes: rule types enabled in the
 *   rule configuration (e.g. CURL_RULES_CONFIG); used only to report status 'off' with
 *   'no-validated-rules' in 'validated-only' mode. Eligibility itself always uses each issue's own
 *   `enabled` flag; an issue observed with enabled === true also counts as an enabled rule.
 */
export function createFeedbackScheduler({ config = {}, speech = null, mode = 'validated-only', enabledRuleTypes = [] } = {}) {
  const settings = Object.freeze({ ...FEEDBACK_CONFIG, ...config });
  validateConfig(settings);
  const voice = speech || NULL_SPEECH;
  const initialEnabledTypes = Array.isArray(enabledRuleTypes) ? enabledRuleTypes : [];

  let currentMode = validateMode(mode);
  let muted = false;
  let stopped, sessionUid, cueSeq, cueLog, episodeCues, primary, speakingEntry, queued, lastSpokenMs, lastSpokenByType,
    attemptEnd, seenAttemptEndIds, enabledTypes, lastTimestampMs, lastState, cancelledSincePrev;

  function clearSession() {
    stopped = false;
    sessionUid = newSessionUid();
    cueSeq = 0;
    cueLog = [];
    episodeCues = new Map(); // episodeId -> { cue, log }: one cue identity and log entry per episode
    primary = null; // { cue, log, holdUntilMs, enabled }
    speakingEntry = null; // { cueId, issueType, log, spokenMs, prevLastSpokenMs, prevTypeMs }
    queued = null; // { cue, log, enqueuedMs }
    lastSpokenMs = null;
    lastSpokenByType = new Map();
    attemptEnd = new Map(); // episodeId -> { type, episodeId, startMs, enabled, validation, receivedMs }
    seenAttemptEndIds = new Set();
    enabledTypes = new Set(initialEnabledTypes);
    lastTimestampMs = null;
    cancelledSincePrev = false;
    lastState = buildState(true, null);
  }

  voice.onEnd((info) => {
    if (!speakingEntry || !info || info.id !== speakingEntry.cueId) return;
    const entry = speakingEntry;
    const { log } = entry;
    speakingEntry = null;
    if (info.reason === 'error') {
      // The browser refused or failed (e.g. 'not-allowed' before prime()): nothing was heard, so
      // the cooldowns this cue consumed are rolled back (unless a later cue has spoken since).
      log.spokenMs = null;
      log.suppressed = 'speech-unavailable';
      if (lastSpokenMs === entry.spokenMs) lastSpokenMs = entry.prevLastSpokenMs;
      if (lastSpokenByType.get(entry.issueType) === entry.spokenMs) {
        if (entry.prevTypeMs === undefined) lastSpokenByType.delete(entry.issueType);
        else lastSpokenByType.set(entry.issueType, entry.prevTypeMs);
      }
    } else if (info.reason === 'cancelled' && log.suppressed === null) {
      log.suppressed = 'cancelled';
      cancelledSincePrev = true;
    }
  });

  const isMuted = () => muted || voice.muted === true;
  const priorityOf = (type) => settings.priority.indexOf(type);
  const modeAllows = (enabled) => currentMode === 'review' || enabled === true;
  const ruleCanCue = (type) => priorityOf(type) >= 0 && getCueText(type) !== null;

  function isSpeaking() {
    if (speakingEntry && !voice.speaking()) speakingEntry = null;
    return speakingEntry !== null;
  }

  /** Cancel current and queued speech; logs the reasons. */
  function cancelSpeech(queuedReason) {
    let cancelled = false;
    if (speakingEntry) {
      if (speakingEntry.log.suppressed === null) speakingEntry.log.suppressed = 'cancelled';
      speakingEntry = null; // cleared first so the adapter's end callback is ignored
      cancelled = true;
    }
    if (queued) {
      queued.log.suppressed = queuedReason;
      queued = null;
      cancelled = true;
    }
    if (cancelled) {
      voice.cancel();
      cancelledSincePrev = true;
    }
    return cancelled;
  }

  function speechGate(issueType, now) {
    if (!voice.available) return 'speech-unavailable';
    if (isMuted()) return 'muted';
    const lastOfType = lastSpokenByType.get(issueType);
    if (lastOfType !== undefined && now - lastOfType < settings.perIssueCooldownMs) return 'cooldown-issue';
    if (lastSpokenMs !== null && now - lastSpokenMs < settings.globalCooldownMs) return 'cooldown-global';
    return null;
  }

  function startSpeech(cue, log, now) {
    if (!voice.speak({ id: cue.id, text: cue.speechText })) {
      log.suppressed = 'speech-unavailable';
      return;
    }
    log.spokenMs = now;
    speakingEntry = {
      cueId: cue.id, issueType: cue.issueType, log, spokenMs: now,
      prevLastSpokenMs: lastSpokenMs, prevTypeMs: lastSpokenByType.get(cue.issueType),
    };
    lastSpokenMs = now;
    lastSpokenByType.set(cue.issueType, now);
  }

  function requestSpeech(cue, log, now) {
    const blocked = speechGate(cue.issueType, now);
    if (blocked) {
      log.suppressed = blocked;
      return;
    }
    if (isSpeaking()) {
      if (queued) queued.log.suppressed = 'replaced';
      queued = { cue, log, enqueuedMs: now };
      return;
    }
    startSpeech(cue, log, now);
  }

  /**
   * Show a candidate as the primary cue. An episode keeps one cue ID and one log entry: when it
   * becomes primary again (e.g. after a dropout frame withdrew it) the same cue is reshown with a
   * new sinceMs, log.reshownCount is incremented and speech is not requested again.
   */
  function showCue(candidate, now) {
    const known = episodeCues.get(candidate.episodeId);
    if (known) {
      known.log.reshownCount += 1;
      known.cue = Object.freeze({ ...known.cue, sinceMs: now });
      return { cue: known.cue, log: known.log, holdUntilMs: now + settings.minCueDisplayMs, enabled: candidate.enabled, isNew: false };
    }
    const texts = getCueText(candidate.type);
    cueSeq += 1;
    const validation = candidate.validation ?? 'unvalidated';
    const cue = Object.freeze({
      id: `cue-${sessionUid}-${cueSeq}`,
      issueType: candidate.type,
      episodeId: candidate.episodeId,
      text: texts.text,
      speechText: validation === 'experimental-model' ? `Experimental prediction. ${texts.speechText}` : texts.speechText,
      validation,
      label: validation === 'validated' ? null : validation === 'experimental-model' ? 'experimental rep-end model prediction' : UNVALIDATED_LABEL,
      sinceMs: now,
    });
    const log = {
      cueId: cue.id, issueType: cue.issueType, episodeId: cue.episodeId, validation, mode: currentMode,
      shownMs: now, spokenMs: null, suppressed: null, reshownCount: 0,
    };
    cueLog.push(log);
    episodeCues.set(cue.episodeId, { cue, log });
    return { cue, log, holdUntilMs: now + settings.minCueDisplayMs, enabled: candidate.enabled, isNew: true };
  }

  function noRulesInMode() {
    return currentMode === 'validated-only' && enabledTypes.size === 0;
  }

  function buildState(assessable, unavailableReason) {
    let status;
    let reason;
    if (stopped) {
      status = 'off';
      reason = 'stopped';
    } else if (!assessable) {
      status = 'unavailable';
      reason = unavailableReason;
    } else if (primary) {
      status = 'coaching';
      reason = null;
    } else if (noRulesInMode()) {
      status = 'off';
      reason = 'no-validated-rules';
    } else {
      status = 'watching';
      reason = null;
    }
    const state = Object.freeze({
      mode: currentMode,
      status,
      primaryCue: primary ? primary.cue : null,
      tracking: Object.freeze({ assessable: Boolean(assessable) && !stopped, reason, text: getTrackingText(reason) }),
      spokenCueId: speakingEntry ? speakingEntry.cueId : null,
      cancelledSpeech: cancelledSincePrev,
    });
    cancelledSincePrev = false;
    return state;
  }

  function ingestAttemptEndIssues(issueOutput, now) {
    const episodes = [];
    for (const event of Array.isArray(issueOutput.events) ? issueOutput.events : []) {
      if (event && event.episode) episodes.push(event.episode);
    }
    for (const issue of Array.isArray(issueOutput.active) ? issueOutput.active : []) {
      if (issue && ATTEMPT_END_ISSUE_TYPES.includes(issue.type)) episodes.push({ ...issue, id: issue.episodeId });
    }
    for (const episode of episodes) {
      const isAttemptEnd = ATTEMPT_END_ISSUE_TYPES.includes(episode.type) || episode.endReason === 'evaluated-at-attempt-end';
      if (!isAttemptEnd || typeof episode.id !== 'string' || seenAttemptEndIds.has(episode.id)) continue;
      seenAttemptEndIds.add(episode.id);
      attemptEnd.set(episode.id, {
        type: episode.type, episodeId: episode.id, startMs: episode.startMs, enabled: episode.enabled,
        validation: episode.validation, receivedMs: now,
      });
    }
    for (const [id, entry] of attemptEnd) {
      if (now - entry.receivedMs >= settings.attemptEndCueDisplayMs) attemptEnd.delete(id);
    }
  }

  function eligibleCandidates(active) {
    const candidates = [];
    const consider = (item) => {
      if (item.enabled === true) enabledTypes.add(item.type);
      if (modeAllows(item.enabled) && ruleCanCue(item.type)) candidates.push(item);
    };
    // Suspended issues still report whether their rule is enabled.
    for (const issue of active) if (issue && issue.enabled === true) enabledTypes.add(issue.type);
    for (const issue of active) {
      if (!issue || ATTEMPT_END_ISSUE_TYPES.includes(issue.type) || issue.state !== 'active') continue;
      consider({ type: issue.type, episodeId: issue.episodeId, startMs: issue.startMs, enabled: issue.enabled, validation: issue.validation });
    }
    for (const entry of attemptEnd.values()) consider(entry);
    candidates.sort((a, b) => priorityOf(a.type) - priorityOf(b.type)
      || (a.startMs ?? 0) - (b.startMs ?? 0)
      || String(a.episodeId).localeCompare(String(b.episodeId)));
    return candidates;
  }

  /**
   * Process one frame's issue output.
   * @param {{timestampMs: number, issueOutput: Object|null}} input
   * @returns {FeedbackState}
   */
  function update({ timestampMs, issueOutput } = {}) {
    if (stopped) return lastState;
    // Invalid or backwards timestamps are rejected (state unchanged), never substituted.
    if (!Number.isFinite(timestampMs) || (lastTimestampMs !== null && timestampMs < lastTimestampMs)) return lastState;
    const now = timestampMs;
    lastTimestampMs = now;

    // Watchdog: an utterance whose end event never arrived.
    if (isSpeaking() && now - speakingEntry.spokenMs > settings.maxSpeechMs) {
      speakingEntry.log.suppressed = 'cancelled';
      speakingEntry = null;
      voice.cancel();
      cancelledSincePrev = true;
    }

    if (!issueOutput || issueOutput.assessable !== true) {
      // Withhold form feedback and stop speech while the evidence is unreliable.
      cancelSpeech('cancelled');
      primary = null;
      attemptEnd.clear();
      const reason = issueOutput && typeof issueOutput.unavailableReason === 'string' ? issueOutput.unavailableReason : 'tracking-loss';
      lastState = buildState(false, reason);
      return lastState;
    }

    const active = Array.isArray(issueOutput.active) ? issueOutput.active : [];
    ingestAttemptEndIssues(issueOutput, now);
    const candidates = eligibleCandidates(active);
    const candidateIds = new Set(candidates.map((c) => c.episodeId));

    // Keep, release or drop the current primary cue.
    if (primary && !candidateIds.has(primary.cue.episodeId)) {
      const stillListed = active.some((issue) => issue && issue.episodeId === primary.cue.episodeId);
      const withdrawn = stillListed || !modeAllows(primary.enabled); // suspended or not allowed by mode
      if (withdrawn || now >= primary.holdUntilMs) primary = null;
    }
    const best = candidates[0] ?? null;
    let primaryChanged = false;
    if (best && (!primary || (best.episodeId !== primary.cue.episodeId && now >= primary.holdUntilMs))) {
      primary = showCue(best, now);
      primaryChanged = true;
    }

    // The queued cue must still be the shown cue, still eligible and fresh.
    if (queued) {
      if (!primary || primary.cue.id !== queued.cue.id) {
        // Replaced when a newer primary cue took over (it requests speech below); otherwise stale.
        queued.log.suppressed = primaryChanged ? 'replaced' : 'stale';
        queued = null;
      } else if (!candidateIds.has(queued.cue.episodeId) || now - queued.enqueuedMs > settings.maxQueueAgeMs) {
        queued.log.suppressed = 'stale';
        queued = null;
      }
    }

    if (primaryChanged && primary.isNew) requestSpeech(primary.cue, primary.log, now);

    if (queued && !isSpeaking()) {
      const next = queued;
      queued = null;
      const blocked = speechGate(next.cue.issueType, now);
      if (blocked) next.log.suppressed = blocked;
      else startSpeech(next.cue, next.log, now);
    }

    lastState = buildState(true, null);
    return lastState;
  }

  clearSession();

  return {
    config: settings,
    update,
    /** @returns {FeedbackState} The state returned by the last update (or the initial state). */
    getState: () => lastState,
    get mode() {
      return currentMode;
    },
    /** Switch mode; cancels speech and clears the primary cue (re-selected on the next update). */
    setMode(nextMode) {
      validateMode(nextMode);
      if (nextMode === currentMode) return;
      cancelSpeech('cancelled');
      currentMode = nextMode;
      primary = null;
    },
    get muted() {
      return isMuted();
    },
    /** Muting cancels current and queued speech; text cues are unaffected. */
    setMuted(value) {
      muted = Boolean(value);
      if (muted) cancelSpeech('muted');
      if (typeof voice.setMuted === 'function') voice.setMuted(muted);
    },
    /** Session end: cancels speech, clears the cue; update() reports status 'off' until reset(). */
    stop() {
      cancelSpeech('cancelled');
      voice.cancel();
      primary = null;
      attemptEnd.clear();
      stopped = true;
      lastState = buildState(false, null);
    },
    /** New session: cancels speech, clears cue log, cooldowns and IDs. Keeps mode and mute. */
    reset() {
      cancelSpeech('cancelled');
      voice.cancel();
      clearSession();
    },
    /** @returns {CueLogEntry[]} Copies of every cue shown this session, in order. */
    getCueLog: () => cueLog.map((entry) => ({ ...entry })),
  };
}

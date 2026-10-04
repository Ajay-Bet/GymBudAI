/**
 * Voice output (Sprint 4 extension, "Feedback wording and output"). Pure JavaScript, independent
 * of React. One audio channel for live cues and end-of-set narration, over two engines:
 *  - AI voice: audio from the backend TTS proxy (`fetchTts(text, purpose, { signal })` → Blob in
 *    frontend/src/api/coach.js), played through one HTMLAudioElement (injectable `createAudio`).
 *  - Browser voice: the Web Speech adapter from speech.js (createSpeechAdapter).
 *
 * Behaviour:
 *  - Output mode 'text' never calls speech or TTS (no audio, no network). 'audio-text' speaks.
 *  - A live cue plays cached AI audio when available; otherwise it speaks with the browser voice
 *    at once and fetches the AI audio in the background for the next time. Live cues never wait for
 *    the network. prefetchCues(texts) is called once at set start (bounded by maxPrefetch).
 *  - Narration waits until no live cue is playing, then tries AI audio with a 6 s timeout, then the
 *    browser voice, then text only (resolves { via: 'text' }).
 *  - One channel: starting anything cancels what was playing. stop()/cancel(), mute, a mode change
 *    and disabling the AI voice cancel both the audio element and browser speech, and any pending
 *    narration. The UI calls stop() on tracking loss handled by the scheduler, a hidden tab and
 *    unmount. Call speakNarration() after scheduler.stop(), because scheduler.stop() cancels.
 *  - Object URLs are created per playback and revoked when playback settles.
 *  - The AI audio cache is keyed by purpose + text and bounded (LRU, 32 entries by default).
 *  - `disclosure` is AI_VOICE_DISCLOSURE whenever the AI voice is active or has been used.
 *
 * Speech-adapter compatibility: the returned object also implements the SpeechAdapter interface
 * used by the scheduler (`available`, `speak({ id, text }) → boolean`, `cancel`, `setMuted`,
 * `muted`, `setVolume`, `volume`, `speaking`, `onEnd`, `prime`), so createFeedbackScheduler keeps
 * priority, cooldowns and queueing unchanged. In 'text' mode `muted` reads true, so the scheduler's
 * cue log records speech as 'muted' (the user chose text only), never as 'speech-unavailable'.
 *
 * Not tested in real browsers yet: autoplay of HTMLAudioElement (iOS needs a user gesture; a
 * rejected play() falls back to the browser voice), and audio/speech interplay.
 */

export const AI_VOICE_DISCLOSURE = 'Voice is AI-generated (OpenAI)';

export const VOICE_CONFIG = Object.freeze({
  narrationTimeoutMs: 6000, // AI narration audio must arrive within this, else browser voice
  prefetchTimeoutMs: 10000, // per background/prefetch request (backend TTS timeout is 10 s)
  narrationWaitMs: 10000, // longest wait for a live cue to finish before narration takes the channel
  maxPrefetch: 8, // texts per prefetchCues() call
  maxBackgroundFetches: 2, // concurrent background requests
  cacheEntries: 32,
  cacheBytes: 8 * 1024 * 1024,
  maxAudioMs: 30000,
  maxTtsChars: 300, // backend limit for /api/coach/tts text
});

const OUTPUT_MODES = ['text', 'audio-text'];
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Bounded LRU cache of AI audio blobs keyed by purpose + text.
 * @param {{maxEntries?: number}} [options]
 */
export function createTtsCache({ maxEntries = VOICE_CONFIG.cacheEntries, maxBytes = VOICE_CONFIG.cacheBytes } = {}) {
  const map = new Map();
  const limit = Math.max(1, Math.floor(maxEntries));
  const byteLimit = Math.max(1, maxBytes);
  const bytes = () => [...map.values()].reduce((n, blob) => n + (blob.size ?? 0), 0);
  const keyOf = (text, purpose) => `${purpose}\u0000${text}`;
  return {
    get(text, purpose) {
      const key = keyOf(text, purpose);
      if (!map.has(key)) return undefined;
      const value = map.get(key);
      map.delete(key);
      map.set(key, value);
      return value;
    },
    has: (text, purpose) => map.has(keyOf(text, purpose)),
    set(text, purpose, blob) {
      const key = keyOf(text, purpose);
      map.delete(key);
      if (!Number.isFinite(blob?.size) || blob.size <= 0 || blob.size > byteLimit) return;
      map.set(key, blob);
      while (map.size > limit || bytes() > byteLimit) map.delete(map.keys().next().value);
    },
    delete: (text, purpose) => map.delete(keyOf(text, purpose)),
    clear: () => map.clear(),
    get size() {
      return map.size;
    },
  };
}

function defaultCreateAudio() {
  return typeof globalThis.Audio === 'function' ? new globalThis.Audio() : null;
}

function resolveTts(aiTts) {
  if (typeof aiTts === 'function') return aiTts;
  if (aiTts && typeof aiTts.fetchTts === 'function') return (...args) => aiTts.fetchTts(...args);
  return null;
}

const isBlobLike = (value) => Boolean(value) && typeof value === 'object' && Number.isFinite(value.size) && value.size > 0;

/**
 * @param {Object} [options]
 * @param {'text'|'audio-text'} [options.outputMode='text']
 * @param {Object|null} [options.speech] Browser speech adapter (createSpeechAdapter).
 * @param {Function|{fetchTts: Function}|null} [options.aiTts] fetchTts(text, purpose, { signal }) → Promise<Blob>.
 * @param {ReturnType<typeof createTtsCache>} [options.cache] Shared across sets if the caller wants.
 * @param {boolean} [options.aiVoiceEnabled=false] AI voice opt-in (backend reports tts: true).
 * @param {() => HTMLAudioElement|null} [options.createAudio] Called once, lazily.
 * @param {{createObjectURL: Function, revokeObjectURL: Function}} [options.urls]
 * @param {{setTimeout: Function, clearTimeout: Function}} [options.timers]
 * @param {Object} [options.config] Overrides of VOICE_CONFIG.
 */
export function createVoice({
  outputMode = 'text',
  speech = null,
  aiTts = null,
  cache = createTtsCache(),
  aiVoiceEnabled = false,
  createAudio = defaultCreateAudio,
  urls = globalThis.URL,
  timers = globalThis,
  config = {},
} = {}) {
  if (!OUTPUT_MODES.includes(outputMode)) throw new Error(`Invalid output mode: ${outputMode}`);
  const settings = Object.freeze({ ...VOICE_CONFIG, ...config });
  const fetchTts = resolveTts(aiTts);
  const setTimer = (fn, ms) => timers.setTimeout(fn, ms);
  const clearTimer = (id) => {
    if (id !== null && id !== undefined) timers.clearTimeout(id);
  };

  let mode = outputMode;
  let aiEnabled = Boolean(aiVoiceEnabled);
  let muted = false;
  let volume = 1;
  let aiUsed = false;
  let disposed = false;
  let cancellationGeneration = 0;
  let audio; // undefined = not created yet; null = unavailable
  /** @type {null|{id: string, kind: 'cue'|'narration', text: string, via: 'ai'|'browser'|null, settled: boolean, url: string|null, onSettle: Function|null}} */
  let current = null;
  let idleWaiters = [];
  let narration = null; // { token, cancelled, controller, timer, finish }
  let narrationSeq = 0;
  const inflight = new Map(); // key -> { promise, controller }
  const listeners = new Set();

  function getAudio() {
    if (audio === undefined) {
      try {
        audio = createAudio ? createAudio() : null;
      } catch {
        audio = null;
      }
    }
    return audio || null;
  }

  const speechAvailable = () => Boolean(speech && speech.available);
  const audioMode = () => mode === 'audio-text';
  const canPlayAi = () => typeof urls?.createObjectURL === 'function' && getAudio() !== null;
  const aiActive = () => !disposed && audioMode() && aiEnabled && fetchTts !== null && canPlayAi();
  const audioAllowed = () => !disposed && audioMode() && !muted;

  function notify(info) {
    for (const callback of [...listeners]) {
      try {
        callback(info);
      } catch {
        // A failing listener must not break voice bookkeeping.
      }
    }
  }

  function flushIdle() {
    if (current) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  function detachAudio() {
    const element = audio;
    if (!element) return;
    element.onended = null;
    element.onerror = null;
    try {
      element.pause();
    } catch {
      // ignore
    }
    try {
      if (typeof element.removeAttribute === 'function') element.removeAttribute('src');
      else element.src = '';
    } catch {
      // ignore
    }
  }

  function revoke(entry) {
    if (!entry.url) return;
    try {
      urls.revokeObjectURL(entry.url);
    } catch {
      // ignore
    }
    entry.url = null;
  }

  function settle(entry, reason, error = null) {
    if (!entry || entry.settled) return;
    entry.settled = true;
    clearTimer(entry.timer);
    if (entry.via === 'ai') detachAudio();
    revoke(entry);
    if (current === entry) current = null;
    notify({ id: entry.id, reason, error, kind: entry.kind, via: entry.via });
    if (entry.onSettle) entry.onSettle({ via: entry.via, reason });
    flushIdle();
  }

  // Forward browser speech end events for the entry currently using the browser voice.
  const unsubscribeSpeech = speech && typeof speech.onEnd === 'function'
    ? speech.onEnd((info) => {
      const entry = current;
      if (entry && !entry.settled && entry.via === 'browser' && info && info.id === entry.id) {
        settle(entry, info.reason, info.error ?? null);
      }
    })
    : () => {};

  function cancelCurrent() {
    const entry = current;
    if (!entry) return false;
    const via = entry.via;
    settle(entry, 'cancelled'); // settle first so engine events from this entry are ignored
    if (via === 'browser' && speech) speech.cancel();
    return true;
  }

  /** Browser voice for an entry; true when speaking started. */
  function watchEntry(entry) {
    clearTimer(entry.timer);
    entry.timer = setTimer(() => {
      if (current !== entry || entry.settled) return;
      const via = entry.via;
      settle(entry, 'error', 'audio-timeout');
      if (via === 'browser') speech?.cancel();
    }, settings.maxAudioMs);
  }

  function speakBrowser(entry) {
    if (!speechAvailable() || muted) return false;
    entry.via = 'browser';
    current = entry;
    let ok = false;
    try {
      ok = speech.speak({ id: entry.id, text: entry.text }) === true;
    } catch {
      ok = false;
    }
    if (!ok && current === entry) current = null;
    if (ok && !entry.settled) watchEntry(entry);
    return ok;
  }

  /**
   * Play a blob through the audio element. Returns true when playback was requested. A rejected
   * play() (autoplay policy) falls back to the browser voice for the same entry, else settles 'error'.
   */
  function playAi(entry, blob) {
    const element = getAudio();
    if (!element) return false;
    let url;
    try {
      url = urls.createObjectURL(blob);
    } catch {
      return false;
    }
    entry.via = 'ai';
    entry.url = url;
    current = entry;
    aiUsed = true;
    element.onended = () => settle(entry, 'ended');
    element.onerror = () => {
      if (entry.settled || current !== entry) return;
      detachAudio(); revoke(entry); current = null;
      if (!speakBrowser(entry)) { current = entry; settle(entry, 'error', 'audio-error'); }
    };
    try {
      element.volume = volume;
      element.src = url;
      watchEntry(entry);
      const result = element.play();
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          if (entry.settled || current !== entry) return;
          detachAudio();
          revoke(entry);
          current = null;
          if (!speakBrowser(entry)) {
            current = entry;
            settle(entry, 'error', 'playback-failed');
          }
        });
      }
      return true;
    } catch {
      detachAudio();
      revoke(entry);
      if (current === entry) current = null;
      entry.via = null;
      return false;
    }
  }

  /** Fetch AI audio into the cache (deduplicated). Resolves to the blob or null. */
  function fetchIntoCache(text, purpose, timeoutMs, { background = false } = {}) {
    if (!aiActive() || typeof text !== 'string' || text.trim() === '' || text.length > settings.maxTtsChars) {
      return Promise.resolve(null);
    }
    const cached = cache.get(text, purpose);
    if (cached) return Promise.resolve(cached);
    const key = `${purpose}\u0000${text}`;
    if (inflight.has(key)) return inflight.get(key).promise;
    if (background && inflight.size >= settings.maxBackgroundFetches) return Promise.resolve(null);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    const timeout = new Promise((resolve) => {
      timer = setTimer(() => {
        if (controller) controller.abort();
        resolve(null);
      }, timeoutMs);
    });
    const request = Promise.resolve()
      .then(() => controller?.signal.aborted ? null : fetchTts(text, purpose, { signal: controller ? controller.signal : undefined }))
      .then((blob) => (isBlobLike(blob) ? blob : null), () => null);
    const aborted = new Promise((resolve) => {
      controller?.signal.addEventListener('abort', () => resolve(null), { once: true });
    });
    const promise = Promise.race([request, timeout, aborted]).then((blob) => {
      clearTimer(timer);
      if (inflight.get(key)?.controller === controller) inflight.delete(key);
      if (blob && !disposed && !(controller && controller.signal.aborted)) {
        cache.set(text, purpose, blob);
        return blob;
      }
      return null;
    });
    inflight.set(key, { promise, controller });
    return promise;
  }

  function abortFetches() {
    for (const { controller } of inflight.values()) if (controller) controller.abort();
    inflight.clear();
  }

  /** Live cue. Returns true when speech or audio started (SpeechAdapter.speak contract). */
  function speak({ id, text } = {}) {
    if (!audioAllowed() || typeof text !== 'string' || text.trim() === '') return false;
    cancelCurrent();
    const entry = { id: String(id), kind: 'cue', text, via: null, settled: false, url: null, onSettle: null };
    if (aiActive()) {
      const blob = cache.get(text, 'cue');
      if (blob && playAi(entry, blob)) return true;
      if (!blob) fetchIntoCache(text, 'cue', settings.prefetchTimeoutMs, { background: true });
    }
    return speakBrowser(entry);
  }

  function waitIdle(job) {
    if (!current) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimer(() => {
        idleWaiters = idleWaiters.filter((w) => w !== done);
        if (!job.cancelled) cancelCurrent();
        resolve();
      }, settings.narrationWaitMs);
      function done() {
        clearTimer(timer);
        resolve();
      }
      job.release = done;
      idleWaiters.push(done);
    });
  }

  function cancelNarration() {
    const job = narration;
    if (!job) return;
    narration = null;
    job.cancelled = true;
    if (job.controller) job.controller.abort();
    if (job.release) {
      idleWaiters = idleWaiters.filter((w) => w !== job.release);
      job.release();
    }
    if (current && current.kind === 'narration') cancelCurrent();
    job.finish({ via: 'text', reason: 'cancelled' });
  }

  function playNarrationEntry(entry, blob, finish) {
    entry.onSettle = (result) => finish(result);
    if (blob && playAi(entry, blob)) return true;
    return speakBrowser(entry);
  }

  /**
   * End-of-set narration. Resolves when it finishes or is cancelled:
   * { via: 'ai'|'browser'|'text', reason: 'ended'|'cancelled'|'error'|'text-only'|'unavailable' }.
   * @param {string} text
   */
  function speakNarration(text) {
    cancelNarration();
    if (!audioAllowed() || typeof text !== 'string' || text.trim() === '') {
      return Promise.resolve({ via: 'text', reason: 'text-only' });
    }
    narrationSeq += 1;
    let resolveResult;
    const resultPromise = new Promise((resolve) => {
      resolveResult = resolve;
    });
    const job = {
      token: narrationSeq, cancelled: false, controller: null, release: null, done: false,
      finish(result) {
        if (job.done) return;
        job.done = true;
        if (narration === job) narration = null;
        resolveResult(result);
      },
    };
    narration = job;

    (async () => {
      await waitIdle(job);
      if (job.cancelled) return;
      let blob = null;
      if (aiActive() && text.length <= settings.maxTtsChars) {
        blob = cache.get(text, 'narration') ?? null;
        if (!blob) {
          blob = await fetchIntoCache(text, 'narration', settings.narrationTimeoutMs);
          if (job.cancelled) return;
        }
      }
      // A cue may have started while the audio was being fetched: narration still goes after it.
      await waitIdle(job);
      if (job.cancelled || !audioAllowed()) {
        job.finish({ via: 'text', reason: job.cancelled ? 'cancelled' : 'text-only' });
        return;
      }
      const entry = { id: `narration-${job.token}`, kind: 'narration', text, via: null, settled: false, url: null, onSettle: null };
      if (!playNarrationEntry(entry, blob, (result) => job.finish(result))) {
        job.finish({ via: 'text', reason: 'unavailable' });
      }
    })();
    return resultPromise;
  }

  /** Fetch AI audio for live cue texts (call once at set start). Resolves to the number cached. */
  async function prefetchCues(texts) {
    if (!audioAllowed() || !aiActive() || !Array.isArray(texts)) return 0;
    const generation = cancellationGeneration;
    const unique = [...new Set(texts.filter((t) => typeof t === 'string' && t.trim() !== ''))].slice(0, settings.maxPrefetch);
    let cached = 0;
    for (const text of unique) {
      if (!audioAllowed() || !aiActive() || generation !== cancellationGeneration) break;
      const blob = await fetchIntoCache(text, 'cue', settings.prefetchTimeoutMs);
      if (blob) cached += 1;
    }
    return cached;
  }

  function cancel() {
    cancellationGeneration += 1;
    cancelNarration();
    cancelCurrent();
    abortFetches();
    if (speech && speechAvailable()) speech.cancel();
    if (audio) detachAudio();
  }

  return {
    // SpeechAdapter-compatible surface (used by the scheduler).
    get available() {
      return speechAvailable() || aiActive();
    },
    prime() {
      if (!speech || typeof speech.prime !== 'function') return false;
      return speech.prime();
    },
    speak,
    cancel,
    setMuted(value) {
      muted = Boolean(value);
      if (speech && typeof speech.setMuted === 'function') speech.setMuted(muted);
      if (muted) cancel();
    },
    /** True when muted or in 'text' mode (no audio either way). */
    get muted() {
      return muted || !audioMode();
    },
    setVolume(value) {
      if (!Number.isFinite(value)) return;
      volume = clamp01(value);
      if (speech && typeof speech.setVolume === 'function') speech.setVolume(volume);
      if (audio) {
        try {
          audio.volume = volume;
        } catch {
          // ignore
        }
      }
    },
    get volume() {
      return volume;
    },
    speaking() {
      return current !== null;
    },
    onEnd(callback) {
      if (typeof callback !== 'function') return () => {};
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    // Voice API.
    speakCue(cue) {
      return speak({ id: cue?.id, text: cue?.speechText ?? cue?.text });
    },
    speakNarration,
    prefetchCues,
    /** Cancel everything: current audio/speech and pending narration. */
    stop: cancel,
    setOutputMode(next) {
      if (!OUTPUT_MODES.includes(next)) throw new Error(`Invalid output mode: ${next}`);
      if (next === mode) return;
      cancel();
      mode = next;
      if (mode === 'text') abortFetches();
    },
    get outputMode() {
      return mode;
    },
    setAiVoiceEnabled(value) {
      const next = Boolean(value);
      if (next === aiEnabled) return;
      cancel();
      aiEnabled = next;
      if (!aiEnabled) abortFetches();
    },
    get aiVoiceEnabled() {
      return aiEnabled;
    },
    /** AI_VOICE_DISCLOSURE while the AI voice is active or after it has been used; else null. */
    get disclosure() {
      return aiActive() || aiUsed ? AI_VOICE_DISCLOSURE : null;
    },
    get aiAudioUsed() {
      return aiUsed;
    },
    get narrating() {
      return narration !== null;
    },
    /** Cancel everything, abort fetches, unsubscribe from the speech adapter. */
    dispose() {
      cancel();
      abortFetches();
      disposed = true;
      unsubscribeSpeech();
      listeners.clear();
    },
  };
}

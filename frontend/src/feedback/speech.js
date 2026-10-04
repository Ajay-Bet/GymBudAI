/**
 * Speech adapter over the Web Speech API (Sprint 4). Pure JavaScript, independent of React.
 * Safe without speechSynthesis (SSR, Node tests, unsupported browsers): it reports
 * available === false, speak() returns false and every other method is a no-op.
 * Text cues never depend on this adapter.
 *
 * Browser behaviour handled here:
 *  - Autoplay rules: some browsers (notably iOS Safari) only allow speech after a user gesture;
 *    prime() speaks a silent utterance and must be called from that gesture (e.g. Start camera).
 *  - synthesis.cancel() fires onend or onerror ('canceled' / 'interrupted') on the cancelled
 *    utterance, synchronously or later depending on the browser, or not at all. Each utterance is
 *    settled exactly once: cancel() settles it itself with reason 'cancelled', and any later
 *    event from that utterance is ignored.
 *  - A newer speak() cancels any utterance still in the browser queue, so the browser can never
 *    hold a backlog of outdated corrections.
 *
 * @typedef {Object} SpeechEndInfo
 * @property {string} id Cue ID passed to speak().
 * @property {'ended'|'cancelled'|'error'} reason
 * @property {string|null} error SpeechSynthesisErrorEvent.error for reason 'error', else null.
 *
 * @typedef {Object} SpeechAdapter
 * @property {boolean} available
 * @property {() => boolean} prime Call from a user gesture; true when a priming utterance was issued.
 * @property {(cue: {id: string, text: string}) => boolean} speak False when unavailable, muted,
 *   given empty text, or the browser threw.
 * @property {() => void} cancel Cancels current and browser-queued speech.
 * @property {(muted: boolean) => void} setMuted Muting cancels current speech.
 * @property {boolean} muted
 * @property {(volume: number) => void} setVolume Clamped to 0..1; non-finite values are ignored.
 *   Applies to the next utterance (the Web Speech API cannot change a running utterance).
 * @property {number} volume
 * @property {() => boolean} speaking True while an utterance started by speak() is unsettled.
 * @property {(callback: (info: SpeechEndInfo) => void) => () => void} onEnd Returns an unsubscribe function.
 */

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * @param {{synthesis?: Object|null, Utterance?: Function|null}} [options]
 * @returns {SpeechAdapter}
 */
export function createSpeechAdapter({
  synthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
} = {}) {
  const available = Boolean(synthesis)
    && typeof synthesis.speak === 'function'
    && typeof synthesis.cancel === 'function'
    && typeof Utterance === 'function';

  let muted = false;
  let volume = 1;
  /** @type {{id: string, utterance: Object, settled: boolean}|null} */
  let current = null;
  const listeners = new Set();

  function notify(info) {
    for (const callback of [...listeners]) {
      try {
        callback(info);
      } catch {
        // A failing listener must not break speech bookkeeping.
      }
    }
  }

  function settle(entry, reason, error = null) {
    if (!entry || entry.settled) return;
    entry.settled = true;
    if (current === entry) current = null;
    notify({ id: entry.id, reason, error });
  }

  function cancel() {
    if (!available) return;
    const entry = current;
    current = null;
    // Settle first so the event fired by synthesis.cancel() on this utterance is ignored.
    settle(entry, 'cancelled');
    try {
      synthesis.cancel();
    } catch {
      // Nothing further to cancel.
    }
  }

  function prime() {
    if (!available) return false;
    try {
      const utterance = new Utterance(' ');
      utterance.volume = 0;
      synthesis.speak(utterance);
      if (typeof synthesis.resume === 'function') synthesis.resume();
      return true;
    } catch {
      return false;
    }
  }

  function speak({ id, text } = {}) {
    if (!available || muted || typeof text !== 'string' || text.trim() === '') return false;
    if (current || synthesis.speaking || synthesis.pending) cancel();
    let entry;
    try {
      const utterance = new Utterance(text);
      utterance.volume = volume;
      // Holding the utterance in `current` also keeps it from being garbage collected before its
      // end event (a known cause of missing onend in Chromium).
      entry = { id: String(id), utterance, settled: false };
      utterance.onend = () => settle(entry, 'ended');
      utterance.onerror = (event) => {
        const error = event && typeof event.error === 'string' ? event.error : 'unknown';
        settle(entry, error === 'canceled' || error === 'interrupted' ? 'cancelled' : 'error', error);
      };
      current = entry;
      synthesis.speak(utterance);
      return true;
    } catch {
      if (entry) {
        entry.settled = true;
        if (current === entry) current = null;
      }
      return false;
    }
  }

  return {
    available,
    prime,
    speak,
    cancel,
    setMuted(value) {
      muted = Boolean(value);
      if (muted) cancel();
    },
    get muted() {
      return muted;
    },
    setVolume(value) {
      if (Number.isFinite(value)) volume = clamp01(value);
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
  };
}

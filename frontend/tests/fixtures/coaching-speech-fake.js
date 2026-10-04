// Sprint 4 fake Web Speech API (speechSynthesis + SpeechSynthesisUtterance) for node tests.
// It models the browser queue: speak() appends, the head utterance is "speaking" until the test
// calls finish(); cancel() empties the queue and fires each utterance's end (Safari) or error
// 'canceled' (Chrome) event synchronously. It proves scheduling logic only, not real audio,
// voices, autoplay policy or user-gesture behaviour of any browser.

export class FakeUtterance {
  constructor(text = '') {
    this.text = text;
    this.volume = 1;
    this.rate = 1;
    this.pitch = 1;
    this.lang = '';
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
    this.listeners = {};
  }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }
}

function fire(utterance, type, extra = {}) {
  const event = { type, utterance, target: utterance, elapsedTime: 0, ...extra };
  utterance[`on${type}`]?.(event);
  for (const fn of utterance.listeners[type] ?? []) fn(event);
}

/**
 * @param {{ cancelEvent?: 'end'|'error'|'none' }} options which event cancel() fires per utterance.
 */
export function createFakeSynthesis({ cancelEvent = 'end' } = {}) {
  let queue = [];
  const log = [];
  let maxOutstanding = 0;
  const synth = {
    paused: false,
    get speaking() { return queue.length > 0; },
    get pending() { return queue.length > 1; },
    speak(utterance) {
      queue.push(utterance);
      maxOutstanding = Math.max(maxOutstanding, queue.length);
      log.push({ type: 'speak', text: utterance.text, volume: utterance.volume, utterance });
      if (queue.length === 1) fire(utterance, 'start');
    },
    cancel() {
      const cancelled = queue;
      queue = [];
      log.push({ type: 'cancel', count: cancelled.length });
      for (const u of cancelled) {
        if (cancelEvent === 'end') fire(u, 'end');
        else if (cancelEvent === 'error') fire(u, 'error', { error: 'canceled' });
      }
    },
    pause() { this.paused = true; },
    resume() { this.paused = false; log.push({ type: 'resume' }); },
    getVoices() { return []; },
    addEventListener() {},
    removeEventListener() {},
    // Test controls.
    finish() {
      const u = queue.shift();
      if (!u) return null;
      fire(u, 'end');
      if (queue[0]) fire(queue[0], 'start');
      return u;
    },
    get outstanding() { return queue.length; },
    get maxOutstanding() { return maxOutstanding; },
    get log() { return log; },
    spoken() { return log.filter((e) => e.type === 'speak' && e.text && e.text.trim() !== '' && e.volume !== 0); },
    cancels() { return log.filter((e) => e.type === 'cancel').length; },
  };
  return synth;
}

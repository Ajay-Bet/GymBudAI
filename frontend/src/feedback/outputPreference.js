/**
 * Output preference (Sprint 4 extension): 'text' (default, no audio until the user opts in) or
 * 'audio-text' (spoken cues and narration plus the same text). Stored per browser in localStorage;
 * every access is wrapped in try/catch because storage can be missing, blocked or throw (private
 * windows, cleared site data). Without storage the default is used and nothing breaks.
 */

export const OUTPUT_MODES = Object.freeze(['text', 'audio-text']);
export const DEFAULT_OUTPUT_MODE = 'text';
export const OUTPUT_MODE_STORAGE_KEY = 'gymbud.outputMode';

export const isOutputMode = (mode) => OUTPUT_MODES.includes(mode);

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {{storage?: Storage|null}} [options] Injectable for tests.
 * @returns {'text'|'audio-text'}
 */
export function loadOutputMode({ storage = defaultStorage() } = {}) {
  try {
    const value = storage?.getItem(OUTPUT_MODE_STORAGE_KEY);
    return isOutputMode(value) ? value : DEFAULT_OUTPUT_MODE;
  } catch {
    return DEFAULT_OUTPUT_MODE;
  }
}

/**
 * @param {'text'|'audio-text'} mode
 * @param {{storage?: Storage|null}} [options]
 * @returns {boolean} true when stored.
 */
export function saveOutputMode(mode, { storage = defaultStorage() } = {}) {
  if (!isOutputMode(mode)) throw new Error(`Invalid output mode: ${mode}`);
  try {
    if (!storage) return false;
    storage.setItem(OUTPUT_MODE_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

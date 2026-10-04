/** Same-origin optional coaching transport. Sends text or numeric findings, never frames. */
async function request(path, body, { signal, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  let rejectAbort;
  const cancelled = new Promise((_, reject) => { rejectAbort = reject; });
  const abort = () => {
    controller.abort();
    rejectAbort(new DOMException('Coaching request cancelled', 'AbortError'));
  };
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    if (signal?.aborted) { abort(); return await cancelled; }
    const read = async () => {
      const response = await fetch(`/api/coach/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`coach-${response.status}`);
      if (path === 'tts') {
        if (!response.headers.get('content-type')?.startsWith('audio/mpeg')) throw new Error('coach-invalid-audio');
        const blob = await response.blob();
        if (!blob.size || blob.size > 5 * 1024 * 1024) throw new Error('coach-invalid-audio');
        return blob;
      }
      return await response.json();
    };
    return await Promise.race([read(), cancelled]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
export async function getCoachStatus(options = {}) {
  const status = await request('status', undefined, { timeoutMs: 3000, ...options });
  if (typeof status.tts !== 'boolean' || typeof status.wording !== 'boolean') throw new Error('coach-invalid-status');
  return status;
}
export function fetchTts(text, purpose, options = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 300 || !['cue', 'narration'].includes(purpose)) return Promise.reject(new Error('coach-invalid-request'));
  return request('tts', { text, purpose }, { timeoutMs: 11000, ...options });
}
export function fetchWording(facts, options = {}) {
  return request('wording', facts, { timeoutMs: 9000, ...options });
}

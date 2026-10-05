/**
 * Same-origin JSON transport for the FastAPI backend (Sprint 5). Development requests reach FastAPI
 * through the Vite proxy. Tokens travel only in the Authorization header, never in URLs or logs.
 */

/** Error thrown by apiRequest. `retryable` is true for network errors, timeouts, 5xx and 429. */
export class ApiError extends Error {
  constructor({ status = 0, code = 'http-error', message = 'Request failed.', retryable = false, detail = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.detail = detail;
  }
}

let unauthorizedHandler = null;

/**
 * Register one handler called with the token when a request that carried a token gets 401.
 * Used by AuthProvider to sign out locally. Returns a function that removes the handler.
 */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
  return () => { if (unauthorizedHandler === handler) unauthorizedHandler = null; };
}

const isRetryableStatus = (status) => status >= 500 || status === 429;

function errorFromResponse(status, body) {
  const detail = body?.detail;
  if (detail && typeof detail === 'object' && !Array.isArray(detail) && typeof detail.code === 'string') {
    return new ApiError({ status, code: detail.code, message: detail.message || `Request failed (HTTP ${status}).`,
      retryable: isRetryableStatus(status), detail });
  }
  if (status === 422) {
    const first = Array.isArray(detail) ? detail[0] : null;
    const where = Array.isArray(first?.loc) ? first.loc.join('.') : null;
    return new ApiError({ status, code: 'validation-error',
      message: first?.msg ? `Invalid data${where ? ` (${where})` : ''}: ${first.msg}` : 'The server rejected the data.',
      retryable: false, detail });
  }
  return new ApiError({ status, code: `http-${status}`, message: `Request failed (HTTP ${status}).`,
    retryable: isRetryableStatus(status), detail: detail ?? null });
}

/**
 * Send a JSON request.
 * @param {string} path Same-origin path starting with /api/.
 * @param {Object} [options]
 * @param {string} [options.method] Default GET, or POST when a body is given.
 * @param {*} [options.body] Serialized as JSON.
 * @param {string|null} [options.token] Bearer token.
 * @param {AbortSignal} [options.signal] Caller cancellation (ApiError code 'aborted').
 * @param {number} [options.timeoutMs] Default 10000 (ApiError code 'timeout').
 * @param {typeof fetch} [options.fetchImpl] Injectable fetch for tests.
 * @returns {Promise<*>} Parsed JSON, or null for an empty response.
 */
export async function apiRequest(path, { method, body, token = null, signal, timeoutMs = 10000, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  let reason = null;
  let rejectStop;
  const stopped = new Promise((_, reject) => { rejectStop = reject; });
  stopped.catch(() => {});
  const stop = (why) => {
    if (reason) return;
    reason = why;
    controller.abort();
    rejectStop(why === 'timeout'
      ? new ApiError({ code: 'timeout', message: `The server did not respond within ${Math.round(timeoutMs / 1000)} s.`, retryable: true })
      : new ApiError({ code: 'aborted', message: 'Request cancelled.', retryable: false }));
  };
  const onAbort = () => stop('aborted');
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => stop('timeout'), timeoutMs);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const run = async () => {
    let response;
    try {
      response = await doFetch(path, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      if (reason) return stopped;
      throw new ApiError({ code: 'network-error', message: 'Could not reach the server. Check your connection.', retryable: true });
    }
    let text = '';
    try {
      text = await response.text();
    } catch {
      if (reason) return stopped;
      throw new ApiError({ status: response.status, code: 'network-error', message: 'The response was interrupted.', retryable: true });
    }
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = null; }
    }
    if (!response.ok) {
      const error = errorFromResponse(response.status, parsed);
      if (response.status === 401 && token && unauthorizedHandler) {
        try { unauthorizedHandler(token); } catch { /* handler errors must not hide the API error */ }
      }
      throw error;
    }
    if (text && parsed === null) {
      throw new ApiError({ status: response.status, code: 'invalid-response', message: 'The server sent an unreadable response.', retryable: false });
    }
    return parsed;
  };

  try {
    if (signal?.aborted) stop('aborted');
    return await Promise.race([run(), stopped]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Session identifiers for exercise analyzers and issue trackers (Sprint 4). Pure JavaScript,
 * independent of React.
 *
 * A session UID is generated for every analyzer/tracker instance and every reset, so IDs built
 * from it (`curl-<sessionUid>-<n>`, `issue-<sessionUid>-<n>`) are unique across page reloads, not
 * only within one page lifetime. Sprint 5 persistence relies on these client-generated IDs.
 */

// Distinguishes fallback UIDs generated within the same millisecond on one page.
let fallbackCounter = 0;

/**
 * New session UID: crypto.randomUUID() where available (secure contexts, Node >= 19); otherwise a
 * fallback of time, random digits and a page-wide counter (unique within the page, very unlikely to
 * repeat across reloads, but not a UUID).
 * @returns {string}
 */
export function createSessionUid() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  fallbackCounter += 1;
  const random = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `${Date.now().toString(36)}-${random}-${fallbackCounter.toString(36)}`;
}

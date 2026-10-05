/**
 * Return `next` when it is a same-site relative path ("/history", "/history/abc?x=1"), else `fallback`.
 * Rejects absolute URLs, protocol-relative ("//host") and backslash tricks ("/\\host").
 */
export function safeNextPath(next, fallback = '/history') {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || /[\\\s]/.test(next)) return fallback;
  try {
    const base = 'http://gymbud.invalid';
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

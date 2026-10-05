// Sprint 5 independent validation (s5-validation): frontend/src/api/http.js, api/auth.js and
// api/workouts.js transport against the "Agreed persistence contract". fetch is faked; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, ApiError, setUnauthorizedHandler } from '../src/api/http.js';
import * as auth from '../src/api/auth.js';
import * as workouts from '../src/api/workouts.js';
import { safeNextPath } from '../src/auth/nextPath.js';

function mockFetch(t, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return fn(url, init); };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}
const json = (status, body) => new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('register/login/logout/me use same-origin paths, JSON bodies and Bearer only in the header', async (t) => {
  const token = 'tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  const calls = mockFetch(t, async (url) => (url === '/api/auth/logout' ? new Response(null, { status: 204 })
    : json(url.endsWith('register') ? 201 : 200, { accessToken: token, tokenType: 'bearer', expiresAt: '2026-10-11T00:00:00Z', user: { id: 'u' } })));
  await auth.register('a@example.com', 'correct-horse-battery', '  Ajay  ');
  await auth.register('b@example.com', 'correct-horse-battery', '   ');
  await auth.login('a@example.com', 'correct-horse-battery');
  assert.equal(await auth.logout(token), null);
  await auth.me(token);
  assert.deepEqual(calls.map((c) => [c.url, c.init.method]), [['/api/auth/register', 'POST'], ['/api/auth/register', 'POST'],
    ['/api/auth/login', 'POST'], ['/api/auth/logout', 'POST'], ['/api/users/me', 'GET']]);
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: 'a@example.com', password: 'correct-horse-battery', displayName: 'Ajay' });
  assert.deepEqual(JSON.parse(calls[1].init.body), { email: 'b@example.com', password: 'correct-horse-battery' }, 'blank displayName omitted');
  assert.equal(calls[0].init.headers.Authorization, undefined, 'no token on register');
  assert.equal(calls[3].init.headers.Authorization, `Bearer ${token}`);
  assert.equal(calls[4].init.headers.Authorization, `Bearer ${token}`);
  for (const c of calls) {
    assert.ok(!c.url.includes(token) && !c.url.includes('password'), 'secrets never in URLs');
    assert.ok(c.url.startsWith('/api/'), 'same-origin');
  }
});

test('workout calls: paths, methods, bodies, encoded ids, list query', async (t) => {
  const calls = mockFetch(t, async () => json(200, { ok: true }));
  await workouts.createWorkout({ clientSessionId: 'workout-1' }, 't');
  await workouts.submitSet('w/1?x', { clientSetId: 's' }, 't');
  await workouts.finalizeWorkout('w1', new Date('2026-10-01T12:00:00Z'), 't');
  await workouts.finalizeWorkout('w1', '2026-10-01T12:00:00Z', 't');
  await workouts.listWorkouts({ limit: 5, before: '2026-10-01T12:00:00+00:00' }, 't');
  await workouts.listWorkouts(undefined, 't');
  await workouts.getWorkout('w1', 't');
  await workouts.updateWorkoutNotes('w1', 'felt good', 't');
  assert.deepEqual(calls.map((c) => [c.init.method, c.url]), [
    ['POST', '/api/workouts'], ['POST', '/api/workouts/w%2F1%3Fx/sets'], ['POST', '/api/workouts/w1/finalize'], ['POST', '/api/workouts/w1/finalize'],
    ['GET', '/api/workouts?limit=5&before=2026-10-01T12%3A00%3A00%2B00%3A00'], ['GET', '/api/workouts?limit=20'],
    ['GET', '/api/workouts/w1'], ['PATCH', '/api/workouts/w1']]);
  assert.deepEqual(JSON.parse(calls[2].init.body), { endedAt: '2026-10-01T12:00:00.000Z' });
  assert.deepEqual(JSON.parse(calls[7].init.body), { notes: 'felt good' });
  assert.ok(calls.every((c) => c.init.headers.Authorization === 'Bearer t'));
});

test('error mapping: {detail:{code,message}}, FastAPI 422 list, 413, 5xx/429 retryable, others not', async (t) => {
  const responses = [
    [json(401, { detail: { code: 'invalid-credentials', message: 'Email or password is incorrect.' } }), 'invalid-credentials', false],
    [json(409, { detail: { code: 'conflict', message: 'c' } }), 'conflict', false],
    [json(404, { detail: { code: 'not-found', message: 'Workout not found.' } }), 'not-found', false],
    [json(422, { detail: [{ type: 'value_error', loc: ['body', 'summary'], msg: 'Value error, summary.side: bad' }] }), 'validation-error', false],
    [json(413, { detail: { code: 'request-too-large', message: 'Request body exceeds 524288 bytes.' } }), 'request-too-large', false],
    [json(503, { detail: { code: 'database-unavailable', message: 'Saved workouts are temporarily unavailable. Try again.' } }), 'database-unavailable', true],
    [json(429, { detail: { code: 'rate-limited', message: 'Too many sign-in attempts.' } }), 'rate-limited', true],
    [new Response('<html>Bad gateway</html>', { status: 502 }), 'http-502', true],
    [json(400, { detail: 'Bad' }), 'http-400', false],
  ];
  for (const [response, code, retryable] of responses) {
    mockFetch(t, async () => response);
    const error = await apiRequest('/api/x').then(() => null, (e) => e);
    assert.ok(error instanceof ApiError, code);
    assert.equal(error.code, code);
    assert.equal(error.retryable, retryable, code);
    assert.equal(error.status, response.status);
    assert.ok(error.message.length > 0);
    assert.ok(!error.message.includes('<html>'), 'raw HTML is not shown to users');
  }
  mockFetch(t, async () => json(422, { detail: [{ loc: ['body', 'password'], msg: 'String should have at least 10 characters' }] }));
  const e = await apiRequest('/api/x', { body: {} }).catch((x) => x);
  assert.match(e.message, /body\.password/);
});

test('network failure and timeout are retryable; caller abort is not; unreadable 200 is invalid-response', async (t) => {
  mockFetch(t, async () => { throw new TypeError('Failed to fetch'); });
  let error = await apiRequest('/api/x').catch((x) => x);
  assert.equal(error.code, 'network-error');
  assert.equal(error.retryable, true);

  mockFetch(t, (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  error = await apiRequest('/api/x', { timeoutMs: 20 }).catch((x) => x);
  assert.equal(error.code, 'timeout');
  assert.equal(error.retryable, true);

  const controller = new AbortController();
  const pending = apiRequest('/api/x', { signal: controller.signal, timeoutMs: 5000 }).catch((x) => x);
  controller.abort();
  error = await pending;
  assert.equal(error.code, 'aborted');
  assert.equal(error.retryable, false);

  const already = new AbortController();
  already.abort();
  assert.equal((await apiRequest('/api/x', { signal: already.signal }).catch((x) => x)).code, 'aborted');

  mockFetch(t, async () => new Response('not json', { status: 200 }));
  assert.equal((await apiRequest('/api/x').catch((x) => x)).code, 'invalid-response');
  mockFetch(t, async () => new Response(null, { status: 204 }));
  assert.equal(await apiRequest('/api/x', { method: 'POST' }), null);
});

test('a 401 on a request that carried a token calls the unauthorized handler with that token only', async (t) => {
  const seen = [];
  const remove = setUnauthorizedHandler((token) => seen.push(token));
  t.after(remove);
  mockFetch(t, async () => json(401, { detail: { code: 'session-expired', message: 'Your session has expired.' } }));
  await apiRequest('/api/workouts', { token: 'tok-1' }).catch(() => {});
  await apiRequest('/api/auth/login', { body: { email: 'a', password: 'b' } }).catch(() => {}); // no token: wrong password is not a sign-out
  assert.deepEqual(seen, ['tok-1']);
  // A throwing handler does not hide the API error.
  setUnauthorizedHandler(() => { throw new Error('handler'); });
  const error = await apiRequest('/api/workouts', { token: 'x' }).catch((x) => x);
  assert.equal(error.code, 'session-expired');
  setUnauthorizedHandler(null);
  mockFetch(t, async () => json(403, { detail: { code: 'forbidden', message: 'no' } }));
  await apiRequest('/api/workouts', { token: 'tok-2' }).catch(() => {});
  assert.deepEqual(seen, ['tok-1']);
});

test('safeNextPath allows same-site paths and rejects open redirects', () => {
  assert.equal(safeNextPath('/history'), '/history');
  assert.equal(safeNextPath('/history/abc?x=1#y'), '/history/abc?x=1#y');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, ' /history', '/%2F%2Fevil', 'history']) {
    const out = safeNextPath(bad);
    assert.ok(out === '/history' || (out.startsWith('/') && !out.startsWith('//')), String(bad));
  }
  assert.equal(safeNextPath('https://evil.example'), '/history');
  assert.equal(safeNextPath('//evil.example'), '/history');
});

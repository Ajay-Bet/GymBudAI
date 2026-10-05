/**
 * Sign-in state for the app (Sprint 5, GB 501). The opaque session token is kept in localStorage
 * (`gymbud.auth` = {token, expiresAt, user}) until it expires or the user logs out. On load, expired
 * tokens are dropped and the rest are verified with GET /api/users/me. Any 401 for the current token
 * signs out locally. Logout calls the API and clears local state even if that call fails.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as authApi from '../api/auth.js';
import { setUnauthorizedHandler } from '../api/http.js';

export const AUTH_STORAGE_KEY = 'gymbud.auth';
const MAX_TIMER_MS = 2 ** 31 - 1;

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function readStored(storage, nowMs) {
  try {
    const raw = storage?.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    const expires = Date.parse(value?.expiresAt);
    if (typeof value?.token !== 'string' || !value.token || !Number.isFinite(expires) || expires <= nowMs) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return { token: value.token, expiresAt: value.expiresAt, user: value.user ?? null };
  } catch {
    return null;
  }
}

function writeStored(storage, value) {
  try {
    if (value) storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
    else storage?.removeItem(AUTH_STORAGE_KEY);
  } catch { /* storage unavailable: the session lasts for this page only */ }
}

const notAvailable = () => Promise.reject(new Error('Sign-in is not available here.'));
const SIGNED_OUT = Object.freeze({ user: null, token: null, expiresAt: null, status: 'signed-out',
  login: notAvailable, register: notAvailable, logout: () => Promise.resolve() });

const AuthContext = createContext(SIGNED_OUT);

/**
 * @param {Object} props
 * @param {*} props.children
 * @param {{login: Function, register: Function, logout: Function, me: Function}} [props.api] Injectable for tests.
 * @param {Storage|null} [props.storage] Injectable for tests.
 */
export function AuthProvider({ children, api = authApi, storage = defaultStorage() }) {
  const [session, setSession] = useState(() => {
    const stored = readStored(storage, Date.now());
    return stored ? { ...stored, status: 'loading' } : { token: null, expiresAt: null, user: null, status: 'signed-out' };
  });
  // Updated only by signOutLocal/applyAuth, which are the only token transitions.
  const tokenRef = useRef(session.token);

  const signOutLocal = useCallback(() => {
    writeStored(storage, null);
    tokenRef.current = null;
    setSession({ token: null, expiresAt: null, user: null, status: 'signed-out' });
  }, [storage]);

  const applyAuth = useCallback((result) => {
    const value = { token: result.accessToken, expiresAt: result.expiresAt, user: result.user ?? null };
    writeStored(storage, value);
    tokenRef.current = value.token;
    setSession({ ...value, status: 'signed-in' });
    return value.user;
  }, [storage]);

  // Verify a stored token once on load. Network failure keeps the stored session (offline use);
  // a 401 drops it.
  const initialToken = useRef(session.status === 'loading' ? session.token : null);
  useEffect(() => {
    const token = initialToken.current;
    if (!token) return undefined;
    const controller = new AbortController();
    api.me(token, { signal: controller.signal }).then((user) => {
      if (tokenRef.current !== token) return;
      setSession((current) => {
        const next = { ...current, user, status: 'signed-in' };
        writeStored(storage, { token: next.token, expiresAt: next.expiresAt, user });
        return next;
      });
    }).catch((error) => {
      if (tokenRef.current !== token || error?.code === 'aborted') return;
      if (error?.status === 401) signOutLocal();
      else setSession((current) => ({ ...current, status: 'signed-in' }));
    });
    return () => controller.abort();
  }, [api, storage, signOutLocal]);

  // Any 401 for the current token signs out locally.
  useEffect(() => setUnauthorizedHandler((token) => {
    if (token && token === tokenRef.current) signOutLocal();
  }), [signOutLocal]);

  // Sign out when the token expires while the page is open.
  useEffect(() => {
    if (!session.token || !session.expiresAt) return undefined;
    const remaining = Date.parse(session.expiresAt) - Date.now();
    const timer = setTimeout(signOutLocal, Math.max(0, Math.min(remaining, MAX_TIMER_MS)));
    return () => clearTimeout(timer);
  }, [session.token, session.expiresAt, signOutLocal]);

  const login = useCallback(async (email, password) => applyAuth(await api.login(email, password)), [api, applyAuth]);
  const register = useCallback(async (email, password, displayName) => applyAuth(await api.register(email, password, displayName)), [api, applyAuth]);
  const logout = useCallback(async () => {
    const token = tokenRef.current;
    signOutLocal();
    if (!token) return;
    try { await api.logout(token); } catch { /* local sign-out already happened */ }
  }, [api, signOutLocal]);

  const value = useMemo(() => ({ user: session.user, token: session.token, expiresAt: session.expiresAt,
    status: session.status, login, register, logout }), [session, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Current sign-in state. Outside an AuthProvider it returns a signed-out value. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}

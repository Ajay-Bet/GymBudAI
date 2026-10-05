/** Account transport (Sprint 5, GB 501): email + password accounts implemented in FastAPI. */
import { apiRequest } from './http.js';

/** @returns {Promise<{accessToken: string, tokenType: 'bearer', expiresAt: string, user: Object}>} */
export function register(email, password, displayName, options = {}) {
  const body = { email, password };
  if (typeof displayName === 'string' && displayName.trim()) body.displayName = displayName.trim();
  return apiRequest('/api/auth/register', { ...options, method: 'POST', body });
}

/** @returns {Promise<{accessToken: string, tokenType: 'bearer', expiresAt: string, user: Object}>} */
export function login(email, password, options = {}) {
  return apiRequest('/api/auth/login', { ...options, method: 'POST', body: { email, password } });
}

/** Revokes the presented token (204 → null). */
export function logout(token, options = {}) {
  return apiRequest('/api/auth/logout', { ...options, method: 'POST', token });
}

/** @returns {Promise<{id: string, email: string, displayName: string|null, createdAt: string}>} */
export function me(token, options = {}) {
  return apiRequest('/api/users/me', { ...options, token });
}

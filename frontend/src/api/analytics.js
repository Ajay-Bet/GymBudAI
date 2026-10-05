/** Owned, bounded analytics. Null measurements stay null until display. */
import { apiRequest } from './http.js';

export function getAnalytics({ startDate, endDate, timezone }, token, options = {}) {
  const params = new URLSearchParams({ startDate, endDate, timezone });
  return apiRequest(`/api/analytics/me?${params}`, { ...options, token });
}

export const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
export const NOT_ASSESSED = 'Not assessed';
export const degrees = (value) => isNumber(value) ? `${value.toFixed(1)}°` : NOT_ASSESSED;
export const seconds = (value) => isNumber(value) ? `${(value / 1000).toFixed(1)} s` : NOT_ASSESSED;
export const percent = (value) => isNumber(value) ? `${(value * 100).toFixed(1)}%` : NOT_ASSESSED;
export function validTimezone(value) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0); return Boolean(value); } catch { return false; }
}
export function selectedTimezone() {
  try {
    const saved = localStorage.getItem('gymbud.analytics.timezone');
    if (validTimezone(saved)) return saved;
  } catch { /* A blocked storage preference does not prevent analytics. */ }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
export function saveTimezone(value) {
  try { localStorage.setItem('gymbud.analytics.timezone', value); } catch { /* Session selection still works. */ }
}
export function localDate(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function defaultRange(timezone = selectedTimezone()) {
  const endDate = localDate(new Date(), timezone);
  const start = new Date(`${endDate}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  return { startDate: start.toISOString().slice(0, 10), endDate, timezone };
}
export function dateTime(iso, timezone) {
  if (!iso) return NOT_ASSESSED;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_ASSESSED;
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
}

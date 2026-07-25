/** Calendar day helpers for daily word goals (user-local, not UTC). */

export const TIMEZONE_COOKIE = "nw_tz";
export const TIMEZONE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TZ_RE = /^[A-Za-z0-9_+\-/]{1,64}$/;

/** Browser local calendar day as YYYY-MM-DD. */
export function clientLocalDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidDayString(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const t = Date.parse(`${day}T12:00:00Z`);
  return !Number.isNaN(t);
}

export function isValidTimeZone(tz: string): boolean {
  if (!TZ_RE.test(tz)) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD for an IANA timezone (e.g. America/Chicago). */
export function dayInTimeZone(timeZone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Resolve which writing_days.day to use.
 * Prefer explicit client day, then timezone cookie, then UTC (legacy fallback).
 */
export function resolveWritingDay(opts: {
  writingDay?: unknown;
  timeZone?: string | null;
}): string {
  if (typeof opts.writingDay === "string" && isValidDayString(opts.writingDay)) {
    return opts.writingDay;
  }
  if (opts.timeZone && isValidTimeZone(opts.timeZone)) {
    return dayInTimeZone(opts.timeZone);
  }
  return new Date().toISOString().slice(0, 10);
}

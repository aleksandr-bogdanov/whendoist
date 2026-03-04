/**
 * Timezone utilities built on Intl.DateTimeFormat.
 *
 * All timezone conversion in the app should go through this module.
 * Uses a formatter cache to avoid re-creating DateTimeFormat instances on hot paths.
 */

// ─── Formatter Cache ─────────────────────────────────────────────────────────

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "0";
}

// ─── Core Extraction ─────────────────────────────────────────────────────────

const PARTS_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hour12: false,
};

/** Extract the hour (0-23) of a Date in a specific timezone. */
export function getHoursInTimezone(date: Date, tz: string): number {
  const parts = getFormatter(tz, PARTS_OPTIONS).formatToParts(date);
  const h = Number.parseInt(getPart(parts, "hour"), 10);
  // Intl hour12:false gives 24 for midnight in some engines
  return h === 24 ? 0 : h;
}

/** Extract the minute (0-59) of a Date in a specific timezone. */
export function getMinutesInTimezone(date: Date, tz: string): number {
  const parts = getFormatter(tz, PARTS_OPTIONS).formatToParts(date);
  return Number.parseInt(getPart(parts, "minute"), 10);
}

/** Get current hours and minutes in a specific timezone. */
export function getCurrentTimeInTimezone(tz: string): { hours: number; minutes: number } {
  const now = new Date();
  return {
    hours: getHoursInTimezone(now, tz),
    minutes: getMinutesInTimezone(now, tz),
  };
}

// ─── Date String ─────────────────────────────────────────────────────────────

const DATE_PARTS_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

/** Get YYYY-MM-DD string for a Date in a specific timezone. */
export function toDateStringInTimezone(date: Date, tz: string): string {
  const parts = getFormatter(tz, DATE_PARTS_OPTIONS).formatToParts(date);
  const y = getPart(parts, "year");
  const m = getPart(parts, "month");
  const d = getPart(parts, "day");
  return `${y}-${m}-${d}`;
}

// ─── Offset Computation ──────────────────────────────────────────────────────

/**
 * Compute the offset in hours between two timezones at a given instant.
 * Returns `tz2_offset - tz1_offset` such that:
 *   time_in_tz2 = time_in_tz1 + result
 *
 * Example: getTimezoneOffsetHours("America/New_York", "Europe/London") → 5
 * (London is 5 hours ahead of New York in winter)
 */
export function getTimezoneOffsetHours(tz1: string, tz2: string, date?: Date): number {
  const d = date ?? new Date();
  const h1 = getHoursInTimezone(d, tz1);
  const m1 = getMinutesInTimezone(d, tz1);
  const h2 = getHoursInTimezone(d, tz2);
  const m2 = getMinutesInTimezone(d, tz2);

  let diffMinutes = h2 * 60 + m2 - (h1 * 60 + m1);

  // Handle day boundary wrap-around (e.g., 23:00 vs 01:00 next day)
  if (diffMinutes > 12 * 60) diffMinutes -= 24 * 60;
  if (diffMinutes < -12 * 60) diffMinutes += 24 * 60;

  return diffMinutes / 60;
}

/**
 * Format a timezone's UTC offset as a human-readable string.
 * Examples: "UTC-5", "UTC+5:30", "UTC+0"
 */
export function formatTimezoneOffset(tz: string, date?: Date): string {
  const d = date ?? new Date();
  const diffHours = getTimezoneOffsetHours("UTC", tz, d);

  if (diffHours === 0) return "UTC+0";

  const sign = diffHours > 0 ? "+" : "-";
  const abs = Math.abs(diffHours);
  const hours = Math.floor(abs);
  const minutes = Math.round((abs - hours) * 60);

  if (minutes === 0) return `UTC${sign}${hours}`;
  return `UTC${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

// ─── Effective Timezone ──────────────────────────────────────────────────────

/**
 * Resolve the effective timezone: user preference if set, otherwise browser default.
 * This is the single source of truth for "what timezone should the UI render in."
 */
export function getEffectiveTimezone(preferredTz?: string | null): string {
  return preferredTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const SYSTEM_TIMEZONE = "Asia/Kolkata" as const;

const TIMESTAMPTZ_OFFSET_RE = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

/** Normalize Postgres short offsets (`+00`) to ISO (`+00:00`) for JS Date parsing. */
function normalizeTimestamptzOffset(iso: string): string {
  return iso.replace(/([+-]\d{2})$/, "$1:00");
}

/**
 * Parse a Postgres `timestamptz` value from Supabase/PostgREST.
 * Strings without an offset are treated as UTC (Postgres always stores UTC instants).
 */
export function parseTimestamptz(value: string): Date {
  const trimmed = value.trim();
  const normalized = trimmed.includes("T")
    ? trimmed
    : trimmed.replace(" ", "T");
  const withOffset = TIMESTAMPTZ_OFFSET_RE.test(normalized)
    ? normalizeTimestamptzOffset(normalized)
    : `${normalized}Z`;
  const d = new Date(withOffset);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`Invalid timestamptz: ${value}`);
  }
  return d;
}

export function formatIST(date: string | Date, formatStr: string): string {
  const d = typeof date === "string" ? parseTimestamptz(date) : date;
  return formatInTimeZone(d, SYSTEM_TIMEZONE, formatStr);
}

const SUPABASE_TIMESTAMPTZ_RE =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/;

/**
 * Display a `timestamptz` exactly as Supabase table editor shows it:
 * `yyyy-MM-dd HH:mm:ss` from the stored +00 value — no IST (+5:30) shift.
 */
export function formatSupabaseTimestamptz(value: string): string {
  if (!value?.trim()) return "—";
  const trimmed = value.trim();
  const match = trimmed.match(SUPABASE_TIMESTAMPTZ_RE);
  if (match) return `${match[1]} ${match[2]}`;
  const d = parseTimestamptz(trimmed);
  return formatInTimeZone(d, "UTC", "yyyy-MM-dd HH:mm:ss");
}

/**
 * @deprecated Use `formatSupabaseTimestamptz` for lead created_at — same behavior.
 */
export function formatTimestamptzColumn(
  date: string | Date,
  formatStr = "MMM d, yyyy, h:mm a",
): string {
  if (typeof date === "string") return formatSupabaseTimestamptz(date);
  return formatInTimeZone(date, "UTC", formatStr);
}

/** Start of the current IST calendar day as a UTC `Date` (for `timestamptz` queries). */
export function getStartOfTodayIST(): Date {
  const ymd = formatInTimeZone(new Date(), SYSTEM_TIMEZONE, "yyyy-MM-dd");
  return fromZonedTime(`${ymd}T00:00:00.000`, SYSTEM_TIMEZONE);
}

/** End of the current IST calendar day as a UTC `Date` (inclusive wall time 23:59:59.999 IST). */
export function getEndOfTodayIST(): Date {
  const ymd = formatInTimeZone(new Date(), SYSTEM_TIMEZONE, "yyyy-MM-dd");
  return fromZonedTime(`${ymd}T23:59:59.999`, SYSTEM_TIMEZONE);
}

/** UTC ISO bounds for a given IST calendar date (`yyyy-MM-dd`). */
export function getIstDayUtcBoundsIso(ymd: string): { startIso: string; endIso: string } {
  const start = fromZonedTime(`${ymd}T00:00:00.000`, SYSTEM_TIMEZONE);
  const end = fromZonedTime(`${ymd}T23:59:59.999`, SYSTEM_TIMEZONE);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Next/previous IST calendar date string from a `yyyy-MM-dd` anchor (noon IST stepping avoids edge cases). */
export function addCalendarDaysIST(ymd: string, days: number): string {
  const noonIst = fromZonedTime(`${ymd}T12:00:00`, SYSTEM_TIMEZONE);
  return formatInTimeZone(addDays(noonIst, days), SYSTEM_TIMEZONE, "yyyy-MM-dd");
}

export function isSameCalendarDayIST(a: Date, b: Date): boolean {
  return formatIST(a, "yyyy-MM-dd") === formatIST(b, "yyyy-MM-dd");
}

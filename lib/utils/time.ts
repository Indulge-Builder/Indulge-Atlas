import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const SYSTEM_TIMEZONE = "Asia/Kolkata" as const;

export function formatIST(date: string | Date, formatStr: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, SYSTEM_TIMEZONE, formatStr);
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

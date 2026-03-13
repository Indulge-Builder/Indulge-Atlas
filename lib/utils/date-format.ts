/**
 * Centralized timezone-safe date formatting for Indulge Atlas.
 *
 * Supabase stores timestamptz in UTC. When displaying or computing with these
 * values on the frontend, always parse via `new Date(utcString)` first — JavaScript
 * automatically converts to the browser's local timezone.
 *
 * Example: "2026-03-09T06:30:00+00:00" (UTC) → "12:00 PM" for a user in IST.
 */

import { format } from "date-fns";

/**
 * Formats a UTC ISO string as local time (e.g. "12:00 PM").
 * Use for task due_date, reminder times, etc.
 */
export function formatLocalTime(utcString: string): string {
  return format(new Date(utcString), "h:mm a");
}

/**
 * Formats a UTC ISO string as local date + time (e.g. "Mar 9, 2026, 12:00 PM").
 */
export function formatLocalDateTime(utcString: string): string {
  return format(new Date(utcString), "MMM d, yyyy, h:mm a");
}

/**
 * Returns milliseconds until a UTC due date from now.
 * Use for setTimeout/scheduling — ensures chime rings at correct local time.
 */
export function msUntilDue(utcString: string): number {
  const dueDate = new Date(utcString);
  const now = new Date();
  return dueDate.getTime() - now.getTime();
}

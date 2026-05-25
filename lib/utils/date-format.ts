/**
 * Centralized timezone-safe date formatting for Indulge Atlas.
 *
 * Supabase stores `timestamptz` as UTC instants. Use helpers from `lib/utils/time.ts`:
 * - `formatIST` — business wall clock (Asia/Kolkata) for tasks, SLA, activity
 * - `formatSupabaseTimestamptz` — literal `yyyy-MM-dd HH:mm:ss` as in Supabase (+00)
 */

import { format } from "date-fns";
import {
  formatIST,
  formatSupabaseTimestamptz,
  parseTimestamptz,
} from "@/lib/utils/time";

/** Lead Added column — IST wall clock (Asia/Kolkata). */
export function formatLeadCreatedAt(utcString: string): string {
  if (!utcString?.trim()) return "—";
  return formatIST(utcString, "dd MMM yyyy, h:mm a");
}

/** Atlas business timezone (Asia/Kolkata) for operational timestamps. */
export function formatAtlasDateTime(utcString: string): string {
  if (!utcString?.trim()) return "—";
  return formatIST(utcString, "MMM d, yyyy, h:mm a");
}

/**
 * Formats a UTC ISO string as local time (e.g. "12:00 PM").
 * Use for task due_date, reminder times, etc.
 */
export function formatLocalTime(utcString: string): string {
  return format(parseTimestamptz(utcString), "h:mm a");
}

/**
 * Formats a UTC ISO string in the browser's local timezone.
 */
export function formatLocalDateTime(utcString: string): string {
  return format(parseTimestamptz(utcString), "MMM d, yyyy, h:mm a");
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

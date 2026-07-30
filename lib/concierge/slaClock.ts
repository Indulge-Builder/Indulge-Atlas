/**
 * SLA clock for concierge tickets.
 *
 * The concierge desk runs 24/7 (confirmed by ops), so SLA due-dates and the
 * overdue check are plain CALENDAR time — no business-hours window, no weekend
 * skipping. Timezone-independent (minute arithmetic on instants).
 *
 * All SLA durations (sla_policies.first_response_minutes / resolution_minutes)
 * are calendar minutes: 8h = 480 · 1 day = 1440 · 2 days = 2880.
 *
 * Pure + deterministic. NOT a "use server" module.
 */
import { addMinutes, differenceInMinutes } from "date-fns";

/** 24h — the concierge SLA clock is round-the-clock, all week. */
export const MINUTES_PER_DAY = 24 * 60; // 1440

/** Overdue when a ticket sits > 8 hours since its last status change (Backend rule). */
export const OVERDUE_THRESHOLD_MINUTES = 8 * 60; // 480

/** Add `minutes` of calendar time to `from`. Negative/zero clamps to `from`. */
export function addSlaMinutes(from: Date, minutes: number): Date {
  return addMinutes(from, Math.max(0, Math.round(minutes)));
}

/** Calendar minutes elapsed in [start, end); 0 if end <= start. */
export function slaMinutesBetween(start: Date, end: Date): number {
  return Math.max(0, differenceInMinutes(end, start));
}

/** SLA due timestamps from a matched policy (ISO strings). */
export function computeSlaDueDates(
  createdAtIso: string,
  firstResponseMinutes: number,
  resolutionMinutes: number,
): { firstResponseDue: string; resolutionDue: string } {
  const created = new Date(createdAtIso);
  return {
    firstResponseDue: addSlaMinutes(created, firstResponseMinutes).toISOString(),
    resolutionDue: addSlaMinutes(created, resolutionMinutes).toISOString(),
  };
}

/** True when the ticket has sat past the overdue threshold since `sinceIso`. */
export function isOverdueSince(
  sinceIso: string,
  now: Date = new Date(),
  thresholdMinutes: number = OVERDUE_THRESHOLD_MINUTES,
): boolean {
  return slaMinutesBetween(new Date(sinceIso), now) >= thresholdMinutes;
}

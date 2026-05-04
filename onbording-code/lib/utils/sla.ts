/**
 * INDULGE ATLAS — SLA Utilities
 *
 * Shared helpers for Speed-to-Lead SLA calculation.
 * Used by both the Lead Dossier RSC (app/(dashboard)/leads/[id]/page.tsx)
 * and the real-time SLA monitor hook (lib/hooks/useSLA_Monitor.ts).
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";

const IST = "Asia/Kolkata";

/**
 * Returns the 9:00 AM IST anchor used for off-duty SLA timing.
 *
 * Rule:
 * - Lead created 09:00–17:59 IST → anchor = same calendar day at 09:00 IST
 * - Lead created 18:00–08:59 IST → anchor = next calendar day at 09:00 IST
 *
 * This means a lead arriving at 23:00 has until the next morning's 11:00 AM
 * before it hits the 120-minute off-duty breach.
 */
export function getOffDutyAnchor(createdAt: string): Date {
  const created = new Date(createdAt);
  const h = parseInt(formatInTimeZone(created, IST, "H"), 10);
  const y = parseInt(formatInTimeZone(created, IST, "yyyy"), 10);
  const m = parseInt(formatInTimeZone(created, IST, "M"), 10);
  const d = parseInt(formatInTimeZone(created, IST, "d"), 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  const midnightIST = fromZonedTime(`${y}-${pad(m)}-${pad(d)}T00:00:00`, IST);
  const anchorDate = addDays(midnightIST, h >= 18 ? 1 : 0);
  const y2 = parseInt(formatInTimeZone(anchorDate, IST, "yyyy"), 10);
  const m2 = parseInt(formatInTimeZone(anchorDate, IST, "M"), 10);
  const d2 = parseInt(formatInTimeZone(anchorDate, IST, "d"), 10);
  return fromZonedTime(`${y2}-${pad(m2)}-${pad(d2)}T09:00:00`, IST);
}

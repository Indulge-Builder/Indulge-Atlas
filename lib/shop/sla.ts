import { differenceInHours } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { ShopMasterTargetPriority } from "@/lib/types/database";

const IST = "Asia/Kolkata";

/** Elapsed whole hours from `before` to `now`, compared on the Asia/Kolkata timeline. */
export function hoursSinceLastUpdateUtcToIst(now: Date, beforeIso: string): number {
  const before = new Date(beforeIso);
  const nowIst = toZonedTime(now, IST);
  const beforeIst = toZonedTime(before, IST);
  return differenceInHours(nowIst, beforeIst);
}

function slaLimitHours(priority: ShopMasterTargetPriority): number {
  switch (priority) {
    case "super_high":
      return 3;
    case "high":
      return 6;
    case "normal":
    default:
      return 12;
  }
}

export function computeTargetSlaBreached(
  priority: ShopMasterTargetPriority,
  lastActivityIso: string,
): boolean {
  const hours = hoursSinceLastUpdateUtcToIst(new Date(), lastActivityIso);
  return hours > slaLimitHours(priority);
}

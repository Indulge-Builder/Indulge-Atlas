import { cn } from "@/lib/utils";

/**
 * 12-column grid spans (lg+) — repeating bento rhythm; each “row” sums to 12.
 * Mobile: single column; md: two equal columns (ignore span until lg).
 */
export function taskInsightsBentoColClass(index: number): string {
  switch (index % 5) {
    case 0:
      return "lg:col-span-7";
    case 1:
      return "lg:col-span-5";
    case 2:
    case 3:
    case 4:
      return "lg:col-span-4";
    default:
      return "lg:col-span-6";
  }
}

/** Wider cells get slightly roomier typography; narrow tiles stay dense. */
export function taskInsightsCardDensity(index: number): "relaxed" | "compact" {
  return index % 5 < 2 ? "relaxed" : "compact";
}

export function taskInsightsBentoGridClass(): string {
  return cn(
    "grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-3",
    "lg:grid-cols-12 lg:gap-3.5 lg:items-start",
  );
}

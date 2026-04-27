import { cva } from "class-variance-authority";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BriefingTrendMetric } from "@/lib/briefing/executiveBriefing";

const briefingDeltaPillVariants = cva(
  "mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
  {
    variants: {
      intent: {
        neutral: "bg-stone-100/90 text-stone-500",
        up: "gap-0.5 bg-emerald-50 text-emerald-600",
        down: "gap-0.5 bg-rose-50 text-rose-600",
      },
    },
    defaultVariants: {
      intent: "neutral",
    },
  },
);

export function BriefingDeltaPill({ metric }: { metric: BriefingTrendMetric }) {
  const { deltaPercent } = metric;

  if (deltaPercent === null || deltaPercent === 0) {
    return (
      <span className={briefingDeltaPillVariants({ intent: "neutral" })}>—</span>
    );
  }

  if (deltaPercent > 0) {
    return (
      <span className={cn(briefingDeltaPillVariants({ intent: "up" }))}>
        <ArrowUp className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
        {`+${deltaPercent}%`}
        <span className="sr-only"> week over week</span>
      </span>
    );
  }

  return (
    <span className={cn(briefingDeltaPillVariants({ intent: "down" }))}>
      <ArrowDown className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
      {deltaPercent}%
      <span className="sr-only"> week over week</span>
    </span>
  );
}

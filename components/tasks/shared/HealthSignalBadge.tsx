"use client";

import { cn } from "@/lib/utils";

export type HealthSignal = "on_track" | "overloaded" | "at_risk" | "on_leave";

const SIGNAL_STYLES: Record<
  HealthSignal,
  { label: string; pill: string; dot: string }
> = {
  on_track: {
    label: "On Track",
    pill: "bg-emerald-500/10 text-emerald-400",
    dot: "bg-emerald-400",
  },
  overloaded: {
    label: "Overloaded",
    pill: "bg-amber-500/10 text-amber-400",
    dot: "bg-amber-400",
  },
  at_risk: {
    label: "At Risk",
    pill: "bg-red-500/10 text-red-400",
    dot: "bg-red-400",
  },
  on_leave: {
    label: "On Leave",
    pill: "bg-slate-500/10 text-slate-400",
    dot: "bg-slate-400",
  },
};

interface HealthSignalBadgeProps {
  signal: HealthSignal;
  className?: string;
}

export function HealthSignalBadge({ signal, className }: HealthSignalBadgeProps) {
  const cfg = SIGNAL_STYLES[signal];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        cfg.pill,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cfg.dot)} aria-hidden />
      {cfg.label}
    </span>
  );
}

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

const SIGNAL_STYLES_LIGHT: Record<
  HealthSignal,
  { label: string; pill: string; dot: string }
> = {
  on_track: {
    label: "On Track",
    pill: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/90",
    dot: "bg-emerald-500",
  },
  overloaded: {
    label: "Overloaded",
    pill: "bg-amber-50 text-amber-900 ring-1 ring-amber-200/90",
    dot: "bg-amber-500",
  },
  at_risk: {
    label: "At Risk",
    pill: "bg-red-50 text-red-800 ring-1 ring-red-200/90",
    dot: "bg-red-500",
  },
  on_leave: {
    label: "On Leave",
    pill: "bg-stone-100 text-stone-600 ring-1 ring-stone-200/90",
    dot: "bg-stone-400",
  },
};

interface HealthSignalBadgeProps {
  signal: HealthSignal;
  className?: string;
  /** `light` = readable on cream / white cards (Task Insights). Default = dark panels. */
  variant?: "dark" | "light";
}

export function HealthSignalBadge({
  signal,
  className,
  variant = "dark",
}: HealthSignalBadgeProps) {
  const cfg =
    variant === "light" ? SIGNAL_STYLES_LIGHT[signal] : SIGNAL_STYLES[signal];
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

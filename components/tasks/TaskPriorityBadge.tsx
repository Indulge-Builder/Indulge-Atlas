"use client";

import { cn } from "@/lib/utils";

type Priority = "urgent" | "high" | "medium" | "low";

const PRIORITY_CONFIG: Record<Priority, { label: string; dotClass: string; textClass: string; bgClass: string }> = {
  urgent: {
    label:     "Urgent",
    dotClass:  "bg-[#D4AF37]",
    textClass: "text-[#A88B25]",
    bgClass:   "bg-[#D4AF37]/10 border-[#D4AF37]/20",
  },
  high: {
    label:     "High",
    dotClass:  "bg-orange-500",
    textClass: "text-orange-600",
    bgClass:   "bg-orange-500/10 border-orange-500/20",
  },
  medium: {
    label:     "Medium",
    dotClass:  "bg-amber-500",
    textClass: "text-amber-700",
    bgClass:   "bg-amber-500/10 border-amber-500/20",
  },
  low: {
    label:     "Low",
    dotClass:  "bg-zinc-400",
    textClass: "text-zinc-500",
    bgClass:   "bg-zinc-500/10 border-zinc-500/20",
  },
};

interface TaskPriorityBadgeProps {
  priority: Priority | string;
  size?: "sm" | "md";
  className?: string;
}

export function TaskPriorityBadge({
  priority,
  size = "md",
  className,
}: TaskPriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority as Priority] ?? PRIORITY_CONFIG.medium;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        config.bgClass,
        config.textClass,
        className,
      )}
      aria-label={`Priority: ${config.label}`}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", config.dotClass)}
        aria-hidden
      />
      {config.label}
    </span>
  );
}

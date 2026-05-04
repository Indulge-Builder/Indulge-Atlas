"use client";

import { cn } from "@/lib/utils";
import { ATLAS_TASK_STATUS_LABELS, ATLAS_TASK_STATUS_COLORS } from "@/lib/types/database";
import type { AtlasTaskStatus } from "@/lib/types/database";

interface SubTaskStatusBadgeProps {
  status: AtlasTaskStatus;
  size?: "sm" | "md";
  className?: string;
}

export function SubTaskStatusBadge({
  status,
  size = "md",
  className,
}: SubTaskStatusBadgeProps) {
  const color = ATLAS_TASK_STATUS_COLORS[status];
  const label = ATLAS_TASK_STATUS_LABELS[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{
        backgroundColor: `${color}18`,
        color,
        border: `1px solid ${color}30`,
      }}
      aria-label={`Status: ${label}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

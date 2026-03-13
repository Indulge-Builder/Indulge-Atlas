import { LEAD_STATUS_CONFIG, type LeadStatus } from "@/lib/types/database";
import { cn } from "@/lib/utils";

interface LeadStatusBadgeProps {
  status: LeadStatus;
  size?: "sm" | "md";
  className?: string;
}

export function LeadStatusBadge({
  status,
  size = "md",
  className,
}: LeadStatusBadgeProps) {
  const config = LEAD_STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1",
        className
      )}
      style={{
        backgroundColor: config.bgColor,
        color: config.color,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: config.color }}
      />
      {config.label}
    </span>
  );
}

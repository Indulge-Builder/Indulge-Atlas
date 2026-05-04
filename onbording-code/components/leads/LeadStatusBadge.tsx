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
  const useTailwind = !!config.className;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1",
        useTailwind ? config.className : undefined,
        className
      )}
      style={!useTailwind ? { backgroundColor: config.bgColor, color: config.color } : undefined}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0 bg-current opacity-80"
        style={!useTailwind ? { backgroundColor: config.color, opacity: 1 } : undefined}
      />
      {config.label}
    </span>
  );
}

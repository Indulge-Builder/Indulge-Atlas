import * as React from "react";
import { cn } from "@/lib/utils";

interface InfoRowProps {
  /** Lucide (or any) icon component. */
  icon: React.ElementType;
  /** Short uppercase label (e.g. "Primary Phone"). */
  label: string;
  /**
   * Display value.  Pass a `string` for simple text, or any `ReactNode` for
   * interactive/composite values (inline edits, selects, badges, etc.).
   */
  value?: string | React.ReactNode;
  /** Background fill for the icon well (default: `#F2F2EE`). */
  iconBg?: string;
  /** Icon colour (default: `#8A8A6E`). */
  iconColor?: string;
  className?: string;
}

/**
 * InfoRow — the canonical 2-column data-field row used throughout the Lead
 * Dossier and detail pages.
 *
 * Layout: `[icon well] | [label ↑ / value ↓]`
 *
 * ```tsx
 * <InfoRow icon={Phone} label="Primary Phone" value={lead.phone_number} />
 *
 * // Composite value (inline edit component):
 * <InfoRow icon={Mail} label="Email" value={<InlineEmailEdit ... />} />
 *
 * // Dynamic icon colour (e.g. SLA status):
 * <InfoRow
 *   icon={sla.showAlert ? AlertTriangle : Clock}
 *   label="SLA · Assigned"
 *   iconBg={sla.bgColor}
 *   iconColor={sla.color}
 *   value={<SLADisplay sla={sla} assignedAt={lead.assigned_at} />}
 * />
 * ```
 */
export function InfoRow({
  icon: Icon,
  label,
  value,
  iconBg = "#F2F2EE",
  iconColor = "#8A8A6E",
  className,
}: InfoRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[1.75rem_1fr] items-start gap-x-2.5 gap-y-0",
        className,
      )}
    >
      {/* Icon well */}
      <div
        className="col-start-1 row-span-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-lg"
        style={{ backgroundColor: iconBg }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
      </div>

      {/* Label */}
      <p className="col-start-2 row-start-1 text-[10px] font-medium uppercase tracking-wider text-[#B5A99A]">
        {label}
      </p>

      {/* Value */}
      {typeof value === "string" ? (
        <p className="col-start-2 row-start-2 mt-0.5 text-sm font-medium text-[#1A1A1A]">
          {value}
        </p>
      ) : (
        <div className="col-start-2 row-start-2 mt-0.5 min-w-0">{value}</div>
      )}
    </div>
  );
}

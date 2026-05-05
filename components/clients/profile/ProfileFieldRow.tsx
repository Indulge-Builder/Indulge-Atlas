import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfileFieldRow({
  label,
  icon: Icon,
  value,
  isEmpty,
  labelIconClassName,
}: {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  isEmpty?: boolean;
  /** Override default muted gold icon tint (e.g. restaurant pin) */
  labelIconClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-0 px-4 py-[11px]">
      <div className="flex items-center gap-1.5 pt-px text-[12px] font-medium text-stone-800">
        <Icon
          className={cn("h-3 w-3 shrink-0 text-stone-600", labelIconClassName)}
          aria-hidden
        />
        <span>{label}</span>
      </div>
      <div className="min-w-0 text-[13px] font-normal leading-[1.5] text-[#1C1917]">
        {isEmpty ? (
          <span className="text-[12px] font-normal italic leading-normal text-[#C4BEB8]">
            Not provided
          </span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

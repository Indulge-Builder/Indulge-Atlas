"use client";

import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import type { DepartmentTaskOverview } from "@/lib/types/database";

function getLucideIcon(name: string) {
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  >;
  return icons[name] ?? LucideIcons.Sparkles;
}

export interface TaskInsightsDepartmentSelectorProps {
  departments: DepartmentTaskOverview[];
  /** `null` = All departments */
  value: string | null;
  onChange: (departmentId: string | null) => void;
}

export function TaskInsightsDepartmentSelector({
  departments,
  value,
  onChange,
}: TaskInsightsDepartmentSelectorProps) {
  if (departments.length === 0) return null;

  return (
    <div className="mb-6 border-b border-[#E5E4DF] pb-5">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#8A8A6E]">
        Department
      </p>
      <div
        className="-mx-1 flex flex-wrap gap-2 px-1 sm:flex-nowrap sm:overflow-x-auto sm:pb-0.5 sm:[scrollbar-width:thin]"
        role="tablist"
        aria-label="Filter by department"
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === null}
          onClick={() => onChange(null)}
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-4 py-2 text-[13px] font-medium transition-all",
            value === null
              ? "border-[#D4AF37] bg-[#FBF6E8] text-[#1A1A1A] shadow-sm"
              : "border-[#E5E4DF] bg-white text-[#6B6B6B] hover:border-[#D0C8BE] hover:text-[#1A1A1A]",
          )}
        >
          All
        </button>
        {departments.map((d) => {
          const Icon = getLucideIcon(d.icon);
          const active = value === d.departmentId;
          const noGroupTasks = d.activeMasterTaskCount === 0;
          return (
            <button
              key={d.departmentId}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(d.departmentId)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-medium transition-[filter,colors,box-shadow,border-color]",
                active
                  ? "border-[#D4AF37] bg-[#FBF6E8] text-[#1A1A1A] shadow-sm"
                  : "border-[#E5E4DF] bg-white text-[#6B6B6B] hover:border-[#D0C8BE] hover:text-[#1A1A1A]",
                noGroupTasks &&
                  (active
                    ? "brightness-[0.97] saturate-[0.92]"
                    : "brightness-[0.94] saturate-[0.86] hover:brightness-[0.99] hover:saturate-[0.94]"),
              )}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${d.accentColor}18` }}
              >
                <Icon
                  className="h-4 w-4"
                  style={{ color: d.accentColor }}
                  aria-hidden
                />
              </span>
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

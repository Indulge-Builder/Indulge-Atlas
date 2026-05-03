"use client";

import { DEPARTMENT_CONFIG } from "@/lib/constants/departments";
import type {
  EmployeeDepartment,
  EmployeeTaskMetrics,
  Profile,
} from "@/lib/types/database";
import { HealthSignalBadge } from "@/components/tasks/shared/HealthSignalBadge";
import { SmartMetricsPanel } from "./SmartMetricsPanel";

function panelInitials(fullName: string): string {
  const parts = fullName.trim().split(" ");
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export interface EmployeeProfilePanelProps {
  profile: Profile;
  metrics: EmployeeTaskMetrics;
}

export function EmployeeProfilePanel({
  profile,
  metrics,
}: EmployeeProfilePanelProps) {
  const dept = profile.department as EmployeeDepartment | null;
  const deptColor =
    dept && DEPARTMENT_CONFIG[dept]
      ? DEPARTMENT_CONFIG[dept].accentColor
      : "#78716c";
  const deptLabel =
    dept && DEPARTMENT_CONFIG[dept]
      ? DEPARTMENT_CONFIG[dept].label
      : (dept ?? "—");

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <div className="flex flex-col items-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full border-2 bg-gradient-to-br from-[#EDEAE4] to-[#E0DDD6] font-[family-name:var(--font-playfair)] text-2xl font-semibold text-[#5c5346]"
          style={{ borderColor: `${deptColor}88` }}
        >
          {panelInitials(profile.full_name)}
        </div>
        <h2 className="mt-3 text-center font-[family-name:var(--font-playfair)] text-xl font-semibold text-stone-900">
          {profile.full_name}
        </h2>
        <p className="mt-1 max-w-[240px] text-center text-sm text-stone-600">
          {(profile.job_title ?? "").trim() || (
            <span className="text-stone-400 italic">No title on file</span>
          )}
        </p>
      </div>

      <div className="mt-1 flex flex-col gap-2.5 rounded-xl border border-[#E5E4DF]/90 bg-white/80 p-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-stone-500">Department</span>
          <span
            className="max-w-[55%] truncate rounded-full border border-y border-r border-[#E5E4DF] border-l-[3px] bg-[#F4F1EA] px-2 py-0.5 text-xs font-medium text-stone-700"
            style={{ borderLeftColor: deptColor }}
          >
            {deptLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-stone-500">Reports to</span>
          <span className="text-stone-700">—</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-stone-500">Status</span>
          <HealthSignalBadge signal={metrics.healthSignal} variant="light" />
        </div>
      </div>

      <div className="border-t border-[#E5E4DF]" />

      <SmartMetricsPanel metrics={metrics} />
    </div>
  );
}

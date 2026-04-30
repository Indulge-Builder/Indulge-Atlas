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
      : "#6366f1";
  const deptLabel =
    dept && DEPARTMENT_CONFIG[dept]
      ? DEPARTMENT_CONFIG[dept].label
      : (dept ?? "—");

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <div className="flex flex-col items-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold"
          style={{
            backgroundColor: `${deptColor}20`,
            color: deptColor,
            outline: `2px solid ${deptColor}70`,
            outlineOffset: "3px",
          }}
        >
          {panelInitials(profile.full_name)}
        </div>
        <h2 className="mt-2 text-center text-xl font-bold text-white">
          {profile.full_name}
        </h2>
        <p className="mt-1 text-center text-sm text-white/50">
          {profile.job_title ?? ""}
        </p>
      </div>

      <div className="mt-1 flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/40">Department</span>
          <span
            className="max-w-[55%] truncate rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: `${deptColor}18`,
              color: deptColor,
            }}
          >
            {deptLabel}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/40">Reports to</span>
          <span className="text-white/80">—</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/40">Status</span>
          <HealthSignalBadge signal={metrics.healthSignal} />
        </div>
      </div>

      <div className="border-t border-white/8" />

      <SmartMetricsPanel metrics={metrics} />
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Layers } from "lucide-react";
import { DEPARTMENT_CONFIG } from "@/lib/constants/departments";
import { cn } from "@/lib/utils";
import type {
  EmployeeDepartment,
  EmployeeHealthSignal,
  Profile,
} from "@/lib/types/database";
import { HealthSignalBadge } from "@/components/tasks/shared/HealthSignalBadge";

function cardInitials(fullName: string): string {
  const parts = fullName.trim().split(" ");
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export interface AgentHealthCardProps {
  profile: Profile;
  healthSignal?: EmployeeHealthSignal;
  completionRate?: number;
  activeTaskCount?: number;
  overdueCount?: number;
  isOnLeave?: boolean;
  onSelect: (agentId: string) => void;
}

export function AgentHealthCard({
  profile,
  healthSignal = "on_track",
  completionRate = 0,
  activeTaskCount = 0,
  overdueCount = 0,
  isOnLeave = false,
  onSelect,
}: AgentHealthCardProps) {
  const dept = profile.department as EmployeeDepartment | null;
  const deptColor =
    dept && DEPARTMENT_CONFIG[dept]
      ? DEPARTMENT_CONFIG[dept].accentColor
      : "#6366f1";
  const deptLabel =
    dept && DEPARTMENT_CONFIG[dept]
      ? DEPARTMENT_CONFIG[dept].label
      : (dept ?? "—");

  const r = 14;
  const circumference = 2 * Math.PI * r;
  const dashOffset =
    circumference - (Math.min(100, Math.max(0, completionRate)) / 100) * circumference;

  const showMetricsRow =
    !isOnLeave && (activeTaskCount > 0 || overdueCount > 0);

  return (
    <motion.button
      type="button"
      data-agent-card
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(profile.id)}
      className={cn(
        "group flex w-[180px] shrink-0 flex-col items-center gap-3 rounded-xl border border-white/8 bg-[var(--surface-2)] p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20",
        isOnLeave && "opacity-60",
      )}
    >
      <div
        className="relative flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold"
        style={{
          backgroundColor: `${deptColor}25`,
          color: deptColor,
          outline: `2px solid ${deptColor}60`,
          outlineOffset: "2px",
        }}
      >
        {cardInitials(profile.full_name)}
      </div>

      <div className="min-h-[2.5rem] w-full">
        <p className="line-clamp-2 text-sm font-semibold leading-tight text-white">
          {profile.full_name}
        </p>
        <p className="mt-0.5 w-full truncate text-[11px] leading-tight text-white/50">
          {profile.job_title ?? ""}
        </p>
      </div>

      <span
        className="max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{
          backgroundColor: `${deptColor}18`,
          color: deptColor,
        }}
      >
        {deptLabel}
      </span>

      {isOnLeave ? (
        <HealthSignalBadge signal="on_leave" />
      ) : (
        <>
          {showMetricsRow && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
              {activeTaskCount > 0 && (
                <span className="inline-flex items-center gap-1 text-white/50">
                  <Layers className="h-3 w-3 shrink-0" />
                  {activeTaskCount} active
                </span>
              )}
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded px-1.5 text-red-400 bg-red-400/8">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {overdueCount} overdue
                </span>
              )}
            </div>
          )}

          {completionRate > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mx-auto"
            >
              <svg width="40" height="40" viewBox="0 0 36 36" aria-hidden>
                <circle
                  cx="18"
                  cy="18"
                  r={r}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r={r}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="3"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
                <text
                  x="18"
                  y="22"
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="bold"
                  fill="white"
                >
                  {Math.round(completionRate)}%
                </text>
              </svg>
            </motion.div>
          ) : (
            <p className="text-[10px] text-white/20">No data</p>
          )}

          <HealthSignalBadge signal={healthSignal} />
        </>
      )}
    </motion.button>
  );
}

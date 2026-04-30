"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Flame } from "lucide-react";
import type { EmployeeTaskMetrics } from "@/lib/types/database";

export interface SmartMetricsPanelProps {
  metrics: EmployeeTaskMetrics;
}

export function SmartMetricsPanel({ metrics }: SmartMetricsPanelProps) {
  const bars: {
    label: string;
    value: number;
    display: string;
    gradient: string;
    warn?: boolean;
  }[] = [
    {
      label: "Completion (30d)",
      value: Math.min(100, metrics.completionRateLast30Days),
      display: `${metrics.completionRateLast30Days}%`,
      gradient: "bg-gradient-to-r from-emerald-500 to-emerald-400",
    },
    {
      label: "On-Time",
      value: Math.min(100, metrics.onTimeRate),
      display: `${metrics.onTimeRate}%`,
      gradient: "bg-gradient-to-r from-sky-500 to-sky-400",
    },
    {
      label: "Workload",
      value: Math.min(100, metrics.workloadScore),
      display: `${metrics.workloadScore}/100`,
      gradient:
        metrics.workloadScore < 70
          ? "bg-gradient-to-r from-sky-500 to-sky-400"
          : metrics.workloadScore < 85
            ? "bg-gradient-to-r from-amber-500 to-amber-400"
            : "bg-gradient-to-r from-red-500 to-red-400",
      warn: metrics.workloadScore > 80,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
        Performance
      </p>

      <div className="flex flex-col gap-4">
        {bars.map((b, index) => (
          <div key={b.label}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center text-xs text-white/50">
                {b.label}
                {b.warn && (
                  <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-400" />
                )}
              </span>
              <span className="text-xs font-semibold text-white">{b.display}</span>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className={`h-full rounded-full ${b.gradient}`}
                initial={{ width: "0%" }}
                animate={{ width: `${b.value}%` }}
                transition={{
                  duration: 0.7,
                  ease: "easeOut",
                  delay: index * 0.12,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {metrics.streakDays > 0 ? (
          <>
            <Flame className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">
              {metrics.streakDays} day streak
            </span>
          </>
        ) : (
          <span className="text-sm text-white/25">No current streak</span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-xl font-bold text-white">{metrics.totalActive}</p>
          <p className="text-[10px] text-white/35">Active Tasks</p>
        </div>
        <div className="text-center">
          <p
            className={`text-xl font-bold ${metrics.overdueCount > 0 ? "text-red-400" : "text-white"}`}
          >
            {metrics.overdueCount}
          </p>
          <p className="text-[10px] text-white/35">Overdue</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-emerald-400">
            {metrics.totalCompletedAllTime}
          </p>
          <p className="text-[10px] text-white/35">All-Time Done</p>
        </div>
      </div>
    </div>
  );
}

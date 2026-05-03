"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
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
      gradient: "bg-gradient-to-r from-emerald-600 to-emerald-500",
    },
    {
      label: "On-time",
      value: Math.min(100, metrics.onTimeRate),
      display: `${metrics.onTimeRate}%`,
      gradient: "bg-gradient-to-r from-sky-600 to-sky-500",
    },
    {
      label: "Workload",
      value: Math.min(100, metrics.workloadScore),
      display: `${metrics.workloadScore}/100`,
      gradient:
        metrics.workloadScore < 70
          ? "bg-gradient-to-r from-sky-600 to-sky-500"
          : metrics.workloadScore < 85
            ? "bg-gradient-to-r from-amber-600 to-amber-500"
            : "bg-gradient-to-r from-red-600 to-red-500",
      warn: metrics.workloadScore > 80,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
        Performance
      </p>

      <div className="flex flex-col gap-4">
        {bars.map((b, index) => (
          <div key={b.label}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center text-xs text-stone-600">
                {b.label}
                {b.warn && (
                  <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-600" aria-hidden />
                )}
              </span>
              <span className="text-xs font-semibold tabular-nums text-stone-900">
                {b.display}
              </span>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-stone-200">
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

      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[#E5E4DF] pt-4">
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums text-stone-900">{metrics.totalActive}</p>
          <p className="text-[10px] text-stone-500">Active tasks</p>
        </div>
        <div className="text-center">
          <p
            className={`text-xl font-bold tabular-nums ${metrics.overdueCount > 0 ? "text-red-700" : "text-stone-900"}`}
          >
            {metrics.overdueCount}
          </p>
          <p className="text-[10px] text-stone-500">Overdue</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums text-emerald-700">
            {metrics.totalCompletedAllTime}
          </p>
          <p className="text-[10px] text-stone-500">All-time done</p>
        </div>
      </div>
    </div>
  );
}

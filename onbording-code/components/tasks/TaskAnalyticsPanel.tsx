"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { X, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import { getMasterTaskAnalytics } from "@/lib/actions/tasks";
import { ATLAS_TASK_STATUS_LABELS, ATLAS_TASK_STATUS_COLORS, ATLAS_TASK_STATUS_VALUES } from "@/lib/types/database";
import type { MasterTaskAnalytics, AtlasTaskStatus } from "@/lib/types/database";

interface TaskAnalyticsPanelProps {
  masterTaskId: string;
  /** Increments when Realtime signals subtask/board changes — triggers analytics re-fetch */
  refreshSignal?: number;
  onClose?: () => void;
}

export function TaskAnalyticsPanel({
  masterTaskId,
  refreshSignal = 0,
  onClose,
}: TaskAnalyticsPanelProps) {
  const [analytics, setAnalytics]   = useState<MasterTaskAnalytics | null>(null);
  const [loading, setLoading]       = useState(true);
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!masterTaskId) return;
    setLoading(true);
    getMasterTaskAnalytics(masterTaskId).then((result) => {
      if (result.success && result.data) setAnalytics(result.data);
      setLoading(false);
    });
  }, [masterTaskId, refreshSignal]);

  // Completion ring SVG
  const pct = analytics?.completion_pct ?? 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.18 }}
      className="w-full space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-800">Analytics</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
            aria-label="Close analytics"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
      ) : analytics ? (
        <>
          {/* Overdue alert */}
          {analytics.overdue_count > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/8 border border-red-500/20 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" aria-hidden />
              <span className="text-xs text-red-600 font-medium">
                {analytics.overdue_count} overdue task{analytics.overdue_count > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Completion ring */}
          <Section
            id="completion"
            label="Completion"
            collapsed={collapsed}
            onToggle={toggle}
          >
            <div className="flex items-center gap-4">
              <div className="relative flex h-24 w-24 items-center justify-center flex-shrink-0">
                <svg
                  viewBox="0 0 100 100"
                  className="h-24 w-24 -rotate-90"
                  aria-label={`${pct}% complete`}
                  role="img"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="#E5E4DF"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="#D4AF37"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-serif text-xl font-bold text-zinc-900">{pct}%</span>
                  <span className="text-[10px] text-zinc-400">done</span>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-xs text-zinc-500">
                <span>{analytics.total_subtasks} total</span>
                <span>{analytics.by_status.done} done</span>
                <span>{analytics.by_status.in_progress} in progress</span>
                <span>{analytics.by_status.todo} to do</span>
              </div>
            </div>
          </Section>

          {/* Status breakdown */}
          <Section
            id="status"
            label="By Status"
            collapsed={collapsed}
            onToggle={toggle}
          >
            <div className="space-y-1.5">
              {ATLAS_TASK_STATUS_VALUES.filter((s) => (analytics.by_status[s] ?? 0) > 0).map((s) => {
                const count = analytics.by_status[s];
                const pctBar = analytics.total_subtasks > 0
                  ? (count / analytics.total_subtasks) * 100
                  : 0;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-20 text-[10px] text-zinc-500 truncate">
                      {ATLAS_TASK_STATUS_LABELS[s]}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width:           `${pctBar}%`,
                          backgroundColor: ATLAS_TASK_STATUS_COLORS[s],
                        }}
                        aria-label={`${count} tasks`}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-400 w-4 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Assignee breakdown */}
          {analytics.by_assignee.length > 0 && (
            <Section
              id="assignees"
              label="By Assignee"
              collapsed={collapsed}
              onToggle={toggle}
            >
              <div className="space-y-2">
                {analytics.by_assignee.map(({ profile, count, done, in_progress }) => (
                  <div key={profile.id} className="flex items-center gap-2">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white">
                      {getInitials(profile.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-700 truncate">
                        {profile.full_name}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {done} done · {in_progress} active · {count} total
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Velocity chart */}
          {analytics.velocity.length > 0 && (
            <Section
              id="velocity"
              label="Velocity (30 days)"
              collapsed={collapsed}
              onToggle={toggle}
            >
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={analytics.velocity}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: "#9CA3AF" }}
                      tickFormatter={(v: string) => v.slice(5)}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#9CA3AF" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        border: "1px solid #E5E4DF",
                        backgroundColor: "#FFFFFF",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      stroke="#D4AF37"
                      strokeWidth={2}
                      fill="url(#goldGradient)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}
        </>
      ) : (
        <p className="text-sm text-zinc-400">No analytics available.</p>
      )}
    </motion.div>
  );
}

function Section({
  id,
  label,
  children,
  collapsed,
  onToggle,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isCollapsed = collapsed.has(id);
  return (
    <div>
      <button
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-1 py-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-600 transition-colors"
        aria-expanded={!isCollapsed}
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", isCollapsed && "-rotate-90")}
        />
        {label}
      </button>
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-2 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

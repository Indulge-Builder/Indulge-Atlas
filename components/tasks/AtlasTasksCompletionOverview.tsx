"use client";

import { useId, useMemo, type ComponentType } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, LayoutGrid, ListTodo, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MasterTask, SubTask, TaskGroup, AtlasTaskStatus } from "@/lib/types/database";
import { ATLAS_TASK_STATUS_LABELS } from "@/lib/types/database";

export interface AtlasTasksData {
  masterTask: MasterTask;
  taskGroups: Array<TaskGroup & { tasks: SubTask[] }>;
}

const STATUS_SEGMENTS: AtlasTaskStatus[] = [
  "done",
  "in_progress",
  "in_review",
  "todo",
  "blocked",
  "error",
  "cancelled",
];

const SEGMENT_CLASS: Record<AtlasTaskStatus, string> = {
  done:        "bg-emerald-500",
  in_progress: "bg-[#C9A227]",
  in_review:   "bg-amber-400",
  todo:        "bg-[#D4D0C8]",
  blocked:     "bg-orange-500",
  error:       "bg-red-500",
  cancelled:   "bg-[#B5B0A8]",
};

interface AtlasTasksCompletionOverviewProps {
  tasks: AtlasTasksData[];
}

function aggregate(tasks: AtlasTasksData[]) {
  let total = 0;
  let done = 0;
  let overdue = 0;
  const counts: Partial<Record<AtlasTaskStatus, number>> = {};
  let workspacesWithSubs = 0;
  const now = Date.now();

  for (const { taskGroups } of tasks) {
    const subs = taskGroups.flatMap((g) => g.tasks);
    if (subs.length === 0) continue;
    workspacesWithSubs++;
    for (const t of subs) {
      total++;
      const st = (t.atlas_status ?? "todo") as AtlasTaskStatus;
      counts[st] = (counts[st] ?? 0) + 1;
      if (st === "done") done++;
      if (
        st !== "done" &&
        st !== "cancelled" &&
        t.due_date &&
        new Date(t.due_date).getTime() < now
      ) {
        overdue++;
      }
    }
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const inFlight =
    (counts.in_progress ?? 0) + (counts.in_review ?? 0) + (counts.todo ?? 0);

  return {
    workspaceCount: tasks.length,
    workspacesWithSubs,
    total,
    done,
    pct,
    overdue,
    inFlight,
    counts,
  };
}

function CompletionRing({ pct }: { pct: number }) {
  const uid = useId();
  const gradId = `atlas-ring-${uid.replace(/\W/g, "")}`;
  const r = 34;
  const stroke = 6;
  const size = 88;
  const c = 2 * Math.PI * r;
  const dash = c * (pct / 100);
  const cx = size / 2;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F0D060" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#A88B25" />
          </linearGradient>
        </defs>
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="#E8E6E0"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="font-serif text-[22px] font-bold leading-none tracking-tight text-[#1A1A1A]"
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}

export function AtlasTasksCompletionOverview({ tasks }: AtlasTasksCompletionOverviewProps) {
  const stats = useMemo(() => aggregate(tasks), [tasks]);

  if (tasks.length === 0) return null;

  const { workspaceCount, workspacesWithSubs, total, done, pct, overdue, inFlight, counts } =
    stats;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="shrink-0 px-6 pt-2 pb-2"
      aria-labelledby="atlas-completion-heading"
    >
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-[#E5E4DF]",
          "bg-gradient-to-br from-white to-[#FAFAF8]",
          "shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
        )}
      >
        <div className="p-3 sm:p-3.5">
          {total === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-[#E5E4DF] bg-[#FAFAF8]/80 px-3 py-4">
              <ListTodo className="h-8 w-8 shrink-0 text-[#D4D0C8]" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#6B6B6B]">No subtasks yet</p>
                <p className="text-[12px] leading-snug text-[#8A8A6E]">
                  Add tasks in a workspace to see portfolio completion here.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              {/* Ring */}
              <div className="flex justify-center sm:justify-start">
                <CompletionRing pct={pct} />
              </div>

              {/* Center: title + bar */}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <h2
                      id="atlas-completion-heading"
                      className="font-serif text-[17px] font-semibold leading-tight tracking-tight text-[#1A1A1A] sm:text-[18px]"
                    >
                      Portfolio completion
                    </h2>
                    <p className="mt-0.5 text-[11px] text-[#8A8A6E]">
                      <span className="tabular-nums font-medium text-[#6B6B6B]">{done}</span>
                      <span> / {total} subtasks done</span>
                      <span className="mx-1.5 text-[#D4D0C8]">·</span>
                      <LayoutGrid className="inline h-3 w-3 -translate-y-px text-[#B5A99A]" aria-hidden />
                      <span className="ml-0.5 tabular-nums">{workspacesWithSubs}</span>
                      <span> / {workspaceCount} workspaces</span>
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#EBE9E4] ring-1 ring-black/5">
                    {STATUS_SEGMENTS.map((status) => {
                      const n = counts[status] ?? 0;
                      if (n === 0 || total === 0) return null;
                      const w = `${(n / total) * 100}%`;
                      return (
                        <div
                          key={status}
                          title={`${ATLAS_TASK_STATUS_LABELS[status]}: ${n}`}
                          className={cn(SEGMENT_CLASS[status], "min-w-[3px] transition-all duration-500")}
                          style={{ width: w }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Compact stats */}
              <div className="flex shrink-0 flex-wrap justify-center gap-2 sm:flex-nowrap sm:flex-col sm:justify-center sm:gap-1.5 sm:border-l sm:border-[#E8E6E0] sm:pl-4">
                <MiniStat
                  icon={CheckCircle2}
                  label="Done"
                  value={done}
                  tone="emerald"
                />
                <MiniStat
                  icon={TrendingUp}
                  label="Active"
                  value={inFlight}
                  tone="gold"
                />
                <MiniStat
                  icon={AlertTriangle}
                  label="Overdue"
                  value={overdue}
                  tone={overdue > 0 ? "rose" : "muted"}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "emerald" | "gold" | "rose" | "muted";
}) {
  const toneCls =
    tone === "emerald"
      ? "bg-emerald-500/12 text-emerald-800"
      : tone === "gold"
        ? "bg-[#D4AF37]/12 text-[#7A6318]"
        : tone === "rose"
          ? "bg-red-500/10 text-red-800"
          : "bg-zinc-500/10 text-[#6B6B6B]";

  return (
    <div
      className={cn(
        "flex min-w-[7.5rem] items-center gap-2 rounded-lg border border-[#EEEDE9]/90 px-2.5 py-1.5 sm:min-w-[6.5rem]",
        "bg-white/90",
      )}
    >
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", toneCls)}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </div>
      <div className="min-w-0 leading-none">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-[#8A8A6E]">{label}</p>
        <p className="mt-0.5 font-serif text-lg font-bold tabular-nums text-[#1A1A1A]">{value}</p>
      </div>
    </div>
  );
}

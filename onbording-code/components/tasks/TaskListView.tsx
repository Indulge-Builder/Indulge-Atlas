"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { AnimatePresence } from "framer-motion";
import { cn, getInitials } from "@/lib/utils";
import { SubTaskStatusBadge } from "./SubTaskStatusBadge";
import { TaskPriorityBadge } from "./TaskPriorityBadge";
import { SubTaskModal } from "./SubTaskModal";
import {
  ATLAS_STATUS_PORTFOLIO_BAR_ORDER,
  ATLAS_STATUS_SEGMENT_BG,
  ATLAS_STATUS_WORKSPACE_SECTION_ORDER,
  ATLAS_TASK_STATUS_LABELS,
} from "@/lib/constants/tasks";
import type { TaskGroup, SubTask, AtlasTaskStatus } from "@/lib/types/database";
import { ChevronDown, ChevronRight } from "lucide-react";

const IST = "Asia/Kolkata";

interface TaskListViewProps {
  groups: (TaskGroup & { tasks: SubTask[] })[];
  currentUser: { id: string; full_name: string; job_title: string | null };
}

export function TaskListView({ groups, currentUser }: TaskListViewProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(
    new Set(),
  );

  const allSubtasks: SubTask[] = useMemo(
    () => groups.flatMap((g) => g.tasks as SubTask[]),
    [groups],
  );

  const byStatus = useMemo(() => {
    const m = new Map<AtlasTaskStatus, SubTask[]>();
    for (const task of allSubtasks) {
      const st = (task.atlas_status ?? "todo") as AtlasTaskStatus;
      const arr = m.get(st) ?? [];
      arr.push(task);
      m.set(st, arr);
    }
    return m;
  }, [allSubtasks]);

  const barStats = useMemo(() => {
    let total = 0;
    const counts: Partial<Record<AtlasTaskStatus, number>> = {};
    for (const task of allSubtasks) {
      total++;
      const st = (task.atlas_status ?? "todo") as AtlasTaskStatus;
      counts[st] = (counts[st] ?? 0) + 1;
    }
    const done = counts.done ?? 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, counts, pct };
  }, [allSubtasks]);

  function toggleStatusSection(status: AtlasTaskStatus) {
    const key = status;
    setCollapsedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Same semantics as Group Tasks main page: completion + status strip */}
      {barStats.total > 0 && (
        <div className="rounded-xl border border-[#E5E4DF] bg-gradient-to-br from-white to-[#FAFAF8] px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-serif text-[15px] font-semibold text-[#1A1A1A]">
                Progress
              </p>
              <p className="text-[11px] text-[#8A8A6E] mt-0.5">
                <span className="tabular-nums font-medium text-[#6B6B6B]">
                  {barStats.done}
                </span>
                <span> / {barStats.total} done</span>
                <span className="mx-1.5 text-[#D4D0C8]">·</span>
                <span className="tabular-nums">{barStats.pct}%</span>
              </p>
            </div>
          </div>
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[#EBE9E4] ring-1 ring-black/5">
            {ATLAS_STATUS_PORTFOLIO_BAR_ORDER.map((status) => {
              const n = barStats.counts[status] ?? 0;
              if (n === 0 || barStats.total === 0) return null;
              const w = `${(n / barStats.total) * 100}%`;
              return (
                <div
                  key={status}
                  title={`${ATLAS_TASK_STATUS_LABELS[status]}: ${n}`}
                  className={cn(
                    ATLAS_STATUS_SEGMENT_BG[status],
                    "min-w-[3px] transition-all duration-500",
                  )}
                  style={{ width: w }}
                />
              );
            })}
          </div>
        </div>
      )}

      {allSubtasks.length === 0 ? (
        <p className="text-sm text-zinc-400 italic text-center py-8">
          No subtasks in this workspace yet.
        </p>
      ) : (
        <div className="space-y-2">
          {ATLAS_STATUS_WORKSPACE_SECTION_ORDER.map((status) => {
            const rows = byStatus.get(status);
            if (!rows?.length) return null;

            const isCollapsed = collapsedStatuses.has(status);

            return (
              <div
                key={status}
                className="rounded-xl border border-zinc-200 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleStatusSection(status)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 bg-zinc-50 hover:bg-zinc-100 transition-colors text-left"
                  aria-expanded={!isCollapsed}
                >
                  <span
                    className={cn(
                      "w-1 self-stretch min-h-[2rem] rounded-full shrink-0",
                      ATLAS_STATUS_SEGMENT_BG[status],
                    )}
                    aria-hidden
                  />
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-zinc-800 flex-1 text-left">
                    {ATLAS_TASK_STATUS_LABELS[status]}
                  </span>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {rows.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div role="list">
                    {rows.map((task, i) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        isLast={i === rows.length - 1}
                        onOpen={() => setSelectedTaskId(task.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {selectedTaskId && (
          <SubTaskModal
            key={selectedTaskId}
            taskId={selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
            currentUser={currentUser}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TaskRow({
  task,
  isLast,
  onOpen,
}: {
  task: SubTask;
  isLast: boolean;
  onOpen: () => void;
}) {
  const isOverdue =
    task.due_date &&
    task.atlas_status !== "done" &&
    task.atlas_status !== "cancelled" &&
    new Date(task.due_date) < new Date();
  const dueDateLabel = task.due_date
    ? format(toZonedTime(new Date(task.due_date), IST), "d MMM")
    : null;
  const assignees = (task.assigned_to_profiles ?? []) as {
    id: string;
    full_name: string;
  }[];

  return (
    <div
      role="listitem"
      onClick={onOpen}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 transition-colors",
        !isLast && "border-b border-zinc-100",
      )}
    >
      <span
        className="h-2 w-2 rounded-full flex-shrink-0"
        style={{
          backgroundColor:
            task.priority === "urgent"
              ? "#D4AF37"
              : task.priority === "high"
                ? "#F97316"
                : task.priority === "medium"
                  ? "#8B5CF6"
                  : "#9CA3AF",
        }}
        aria-hidden
      />

      <div className="flex-1 min-w-0">
        <span className="block text-sm text-zinc-800 truncate">
          {task.title}
        </span>
      </div>

      <SubTaskStatusBadge
        status={task.atlas_status ?? "todo"}
        size="sm"
        className="hidden sm:inline-flex shrink-0"
      />

      <TaskPriorityBadge
        priority={task.priority ?? "medium"}
        size="sm"
        className="hidden md:inline-flex shrink-0"
      />

      {dueDateLabel && (
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0",
            isOverdue ? "bg-red-500/10 text-red-600" : "text-zinc-400",
          )}
        >
          {dueDateLabel}
        </span>
      )}

      {assignees[0] && (
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white ring-1 ring-white flex-shrink-0"
          aria-label={`Assigned to ${assignees[0].full_name}`}
        >
          {getInitials(assignees[0].full_name)}
        </div>
      )}
    </div>
  );
}

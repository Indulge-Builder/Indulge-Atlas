"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { TASK_PRIORITY_CONFIG } from "@/lib/types/database";
import type { TaskGroup, ProjectTask } from "@/lib/types/database";
import { updateTaskProgress } from "@/lib/actions/projects";
import { format, isAfter, differenceInHours } from "date-fns";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ListViewProps {
  taskGroups: TaskGroup[];
  tasks: ProjectTask[];
  onTaskClick: (task: ProjectTask) => void;
}

type SortKey = "title" | "priority" | "due_date" | "progress" | "status";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function DueDateCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-zinc-300 text-xs">—</span>;
  const d = new Date(date);
  const now = new Date();
  const isOverdue = isAfter(now, d);
  const isWarning = !isOverdue && differenceInHours(d, now) <= 24;
  return (
    <span
      className={cn(
        "text-xs font-medium",
        isOverdue && "text-red-600",
        isWarning && !isOverdue && "text-amber-600",
        !isOverdue && !isWarning && "text-zinc-500",
      )}
    >
      {format(d, "MMM d")}
    </span>
  );
}

function InlineProgressCell({
  task,
}: {
  task: ProjectTask;
}) {
  const [hover, setHover] = useState(false);
  const [showSlider, setShowSlider] = useState(false);
  const [localPct, setLocalPct] = useState(task.progress ?? 0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function commit(v: number) {
    setShowSlider(false);
    if (v === (task.progress ?? 0)) return;
    startTransition(async () => {
      const r = await updateTaskProgress(task.id, v);
      if (r.success) {
        router.refresh();
      } else {
        toast.error(r.error ?? "Failed");
        setLocalPct(task.progress ?? 0);
      }
    });
  }

  if (showSlider) {
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <input
          autoFocus
          type="range"
          min={0}
          max={100}
          value={localPct}
          onChange={(e) => setLocalPct(Number(e.target.value))}
          onBlur={() => commit(localPct)}
          onKeyDown={(e) => e.key === "Enter" && commit(localPct)}
          className="flex-1 accent-[#D4AF37]"
          aria-label="Progress"
        />
        <span className="text-xs text-zinc-500 w-7 text-right">{localPct}%</span>
      </div>
    );
  }

  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => { setLocalPct(task.progress ?? 0); setShowSlider(true); }}
      disabled={isPending}
      className="flex items-center gap-2 group/prog"
      aria-label="Update progress"
    >
      <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            (task.progress ?? 0) === 100
              ? "bg-emerald-500"
              : (task.progress ?? 0) >= 50
                ? "bg-amber-400"
                : "bg-[#D4AF37]",
          )}
          style={{ width: `${task.progress ?? 0}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs text-zinc-400 transition-colors",
          hover && "text-[#D4AF37]",
        )}
      >
        {task.progress ?? 0}%
      </span>
    </button>
  );
}

export function ListView({ taskGroups, tasks, onTaskClick }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const groupMap = Object.fromEntries(taskGroups.map((g) => [g.id, g]));
  const sorted = [...taskGroups].sort((a, b) => a.position - b.position);

  function sortTasks(arr: ProjectTask[]) {
    return [...arr].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title);
      else if (sortKey === "priority")
        cmp =
          (PRIORITY_ORDER[a.priority ?? "medium"] ?? 2) -
          (PRIORITY_ORDER[b.priority ?? "medium"] ?? 2);
      else if (sortKey === "due_date")
        cmp = (a.due_date ?? "").localeCompare(b.due_date ?? "");
      else if (sortKey === "progress")
        cmp = (a.progress ?? 0) - (b.progress ?? 0);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === "asc" ? (
        <ChevronDown className="w-3 h-3" />
      ) : (
        <ChevronRight className="w-3 h-3 rotate-90" />
      )
    ) : (
      <Minus className="w-3 h-3 opacity-30" />
    );

  const headerClass =
    "text-[11px] font-semibold text-zinc-400 uppercase tracking-wide cursor-pointer hover:text-zinc-600 select-none flex items-center gap-1";

  return (
    <div className="px-6 py-4">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_80px_100px_100px_80px_80px] gap-4 px-4 py-2 mb-1">
        <button
          type="button"
          className={headerClass}
          onClick={() => handleSort("title")}
        >
          Title <SortIcon k="title" />
        </button>
        <button
          type="button"
          className={headerClass}
          onClick={() => handleSort("priority")}
        >
          Priority <SortIcon k="priority" />
        </button>
        <span className={headerClass.replace("cursor-pointer hover:text-zinc-600 ", "")}>
          Assignees
        </span>
        <button
          type="button"
          className={headerClass}
          onClick={() => handleSort("progress")}
        >
          Progress <SortIcon k="progress" />
        </button>
        <button
          type="button"
          className={headerClass}
          onClick={() => handleSort("due_date")}
        >
          Due <SortIcon k="due_date" />
        </button>
        <span className={headerClass.replace("cursor-pointer hover:text-zinc-600 ", "")}>
          Group
        </span>
      </div>

      {/* Rows grouped by task group */}
      {sorted.map((group) => {
        const groupTasks = tasks.filter((t) => t.group_id === group.id);
        if (groupTasks.length === 0) return null;
        const isCollapsed = collapsed.has(group.id);

        return (
          <div key={group.id} className="mb-4">
            {/* Group row */}
            <button
              type="button"
              onClick={() => toggleCollapse(group.id)}
              className="flex items-center gap-2 px-3 py-1.5 w-full hover:bg-zinc-50 rounded-xl mb-1 text-left"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              )}
              <span className="text-xs font-semibold text-zinc-600">{group.title}</span>
              <span className="text-[10px] text-zinc-400 bg-zinc-100 rounded-full px-1.5 py-0.5">
                {groupTasks.length}
              </span>
            </button>

            {!isCollapsed && (
              <div className="rounded-2xl border border-[#E5E4DF] bg-white overflow-hidden divide-y divide-[#F0F0EE]">
                {sortTasks(groupTasks).map((task) => {
                  const priorityConfig = task.priority
                    ? TASK_PRIORITY_CONFIG[task.priority]
                    : null;
                  const assignees = task.assigned_to_profiles ?? [];
                  const group = task.group_id ? groupMap[task.group_id] : null;

                  return (
                    <div
                      key={task.id}
                      className="grid grid-cols-[1fr_80px_100px_100px_80px_80px] gap-4 px-4 py-3 hover:bg-[#FAFAF8] transition-colors group"
                    >
                      {/* Title */}
                      <button
                        type="button"
                        onClick={() => onTaskClick(task)}
                        className="text-left text-sm text-[#1A1A1A] truncate group-hover:text-[#D4AF37] transition-colors font-medium"
                      >
                        {task.status === "completed" && (
                          <span className="mr-1.5 text-emerald-500">✓</span>
                        )}
                        {task.title}
                      </button>

                      {/* Priority */}
                      <div>
                        {priorityConfig ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                              priorityConfig.className,
                            )}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                priorityConfig.dotClass,
                              )}
                            />
                            {priorityConfig.label}
                          </span>
                        ) : (
                          <span className="text-zinc-300 text-xs">—</span>
                        )}
                      </div>

                      {/* Assignees */}
                      <div>
                        {assignees.length > 0 ? (
                          <AvatarStack assignees={assignees} maxVisible={3} size="sm" />
                        ) : (
                          <span className="text-zinc-300 text-xs">—</span>
                        )}
                      </div>

                      {/* Progress */}
                      <InlineProgressCell task={task} />

                      {/* Due date */}
                      <DueDateCell date={task.due_date ?? null} />

                      {/* Group */}
                      <span className="text-[10px] text-zinc-400 truncate">
                        {group?.title ?? "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-zinc-400">No tasks yet.</p>
          <p className="text-xs text-zinc-300 mt-1">
            Switch to board view to add your first task group.
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import { TASK_PRIORITY_CONFIG } from "@/lib/types/database";
import type { TaskGroup, ProjectTask } from "@/lib/types/database";
import {
  createTaskGroup,
  createGroupTask,
  updateTaskProgress,
} from "@/lib/actions/projects";
import { format, isAfter, differenceInHours } from "date-fns";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ListViewProps {
  projectId: string;
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

export function ListView({
  projectId,
  taskGroups,
  tasks,
  onTaskClick,
}: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [inlineAdd, setInlineAdd] = useState<{ groupId: string; value: string } | null>(
    null,
  );
  const [groupPending, startGroupTransition] = useTransition();
  const router = useRouter();

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

  function handleAddGroup() {
    if (!newGroupTitle.trim()) return;
    startGroupTransition(async () => {
      const result = await createTaskGroup(projectId, {
        title: newGroupTitle.trim(),
        position: taskGroups.length,
      });
      if (result.success) {
        toast.success("Group created");
        setNewGroupTitle("");
        setAddingGroup(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to create group");
      }
    });
  }

  function handleInlineAddTask(groupId: string) {
    if (!inlineAdd?.value.trim()) {
      setInlineAdd(null);
      return;
    }
    startGroupTransition(async () => {
      const result = await createGroupTask(groupId, {
        title: inlineAdd.value.trim(),
      });
      if (result.success) {
        setInlineAdd(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to create task");
      }
    });
  }

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

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-280px)] px-6 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center">
          <Plus className="w-6 h-6 text-[#D4AF37]/70" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-700 mb-1">No groups yet</p>
          <p className="text-xs text-zinc-400 max-w-xs">
            Create your first group (for example Design, Backend, QA) to start adding tasks.
          </p>
        </div>

        {addingGroup ? (
          <div className="w-[280px] rounded-2xl border border-dashed border-[#D4AF37]/50 p-4 space-y-3">
            <input
              autoFocus
              type="text"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGroup();
                if (e.key === "Escape") {
                  setAddingGroup(false);
                  setNewGroupTitle("");
                }
              }}
              placeholder="Group name…"
              maxLength={200}
              className="w-full text-sm font-medium text-[#1A1A1A] bg-transparent focus:outline-none placeholder:text-zinc-400"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="gold"
                disabled={groupPending}
                onClick={handleAddGroup}
                className="text-xs"
              >
                {groupPending ? "Adding…" : "Add"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAddingGroup(false);
                  setNewGroupTitle("");
                }}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingGroup(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D4AF37] text-[#0A0A0A] text-sm font-semibold hover:bg-[#C9A530] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create first group
          </button>
        )}
      </div>
    );
  }

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

      {sorted.map((group) => {
        const groupTasks = tasks.filter((t) => t.group_id === group.id);
        const isCollapsed = collapsed.has(group.id);

        return (
          <div key={group.id} className="mb-4">
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

            {!isCollapsed &&
              (groupTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-[#FAFAF8]/60 px-4 py-6">
                  <p className="text-xs text-zinc-400 text-center mb-3">No tasks in this group yet.</p>
                  {inlineAdd?.groupId === group.id ? (
                    <div className="max-w-md mx-auto rounded-2xl border border-[#D4AF37]/40 bg-white p-2.5">
                      <input
                        autoFocus
                        type="text"
                        value={inlineAdd.value}
                        onChange={(e) =>
                          setInlineAdd({ groupId: group.id, value: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleInlineAddTask(group.id);
                          if (e.key === "Escape") setInlineAdd(null);
                        }}
                        onBlur={() => handleInlineAddTask(group.id)}
                        placeholder="Task title…"
                        className="w-full text-sm text-[#1A1A1A] bg-transparent focus:outline-none placeholder:text-zinc-400"
                      />
                      <div className="flex items-center gap-1.5 mt-2">
                        <button
                          type="button"
                          disabled={groupPending}
                          onClick={() => handleInlineAddTask(group.id)}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[#D4AF37] text-[#0A0A0A] hover:bg-[#C9A530] transition-colors disabled:opacity-50"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setInlineAdd(null)}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg text-zinc-500 hover:bg-zinc-100 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => setInlineAdd({ groupId: group.id, value: "" })}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-zinc-500",
                          "hover:text-zinc-700 hover:bg-white border border-transparent hover:border-zinc-200 transition-colors",
                          "text-xs font-medium",
                        )}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add task
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#E5E4DF] bg-white overflow-hidden divide-y divide-[#F0F0EE]">
                  {sortTasks(groupTasks).map((task) => {
                    const priorityConfig = task.priority
                      ? TASK_PRIORITY_CONFIG[task.priority]
                      : null;
                    const assignees = task.assigned_to_profiles ?? [];
                    const g = task.group_id ? groupMap[task.group_id] : null;

                    return (
                      <div
                        key={task.id}
                        className="grid grid-cols-[1fr_80px_100px_100px_80px_80px] gap-4 px-4 py-3 hover:bg-[#FAFAF8] transition-colors group"
                      >
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

                        <div>
                          {assignees.length > 0 ? (
                            <AvatarStack assignees={assignees} maxVisible={3} size="sm" />
                          ) : (
                            <span className="text-zinc-300 text-xs">—</span>
                          )}
                        </div>

                        <InlineProgressCell task={task} />

                        <DueDateCell date={task.due_date ?? null} />

                        <span className="text-[10px] text-zinc-400 truncate">
                          {g?.title ?? "—"}
                        </span>
                      </div>
                    );
                  })}
                  <div className="px-4 py-2.5 bg-[#FAFAF8]/50">
                    {inlineAdd?.groupId === group.id ? (
                      <div className="flex flex-col gap-2 max-w-lg">
                        <input
                          autoFocus
                          type="text"
                          value={inlineAdd.value}
                          onChange={(e) =>
                            setInlineAdd({ groupId: group.id, value: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleInlineAddTask(group.id);
                            if (e.key === "Escape") setInlineAdd(null);
                          }}
                          onBlur={() => handleInlineAddTask(group.id)}
                          placeholder="Task title…"
                          className="w-full text-sm text-[#1A1A1A] bg-white border border-[#E5E4DF] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 placeholder:text-zinc-400"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={groupPending}
                            onClick={() => handleInlineAddTask(group.id)}
                            className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[#D4AF37] text-[#0A0A0A] hover:bg-[#C9A530] transition-colors disabled:opacity-50"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => setInlineAdd(null)}
                            className="text-xs font-medium px-2.5 py-1 rounded-lg text-zinc-500 hover:bg-zinc-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setInlineAdd({ groupId: group.id, value: "" })}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-zinc-400",
                          "hover:text-zinc-600 hover:bg-white transition-colors",
                          "text-xs font-medium",
                        )}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add task
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        );
      })}

      <div className="mt-2 max-w-[280px]">
        {addingGroup ? (
          <div className="rounded-2xl border border-dashed border-[#D4AF37]/50 p-4 space-y-3">
            <input
              autoFocus
              type="text"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGroup();
                if (e.key === "Escape") {
                  setAddingGroup(false);
                  setNewGroupTitle("");
                }
              }}
              placeholder="Group name…"
              maxLength={200}
              className="w-full text-sm font-medium text-[#1A1A1A] bg-transparent focus:outline-none placeholder:text-zinc-400"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="gold"
                disabled={groupPending}
                onClick={handleAddGroup}
                className="text-xs"
              >
                {groupPending ? "Adding…" : "Add"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAddingGroup(false);
                  setNewGroupTitle("");
                }}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingGroup(true)}
            className={cn(
              "w-full flex items-center gap-2 px-4 py-3 rounded-2xl",
              "border border-dashed border-zinc-200 hover:border-[#D4AF37]/50",
              "text-zinc-400 hover:text-zinc-600",
              "transition-all duration-200",
              "text-[13px] font-medium",
            )}
          >
            <Plus className="w-4 h-4" />
            New group
          </button>
        )}
      </div>
    </div>
  );
}

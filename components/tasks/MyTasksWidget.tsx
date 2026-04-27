"use client";

import { useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { format, isToday, isTomorrow, isPast, addDays, isBefore } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Plus, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Input } from "@/components/ui/input";
import { completePersonalTask, createPersonalTask } from "@/lib/actions/tasks";
import type { PersonalTask, AtlasTaskStatus } from "@/lib/types/database";

const IST = "Asia/Kolkata";

interface MyTasksWidgetProps {
  initialTasks: PersonalTask[];
}

type DateGroup = "overdue" | "today" | "upcoming" | "none";

function getGroup(task: PersonalTask): DateGroup {
  if (!task.due_date) return "none";
  const due = toZonedTime(new Date(task.due_date), IST);
  const now = toZonedTime(new Date(), IST);
  if (task.atlas_status === "done" || task.atlas_status === "cancelled") return "none";
  if (isPast(due) && !isToday(due)) return "overdue";
  if (isToday(due)) return "today";
  return "upcoming";
}

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-[#D4AF37]",
  high:     "bg-orange-500",
  medium:   "bg-purple-500",
  low:      "bg-zinc-300",
};

const GROUP_CONFIG: Record<
  DateGroup,
  { label: string; emptyLabel: string; headerClass: string }
> = {
  overdue:  { label: "Overdue",  emptyLabel: "", headerClass: "text-red-600" },
  today:    { label: "Today",    emptyLabel: "Nothing due today", headerClass: "text-zinc-800" },
  upcoming: { label: "Upcoming", emptyLabel: "No upcoming tasks", headerClass: "text-zinc-600" },
  none:     { label: "No Date",  emptyLabel: "No undated tasks",  headerClass: "text-zinc-400" },
};

export function MyTasksWidget({ initialTasks }: MyTasksWidgetProps) {
  const [tasks, setTasks]                 = useState<PersonalTask[]>(initialTasks);
  const [addingGroup, setAddingGroup]     = useState<DateGroup | null>(null);
  const [newTitle, setNewTitle]           = useState("");
  const [completingId, setCompletingId]  = useState<string | null>(null);
  const [isPending, startTransition]      = useTransition();

  function handleComplete(taskId: string) {
    setCompletingId(taskId);
    startTransition(async () => {
      const result = await completePersonalTask(taskId);
      if (result.success) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, atlas_status: "done" as AtlasTaskStatus } : t,
          ),
        );
      } else {
        toast.error(result.error ?? "Failed to complete task");
      }
      setCompletingId(null);
    });
  }

  function handleAdd(group: DateGroup) {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      const dueDate =
        group === "today"
          ? new Date().toISOString()
          : group === "upcoming"
          ? addDays(new Date(), 3).toISOString()
          : undefined;

      const result = await createPersonalTask({
        title:    newTitle.trim(),
        due_date: dueDate,
      });
      if (result.success && result.data) {
        const newTask: PersonalTask = {
          id:               result.data.id,
          title:            newTitle.trim(),
          notes:            null,
          unified_task_type: "personal",
          atlas_status:     "todo",
          priority:         "medium",
          due_date:         dueDate ?? null,
          progress:         0,
          created_by:       null,
          assigned_to_users: [],
          created_at:       new Date().toISOString(),
          updated_at:       new Date().toISOString(),
        };
        setTasks((prev) => [...prev, newTask]);
        setNewTitle("");
        setAddingGroup(null);
        toast.success("Task added");
      } else {
        toast.error(result.error ?? "Failed to add task");
      }
    });
  }

  const groups: DateGroup[] = ["overdue", "today", "upcoming", "none"];
  const activeTasks = tasks.filter(
    (t) => t.atlas_status !== "done" && t.atlas_status !== "cancelled",
  );

  return (
    <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-base font-semibold text-zinc-900">My Tasks</h2>
        <IndulgeButton
          variant="outline"
          size="sm"
          onClick={() => setAddingGroup("today")}
          aria-label="Add a personal task"
          leftIcon={<Plus className="h-3.5 w-3.5" />}
        >
          Add Task
        </IndulgeButton>
      </div>

      {activeTasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-zinc-400">
          <CheckCircle2 className="h-8 w-8 opacity-30" />
          <p className="text-sm">You&apos;re all caught up!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const groupTasks = activeTasks.filter((t) => getGroup(t) === group);
            const config = GROUP_CONFIG[group];
            if (groupTasks.length === 0 && addingGroup !== group) return null;

            return (
              <div key={group}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-2">
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-widest",
                      config.headerClass,
                    )}
                  >
                    {config.label}
                  </p>
                  {groupTasks.length > 0 && (
                    <span className="text-[10px] text-zinc-400">({groupTasks.length})</span>
                  )}
                </div>

                {/* Task rows */}
                <div className="space-y-1.5">
                  {groupTasks.map((task) => {
                    const dueDateLabel = task.due_date
                      ? format(toZonedTime(new Date(task.due_date), IST), "d MMM")
                      : null;
                    const isCompleting = completingId === task.id;

                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-zinc-50 transition-colors group"
                      >
                        {/* Complete checkbox */}
                        <button
                          onClick={() => handleComplete(task.id)}
                          disabled={isCompleting || isPending}
                          className="flex-shrink-0 text-zinc-300 hover:text-emerald-500 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded"
                          aria-label={`Mark "${task.title}" as complete`}
                        >
                          {isCompleting ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 animate-spin" />
                          ) : (
                            <Circle className="h-4 w-4" />
                          )}
                        </button>

                        {/* Priority dot */}
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full flex-shrink-0",
                            PRIORITY_DOT[task.priority] ?? "bg-zinc-300",
                          )}
                          aria-hidden
                        />

                        {/* Title */}
                        <span className="flex-1 text-sm text-zinc-700 truncate">
                          {task.title}
                        </span>

                        {/* Due date */}
                        {dueDateLabel && (
                          <span
                            className={cn(
                              "text-[10px] font-medium flex-shrink-0",
                              group === "overdue" ? "text-red-600" : "text-zinc-400",
                            )}
                          >
                            {dueDateLabel}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Inline add form */}
                  {addingGroup === group ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); handleAdd(group); }}
                      className="flex items-center gap-1.5"
                    >
                      <Input
                        autoFocus
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="New task title…"
                        className="h-8 text-sm flex-1"
                        maxLength={255}
                        aria-label="New personal task title"
                      />
                      <IndulgeButton
                        type="submit"
                        size="sm"
                        variant="gold"
                        loading={isPending}
                        className="h-8 px-2.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </IndulgeButton>
                      <button
                        type="button"
                        onClick={() => { setAddingGroup(null); setNewTitle(""); }}
                        className="h-8 px-2 text-xs text-zinc-400 hover:text-zinc-700"
                        aria-label="Cancel"
                      >
                        ×
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setAddingGroup(group)}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"
                      aria-label={`Add task to ${config.label} group`}
                    >
                      <Plus className="h-3 w-3" />
                      Add to {config.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

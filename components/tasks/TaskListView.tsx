"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import { SubTaskStatusBadge } from "./SubTaskStatusBadge";
import { TaskPriorityBadge } from "./TaskPriorityBadge";
import { SubTaskDetailSheet } from "./SubTaskDetailSheet";
import type { TaskGroup, SubTask } from "@/lib/types/database";
import {
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const IST = "Asia/Kolkata";

interface TaskListViewProps {
  groups: (TaskGroup & { tasks: SubTask[] })[];
}

export function TaskListView({ groups }: TaskListViewProps) {
  const [selectedTaskId, setSelectedTaskId]       = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups]     = useState<Set<string>>(new Set());

  function toggleGroup(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.id);
        const subtasks  = group.tasks as SubTask[];
        const doneCount = subtasks.filter((t) => t.atlas_status === "done").length;

        return (
          <div key={group.id} className="rounded-xl border border-zinc-200 overflow-hidden">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center gap-2 px-4 py-2.5 bg-zinc-50 hover:bg-zinc-100 transition-colors text-left"
              aria-expanded={!isCollapsed}
              aria-controls={`group-tasks-${group.id}`}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-zinc-400 flex-shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-zinc-400 flex-shrink-0" />
              )}
              <span className="text-sm font-semibold text-zinc-800 flex-1 text-left">
                {group.title}
              </span>
              <span className="text-xs text-zinc-400">
                {doneCount}/{subtasks.length}
              </span>
            </button>

            {/* Task rows */}
            {!isCollapsed && (
              <div id={`group-tasks-${group.id}`} role="list">
                {subtasks.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-zinc-400 italic">
                    No tasks in this group
                  </p>
                ) : (
                  subtasks.map((task, i) => {
                    const isLast = i === subtasks.length - 1;
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
                        key={task.id}
                        role="listitem"
                        onClick={() => setSelectedTaskId(task.id)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 transition-colors",
                          !isLast && "border-b border-zinc-100",
                        )}
                      >
                        {/* Priority dot */}
                        <span
                          className="h-2 w-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor:
                              task.priority === "urgent" ? "#D4AF37"
                              : task.priority === "high" ? "#F97316"
                              : task.priority === "medium" ? "#8B5CF6"
                              : "#9CA3AF",
                          }}
                          aria-hidden
                        />

                        {/* Title */}
                        <span className="flex-1 text-sm text-zinc-800 truncate">
                          {task.title}
                        </span>

                        {/* Status */}
                        <SubTaskStatusBadge
                          status={task.atlas_status ?? "todo"}
                          size="sm"
                          className="hidden sm:inline-flex"
                        />

                        {/* Priority */}
                        <TaskPriorityBadge
                          priority={task.priority ?? "medium"}
                          size="sm"
                          className="hidden md:inline-flex"
                        />

                        {/* Due date */}
                        {dueDateLabel && (
                          <span
                            className={cn(
                              "text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0",
                              isOverdue
                                ? "bg-red-500/10 text-red-600"
                                : "text-zinc-400",
                            )}
                          >
                            {dueDateLabel}
                          </span>
                        )}

                        {/* Assignee */}
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
                  })
                )}
              </div>
            )}
          </div>
        );
      })}

      {selectedTaskId && (
        <SubTaskDetailSheet
          taskId={selectedTaskId}
          open={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}

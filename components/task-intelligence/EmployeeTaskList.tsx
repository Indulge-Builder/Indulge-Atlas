"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Check, Circle, Inbox, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ATLAS_TASK_STATUS_COLORS,
  ATLAS_TASK_STATUS_LABELS,
  TASK_PRIORITY_CONFIG,
} from "@/lib/types/database";
import type {
  AtlasTaskStatus,
  EmployeeDossierPayload,
  PersonalTask,
  WorkspaceSubtaskAssignment,
} from "@/lib/types/database";

const IST = "Asia/Kolkata";

function formatDueIst(iso: string | null | undefined): string {
  if (!iso) return "";
  return format(toZonedTime(new Date(iso), IST), "d MMM, h:mm a");
}

function isGroupSubOverdue(
  due: string | null,
  status: AtlasTaskStatus,
): boolean {
  if (!due) return false;
  if (status === "done" || status === "cancelled") return false;
  return new Date(due).getTime() < Date.now();
}

function isPersonalOverdue(task: PersonalTask): boolean {
  if (task.atlas_status === "done" || task.atlas_status === "cancelled") return false;
  if (!task.due_date) return false;
  return new Date(task.due_date).getTime() < Date.now();
}

export interface EmployeeTaskListProps {
  personalTasks: EmployeeDossierPayload["personalTasks"];
  workspaceSubtasks: WorkspaceSubtaskAssignment[];
  agentName: string;
  onOpenWorkspaceSubtask: (subtaskId: string) => void;
  onOpenPersonalTask: (taskId: string) => void;
}

type TabKey = "personal" | "workspace";

type PersonalSectionKey =
  | "dailySop"
  | "pendingToday"
  | "upcoming"
  | "completedLastWeek";

export function EmployeeTaskList({
  personalTasks,
  workspaceSubtasks,
  agentName,
  onOpenWorkspaceSubtask,
  onOpenPersonalTask,
}: EmployeeTaskListProps) {
  const [tab, setTab] = useState<TabKey>("personal");

  const safePersonal = useMemo(() => {
    const pt = personalTasks as EmployeeDossierPayload["personalTasks"] & {
      overdue?: PersonalTask[];
      thisWeek?: PersonalTask[];
    };
    return {
      dailySop: pt.dailySop ?? [],
      pendingToday: pt.pendingToday ?? [],
      upcoming: pt.upcoming ?? [],
      completedLastWeek: pt.completedLastWeek ?? [],
    };
  }, [personalTasks]);

  const sortedWorkspace = useMemo(() => {
    return [...workspaceSubtasks].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [workspaceSubtasks]);

  const personalEmpty =
    safePersonal.dailySop.length === 0 &&
    safePersonal.pendingToday.length === 0 &&
    safePersonal.upcoming.length === 0 &&
    safePersonal.completedLastWeek.length === 0;

  const sections: {
    key: PersonalSectionKey;
    label: string;
    labelClass: string;
  }[] = [
    { key: "dailySop", label: "SOP", labelClass: "text-[#9A7B2E]" },
    {
      key: "pendingToday",
      label: "Pending today",
      labelClass: "text-stone-500",
    },
    {
      key: "upcoming",
      label: "Upcoming",
      labelClass: "text-stone-500",
    },
    {
      key: "completedLastWeek",
      label: "Completed (past 7 days)",
      labelClass: "text-stone-500",
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div
        className="flex shrink-0 gap-1 border-b border-[#E5E4DF] bg-[#F2F2EE] p-1.5"
        role="tablist"
        aria-label="Task source"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "personal"}
          onClick={() => setTab("personal")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "personal"
              ? "bg-white text-stone-900 shadow-sm ring-1 ring-[#E5E4DF]/80"
              : "text-stone-600 hover:bg-white/60 hover:text-stone-900",
          )}
        >
          Personal tasks
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "workspace"}
          onClick={() => setTab("workspace")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "workspace"
              ? "bg-white text-stone-900 shadow-sm ring-1 ring-[#E5E4DF]/80"
              : "text-stone-600 hover:bg-white/60 hover:text-stone-900",
          )}
        >
          Workspace tasks
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "personal" && (
          <>
            <div className="sticky top-0 z-10 border-b border-[#E5E4DF] bg-[#FAFAF8]/95 px-5 py-2.5 backdrop-blur-sm">
              <p className="text-[11px] leading-relaxed text-stone-600">
                Personal and group-assigned tasks for{" "}
                <span className="font-medium text-stone-800">{agentName}</span>
              </p>
            </div>

            {personalEmpty ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Inbox className="h-10 w-10 text-stone-300" aria-hidden />
                <p className="text-sm text-stone-500">No personal tasks</p>
              </div>
            ) : (
              sections.map(({ key, label, labelClass }) => {
                const bucket = safePersonal[key];
                if (!bucket?.length) return null;

                if (key === "dailySop") {
                  return (
                    <div key={key}>
                      <div className="flex items-center gap-2 px-5 pb-1 pt-4">
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wider",
                            labelClass,
                          )}
                        >
                          {label}
                        </span>
                        <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-stone-600 ring-1 ring-[#E5E4DF]">
                          {bucket.length}
                        </span>
                      </div>
                      <ul className="divide-y divide-[#E5E4DF]/70">
                        {(bucket as PersonalTask[]).map((task) => {
                          const done = task.atlas_status === "done";
                          return (
                            <li key={task.id}>
                              <button
                                type="button"
                                onClick={() => onOpenPersonalTask(task.id)}
                                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[#F9F9F6]"
                              >
                                <span
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E5E4DF] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
                                  aria-hidden
                                >
                                  {done ? (
                                    <Check
                                      className="h-3.5 w-3.5 text-[#B8941E]"
                                      strokeWidth={2.5}
                                    />
                                  ) : (
                                    <Circle
                                      className="h-2 w-2 text-stone-300"
                                      fill="currentColor"
                                    />
                                  )}
                                </span>
                                <span
                                  className={cn(
                                    "min-w-0 flex-1 truncate text-sm",
                                    done
                                      ? "text-stone-400 line-through"
                                      : "text-stone-800",
                                  )}
                                >
                                  {task.title}
                                </span>
                                {task.due_date ? (
                                  <span className="shrink-0 text-[11px] tabular-nums text-stone-500">
                                    {formatDueIst(task.due_date)}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                }

                return (
                  <div key={key}>
                    <div className="flex items-center gap-2 px-5 pb-1 pt-4">
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase tracking-wider",
                          labelClass,
                        )}
                      >
                        {label}
                      </span>
                      <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-stone-600 ring-1 ring-[#E5E4DF]">
                        {bucket.length}
                      </span>
                    </div>
                    <ul className="divide-y divide-[#E5E4DF]/70">
                      {(bucket as PersonalTask[]).map((task) => {
                        const doneBucket = key === "completedLastWeek";
                        const pri = TASK_PRIORITY_CONFIG[task.priority];
                        const late =
                          key === "upcoming" && isPersonalOverdue(task);
                        return (
                          <li key={task.id}>
                            <button
                              type="button"
                              onClick={() => onOpenPersonalTask(task.id)}
                              className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[#F9F9F6]"
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  pri?.dotClass ?? "bg-stone-400",
                                )}
                              />
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate text-sm",
                                  doneBucket
                                    ? "text-stone-400 line-through"
                                    : "text-stone-800",
                                )}
                              >
                                {task.title}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 text-[11px] tabular-nums",
                                  late ? "font-medium text-red-700" : "text-stone-500",
                                )}
                              >
                                {doneBucket && task.updated_at
                                  ? formatDueIst(task.updated_at)
                                  : task.due_date
                                    ? formatDueIst(task.due_date)
                                    : ""}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </>
        )}

        {tab === "workspace" && (
          <>
            <p className="border-b border-[#E5E4DF]/80 px-5 pb-2.5 pt-4 text-xs text-stone-600">
              Master workspace assignments for{" "}
              <span className="font-medium text-stone-800">{agentName}</span>
            </p>
            {sortedWorkspace.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Users className="h-10 w-10 text-stone-300" aria-hidden />
                <p className="text-sm text-stone-500">No workspace task assignments</p>
              </div>
            ) : (
              <ul className="divide-y divide-[#E5E4DF]/70">
                {sortedWorkspace.map((sub) => {
                  const coverColor = sub.masterCoverColor ?? "#78716c";
                  const parentTitle = sub.masterTaskTitle ?? "Workspace";
                  const overdue = isGroupSubOverdue(
                    sub.due_date,
                    sub.atlas_status,
                  );
                  const crumb =
                    parentTitle.length > 20
                      ? `${parentTitle.slice(0, 20)}…`
                      : parentTitle;
                  const statusColor =
                    ATLAS_TASK_STATUS_COLORS[sub.atlas_status] ?? "#6B7280";
                  return (
                    <li key={sub.id}>
                      <button
                        type="button"
                        onClick={() => onOpenWorkspaceSubtask(sub.id)}
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-2 px-5 py-3 text-left transition-colors hover:bg-[#F9F9F6] sm:flex-nowrap"
                      >
                        <span
                          className="max-w-[120px] shrink-0 truncate rounded-full border px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            borderColor: `${coverColor}55`,
                            color: coverColor,
                            backgroundColor: `${coverColor}12`,
                          }}
                        >
                          {crumb}
                        </span>
                        <span className="shrink-0 text-[10px] text-stone-400" aria-hidden>
                          ›
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                          {sub.title}
                        </span>
                        <span
                          className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            borderColor: `${statusColor}50`,
                            color: statusColor,
                            backgroundColor: `${statusColor}12`,
                          }}
                        >
                          {ATLAS_TASK_STATUS_LABELS[sub.atlas_status]}
                        </span>
                        <div className="relative h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-stone-200">
                          <div
                            className="absolute left-0 top-0 h-full rounded-full"
                            style={{
                              width: `${sub.progress ?? 0}%`,
                              backgroundColor: coverColor,
                            }}
                          />
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-[11px] tabular-nums",
                            overdue ? "font-medium text-red-700" : "text-stone-500",
                          )}
                        >
                          {sub.due_date ? formatDueIst(sub.due_date) : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

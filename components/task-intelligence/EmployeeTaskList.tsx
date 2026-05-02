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
      dailySop:          pt.dailySop ?? [],
      pendingToday:      pt.pendingToday ?? [],
      upcoming:          pt.upcoming ?? [],
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
    { key: "dailySop", label: "SOP", labelClass: "text-[#D4AF37]/90" },
    {
      key: "pendingToday",
      label: "PENDING TODAY",
      labelClass: "text-white/30",
    },
    {
      key: "upcoming",
      label: "UPCOMING",
      labelClass: "text-white/30",
    },
    {
      key: "completedLastWeek",
      label: "COMPLETED (PAST 7 DAYS)",
      labelClass: "text-white/30",
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 border-b border-white/8">
        <button
          type="button"
          onClick={() => setTab("personal")}
          className={cn(
            "-mb-px px-5 py-3 text-sm transition-colors",
            tab === "personal"
              ? "border-b-2 border-white font-medium text-white"
              : "text-white/40 hover:text-white/60",
          )}
        >
          Personal Tasks
        </button>
        <button
          type="button"
          onClick={() => setTab("workspace")}
          className={cn(
            "-mb-px px-5 py-3 text-sm transition-colors",
            tab === "workspace"
              ? "border-b-2 border-white font-medium text-white"
              : "text-white/40 hover:text-white/60",
          )}
        >
          Workspace tasks
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "personal" && (
          <>
            <div className="sticky top-0 z-10 border-b border-white/5 bg-[var(--surface-1)] px-5 py-2.5">
              <p className="text-[11px] text-white/35">
                Personal and group-assigned tasks for {agentName}
              </p>
            </div>

            {personalEmpty ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Inbox className="h-10 w-10 text-white/15" />
                <p className="text-sm text-white/30">No personal tasks</p>
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
                            "text-[10px] font-semibold uppercase tracking-widest",
                            labelClass,
                          )}
                        >
                          {label}
                        </span>
                        <span className="rounded-full bg-white/8 px-1.5 text-[10px] text-white/40">
                          {bucket.length}
                        </span>
                      </div>
                      <ul>
                        {(bucket as PersonalTask[]).map((task) => {
                          const done = task.atlas_status === "done";
                          return (
                            <li key={task.id}>
                              <button
                                type="button"
                                onClick={() => onOpenPersonalTask(task.id)}
                                className="flex w-full items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-white/[0.06]"
                              >
                                <span
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04]"
                                  aria-hidden
                                >
                                  {done ? (
                                    <Check
                                      className="h-3.5 w-3.5 text-[#D4AF37]"
                                      strokeWidth={2.5}
                                    />
                                  ) : (
                                    <Circle className="h-2 w-2 text-white/20" fill="currentColor" />
                                  )}
                                </span>
                                <span
                                  className={cn(
                                    "min-w-0 flex-1 truncate text-sm",
                                    done ? "text-white/40 line-through" : "text-white/85",
                                  )}
                                >
                                  {task.title}
                                </span>
                                {task.due_date ? (
                                  <span className="shrink-0 text-[11px] text-white/35">
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
                          "text-[10px] font-semibold uppercase tracking-widest",
                          labelClass,
                        )}
                      >
                        {label}
                      </span>
                      <span className="rounded-full bg-white/8 px-1.5 text-[10px] text-white/40">
                        {bucket.length}
                      </span>
                    </div>
                    <ul>
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
                              className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  pri?.dotClass ?? "bg-white/30",
                                )}
                              />
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate text-sm",
                                  doneBucket
                                    ? "text-white/35 line-through"
                                    : "text-white/80",
                                )}
                              >
                                {task.title}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 text-[11px]",
                                  late ? "text-red-400/80" : "text-white/40",
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
            <p className="px-5 pb-2 pt-4 text-xs text-white/40">
              Master workspace assignments for {agentName}
            </p>
            {sortedWorkspace.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Users className="h-10 w-10 text-white/15" />
                <p className="text-sm text-white/30">
                  No workspace task assignments
                </p>
              </div>
            ) : (
              <ul>
                {sortedWorkspace.map((sub) => {
                  const coverColor = sub.masterCoverColor ?? "#6366f1";
                  const parentTitle = sub.masterTaskTitle ?? "Workspace";
                  const overdue = isGroupSubOverdue(
                    sub.due_date,
                    sub.atlas_status,
                  );
                  const crumb =
                    parentTitle.length > 20
                      ? `${parentTitle.slice(0, 20)}…`
                      : parentTitle;
                  return (
                    <li key={sub.id}>
                      <button
                        type="button"
                        onClick={() => onOpenWorkspaceSubtask(sub.id)}
                        className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                      >
                        <span
                          className="max-w-[100px] shrink-0 truncate rounded-full border px-2 py-0.5 text-[10px]"
                          style={{
                            borderColor: `${coverColor}80`,
                            color: coverColor,
                            backgroundColor: `${coverColor}12`,
                          }}
                        >
                          {crumb}
                        </span>
                        <span className="shrink-0 text-[10px] text-white/20">
                          ›
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-white/80">
                          {sub.title}
                        </span>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] text-white"
                          style={{
                            backgroundColor: `${ATLAS_TASK_STATUS_COLORS[sub.atlas_status]}35`,
                          }}
                        >
                          {ATLAS_TASK_STATUS_LABELS[sub.atlas_status]}
                        </span>
                        <div className="relative h-1 w-12 shrink-0 overflow-hidden rounded-full bg-white/8">
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
                            "shrink-0 text-[11px]",
                            overdue ? "text-red-400" : "text-white/40",
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

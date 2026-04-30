"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Inbox, Lock, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ATLAS_TASK_STATUS_COLORS,
  ATLAS_TASK_STATUS_LABELS,
  TASK_PRIORITY_CONFIG,
} from "@/lib/types/database";
import type {
  AtlasTaskStatus,
  EmployeeDossierPayload,
  WorkspaceSubtaskAssignment,
} from "@/lib/types/database";
import { PrivacyBadge } from "@/components/tasks/shared/PrivacyBadge";

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

export interface EmployeeTaskListProps {
  personalTasks: EmployeeDossierPayload["personalTasks"];
  workspaceSubtasks: WorkspaceSubtaskAssignment[];
  agentName: string;
}

type TabKey = "personal" | "workspace";

export function EmployeeTaskList({
  personalTasks,
  workspaceSubtasks,
  agentName,
}: EmployeeTaskListProps) {
  const [tab, setTab] = useState<TabKey>("personal");

  const sortedWorkspace = useMemo(() => {
    return [...workspaceSubtasks].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [workspaceSubtasks]);

  const personalEmpty =
    personalTasks.overdue.length === 0 &&
    personalTasks.today.length === 0 &&
    personalTasks.thisWeek.length === 0 &&
    personalTasks.upcoming.length === 0 &&
    personalTasks.completedToday.length === 0;

  const sections: {
    key: keyof EmployeeDossierPayload["personalTasks"];
    label: string;
    labelClass: string;
  }[] = [
    { key: "overdue", label: "OVERDUE", labelClass: "text-red-400/70" },
    { key: "today", label: "TODAY", labelClass: "text-white/30" },
    { key: "thisWeek", label: "THIS WEEK", labelClass: "text-white/30" },
    { key: "upcoming", label: "UPCOMING", labelClass: "text-white/30" },
    {
      key: "completedToday",
      label: "COMPLETED TODAY",
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
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/5 bg-[var(--surface-1)] px-5 py-2.5">
              <Lock className="h-3 w-3 shrink-0 text-white/25" />
              <p className="text-[11px] text-white/35">
                These tasks are private to {agentName}
              </p>
            </div>

            {personalEmpty ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Inbox className="h-10 w-10 text-white/15" />
                <p className="text-sm text-white/30">No personal tasks</p>
              </div>
            ) : (
              sections.map(({ key, label, labelClass }) => {
                const bucket = personalTasks[key];
                if (!bucket.length) return null;
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
                      {bucket.map((task) => {
                        const doneBucket = key === "completedToday";
                        const pri = TASK_PRIORITY_CONFIG[task.priority];
                        return (
                          <li
                            key={task.id}
                            className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.03]"
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
                            <span className="shrink-0 text-[11px] text-white/40">
                              {task.due_date
                                ? formatDueIst(task.due_date)
                                : ""}
                            </span>
                            <PrivacyBadge
                              isManagerView
                              className="shrink-0"
                            />
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
                  const coverColor =
                    sub.masterCoverColor ?? "#6366f1";
                  const parentTitle = sub.masterTaskTitle ?? "Workspace";
                  const overdue = isGroupSubOverdue(
                    sub.due_date,
                    sub.atlas_status,
                  );
                  const crumb =
                    parentTitle.length > 20
                      ? `${parentTitle.slice(0, 20)}…`
                      : parentTitle;
                  const masterHref = sub.project_id
                    ? `/tasks/${sub.project_id}`
                    : "/tasks";
                  return (
                    <li key={sub.id}>
                      <Link
                        href={masterHref}
                        className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.03]"
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
                      </Link>
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

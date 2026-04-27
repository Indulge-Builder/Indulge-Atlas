"use client";

import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { TASK_PRIORITY_CONFIG } from "@/lib/types/database";
import type { ProjectTask } from "@/lib/types/database";
import { format, isAfter, differenceInHours } from "date-fns";
import { MessageSquare, ChevronRight } from "lucide-react";

interface TaskCardProps {
  task: ProjectTask;
  onClick: (task: ProjectTask) => void;
}

function priorityProgressColor(progress: number): string {
  if (progress === 100) return "bg-emerald-500";
  if (progress >= 75) return "bg-emerald-400";
  if (progress >= 50) return "bg-amber-400";
  if (progress >= 25) return "bg-orange-400";
  return "bg-zinc-300";
}

function DueDatePill({ date }: { date: string }) {
  const d = new Date(date);
  const now = new Date();
  const isOverdue = isAfter(now, d);
  const isWarning = !isOverdue && differenceInHours(d, now) <= 24;

  return (
    <span
      className={cn(
        "text-[10px] font-medium px-1.5 py-0.5 rounded-md",
        isOverdue && "bg-red-50 text-red-600",
        isWarning && !isOverdue && "bg-amber-50 text-amber-600",
        !isOverdue && !isWarning && "bg-zinc-50 text-zinc-500",
      )}
    >
      {format(d, "MMM d")}
    </span>
  );
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const priorityConfig = task.priority ? TASK_PRIORITY_CONFIG[task.priority] : null;
  const progress = task.progress ?? 0;
  const subTaskCount = task.sub_tasks?.length ?? 0;
  const commentCount = task.comment_count ?? 0;
  const assignees = task.assigned_to_profiles ?? [];

  return (
    <button
      onClick={() => onClick(task)}
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "xs", overflow: "visible" }),
        "w-full text-left cursor-pointer p-3 group",
        "hover:shadow-[0_4px_16px_-4px_rgb(0_0_0/0.10)]",
        "hover:-translate-y-[1px]",
        "transition-all duration-200",
        task.status === "completed" && "opacity-60",
      )}
    >
      {/* Priority + progress bar row */}
      <div className="flex items-center gap-2 mb-2">
        {priorityConfig && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
              priorityConfig.className,
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", priorityConfig.dotClass)} />
            {priorityConfig.label}
          </span>
        )}
        {task.status === "completed" && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 ml-auto">
            Done
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-[13px] font-medium text-[#1A1A1A] leading-snug line-clamp-2 mb-2 group-hover:text-[#111]">
        {task.title}
      </p>

      {/* Progress bar */}
      {progress > 0 && (
        <div className="w-full h-[3px] bg-zinc-100 rounded-full mb-2.5 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              priorityProgressColor(progress),
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Footer row: assignees + meta badges */}
      <div className="flex items-center justify-between gap-2">
        {assignees.length > 0 && (
          <AvatarStack assignees={assignees} maxVisible={3} size="sm" />
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {subTaskCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-zinc-400 font-medium">
              <ChevronRight className="w-2.5 h-2.5" />
              {(task.sub_tasks?.filter((s) => s.status === "completed").length ?? 0)}/
              {subTaskCount}
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-zinc-400">
              <MessageSquare className="w-2.5 h-2.5" />
              {commentCount}
            </span>
          )}
          {task.due_date && <DueDatePill date={task.due_date} />}
        </div>
      </div>
    </button>
  );
}

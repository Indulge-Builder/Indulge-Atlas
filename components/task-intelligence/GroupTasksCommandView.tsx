"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Layers,
  LayoutGrid,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { EmployeeDepartment, TaskInsightsWorkspaceCard } from "@/lib/types/database";
import { TASK_PRIORITY_CONFIG } from "@/lib/types/database";
import { cn, getInitials } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { DEPARTMENT_CONFIG } from "@/lib/constants/departments";
import {
  taskInsightsBentoColClass,
  taskInsightsBentoGridClass,
  taskInsightsCardDensity,
} from "./taskInsightsBento";

function TaskCardIcon({
  iconKey,
  className,
}: {
  iconKey: string | null | undefined;
  className?: string;
}) {
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string }>
  >;
  const Cmp =
    iconKey && icons[iconKey] ? icons[iconKey]! : LucideIcons.Layers;
  return <Cmp className={className} />;
}

interface WorkspaceCardProps {
  task: TaskInsightsWorkspaceCard;
  index: number;
  onOpenWorkspace: (task: TaskInsightsWorkspaceCard) => void;
  showDepartmentBadge?: boolean;
  density?: "relaxed" | "compact";
}

function WorkspaceCard({
  task,
  index,
  onOpenWorkspace,
  showDepartmentBadge = false,
  density = "relaxed",
}: WorkspaceCardProps) {
  const coverColor = task.cover_color ?? "#D4AF37";
  const overdue = task.overdue_subtask_count ?? 0;
  const profiles = task.memberProfiles ?? [];
  const stack = profiles.slice(0, density === "compact" ? 2 : 3);
  const pri = TASK_PRIORITY_CONFIG[task.priority]?.label ?? task.priority;

  const deptRaw = task.department?.trim() ?? "";
  const deptKey =
    deptRaw && deptRaw in DEPARTMENT_CONFIG ? (deptRaw as EmployeeDepartment) : null;
  const deptLabel = deptKey ? DEPARTMENT_CONFIG[deptKey].label : null;

  const compact = density === "compact";

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay: Math.min(index * 0.04, 0.4) }}
      className={cn(
        "group relative flex h-full min-h-0 cursor-pointer flex-col text-left outline-none transition-shadow duration-300",
        surfaceCardVariants({ tone: "luxury", elevation: "sm", overflow: "hidden" }),
        "rounded-xl",
        "hover:shadow-[0_10px_32px_-14px_rgb(0_0_0/0.10)]",
        "focus-visible:ring-2 focus-visible:ring-[#D4AF37]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F9F6]",
      )}
      role="button"
      tabIndex={0}
      onClick={() => onOpenWorkspace(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenWorkspace(task);
        }
      }}
      aria-label={`Open workspace ${task.title}${
        (task.subtask_count ?? 0) > 0 ? `, ${task.subtask_count} subtasks` : ""
      }`}
    >
      <div
        className="h-0.5 w-full shrink-0"
        style={{ backgroundColor: coverColor }}
        aria-hidden
      />

      <div className={cn("relative flex min-h-0 flex-1 flex-col", compact ? "p-3.5" : "p-4")}>
        <div className={cn("flex items-start", compact ? "gap-2.5" : "gap-3")}>
          <div
            className={cn(
              "mt-0.5 flex shrink-0 items-center justify-center rounded-lg",
              compact ? "h-8 w-8" : "h-9 w-9",
            )}
            style={{ backgroundColor: `${coverColor}18` }}
          >
            <span style={{ color: coverColor }}>
              <TaskCardIcon
                iconKey={task.icon_key}
                className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"}
              />
            </span>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <h3
                className={cn(
                  "min-w-0 flex-1 font-serif font-semibold leading-snug tracking-tight text-[#1A1A1A]",
                  compact ? "line-clamp-1 text-[14px]" : "line-clamp-2 text-[15px] sm:text-[16px]",
                )}
              >
                {task.title}
              </h3>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {showDepartmentBadge && deptLabel && (
                  <span
                    className="rounded-full border border-[#E5E4DF] bg-[#FAFAF8] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#6B6B6B]"
                    title={`Department: ${deptLabel}`}
                  >
                    {deptLabel}
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                    TASK_PRIORITY_CONFIG[task.priority]?.className ??
                      "border-[#E5E4DF] bg-[#F9F9F6] text-[#6B6B6B]",
                  )}
                >
                  {pri}
                </span>
              </div>
            </div>

            <div
              className={cn(
                "mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#E5E4DF]/80 pt-2.5 text-[11px] text-[#8A8A6E]",
                compact && "mt-2 gap-x-1.5 pt-2 text-[10px]",
              )}
            >
              <div className="flex -space-x-1">
                {stack.map((p) => (
                  <span
                    key={p.id}
                    title={p.full_name}
                    className={cn(
                      "flex items-center justify-center rounded-full border-2 border-white bg-[#F2F2EE] font-semibold text-[#57534E] shadow-sm",
                      compact ? "h-5 w-5 text-[8px]" : "h-6 w-6 text-[10px]",
                    )}
                  >
                    {getInitials(p.full_name)}
                  </span>
                ))}
              </div>
              {!compact && (
                <span className="font-medium text-[#6B6B6B]">{profiles.length} members</span>
              )}
              {compact ? (
                <span className="tabular-nums text-[#6B6B6B]">{profiles.length}</span>
              ) : null}
              <span className="text-[#E5E4DF]" aria-hidden>
                ·
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-[#1A1814]">
                <Layers
                  className={cn(
                    compact ? "h-3.5 w-3.5" : "h-4 w-4",
                    "shrink-0 text-[#44403C]",
                  )}
                  aria-hidden
                />
                <span className="tabular-nums tracking-tight">
                  {task.subtask_count ?? 0}
                  {!compact ? " subtasks" : ""}
                </span>
              </span>
              {overdue > 0 && (
                <>
                  <span className="text-[#E5E4DF]" aria-hidden>
                    ·
                  </span>
                  <span className="inline-flex items-center gap-0.5 font-semibold text-[#C0392B]">
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                    {overdue}
                    {!compact ? " overdue" : ""}
                  </span>
                </>
              )}

              <span className="ml-auto flex shrink-0 items-center justify-end">
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full bg-[#F9F9F6] text-[#57534E] transition-colors duration-200 group-hover:bg-[#FBF6E8] group-hover:text-[#8B7320]",
                    compact ? "h-7 w-7" : "h-8 w-8",
                  )}
                >
                  <ArrowRight
                    className={cn(
                      "transition-transform duration-200 group-hover:translate-x-0.5",
                      compact ? "h-3.5 w-3.5" : "h-4 w-4",
                    )}
                  />
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

interface GroupTasksCommandViewProps {
  items: TaskInsightsWorkspaceCard[];
  /** When true, show a department label from `task.department` (Task Insights org view). */
  showDepartmentBadge?: boolean;
}

export function GroupTasksCommandView({
  items,
  showDepartmentBadge = false,
}: GroupTasksCommandViewProps) {
  const router = useRouter();

  if (items.length === 0) {
    return (
      <div
        className={cn(
          surfaceCardVariants({ tone: "subtle", elevation: "sm" }),
          "flex flex-col items-center justify-center border-dashed px-8 py-16 text-center",
        )}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E5E4DF]/80 bg-[#F9F9F6] text-[#B5A99A] shadow-[inset_0_1px_0_rgb(255_255_255/0.6)]"
          aria-hidden
        >
          <LayoutGrid className="h-6 w-6" />
        </div>
        <div className="mt-3">
          <p className="font-serif text-lg font-semibold text-[#1A1A1A]">No workspaces yet</p>
          <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[#8A8A6E]">
            No active master workspaces in your scope. When teams create workspaces you can access,
            they will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={taskInsightsBentoGridClass()}>
      {items.map((t, i) => (
        <div key={t.id} className={cn("min-w-0", taskInsightsBentoColClass(i))}>
          <WorkspaceCard
            task={t}
            index={i}
            density={taskInsightsCardDensity(i)}
            showDepartmentBadge={showDepartmentBadge}
            onOpenWorkspace={(task) => router.push(`/tasks/${task.id}`)}
          />
        </div>
      ))}
    </div>
  );
}

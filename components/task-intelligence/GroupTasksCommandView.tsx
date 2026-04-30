"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Layers,
  LayoutGrid,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { AtlasTaskStatus, TaskInsightsWorkspaceCard } from "@/lib/types/database";
import {
  ATLAS_TASK_STATUS_LABELS,
  TASK_PRIORITY_CONFIG,
} from "@/lib/types/database";
import { cn, getInitials } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { DEPARTMENT_CONFIG } from "@/lib/constants/departments";
import type { EmployeeDepartment } from "@/lib/types/database";

const IST = "Asia/Kolkata";

/** Status chips tuned for luxury light surfaces (white / #F9F9F6). */
const STATUS_CHIP: Record<AtlasTaskStatus, string> = {
  todo:        "bg-[#F4F4F2] text-[#57534E] border-[#E5E4DF]",
  in_progress: "bg-[#FBF6E8] text-[#8B7320] border-[#D4AF37]/35",
  done:        "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]",
  error:       "bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]",
  cancelled:   "bg-[#F4F4F5] text-[#71717A] border-[#E4E4E7]",
};

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

function isOverdue(due: string | null, status: AtlasTaskStatus): boolean {
  if (!due) return false;
  if (status === "done" || status === "cancelled") return false;
  return new Date(due).getTime() < Date.now();
}

interface WorkspaceCardProps {
  task: TaskInsightsWorkspaceCard;
  index: number;
  onOpenWorkspace: (task: TaskInsightsWorkspaceCard) => void;
  showDepartmentBadge?: boolean;
}

function WorkspaceCard({
  task,
  index,
  onOpenWorkspace,
  showDepartmentBadge = false,
}: WorkspaceCardProps) {
  const pct = Math.round(task.progress ?? 0);
  const coverColor = task.cover_color ?? "#D4AF37";
  const overdue = task.overdue_subtask_count ?? 0;
  const profiles = task.memberProfiles ?? [];
  const stack = profiles.slice(0, 3);
  const pri = TASK_PRIORITY_CONFIG[task.priority]?.label ?? task.priority;

  const dueOverdue = isOverdue(task.due_date, task.atlas_status);
  const statusClass = STATUS_CHIP[task.atlas_status] ?? STATUS_CHIP.todo;

  const deptRaw = task.department?.trim() ?? "";
  const deptKey =
    deptRaw && deptRaw in DEPARTMENT_CONFIG ? (deptRaw as EmployeeDepartment) : null;
  const deptLabel = deptKey ? DEPARTMENT_CONFIG[deptKey].label : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay: Math.min(index * 0.04, 0.4) }}
      className={cn(
        "group relative cursor-pointer text-left outline-none transition-shadow duration-300",
        surfaceCardVariants({ tone: "luxury", elevation: "sm", overflow: "hidden" }),
        "hover:shadow-[0_12px_40px_-12px_rgb(0_0_0/0.10)]",
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
      aria-label={`Open workspace ${task.title}`}
    >
      <div
        className="h-1 w-full shrink-0"
        style={{ backgroundColor: coverColor }}
        aria-hidden
      />

      <div className="relative p-5">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${coverColor}18` }}
          >
            <span style={{ color: coverColor }}>
              <TaskCardIcon iconKey={task.icon_key} className="h-5 w-5" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 flex-1 font-serif text-[17px] font-semibold leading-snug tracking-tight text-[#1A1A1A] line-clamp-2">
                {task.title}
              </h3>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {showDepartmentBadge && deptLabel && (
                  <span
                    className="rounded-full border border-[#E5E4DF] bg-[#FAFAF8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B6B6B]"
                    title={`Department: ${deptLabel}`}
                  >
                    {deptLabel}
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    TASK_PRIORITY_CONFIG[task.priority]?.className ??
                      "border-[#E5E4DF] bg-[#F9F9F6] text-[#6B6B6B]",
                  )}
                >
                  {pri}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E5E4DF]">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${coverColor}, ${coverColor}CC)`,
                  }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums text-[#6B6B6B]">
                {pct}%
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-[#8A8A6E]">
              <div className="flex -space-x-1.5">
                {stack.map((p) => (
                  <span
                    key={p.id}
                    title={p.full_name}
                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#F2F2EE] text-[10px] font-semibold text-[#57534E] shadow-sm"
                  >
                    {getInitials(p.full_name)}
                  </span>
                ))}
              </div>
              <span className="font-medium text-[#6B6B6B]">{profiles.length} members</span>
              <span className="text-[#E5E4DF]" aria-hidden>
                ·
              </span>
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-[#B5A99A]" aria-hidden />
                <span>{task.subtask_count ?? 0} subtasks</span>
              </span>
              {overdue > 0 && (
                <>
                  <span className="text-[#E5E4DF]" aria-hidden>
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-[#C0392B]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {overdue} overdue
                  </span>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#E5E4DF]/90 pt-4">
              {task.due_date ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-[12px]",
                    dueOverdue ? "font-medium text-[#C0392B]" : "text-[#6B6B6B]",
                  )}
                >
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-[#B5A99A]" aria-hidden />
                  {format(toZonedTime(new Date(task.due_date), IST), "d MMM yyyy")}
                </span>
              ) : (
                <span className="text-[12px] text-[#B5A99A]">No due date</span>
              )}

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    statusClass,
                  )}
                >
                  {ATLAS_TASK_STATUS_LABELS[task.atlas_status]}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F9F9F6] text-[#B5A99A] transition-colors duration-200 group-hover:bg-[#FBF6E8] group-hover:text-[#8B7320]">
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
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
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
      {items.map((t, i) => (
        <WorkspaceCard
          key={t.id}
          task={t}
          index={i}
          showDepartmentBadge={showDepartmentBadge}
          onOpenWorkspace={(task) => router.push(`/tasks/${task.id}`)}
        />
      ))}
    </div>
  );
}

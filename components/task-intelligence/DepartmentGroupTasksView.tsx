"use client";

import { useState, useCallback, useTransition, useMemo, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ChevronDown, LayoutGrid } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { MemberAvatarStack } from "@/components/tasks/MemberAvatarStack";
import { SubTaskStatusBadge } from "@/components/tasks/SubTaskStatusBadge";
import { TaskPriorityBadge } from "@/components/tasks/TaskPriorityBadge";
import { SubTaskModal } from "@/components/tasks/SubTaskModal";
import { getDepartmentGroupTasks } from "@/lib/actions/task-intelligence";
import type { DepartmentGroupTaskBundle } from "@/lib/actions/task-intelligence";
import { useMasterBoardsRealtime } from "@/lib/hooks/useTaskRealtime";
import type {
  AtlasTaskStatus,
  EmployeeDepartment,
  MasterTask,
  SubTask,
  TaskGroup,
  TaskPriority,
} from "@/lib/types/database";

const IST = "Asia/Kolkata";

function formatDateIST(iso: string): string {
  return format(toZonedTime(new Date(iso), IST), "d MMM");
}

function isOverdue(isoDate: string | null, status: AtlasTaskStatus): boolean {
  if (!isoDate) return false;
  if (status === "done" || status === "cancelled") return false;
  return new Date(isoDate) < new Date();
}

function getIcon(
  iconKey: string | null | undefined,
): React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}> | null {
  if (!iconKey) return null;
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  >;
  return icons[iconKey] ?? null;
}

function DateChip({ isoDate, status }: { isoDate: string | null; status: AtlasTaskStatus }) {
  if (!isoDate) return null;
  const overdue = isOverdue(isoDate, status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5",
        overdue ? "bg-[#C0392B]/10 text-[#C0392B]" : "bg-[#F2F2EE] text-[#6B6B6B]",
      )}
    >
      {formatDateIST(isoDate)}
    </span>
  );
}

function ReadOnlySubtaskRow({ task, onOpen }: { task: SubTask; onOpen: (id: string) => void }) {
  const firstProfile = (task.assigned_to_profiles ?? [])[0];
  const assigneeInitials = firstProfile?.full_name ? getInitials(firstProfile.full_name) : "—";
  const atlasStatus = (task.atlas_status ?? "todo") as AtlasTaskStatus;

  return (
    <div
      className="group flex items-center gap-3 px-5 py-2.5 hover:bg-[#F9F9F6] transition-colors cursor-pointer border-b border-[#E5E4DF] last:border-b-0"
      onClick={() => onOpen(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen(task.id);
      }}
    >
      <SubTaskStatusBadge status={atlasStatus} size="sm" />
      <span className="flex-1 text-[13px] text-[#1A1A1A] min-w-0 truncate">{task.title}</span>
      <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[9px] font-bold text-[#A88B25] shrink-0">
        {assigneeInitials}
      </div>
      <TaskPriorityBadge priority={(task.priority ?? "medium") as TaskPriority} size="sm" />
      <DateChip isoDate={task.due_date} status={atlasStatus} />
    </div>
  );
}

function ReadOnlyMasterRow({
  masterTask,
  taskGroups,
  onOpenSubtask,
}: {
  masterTask: MasterTask;
  taskGroups: Array<TaskGroup & { tasks: SubTask[] }>;
  onOpenSubtask: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const accentColor = masterTask.cover_color ?? "#D4AF37";
  const Icon = getIcon(masterTask.icon_key);

  const allSubtasks = taskGroups.flatMap((g) => g.tasks);
  const total =
    allSubtasks.length > 0 ? allSubtasks.length : (masterTask.subtask_count ?? 0);
  const done =
    allSubtasks.length > 0
      ? allSubtasks.filter((t) => t.atlas_status === "done").length
      : (masterTask.completed_subtask_count ?? 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const members = (masterTask.members ?? []).map((m) => ({
    id:        m.user_id,
    full_name: m.profile?.full_name ?? "Member",
    job_title: m.profile?.job_title ?? null,
  }));

  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "xs", overflow: "visible" }),
        "overflow-hidden",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-workspace-link]")) return;
          setOpen((p) => !p);
        }}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-workspace-link]")) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((p) => !p);
          }
        }}
        className="flex flex-1 min-w-0 cursor-pointer items-center gap-3 px-5 py-4 text-left outline-none transition-colors hover:bg-[#FAFAF8] focus-visible:bg-[#FAFAF8] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4AF37]/35"
      >
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown
            className={cn("w-4 h-4 shrink-0 text-[#B5A99A] rotate-[-90deg]", open && "rotate-0")}
          />
        </motion.div>

        <div
          className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          {Icon ? (
            <Icon className="w-4 h-4" style={{ color: accentColor }} />
          ) : (
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <span className="min-w-0 flex-1 truncate font-serif text-[15px] font-semibold text-[#1A1A1A]">
            {masterTask.title}
          </span>
          <Link
            data-workspace-link
            href={`/tasks/${masterTask.id}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 sm:px-3",
              "border-[#D4AF37]/45 bg-gradient-to-b from-[#FCFAF4] to-[#F3ECD8]",
              "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8B7320]",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5 opacity-90" aria-hidden />
            <span>Workspace</span>
          </Link>
        </div>

        {members.length > 0 && <MemberAvatarStack members={members} max={4} size="sm" />}

        <div className="flex items-center gap-2 w-32 shrink-0">
          <div className="flex-1 h-1.5 rounded-full bg-[#E5E4DF] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#D4AF37] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-[#6B6B6B] tabular-nums font-medium w-9 text-right">{pct}%</span>
        </div>

        <span className="text-[12px] text-[#8A8A6E] shrink-0 w-16 text-right">
          {done}/{total} done
        </span>

        {masterTask.due_date && (
          <DateChip isoDate={masterTask.due_date} status={masterTask.atlas_status} />
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="subtasks"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#E5E4DF] bg-[#FAFAF8]">
              {allSubtasks.length === 0 ? (
                <p className="px-5 pt-4 pb-2 text-[12px] text-[#B5A99A] italic">No subtasks yet.</p>
              ) : (
                allSubtasks.map((st) => (
                  <ReadOnlySubtaskRow key={st.id} task={st} onOpen={onOpenSubtask} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DepartmentGroupTasksViewProps {
  departmentId: EmployeeDepartment;
  initialBundles: DepartmentGroupTaskBundle[];
  currentUser: { id: string; full_name: string; job_title: string | null };
}

export function DepartmentGroupTasksView({
  departmentId,
  initialBundles,
  currentUser,
}: DepartmentGroupTasksViewProps) {
  const [bundles, setBundles] = useState<DepartmentGroupTaskBundle[]>(initialBundles);
  const [modalId, setModalId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const masterIds = useMemo(() => bundles.map((b) => b.masterTask.id), [bundles]);

  const refetch = useCallback(() => {
    startTransition(() => {
      void (async () => {
        const res = await getDepartmentGroupTasks({ departmentId });
        if (res.success && res.data) setBundles(res.data);
      })();
    });
  }, [departmentId]);

  useEffect(() => {
    setBundles(initialBundles);
  }, [initialBundles]);

  useMasterBoardsRealtime(masterIds, refetch);

  return (
    <div className="space-y-3 max-h-[min(60vh,520px)] overflow-y-auto pr-1">
      {bundles.length === 0 ? (
        <p className="text-[13px] text-[#8A8A6E] py-8 text-center">No active group tasks in this department.</p>
      ) : (
        bundles.map((b) => (
          <ReadOnlyMasterRow
            key={b.masterTask.id}
            masterTask={b.masterTask}
            taskGroups={b.taskGroups}
            onOpenSubtask={setModalId}
          />
        ))
      )}

      {modalId && (
        <SubTaskModal
          taskId={modalId}
          readOnly
          currentUser={currentUser}
          onClose={() => setModalId(null)}
        />
      )}
    </div>
  );
}

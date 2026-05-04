"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  LayoutGrid,
  BarChart3,
  Users,
  Pencil,
  Archive,
  ChevronLeft,
  X,
  Trash2,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { surfaceCardVariants } from "@/components/ui/card";
import { TaskListView } from "./TaskListView";
import { TaskAnalyticsPanel } from "./TaskAnalyticsPanel";
import { CreateMasterTaskModal } from "./CreateMasterTaskModal";
import { MemberAvatarStack } from "./MemberAvatarStack";
import { archiveMasterTask, deleteMasterTask } from "@/lib/actions/tasks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  MasterTask,
  MasterTaskMember,
  TaskGroup,
  SubTask,
} from "@/lib/types/database";
import { useAtlasTaskRealtime } from "@/lib/hooks/useTaskRealtime";

const IST = "Asia/Kolkata";

function getHeroIcon(iconKey: string | null | undefined) {
  if (!iconKey) return null;
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  >;
  return icons[iconKey] ?? null;
}

interface MasterTaskDetailProps {
  masterTask: MasterTask;
  taskGroups: (TaskGroup & { tasks: SubTask[] })[];
  members: MasterTaskMember[];
  /** Admin / founder — permanent delete */
  canDeleteMaster?: boolean;
  /** Viewer profile — required for subtask modal (same as Group Tasks list). */
  currentUser: { id: string; full_name: string; job_title: string | null };
}

export function MasterTaskDetail({
  masterTask,
  taskGroups,
  members,
  canDeleteMaster = false,
  currentUser,
}: MasterTaskDetailProps) {
  const router = useRouter();
  const { boardVersion } = useAtlasTaskRealtime({
    masterTaskId: masterTask.id,
    onSubtaskChanged: () => {
      router.refresh();
    },
  });
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteMasterTask(masterTask.id);
      if (result.success) {
        toast.success("Master task deleted");
        setDeleteDialogOpen(false);
        router.push("/tasks");
      } else {
        toast.error(result.error ?? "Failed to delete");
      }
    });
  }

  const memberProfiles = members.map((m) => ({
    id: m.user_id,
    full_name:
      (m.profile as { full_name: string } | null | undefined)?.full_name ??
      "Member",
    job_title:
      (m.profile as { job_title?: string | null } | null | undefined)
        ?.job_title ?? null,
  }));

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveMasterTask(masterTask.id);
      if (result.success) {
        toast.success("Task archived");
        router.push("/tasks");
      } else {
        toast.error(result.error ?? "Failed to archive");
      }
    });
  }

  const accentColor = masterTask.cover_color ?? "#D4AF37";
  const HeroIcon = getHeroIcon(masterTask.icon_key);

  const descriptionText =
    masterTask.description ??
    (masterTask as { notes?: string | null }).notes ??
    null;

  const subtitleParts = useMemo(() => {
    const parts: string[] = [];
    if (masterTask.due_date) {
      parts.push(
        `Due ${format(toZonedTime(new Date(masterTask.due_date), IST), "d MMM yyyy")}`,
      );
    }
    return parts;
  }, [masterTask.due_date]);

  const departmentLabel = masterTask.department
    ? masterTask.department.charAt(0).toUpperCase() +
      masterTask.department.slice(1)
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#F9F9F6]">
      {/* Masthead — matches /tasks Group Tasks shell */}
      <header className="atlas-masthead-texture w-full px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#8A8A6E] hover:text-[#1A1A1A] transition-colors mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          Group Tasks
        </Link>

        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <div className="flex min-w-0 gap-4 lg:flex-1 lg:min-w-0">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#E5E4DF] bg-white shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]"
              style={{ boxShadow: `0 0 0 1px ${accentColor}22` }}
            >
              {HeroIcon ? (
                <HeroIcon className="h-7 w-7" style={{ color: accentColor }} />
              ) : (
                <LayoutGrid
                  className="h-7 w-7"
                  style={{ color: accentColor }}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3">
                <h1 className="min-w-0 font-serif text-[28px] sm:text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight">
                  {masterTask.title}
                </h1>
                {departmentLabel && (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full border border-[#E5E4DF] bg-white px-3 py-1",
                      "text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6B6B]",
                      "shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
                    )}
                  >
                    {departmentLabel}
                  </span>
                )}
              </div>
              {subtitleParts.length > 0 && (
                <p className="text-[14px] text-[#8A8A6E] mt-2">
                  {subtitleParts.join(" · ")}
                </p>
              )}
              {descriptionText && (
                <p className="text-[13px] text-[#6B6B6B] mt-2 max-w-2xl leading-relaxed line-clamp-2">
                  {descriptionText}
                </p>
              )}
            </div>
          </div>

          {/* Toolbar — right-aligned; luxury surface + outline controls */}
          <div
            className={cn(
              surfaceCardVariants({
                tone: "luxury",
                elevation: "xs",
                overflow: "visible",
              }),
              "flex w-full shrink-0 flex-wrap items-center justify-end gap-2 p-2.5 sm:p-3 lg:max-w-none lg:w-auto lg:self-start",
            )}
          >
            <button
              type="button"
              onClick={() => setShowMembers(!showMembers)}
              className={cn(
                "flex h-9 items-center gap-2 rounded-xl border border-[#E5E4DF] bg-[#F9F9F6] px-3",
                "text-left text-[12px] font-medium text-[#1A1A1A]",
                "transition-colors hover:border-[#D0C8BE] hover:bg-[#FAFAF8]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/35",
              )}
              aria-label={`${members.length} members`}
            >
              <MemberAvatarStack
                members={memberProfiles}
                max={4}
                size="xs"
              />
              <span className="tabular-nums">Team · {members.length}</span>
            </button>
            <span
              className="hidden h-6 w-px shrink-0 bg-[#E5E4DF] sm:inline"
              aria-hidden
            />

            <IndulgeButton
              variant="outline"
              size="sm"
              onClick={() => setShowAnalytics(!showAnalytics)}
              leftIcon={<BarChart3 className="h-3.5 w-3.5" />}
              className={cn(
                "border-[#E5E4DF] shrink-0",
                showAnalytics &&
                  "border-[#D4AF37] text-[#A88B25] bg-[#D4AF37]/08",
              )}
              aria-pressed={showAnalytics}
            >
              Analytics
            </IndulgeButton>

            <IndulgeButton
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              leftIcon={<Pencil className="h-3.5 w-3.5" />}
              className="border-[#E5E4DF] shrink-0"
              aria-label="Edit master task"
            >
              Edit
            </IndulgeButton>

            <IndulgeButton
              variant="outline"
              size="sm"
              loading={isPending}
              onClick={handleArchive}
              leftIcon={<Archive className="h-3.5 w-3.5" />}
              className="border-[#E5E4DF] shrink-0"
              aria-label="Archive task"
            >
              Archive
            </IndulgeButton>

            {canDeleteMaster && (
              <IndulgeButton
                variant="outline"
                size="sm"
                loading={isPending}
                onClick={() => setDeleteDialogOpen(true)}
                leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                className="shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                aria-label="Delete master task permanently"
              >
                Delete
              </IndulgeButton>
            )}
          </div>
        </div>

        <div className="border-b border-[#E5E4DF]" aria-hidden />
      </header>

      {/* Workspace — subtasks list */}
      <div className="flex flex-1 flex-col gap-0 min-h-0 w-full px-6 pb-8 pt-6 max-w-7xl mx-auto">
        <div className="flex flex-1 gap-4 min-h-0">
          <div
            className={cn(
              surfaceCardVariants({
                tone: "stone",
                elevation: "xs",
                overflow: "hidden",
              }),
              "flex-1 flex flex-col min-w-0 min-h-[420px]",
            )}
          >
            <div className="flex-1 min-h-0 overflow-auto p-5 bg-[#FAFAF8]/80">
              <TaskListView groups={taskGroups} currentUser={currentUser} />
            </div>
          </div>

          <AnimatePresence>
            {showAnalytics && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 300, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  surfaceCardVariants({
                    tone: "luxury",
                    elevation: "sm",
                    overflow: "hidden",
                  }),
                  "shrink-0 overflow-y-auto p-4 self-stretch",
                )}
                style={{ width: 300 }}
                aria-label="Analytics panel"
              >
                <TaskAnalyticsPanel
                  masterTaskId={masterTask.id}
                  refreshSignal={boardVersion}
                  onClose={() => setShowAnalytics(false)}
                />
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Members panel */}
      <AnimatePresence>
        {showMembers && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="max-w-7xl mx-auto w-full px-6 pb-8"
          >
            <motion.div
              className={cn(
                surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
                "overflow-hidden",
              )}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
                <p className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                  <Users className="h-4 w-4" aria-hidden />
                  Members ({members.length})
                </p>
                <button
                  onClick={() => setShowMembers(false)}
                  className="text-zinc-400 hover:text-zinc-700"
                  aria-label="Close members panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-3 p-4">
                {members.map((m) => {
                  const profile = m.profile as
                    | {
                        id: string;
                        full_name: string;
                        role: string;
                        job_title?: string | null;
                      }
                    | null
                    | undefined;
                  return (
                    <div
                      key={m.user_id}
                      className="flex items-center gap-2 rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">
                        {(profile?.full_name ?? "?")[0]}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-zinc-800">
                          {profile?.full_name ?? "Member"}
                        </p>
                        <p className="text-[10px] text-zinc-400 capitalize">
                          {m.role}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="border-t border-zinc-100 px-4 py-3 text-[11px] leading-relaxed text-zinc-500">
                To add teammates after the task was created, open{" "}
                <span className="font-medium text-zinc-700">Edit</span>, use{" "}
                <span className="font-medium text-zinc-700">Add members</span>, then save.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit modal */}
      <CreateMasterTaskModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editTask={masterTask}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete master task?</DialogTitle>
            <DialogDescription>
              This permanently removes “{masterTask.title}” and all of its
              groups and subtasks. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <IndulgeButton
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </IndulgeButton>
            <IndulgeButton
              variant="gold"
              size="sm"
              loading={isPending}
              onClick={handleDelete}
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              Delete permanently
            </IndulgeButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

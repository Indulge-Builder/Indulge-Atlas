"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  LayoutGrid,
  List,
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
import { TaskBoard } from "./TaskBoard";
import { TaskListView } from "./TaskListView";
import { TaskAnalyticsPanel } from "./TaskAnalyticsPanel";
import { CreateMasterTaskModal } from "./CreateMasterTaskModal";
import { MemberAvatarStack } from "./MemberAvatarStack";
import {
  archiveMasterTask,
  deleteMasterTask,
} from "@/lib/actions/tasks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MasterTask, MasterTaskMember, TaskGroup, SubTask } from "@/lib/types/database";
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

type ViewMode = "board" | "list";

interface MasterTaskDetailProps {
  masterTask: MasterTask;
  taskGroups: (TaskGroup & { tasks: SubTask[] })[];
  members: MasterTaskMember[];
  /** Admin / founder — permanent delete */
  canDeleteMaster?: boolean;
}

export function MasterTaskDetail({
  masterTask,
  taskGroups,
  members,
  canDeleteMaster = false,
}: MasterTaskDetailProps) {
  const router = useRouter();
  const { boardVersion } = useAtlasTaskRealtime({
    masterTaskId: masterTask.id,
    onSubtaskChanged: () => {
      router.refresh();
    },
  });
  const [view, setView]               = useState<ViewMode>("board");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [editOpen, setEditOpen]       = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isPending, startTransition]  = useTransition();

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
    id:        m.user_id,
    full_name: (m.profile as { full_name: string } | null | undefined)?.full_name ?? "Member",
    job_title: (m.profile as { job_title?: string | null } | null | undefined)?.job_title ?? null,
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

  const allSubtasksFlat = useMemo(
    () => taskGroups.flatMap((g) => g.tasks as SubTask[]),
    [taskGroups],
  );
  const totalSubs =
    masterTask.subtask_count ?? allSubtasksFlat.length;
  const doneSubs =
    masterTask.completed_subtask_count ??
    allSubtasksFlat.filter((t) => t.atlas_status === "done").length;

  const descriptionText =
    masterTask.description ??
    (masterTask as { notes?: string | null }).notes ??
    null;

  const subtitleParts = useMemo(() => {
    const parts: string[] = [];
    if (masterTask.department) {
      parts.push(
        masterTask.department.charAt(0).toUpperCase() + masterTask.department.slice(1),
      );
    }
    if (masterTask.due_date) {
      parts.push(
        `Due ${format(toZonedTime(new Date(masterTask.due_date), IST), "d MMM yyyy")}`,
      );
    }
    if (totalSubs > 0) {
      parts.push(`${doneSubs}/${totalSubs} subtasks done`);
    }
    return parts;
  }, [masterTask.department, masterTask.due_date, totalSubs, doneSubs]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F9F9F6]">
      {/* Masthead — matches /tasks Atlas Tasks shell */}
      <header className="w-full px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#8A8A6E] hover:text-[#1A1A1A] transition-colors mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          Atlas Tasks
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div className="flex min-w-0 gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#E5E4DF] bg-white shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]"
              style={{ boxShadow: `0 0 0 1px ${accentColor}22` }}
            >
              {HeroIcon ? (
                <HeroIcon className="h-7 w-7" style={{ color: accentColor }} />
              ) : (
                <LayoutGrid className="h-7 w-7" style={{ color: accentColor }} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A8A6E] mb-1">
                Master workspace
              </p>
              <h1 className="font-serif text-[28px] sm:text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight">
                {masterTask.title}
              </h1>
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
        </div>

        <div className="border-b border-[#E5E4DF]" aria-hidden />
      </header>

      {/* Actions — same card language as Atlas list rows */}
      <div className="w-full px-6 pt-4 max-w-7xl mx-auto">
        <div
          className={cn(
            surfaceCardVariants({
              tone: "luxury",
              elevation: "xs",
              overflow: "visible",
            }),
            "flex flex-wrap items-center gap-2 p-3",
          )}
        >
          {memberProfiles.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMembers(!showMembers)}
              className="flex items-center gap-2 rounded-xl border border-[#E5E4DF] bg-[#F9F9F6] px-3 py-2 text-left hover:border-[#D0C8BE] transition-colors"
              aria-label={`${members.length} members`}
            >
              <MemberAvatarStack members={memberProfiles} max={4} size="xs" />
              <span className="text-[12px] font-medium text-[#1A1A1A]">
                Team · {members.length}
              </span>
            </button>
          )}

          <div className="flex-1 min-w-[8px]" />

          <IndulgeButton
            variant="outline"
            size="sm"
            onClick={() => setShowAnalytics(!showAnalytics)}
            leftIcon={<BarChart3 className="h-3.5 w-3.5" />}
            className={cn(
              "border-[#E5E4DF]",
              showAnalytics && "border-[#D4AF37] text-[#A88B25] bg-[#D4AF37]/08",
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
            className="border-[#E5E4DF]"
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
            className="border-[#E5E4DF]"
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
              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              aria-label="Delete master task permanently"
            >
              Delete
            </IndulgeButton>
          )}
        </div>
      </div>

      {/* Workspace — tabs + framed board (Atlas flow) */}
      <div className="flex flex-1 flex-col gap-0 min-h-0 w-full px-6 pb-8 pt-6 max-w-7xl mx-auto">
        <div
          className="flex items-center gap-0 border-b border-[#E5E4DF] relative mb-5"
          role="tablist"
          aria-label="Workspace view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "board"}
            id="tab-board"
            onClick={() => setView("board")}
            className={cn(
              "relative px-5 py-3 text-[14px] font-medium transition-colors duration-150 select-none flex items-center gap-2",
              view === "board" ? "text-[#1A1A1A]" : "text-[#8A8A6E] hover:text-[#1A1A1A]",
            )}
          >
            <LayoutGrid className="h-4 w-4 opacity-70" />
            Board
            {view === "board" && (
              <motion.div
                layoutId="workspace-view-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37] rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            id="tab-list"
            onClick={() => setView("list")}
            className={cn(
              "relative px-5 py-3 text-[14px] font-medium transition-colors duration-150 select-none flex items-center gap-2",
              view === "list" ? "text-[#1A1A1A]" : "text-[#8A8A6E] hover:text-[#1A1A1A]",
            )}
          >
            <List className="h-4 w-4 opacity-70" />
            List
            {view === "list" && (
              <motion.div
                layoutId="workspace-view-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37] rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        </div>

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
            <div className="border-b border-[#E5E4DF] bg-white/60 px-5 py-4">
              <h2 className="font-serif text-[17px] font-semibold text-[#1A1A1A]">
                {view === "board" ? "Columns" : "All subtasks"}
              </h2>
              <p className="text-[13px] text-[#8A8A6E] mt-1 leading-snug max-w-3xl">
                {view === "board"
                  ? "Each column is a stage on your board. Add tasks inside a column, drag cards between columns, or use Add Group for more stages (e.g. review or blocked)."
                  : "Every subtask in this workspace, grouped by column."}
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-5 bg-[#FAFAF8]/80">
              {view === "board" ? (
                <TaskBoard masterTask={masterTask} initialGroups={taskGroups} />
              ) : (
                <TaskListView groups={taskGroups} />
              )}
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
                const profile = m.profile as {
                  id: string;
                  full_name: string;
                  role: string;
                  job_title?: string | null;
                } | null | undefined;
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
                      <p className="text-[10px] text-zinc-400 capitalize">{m.role}</p>
                    </div>
                  </div>
                );
              })}
            </div>
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
              This permanently removes “{masterTask.title}” and all of its groups and subtasks.
              This cannot be undone.
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

"use client";

import {
  useState,
  useEffect,
  useCallback,
  useTransition,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Pencil,
  ChevronRight,
  Calendar as CalendarIcon,
  User,
  Flag,
  Hash,
  Clock,
  MoreHorizontal,
  CheckSquare,
  Activity,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn, getInitials } from "@/lib/utils";
import { useSubtaskRealtime } from "@/lib/hooks/useTaskRealtime";
import { surfaceCardVariants } from "@/components/ui/card";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { InfoRow } from "@/components/ui/info-row";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SubTaskStatusBadge } from "./SubTaskStatusBadge";
import { TaskPriorityBadge } from "./TaskPriorityBadge";
import { TaskChecklist } from "./TaskChecklist";
import { TimelineEvent } from "./TimelineEvent";
import { LogUpdateForm } from "./LogUpdateForm";
import { getSubTaskDetail, updateSubTask, deleteSubTask } from "@/lib/actions/tasks";
import type {
  SubTask,
  TaskRemark,
  ChecklistItem,
  AtlasTaskStatus,
  TaskPriority,
} from "@/lib/types/database";
import { ATLAS_TASK_STATUS_VALUES, ATLAS_TASK_STATUS_LABELS } from "@/lib/types/database";
import type { UpdateSubTaskInput } from "@/lib/schemas/tasks";

const IST = "Asia/Kolkata";

// ── Section label style (eyebrow) ─────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8A8A6E] mb-3">
      {children}
    </p>
  );
}

// ── IST-aware date formatter ───────────────────────────────────────────────────

function formatDateIST(iso: string): string {
  return format(toZonedTime(new Date(iso), IST), "EEE, d MMM yyyy");
}

function isOverdue(isoDate: string | null, status: AtlasTaskStatus): boolean {
  if (!isoDate) return false;
  if (status === "done" || status === "cancelled") return false;
  return new Date(isoDate) < new Date();
}

function extractChecklistFromAttachments(attachments: unknown): ChecklistItem[] {
  const raw = attachments as unknown[] | null;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ChecklistItem =>
      typeof item === "object" && item !== null && "id" in item && "text" in item && "checked" in item,
  );
}

// ── Zone A — The Brief ─────────────────────────────────────────────────────────

interface ZoneAProps {
  task: SubTask;
  masterTaskTitle: string | null;
  masterTaskGroupTitle: string | null;
  assigneeProfile: { id: string; full_name: string; job_title: string | null } | null;
  workspaceMembers: { id: string; full_name: string; job_title: string | null }[];
  canAssignSubtask: boolean;
  checklist: ChecklistItem[];
  editable: boolean;
  onSaved: () => void;
  onCancelEdit: () => void;
}

function ZoneA({
  task,
  masterTaskTitle,
  masterTaskGroupTitle,
  assigneeProfile,
  workspaceMembers,
  canAssignSubtask,
  checklist,
  editable,
  onSaved,
  onCancelEdit,
}: ZoneAProps) {
  const [isPending, startTransition] = useTransition();
  const [description, setDescription] = useState(task.notes ?? "");
  const [dueDate, setDueDate] = useState(
    task.due_date ? task.due_date.slice(0, 10) : "",
  );
  const [priority, setPriority] = useState<string>(task.priority ?? "medium");
  const [status, setStatus] = useState<AtlasTaskStatus>(task.atlas_status);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [assigneeUserId, setAssigneeUserId] = useState(
    () => (task.assigned_to_users as string[] | null)?.[0] ?? "",
  );

  // Derive a Date object for the Calendar
  const dueDateObj = dueDate ? new Date(dueDate + "T00:00:00") : undefined;

  const dueDateOverdue = isOverdue(task.due_date, task.atlas_status);

  useEffect(() => {
    setAssigneeUserId((task.assigned_to_users as string[] | null)?.[0] ?? "");
  }, [task.id, task.assigned_to_users]);

  function handleSave() {
    startTransition(async () => {
      const payload: UpdateSubTaskInput = {
        description:  description || null,
        due_date:     dueDate ? new Date(dueDate).toISOString() : null,
        priority:     priority as TaskPriority,
        atlas_status: status,
      };
      if (canAssignSubtask) {
        payload.assigned_to_users = assigneeUserId ? [assigneeUserId] : [];
      }
      const result = await updateSubTask(task.id, payload);
      if (!result.success) {
        toast.error(result.error ?? "Failed to save changes.");
      } else {
        toast.success("Brief updated.");
        onSaved();
      }
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 min-h-0">
        <SectionLabel>The Brief</SectionLabel>

        {/* Objective */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#B5A99A] mb-2">
            Objective
          </p>
          {editable ? (
            <IndulgeField htmlFor="description">
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-[#E5E4DF] bg-[#F9F9F6] px-3 py-2.5 text-[13px] text-[#1A1A1A] placeholder:text-[#B5A99A] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 transition-colors"
                placeholder="Describe the objective of this task…"
              />
            </IndulgeField>
          ) : (
            <div className="text-[13px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">
              {task.notes ? task.notes : (
                <span className="text-[#B5A99A] italic">No description provided.</span>
              )}
            </div>
          )}
        </div>

        {/* Checklist */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#B5A99A] mb-2 flex items-center gap-1.5">
            <CheckSquare className="w-3 h-3" />
            Action Items
          </p>
          <TaskChecklist
            taskId={task.id}
            initialItems={checklist}
            editable={editable}
          />
        </div>

        {/* Key Variables */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#B5A99A] mb-3">
            Key Variables
          </p>
          <div className="space-y-3">
            <InfoRow
              icon={CalendarIcon}
              label="Deadline"
              value={
                editable ? (
                  <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
                          dueDate
                            ? "border-[#D4AF37]/40 bg-[#FDF9EE] text-[#1A1A1A] hover:border-[#D4AF37]"
                            : "border-[#E5E4DF] bg-[#F9F9F6] text-[#B5A99A] hover:border-[#D4AF37]",
                        )}
                      >
                        <CalendarIcon className="w-3.5 h-3.5 shrink-0 text-[#A88B25]" />
                        {dueDate
                          ? format(new Date(dueDate + "T00:00:00"), "EEE, d MMM yyyy")
                          : "Pick a date"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <div className="rounded-xl overflow-hidden">
                        <Calendar
                          mode="single"
                          selected={dueDateObj}
                          onSelect={(day) => {
                            setDueDate(day ? format(day, "yyyy-MM-dd") : "");
                            setDueDateOpen(false);
                          }}
                          initialFocus
                        />
                        {dueDate && (
                          <div className="border-t border-[#E5E4DF] px-3 py-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => { setDueDate(""); setDueDateOpen(false); }}
                              className="text-[11px] text-[#8A8A6E] hover:text-[#C0392B] transition-colors"
                            >
                              Clear date
                            </button>
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : task.due_date ? (
                  <span className={cn(
                    "text-[13px] font-medium",
                    dueDateOverdue ? "text-[#C0392B]" : "text-[#1A1A1A]",
                  )}>
                    {dueDateOverdue && <AlertTriangle className="w-3 h-3 inline mr-1 text-[#C0392B]" />}
                    {formatDateIST(task.due_date)}
                  </span>
                ) : (
                  <span className="text-[#B5A99A] text-[13px]">Not set</span>
                )
              }
            />
            <InfoRow
              icon={User}
              label="Assigned Agent"
              value={
                editable && canAssignSubtask ? (
                  <select
                    id="subtask-assignee"
                    aria-label="Assign subtask"
                    value={assigneeUserId}
                    onChange={(e) => setAssigneeUserId(e.target.value)}
                    className="max-w-[min(100%,260px)] rounded-lg border border-[#E5E4DF] bg-[#F9F9F6] px-2.5 py-1.5 text-[12px] text-[#1A1A1A] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30"
                  >
                    <option value="">Unassigned</option>
                    {workspaceMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                ) : assigneeProfile ? (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[10px] font-bold text-[#A88B25]">
                      {getInitials(assigneeProfile.full_name)}
                    </div>
                    <span className="text-[13px] font-medium text-[#1A1A1A]">
                      {assigneeProfile.full_name}
                    </span>
                  </div>
                ) : (
                  <span className="text-[#B5A99A] text-[13px]">Unassigned</span>
                )
              }
            />
            <InfoRow
              icon={Activity}
              label="Status"
              value={
                editable ? (
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AtlasTaskStatus)}
                    className="rounded border border-[#E5E4DF] bg-[#F9F9F6] px-2 py-1 text-[12px] text-[#1A1A1A] outline-none focus:border-[#D4AF37]"
                  >
                    {ATLAS_TASK_STATUS_VALUES.map((s) => (
                      <option key={s} value={s}>
                        {ATLAS_TASK_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <SubTaskStatusBadge status={task.atlas_status} size="sm" />
                )
              }
            />
            <InfoRow
              icon={Flag}
              label="Priority"
              value={
                editable ? (
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="rounded border border-[#E5E4DF] bg-[#F9F9F6] px-2 py-1 text-[12px] text-[#1A1A1A] outline-none focus:border-[#D4AF37]"
                  >
                    {["critical","high","medium","low"].map((p) => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                ) : (
                  <TaskPriorityBadge priority={task.priority ?? "medium"} size="sm" />
                )
              }
            />
          </div>
        </div>

        {/* Supplemental metadata */}
        <div className="pt-2 border-t border-[#E5E4DF]">
          <div className="space-y-1.5">
            <div className="flex gap-2 text-[11px]">
              <span className="text-[#B5A99A] w-20 shrink-0">Task ID</span>
              <span className="text-[#6B6B6B] font-mono">#{task.id.slice(0, 8)}</span>
            </div>
            <div className="flex gap-2 text-[11px]">
              <span className="text-[#B5A99A] w-20 shrink-0">Created</span>
              <span className="text-[#6B6B6B]">{formatDateIST(task.created_at)}</span>
            </div>
            <div className="flex gap-2 text-[11px]">
              <span className="text-[#B5A99A] w-20 shrink-0">Updated</span>
              <span className="text-[#6B6B6B]">{formatDateIST(task.updated_at)}</span>
            </div>
            {masterTaskTitle && (
              <div className="flex gap-2 text-[11px]">
                <span className="text-[#B5A99A] w-20 shrink-0">In</span>
                <span className="text-[#6B6B6B]">
                  {masterTaskTitle}
                  {masterTaskGroupTitle && (
                    <> <ChevronRight className="w-3 h-3 inline" /> {masterTaskGroupTitle}</>
                  )}
                </span>
              </div>
            )}
            {task.imported_from && (
              <div className="flex gap-2 text-[11px]">
                <span className="text-[#B5A99A] w-20 shrink-0">Imported</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E5E4DF] px-2 py-0.5 text-[10px] text-[#6B6B6B]">
                  {task.imported_from}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zone A footer — edit mode only */}
      <AnimatePresence>
        {editable && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="px-6 py-4 border-t border-[#E5E4DF] flex items-center justify-between shrink-0"
          >
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-[13px] text-[#8A8A6E] hover:text-[#1A1A1A] transition-colors"
            >
              Cancel
            </button>
            <IndulgeButton
              variant="gold"
              size="sm"
              loading={isPending}
              onClick={handleSave}
            >
              Save Brief
            </IndulgeButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Zone B — The Agentic Timeline ─────────────────────────────────────────────

interface ZoneBProps {
  taskId: string;
  currentStatus: AtlasTaskStatus;
  currentProgress: number;
  remarks: TaskRemark[];
  setRemarks: Dispatch<SetStateAction<TaskRemark[]>>;
  currentUserId: string;
  currentUserName: string;
  currentUserJobTitle: string | null;
  onStatusChange?: (newStatus: AtlasTaskStatus) => void;
  onProgressChange?: (newProgress: number) => void;
  readOnly?: boolean;
}

function ZoneB({
  taskId,
  currentStatus,
  currentProgress,
  remarks,
  setRemarks,
  currentUserId,
  currentUserName,
  currentUserJobTitle,
  onStatusChange,
  onProgressChange,
  readOnly = false,
}: ZoneBProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  // Optimistic insert (called from LogUpdateForm before server confirms)
  const handleOptimisticInsert = useCallback((remark: TaskRemark) => {
    setRemarks((prev) => [remark, ...prev]);
  }, [setRemarks]);

  const feedEmpty = remarks.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Feed header */}
      <div className="px-6 pt-5 pb-3 shrink-0">
        <SectionLabel>Activity</SectionLabel>
      </div>

      {/* Feed — scrollable */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-6 pb-2 space-y-3 min-h-0">
        {feedEmpty ? (
          <p className="text-[13px] text-[#B5A99A] italic text-center py-8">
            {readOnly
              ? "No updates yet."
              : "No updates yet. Be the first to log progress."}
          </p>
        ) : (
          remarks.map((remark, i) => (
            <TimelineEvent
              key={remark.id}
              remark={remark}
              isNew={i === 0 && remark.id.startsWith("optimistic-")}
              className={readOnly ? "border-l-0" : undefined}
            />
          ))
        )}
      </div>

      {/* Log Update form — pinned to bottom (hidden in read-only intelligence mode). */}
      {!readOnly && (
        <div className="px-6 pb-5 shrink-0">
          <LogUpdateForm
            taskId={taskId}
            currentStatus={currentStatus}
            currentProgress={currentProgress}
            onOptimisticInsert={handleOptimisticInsert}
            onStatusChange={onStatusChange}
            onProgressChange={onProgressChange}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserJobTitle={currentUserJobTitle}
          />
        </div>
      )}
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

export interface SubTaskModalProps {
  taskId: string;
  onClose: () => void;
  currentUser: {
    id: string;
    full_name: string;
    job_title: string | null;
  };
  /** When true, brief and timeline are view-only; no mutations or Log Update form. */
  readOnly?: boolean;
}

export function SubTaskModal({
  taskId,
  onClose,
  currentUser,
  readOnly = false,
}: SubTaskModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<SubTask | null>(null);
  const [masterTaskTitle, setMasterTaskTitle] = useState<string | null>(null);
  const [masterTaskGroupTitle, setMasterTaskGroupTitle] = useState<string | null>(null);
  const [assigneeProfile, setAssigneeProfile] = useState<{ id: string; full_name: string; job_title: string | null } | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<
    { id: string; full_name: string; job_title: string | null }[]
  >([]);
  const workspaceMembersRef = useRef(workspaceMembers);
  workspaceMembersRef.current = workspaceMembers;
  const [canAssignSubtask, setCanAssignSubtask] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [remarks, setRemarks] = useState<TaskRemark[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteSubTask(taskId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to delete subtask.");
      } else {
        toast.success("Subtask deleted.");
        router.refresh();
        onClose();
      }
    });
  }

  // Fetch task data (`silent`: no full-modal spinner — used after brief save so the list can refresh via router without flashing the UI)
  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const result = await getSubTaskDetail(taskId);
    if (!result.success || !result.data) {
      if (!silent) setError(result.error ?? "Failed to load task.");
    } else {
      setTask(result.data.task);
      setMasterTaskTitle(result.data.masterTaskTitle);
      setMasterTaskGroupTitle(result.data.masterTaskGroupTitle);
      setAssigneeProfile(result.data.assigneeProfile);
      setWorkspaceMembers(result.data.workspaceMembers ?? []);
      setCanAssignSubtask(result.data.canAssignSubtask ?? false);
      setChecklist(result.data.checklist);
      setRemarks(result.data.remarks);
    }
    if (!silent) setLoading(false);
  }, [taskId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (readOnly) {
      setEditMode(false);
      setMenuOpen(false);
      setDeleteConfirm(false);
    }
  }, [readOnly]);

  useSubtaskRealtime(taskId, {
    onRemarkInserted: (raw) => {
      setRemarks((prev) => {
        const filtered = prev.filter(
          (r) => !r.id.startsWith("optimistic-") || r.content !== raw.content,
        );
        if (filtered.some((r) => r.id === raw.id)) return filtered;
        return [raw, ...filtered];
      });
    },
    onTaskUpdated: (row) => {
      const nextUsers = row.assigned_to_users as string[] | undefined;
      if (nextUsers !== undefined) {
        const uid = nextUsers[0];
        if (!uid) setAssigneeProfile(null);
        else {
          const m = workspaceMembersRef.current.find((x) => x.id === uid);
          setAssigneeProfile(
            m ?? { id: uid, full_name: "Member", job_title: null },
          );
        }
      }
      if (row.attachments !== undefined) {
        setChecklist(extractChecklistFromAttachments(row.attachments));
      }
      setTask((prev) => {
        if (!prev) return prev;
        const attachments =
          row.attachments !== undefined ? row.attachments : prev.attachments;
        return {
          ...prev,
          atlas_status: (row.atlas_status as AtlasTaskStatus) ?? prev.atlas_status,
          progress: (row.progress as number) ?? prev.progress,
          priority: (row.priority as TaskPriority) ?? prev.priority,
          assigned_to_users: nextUsers ?? prev.assigned_to_users,
          due_date: (row.due_date as string | null) ?? prev.due_date,
          notes: (row.notes as string | null) ?? prev.notes,
          attachments: attachments as SubTask["attachments"],
        };
      });
    },
  });

  // Keyboard close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        {/* Scrim */}
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />

        {/* Modal panel */}
        <motion.div
          key="modal"
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "relative z-10 w-full max-w-[1100px] h-[90vh] max-h-[820px] flex flex-col",
            surfaceCardVariants({ tone: "luxury", elevation: "md", overflow: "hidden" }),
          )}
        >
          {/* ── Modal Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E4DF] shrink-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {masterTaskTitle && (
                <>
                  <span className="text-[12px] text-[#8A8A6E] truncate max-w-[200px]">
                    {masterTaskTitle}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#B5A99A] shrink-0" />
                </>
              )}
              <span className="text-[14px] font-medium text-[#1A1A1A] truncate">
                {task?.title ?? "Loading…"}
              </span>
            </div>

            {/* Status + priority + actions */}
            {task && (
              <div className="relative flex items-center gap-2 shrink-0 ml-4">
                <SubTaskStatusBadge status={task.atlas_status} size="sm" />
                <TaskPriorityBadge priority={task.priority ?? "medium"} size="sm" />
                {!readOnly && (
                  <>
                    <div className="w-px h-5 bg-[#E5E4DF] mx-1" />
                    <button
                      type="button"
                      onClick={() => setEditMode((p) => !p)}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        editMode
                          ? "bg-[#D4AF37]/10 text-[#A88B25]"
                          : "hover:bg-[#F2F2EE] text-[#6B6B6B]",
                      )}
                      aria-label="Edit brief"
                      title="Edit brief"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen((p) => !p);
                        setDeleteConfirm(false);
                      }}
                      className="p-1.5 rounded-lg hover:bg-[#F2F2EE] text-[#6B6B6B] transition-colors"
                      aria-label="More actions"
                      title="More actions"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {menuOpen && (
                      <div
                        ref={menuRef}
                        className="absolute top-full right-0 mt-1 z-50 w-44 rounded-xl border border-[#E5E4DF] bg-white shadow-lg py-1"
                      >
                        {!deleteConfirm ? (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(true)}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-[#C0392B] hover:bg-[#FEF2F2] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            Delete subtask
                          </button>
                        ) : (
                          <div className="px-3 py-2.5">
                            <p className="text-[12px] text-[#1A1A1A] font-medium mb-2">
                              Delete this subtask?
                            </p>
                            <p className="text-[11px] text-[#8A8A6E] mb-3 leading-snug">
                              This cannot be undone.
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm(false)}
                                className="flex-1 rounded-lg border border-[#E5E4DF] bg-white px-2 py-1.5 text-[12px] text-[#6B6B6B] hover:bg-[#F2F2EE] transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="flex-1 rounded-lg bg-[#C0392B] px-2 py-1.5 text-[12px] text-white hover:bg-[#A93226] disabled:opacity-60 transition-colors"
                              >
                                {isDeleting ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="ml-2 p-1.5 rounded-lg hover:bg-[#F2F2EE] text-[#6B6B6B] transition-colors shrink-0"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Modal Body ── */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <AlertTriangle className="w-8 h-8 text-[#C0392B] mx-auto mb-2" />
                <p className="text-[14px] text-[#C0392B]">{error}</p>
                <button
                  type="button"
                  onClick={() => void fetchData()}
                  className="mt-3 text-[13px] text-[#D4AF37] underline"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : task ? (
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Zone A — 38% width */}
              <div
                className={cn(
                  "w-[38%] shrink-0 flex flex-col min-h-0 bg-white",
                  !readOnly && "border-r border-[#E5E4DF]",
                )}
              >
                <ZoneA
                  task={task}
                  masterTaskTitle={masterTaskTitle}
                  masterTaskGroupTitle={masterTaskGroupTitle}
                  assigneeProfile={assigneeProfile}
                  workspaceMembers={workspaceMembers}
                  canAssignSubtask={canAssignSubtask}
                  checklist={checklist}
                  editable={editMode && !readOnly}
                  onSaved={() => {
                    setEditMode(false);
                    router.refresh();
                    void fetchData({ silent: true });
                  }}
                  onCancelEdit={() => setEditMode(false)}
                />
              </div>

              {/* Zone B — 62% width */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#FAFAF8]">
                <ZoneB
                  taskId={task.id}
                  currentStatus={task.atlas_status}
                  currentProgress={task.progress ?? 0}
                  remarks={remarks}
                  setRemarks={setRemarks}
                  currentUserId={currentUser.id}
                  currentUserName={currentUser.full_name}
                  currentUserJobTitle={currentUser.job_title}
                  readOnly={readOnly}
                  onStatusChange={(newStatus) =>
                    setTask((prev) => prev ? { ...prev, atlas_status: newStatus } : null)
                  }
                  onProgressChange={(newProgress) =>
                    setTask((prev) => prev ? { ...prev, progress: newProgress } : null)
                  }
                />
              </div>
            </div>
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

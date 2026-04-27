"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { useTaskRealtime } from "@/lib/hooks/useTaskRealtime";
import { getTaskDetail } from "@/lib/actions/projects";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { UpdateProgressModal } from "@/components/projects/UpdateProgressModal";
import {
  updateGroupTask,
  updateTaskProgress,
  addComment,
  editComment,
  deleteComment,
  createSubTask,
  deleteGroupTask,
} from "@/lib/actions/projects";
import { TASK_PRIORITY_CONFIG } from "@/lib/types/database";
import type {
  ProjectTask,
  TaskComment,
  ProjectProgressUpdate,
  TaskPriority,
} from "@/lib/types/database";
import { format, formatDistanceToNow, isAfter, differenceInHours } from "date-fns";
import { toast } from "sonner";
import {
  ChevronRight,
  Edit2,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  Tag,
  Send,
  Loader2,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";

// ── Progress Ring ──────────────────────────────────────────────────────────

function ProgressRing({
  value,
  size = 56,
  onClick,
}: {
  value: number;
  size?: number;
  onClick?: () => void;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <button
      type="button"
      onClick={onClick}
      title="Update progress"
      className="group relative flex items-center justify-center hover:opacity-80 transition-opacity"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E4E4E0"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={value === 100 ? "#10B981" : "#D4AF37"}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>
      <span
        className={cn(
          "absolute text-[11px] font-bold leading-none",
          value === 100 ? "text-emerald-600" : "text-zinc-700",
        )}
      >
        {value}%
      </span>
    </button>
  );
}

// ── Priority Selector ──────────────────────────────────────────────────────

const PRIORITY_OPTIONS: TaskPriority[] = ["urgent", "high", "medium", "low"];

function PrioritySelector({
  value,
  taskId,
  projectId,
}: {
  value: TaskPriority | null;
  taskId: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<TaskPriority | null>(value);
  const [isPending, startTransition] = useTransition();
  const config = current ? TASK_PRIORITY_CONFIG[current] : null;

  function selectPriority(p: TaskPriority) {
    setCurrent(p);
    setOpen(false);
    startTransition(async () => {
      const r = await updateGroupTask(taskId, { priority: p });
      if (!r.success) {
        toast.error(r.error ?? "Failed to update priority");
        setCurrent(value);
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all",
          config ? config.className : "bg-zinc-100 text-zinc-400",
        )}
      >
        {config ? (
          <>
            <span className={cn("w-1.5 h-1.5 rounded-full", config.dotClass)} />
            {config.label}
          </>
        ) : (
          "No priority"
        )}
      </button>
      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 bg-white border border-[#E5E4DF] rounded-xl shadow-lg py-1 min-w-[120px]">
          {PRIORITY_OPTIONS.map((p) => {
            const c = TASK_PRIORITY_CONFIG[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => selectPriority(p)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium hover:bg-zinc-50 transition-colors",
                  current === p && "bg-zinc-50",
                )}
              >
                <span className={cn("w-2 h-2 rounded-full", c.dotClass)} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Single Comment Row ─────────────────────────────────────────────────────

function CommentRow({
  comment,
  currentUserId,
}: {
  comment: TaskComment;
  currentUserId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment.content);
  const [isPending, startTransition] = useTransition();
  const isOwn = comment.author_id === currentUserId;

  function handleSaveEdit() {
    if (!editValue.trim()) return;
    startTransition(async () => {
      const r = await editComment(comment.id, editValue.trim());
      if (r.success) setEditing(false);
      else toast.error(r.error ?? "Failed to edit");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const r = await deleteComment(comment.id);
      if (!r.success) toast.error(r.error ?? "Failed to delete");
    });
  }

  if (comment.is_system) {
    return (
      <div className="flex items-start gap-2 py-2">
        <div className="w-5 h-5 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 mt-0.5">
          <CheckCircle2 className="w-3 h-3 text-zinc-400" />
        </div>
        <div>
          <p className="text-xs text-zinc-400 italic">{comment.content}</p>
          <p className="text-[10px] text-zinc-300 mt-0.5">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
    );
  }

  const initials = getInitials(comment.author?.full_name ?? "?");

  return (
    <div className="flex items-start gap-2.5 py-2 group/comment">
      <div className="w-7 h-7 rounded-full bg-[#D4AF37]/15 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[10px] font-semibold text-[#A88B25]">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-zinc-700">
            {comment.author?.full_name ?? "Unknown"}
          </span>
          <span className="text-[10px] text-zinc-400">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
          {comment.edited_at && (
            <span className="text-[10px] text-zinc-300 italic">edited</span>
          )}
        </div>
        {editing ? (
          <div>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              rows={2}
              className="w-full text-xs text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-[#D4AF37]/50"
              autoFocus
            />
            <div className="flex gap-1.5 mt-1">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isPending}
                className="text-[11px] font-medium text-[#D4AF37] hover:text-[#A88B25]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setEditValue(comment.content); }}
                className="text-[11px] font-medium text-zinc-400 hover:text-zinc-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-600 whitespace-pre-wrap">{comment.content}</p>
        )}
      </div>
      {isOwn && !editing && (
        <div className="opacity-0 group-hover/comment:opacity-100 flex gap-1 shrink-0 transition-opacity">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="p-1 rounded-lg text-zinc-300 hover:text-zinc-500 hover:bg-zinc-50 transition-colors"
            aria-label="Edit comment"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="p-1 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            aria-label="Delete comment"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-task row ───────────────────────────────────────────────────────────

function SubTaskRow({ task }: { task: ProjectTask }) {
  const [done, setDone] = useState(task.status === "completed");
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !done;
    setDone(next);
    startTransition(async () => {
      const r = await updateTaskProgress(task.id, next ? 100 : 0);
      if (!r.success) {
        toast.error(r.error ?? "Failed");
        setDone(!next);
      }
    });
  }

  return (
    <div className="flex items-center gap-2.5 py-1.5 group/subtask">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        className="shrink-0 transition-colors"
        aria-label={done ? "Mark incomplete" : "Mark complete"}
      >
        {done ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <Circle className="w-4 h-4 text-zinc-300 group-hover/subtask:text-zinc-400" />
        )}
      </button>
      <span
        className={cn(
          "text-xs flex-1",
          done ? "text-zinc-400 line-through" : "text-zinc-700",
        )}
      >
        {task.title}
      </span>
    </div>
  );
}

// ── Main Sheet ─────────────────────────────────────────────────────────────

interface TaskDetailSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  taskId: string | null;
  projectName?: string;
  groupName?: string;
  initialTask?: ProjectTask | null; // board-level snapshot shown instantly; full detail loaded async
  currentUserId: string;
  projectId?: string;
}

export function TaskDetailSheet({
  open,
  onOpenChange,
  taskId,
  projectName,
  groupName,
  initialTask,
  currentUserId,
  projectId,
}: TaskDetailSheetProps) {
  const [subTasks, setSubTasks] = useState<ProjectTask[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Realtime hook — we seed its state imperatively after the async DB fetch
  // (avoids the infinite-loop that prop-sync useEffects cause)
  const {
    comments, progressUpdates, task,
    setComments, setProgressUpdates, setTask,
  } = useTaskRealtime({ taskId, initialTask: initialTask ?? null });

  const currentTask = task ?? initialTask;

  // Fetch full task detail from DB whenever taskId+open changes (LeadContextChat pattern)
  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    const result = await getTaskDetail(id);
    setDetailLoading(false);
    if (result.success && result.data) {
      setTask(result.data.task);
      setComments(result.data.comments);
      setProgressUpdates(result.data.progress_updates);
      setSubTasks(result.data.sub_tasks);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open && taskId) {
      fetchDetail(taskId);
    } else if (!open) {
      setComments([]);
      setProgressUpdates([]);
      setSubTasks([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(currentTask?.title ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  // Notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(currentTask?.notes ?? "");
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Progress modal
  const [progressOpen, setProgressOpen] = useState(false);

  // Comment input — follows LeadContextChat pattern (send → clear, realtime delivers)
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Add sub-task inline
  const [addingSubTask, setAddingSubTask] = useState(false);
  const [subTaskTitle, setSubTaskTitle] = useState("");
  const [isAddingSubTask, startAddSubTask] = useTransition();

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const [isSavingTitle, startSaveTitle] = useTransition();
  const [isSavingNotes, startSaveNotes] = useTransition();

  useEffect(() => {
    if (currentTask) {
      setTitleValue(currentTask.title);
      setNotesValue(currentTask.notes ?? "");
    }
  }, [currentTask?.id]);

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (editingNotes) notesRef.current?.focus();
  }, [editingNotes]);

  // Auto-scroll to newest comment (same as LeadContextChat bottomRef pattern)
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  function saveTitle() {
    setEditingTitle(false);
    if (!titleValue.trim() || !currentTask || titleValue === currentTask.title) return;
    startSaveTitle(async () => {
      const r = await updateGroupTask(currentTask.id, { title: titleValue.trim() });
      if (!r.success) {
        toast.error(r.error ?? "Failed to update title");
        setTitleValue(currentTask.title);
      }
    });
  }

  function saveNotes() {
    setEditingNotes(false);
    if (!currentTask || notesValue === (currentTask.notes ?? "")) return;
    startSaveNotes(async () => {
      const r = await updateGroupTask(currentTask.id, { notes: notesValue });
      if (!r.success) toast.error(r.error ?? "Failed to save notes");
    });
  }

  // Send comment: clear textarea immediately (optimistic UX), realtime delivers the persisted row
  async function handleSubmitComment() {
    if (!commentText.trim() || !taskId) return;
    const text = commentText.trim();
    setCommentText("");
    setSubmittingComment(true);
    try {
      const r = await addComment(taskId, text);
      if (!r.success) {
        setCommentText(text); // restore on failure
        toast.error(r.error ?? "Failed to post comment");
      }
    } finally {
      setSubmittingComment(false);
    }
  }

  function handleAddSubTask() {
    if (!subTaskTitle.trim() || !taskId) return;
    startAddSubTask(async () => {
      const r = await createSubTask(taskId, { title: subTaskTitle.trim() });
      if (r.success) {
        setSubTaskTitle("");
        setAddingSubTask(false);
        // Re-fetch sub-tasks from DB (sub-tasks don't come through realtime)
        await fetchDetail(taskId);
      } else {
        toast.error(r.error ?? "Failed to create sub-task");
      }
    });
  }

  function handleDelete() {
    if (!currentTask) return;
    startDelete(async () => {
      const r = await deleteGroupTask(currentTask.id);
      if (r.success) {
        onOpenChange(false);
        setConfirmDelete(false);
      } else {
        toast.error(r.error ?? "Failed to delete task");
      }
    });
  }

  const progress = currentTask?.progress ?? 0;
  const dueDate = currentTask?.due_date ? new Date(currentTask.due_date) : null;
  const isOverdue = dueDate ? isAfter(new Date(), dueDate) : false;
  const isWarning = dueDate && !isOverdue ? differenceInHours(dueDate, new Date()) <= 24 : false;

  const completedSubTasks = subTasks.filter((s) => s.status === "completed").length;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className="w-full max-w-[560px] p-0 flex flex-col overflow-hidden bg-[#FAFAF8]"
        >
          {/* Radix requires a DialogTitle for accessibility; use the task title (sr-only when task loaded, fallback when loading) */}
          <SheetTitle className="sr-only">
            {currentTask ? currentTask.title : "Task detail"}
          </SheetTitle>

          {detailLoading && !currentTask ? (
            <div className="flex-1 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 text-zinc-300 animate-spin" />
              <span className="text-xs text-zinc-400">Loading…</span>
            </div>
          ) : !currentTask ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-zinc-300 animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Sheet Header ───────────────────── */}
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-[#E5E4DF] bg-white shrink-0">
                {/* Breadcrumb */}
                {(projectName || groupName) && (
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-2 font-medium">
                    {projectName && <span>{projectName}</span>}
                    {projectName && groupName && (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    {groupName && <span>{groupName}</span>}
                  </div>
                )}

                {/* Editable title */}
                <div className="pr-8">
                  {editingTitle ? (
                    <input
                      ref={titleRef}
                      value={titleValue}
                      onChange={(e) => setTitleValue(e.target.value)}
                      onBlur={saveTitle}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTitle();
                        if (e.key === "Escape") {
                          setEditingTitle(false);
                          setTitleValue(currentTask.title);
                        }
                      }}
                      className="w-full text-xl font-semibold text-[#1A1A1A] bg-transparent border-b-2 border-[#D4AF37]/40 focus:outline-none focus:border-[#D4AF37] pb-0.5"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingTitle(true)}
                      className={cn(
                        "text-xl font-semibold text-[#1A1A1A] text-left w-full hover:text-[#D4AF37] transition-colors",
                        currentTask.status === "completed" && "line-through opacity-60",
                        isSavingTitle && "opacity-60",
                      )}
                    >
                      {currentTask.title}
                    </button>
                  )}
                </div>

                {/* Priority + Status row */}
                <div className="flex items-center gap-2 mt-2">
                  <PrioritySelector
                    value={currentTask.priority ?? null}
                    taskId={currentTask.id}
                    projectId={projectId ?? currentTask.project_id}
                  />
                  <span
                    className={cn(
                      "text-[11px] font-semibold px-2.5 py-1 rounded-lg",
                      currentTask.status === "completed"
                        ? "bg-emerald-500/10 text-emerald-700"
                        : progress > 0
                          ? "bg-amber-400/10 text-amber-700"
                          : "bg-zinc-100 text-zinc-500",
                    )}
                  >
                    {currentTask.status === "completed"
                      ? "Completed"
                      : progress > 0
                        ? "In Progress"
                        : "Not Started"}
                  </span>
                </div>
              </SheetHeader>

              {/* ── Scrollable body ────────────────────── */}
              <div className="flex-1 overflow-y-auto">
                {/* Meta grid */}
                <div className="px-6 py-5 grid grid-cols-[160px_1fr] gap-y-4 gap-x-4 border-b border-[#E5E4DF]">
                  {/* Progress */}
                  <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                    <span>Progress</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ProgressRing
                      value={progress}
                      size={44}
                      onClick={() => setProgressOpen(true)}
                    />
                    <button
                      type="button"
                      onClick={() => setProgressOpen(true)}
                      className="text-xs text-zinc-400 hover:text-[#D4AF37] transition-colors"
                    >
                      Update
                    </button>
                  </div>

                  {/* Assignees */}
                  <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                    <span>Assignees</span>
                  </div>
                  <div>
                    {(currentTask.assigned_to_profiles?.length ?? 0) > 0 ? (
                      <AvatarStack
                        assignees={currentTask.assigned_to_profiles ?? []}
                        maxVisible={5}
                        size="sm"
                      />
                    ) : (
                      <span className="text-xs text-zinc-300">Unassigned</span>
                    )}
                  </div>

                  {/* Due date */}
                  <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Due</span>
                  </div>
                  <div>
                    {dueDate ? (
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isOverdue && "text-red-600",
                          isWarning && !isOverdue && "text-amber-600",
                          !isOverdue && !isWarning && "text-zinc-600",
                        )}
                      >
                        {format(dueDate, "MMMM d, yyyy")}
                        {isOverdue && (
                          <AlertTriangle className="inline w-3 h-3 ml-1 mb-0.5 text-red-500" />
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-300">No due date</span>
                    )}
                  </div>

                  {/* Estimated */}
                  {currentTask.estimated_minutes !== null && (
                    <>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                        <span>Estimated</span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-600">
                          {Math.round(currentTask.estimated_minutes! / 60 * 10) / 10}h
                        </span>
                      </div>
                    </>
                  )}

                  {/* Tags */}
                  {currentTask.tags?.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                        <Tag className="w-3.5 h-3.5" />
                        <span>Tags</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {currentTask.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Description / Notes */}
                <div className="px-6 py-5 border-b border-[#E5E4DF]">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                    Description
                  </h4>
                  {editingNotes ? (
                    <textarea
                      ref={notesRef}
                      value={notesValue}
                      onChange={(e) => {
                        setNotesValue(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = e.target.scrollHeight + "px";
                      }}
                      onBlur={saveNotes}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNotes();
                        if (e.key === "Escape") {
                          setEditingNotes(false);
                          setNotesValue(currentTask.notes ?? "");
                        }
                      }}
                      placeholder="Add a description…"
                      className="w-full text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-[#D4AF37]/50 min-h-[80px]"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingNotes(true)}
                      className={cn(
                        "w-full text-left text-sm rounded-xl px-3 py-2.5 transition-colors",
                        notesValue
                          ? "text-zinc-700 hover:bg-zinc-50"
                          : "text-zinc-300 hover:bg-zinc-50 italic",
                      )}
                    >
                      {notesValue || "Add a description…"}
                    </button>
                  )}
                  {isSavingNotes && (
                    <p className="text-[10px] text-zinc-400 mt-1">Saving…</p>
                  )}
                </div>

                {/* Sub-tasks */}
                <div className="px-6 py-5 border-b border-[#E5E4DF]">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                      Sub-tasks
                      {subTasks.length > 0 && (
                        <span className="ml-1 text-zinc-300">
                          ({completedSubTasks}/{subTasks.length})
                        </span>
                      )}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setAddingSubTask(true)}
                      className="text-[11px] text-zinc-400 hover:text-[#D4AF37] flex items-center gap-0.5 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                  <div className="divide-y divide-zinc-50">
                    {subTasks.map((sub) => (
                      <SubTaskRow key={sub.id} task={sub} />
                    ))}
                  </div>
                  {addingSubTask && (
                    <div className="mt-2 flex gap-2 items-center">
                      <input
                        autoFocus
                        type="text"
                        value={subTaskTitle}
                        onChange={(e) => setSubTaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddSubTask();
                          if (e.key === "Escape") {
                            setAddingSubTask(false);
                            setSubTaskTitle("");
                          }
                        }}
                        placeholder="Sub-task title…"
                        className="flex-1 text-xs text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4AF37]/50"
                      />
                      <button
                        type="button"
                        onClick={handleAddSubTask}
                        disabled={isAddingSubTask}
                        className="text-[11px] font-medium text-[#D4AF37] hover:text-[#A88B25] disabled:opacity-50"
                      >
                        {isAddingSubTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
                      </button>
                    </div>
                  )}
                  {subTasks.length === 0 && !addingSubTask && (
                    <p className="text-xs text-zinc-300 italic">No sub-tasks yet</p>
                  )}
                </div>

                {/* Progress History */}
                {progressUpdates.length > 0 && (
                  <div className="px-6 py-5 border-b border-[#E5E4DF]">
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                      Progress History
                    </h4>
                    <div className="space-y-3">
                      {progressUpdates.map((pu) => (
                        <div key={pu.id} className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-1.5 shrink-0" />
                          <div>
                            <p className="text-xs text-zinc-600">
                              <span className="font-medium">
                                {pu.updater?.full_name ?? "Someone"}
                              </span>{" "}
                              moved progress from{" "}
                              <span className="font-medium">{pu.previous_progress}%</span> to{" "}
                              <span className="font-medium">{pu.new_progress}%</span>
                            </p>
                            {pu.note && (
                              <p className="text-xs text-zinc-500 mt-0.5 italic">{pu.note}</p>
                            )}
                            <p className="text-[10px] text-zinc-300 mt-0.5">
                              {formatDistanceToNow(new Date(pu.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div className="px-6 py-5">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                    Comments
                  </h4>
                  <div className="divide-y divide-zinc-50">
                    {comments.map((c) => (
                      <CommentRow key={c.id} comment={c} currentUserId={currentUserId} />
                    ))}
                    {comments.length === 0 && (
                      <p className="text-xs text-zinc-300 italic py-2">
                        No comments yet. Be the first.
                      </p>
                    )}
                  </div>
                  <div ref={commentsEndRef} />
                </div>
              </div>

              {/* ── Comment input (pinned bottom) ───────── */}
              <div className="px-6 py-4 border-t border-[#E5E4DF] bg-white shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    value={commentText}
                    onChange={(e) => {
                      setCommentText(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSubmitComment();
                      }
                    }}
                    placeholder="Leave a comment… (⌘↵ to post)"
                    rows={1}
                    className="flex-1 text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-[#D4AF37]/40 placeholder:text-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={handleSubmitComment}
                    disabled={submittingComment || !commentText.trim()}
                    className="p-2.5 rounded-xl bg-[#D4AF37] text-[#0A0A0A] hover:bg-[#C9A530] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                    aria-label="Post comment"
                  >
                    {submittingComment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* ── Danger zone ─────────────────────────── */}
              <div className="px-6 py-3 border-t border-[#E5E4DF] bg-white shrink-0">
                {confirmDelete ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-red-600 font-medium flex-1">
                      Delete this task permanently?
                    </span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete task
                  </button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Progress modal */}
      {currentTask && (
        <UpdateProgressModal
          open={progressOpen}
          onOpenChange={setProgressOpen}
          taskId={currentTask.id}
          taskTitle={currentTask.title}
          currentProgress={progress}
        />
      )}
    </>
  );
}

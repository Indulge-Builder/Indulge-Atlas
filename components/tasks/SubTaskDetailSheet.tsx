"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { isToday, isTomorrow, isYesterday } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  X, Calendar, Clock, Tag, User,
  CheckCircle2, Layers, AlertCircle,
  SlidersHorizontal, MessageSquare, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SubTaskStatusBadge } from "./SubTaskStatusBadge";
import { TaskPriorityBadge } from "./TaskPriorityBadge";
import { RemarkTimeline } from "./RemarkTimeline";
import { AddRemarkForm } from "./AddRemarkForm";
import { getSubTaskDetail, updateSubTask, updateSubTaskProgress } from "@/lib/actions/tasks";
import { useAtlasTaskRealtime } from "@/lib/hooks/useTaskRealtime";
import type { SubTask, TaskRemark, AtlasTaskStatus } from "@/lib/types/database";
import { getInitials } from "@/lib/utils";

const IST = "Asia/Kolkata";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDue(iso: string): { label: string; overdue: boolean } {
  const d = toZonedTime(new Date(iso), IST);
  if (isNaN(d.getTime())) return { label: "No due date", overdue: false };
  const now = toZonedTime(new Date(), IST);
  const overdue = d < now && !isToday(d);
  if (isToday(d))     return { label: `Today · ${format(d, "h:mm a")}`,     overdue: false };
  if (isTomorrow(d))  return { label: `Tomorrow · ${format(d, "h:mm a")}`,  overdue: false };
  if (isYesterday(d)) return { label: `Yesterday · ${format(d, "h:mm a")}`, overdue: true  };
  return { label: format(d, "d MMM yyyy · h:mm a"), overdue };
}

function fmtMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function InitialAvatar({ name }: { name: string }) {
  const palettes = [
    ["bg-violet-100", "text-violet-700"],
    ["bg-amber-100",  "text-amber-700" ],
    ["bg-emerald-100","text-emerald-700"],
    ["bg-blue-100",   "text-blue-700"  ],
    ["bg-rose-100",   "text-rose-700"  ],
  ];
  const [bg, text] = palettes[name.charCodeAt(0) % palettes.length];
  return (
    <span className={cn("h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0", bg, text)}>
      {getInitials(name)}
    </span>
  );
}

// ── Progress ring ─────────────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const stroke = circ * (pct / 100);
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="flex-shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#f4f4f5" strokeWidth="4" />
      <circle
        cx="26" cy="26" r={r}
        fill="none"
        stroke="#D4AF37"
        strokeWidth="4"
        strokeDasharray={`${stroke} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
      <text x="26" y="31" textAnchor="middle" fontSize="10" fill="#1A1814" fontWeight="700">
        {pct}%
      </text>
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SubTaskDetailSheetProps {
  taskId: string;
  open:   boolean;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SubTaskDetailSheet({ taskId, open, onClose }: SubTaskDetailSheetProps) {
  const router = useRouter();
  const [task,    setTask]    = useState<SubTask | null>(null);
  const [remarks, setRemarks] = useState<TaskRemark[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<
    { id: string; full_name: string; job_title: string | null }[]
  >([]);
  const [canAssignSubtask, setCanAssignSubtask] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [assignSaving, startAssignSaving] = useTransition();
  const didMutateRef = useRef(false);
  const bottomRef    = useRef<HTMLDivElement>(null);

  const { setRemarks: setRealtimeRemarks } = useAtlasTaskRealtime({
    masterTaskId: task?.project_id ?? null,
    subtaskId:    taskId,
    onRemarkAdded: (r) => {
      setRemarks((prev) => prev.some((x) => x.id === r.id) ? prev : [...prev, r]);
    },
  });

  const reloadDetail = useCallback(async () => {
    const result = await getSubTaskDetail(taskId);
    if (result.success && result.data) {
      setTask(result.data.task);
      setRemarks(result.data.remarks);
      setRealtimeRemarks(result.data.remarks);
      setWorkspaceMembers(result.data.workspaceMembers ?? []);
      setCanAssignSubtask(result.data.canAssignSubtask ?? false);
    }
  }, [taskId, setRealtimeRemarks]);

  useEffect(() => {
    if (!open || !taskId) return;
    setLoading(true);
    getSubTaskDetail(taskId).then((result) => {
      if (result.success && result.data) {
        setTask(result.data.task);
        setRemarks(result.data.remarks);
        setRealtimeRemarks(result.data.remarks);
        setWorkspaceMembers(result.data.workspaceMembers ?? []);
        setCanAssignSubtask(result.data.canAssignSubtask ?? false);
      } else {
        toast.error("Failed to load task details");
      }
      setLoading(false);
    });
  }, [taskId, open, setRealtimeRemarks]);

  function handleAssignChange(userId: string) {
    startAssignSaving(async () => {
      const result = await updateSubTask(taskId, {
        assigned_to_users: userId ? [userId] : [],
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not update assignee");
        return;
      }
      toast.success(userId ? "Assignee updated" : "Unassigned");
      await reloadDetail();
      didMutateRef.current = true;
      router.refresh();
    });
  }

  // Scroll remarks to bottom on new entry
  useEffect(() => {
    if (remarks.length) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [remarks.length]);

  function handleProgressChange(val: number) {
    if (!task) return;
    startTransition(async () => {
      const result = await updateSubTaskProgress({ task_id: task.id, new_progress: val });
      if (result.success) {
        didMutateRef.current = true;
        setTask((p) => p ? { ...p, progress: val } : p);
      } else {
        toast.error(result.error ?? "Failed to update progress");
      }
    });
  }

  function handleRemarkAdded(partial: Partial<TaskRemark>) {
    didMutateRef.current = true;
    setRemarks((prev) => {
      const remark: TaskRemark = {
        id:               `temp-${Date.now()}`,
        task_id:          taskId,
        author_id:        "",
        content:          partial.content ?? "",
        state_at_time:    (partial.state_at_time ?? "todo") as AtlasTaskStatus,
        previous_status:  partial.previous_status ?? null,
        progress_at_time: partial.progress_at_time ?? null,
        source:           partial.source ?? "agent",
        created_at:       partial.created_at ?? new Date().toISOString(),
      };
      return [...prev, remark];
    });
    if (partial.state_at_time && task) {
      setTask((p) => p ? { ...p, atlas_status: partial.state_at_time as AtlasTaskStatus } : p);
    }
  }

  function handleClose() {
    if (didMutateRef.current) {
      didMutateRef.current = false;
      router.refresh();
    }
    onClose();
  }

  const assignees = (task?.assigned_to_profiles ?? []) as { id: string; full_name: string; job_title?: string | null }[];
  const due = task?.due_date ? fmtDue(task.due_date) : null;
  const progress = task?.progress ?? 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="sub-bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[4px]"
            aria-hidden
          />

          {/* Dialog */}
          <motion.div
            key="sub-dlg"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{   opacity: 0, scale: 0.97,  y: 10 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            aria-label={task ? `Task: ${task.title}` : "Task details"}
            className={cn(
              "fixed z-[60] inset-x-0 mx-auto",
              "top-[4vh] bottom-[4vh]",
              "w-full max-w-xl",
              "flex flex-col",
              "bg-[#FAFAF8] rounded-2xl overflow-hidden",
              "shadow-[0_40px_80px_-16px_rgba(0,0,0,0.28),0_0_0_1px_rgba(0,0,0,0.06),0_8px_20px_-4px_rgba(0,0,0,0.12)]",
            )}
          >
            {/* Gold accent line */}
            <div className="h-[3px] w-full bg-gradient-to-r from-[#D4AF37] via-[#F0D060] to-[#A88B25] flex-shrink-0" />

            {/* Top bar */}
            <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-zinc-100 flex-shrink-0">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>Atlas Tasks</span>
                <span>/</span>
                <span className="text-zinc-600 font-medium">Sub-task</span>
              </div>
              <button
                onClick={handleClose}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-[#D4AF37] animate-spin" />
                <p className="text-xs text-zinc-400">Loading task…</p>
              </div>
            ) : !task ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-zinc-400">Task not found</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

                {/* Hero */}
                <div className="px-6 pt-5 pb-4 bg-white border-b border-zinc-100 flex-shrink-0 space-y-3">
                  {/* Badges + progress ring */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      <SubTaskStatusBadge status={task.atlas_status ?? "todo"} />
                      <TaskPriorityBadge  priority={task.priority ?? "medium"} />
                    </div>
                    <ProgressRing pct={progress} />
                  </div>

                  {/* Title */}
                  <h2
                    className="text-[18px] font-bold leading-snug text-zinc-900"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {task.title}
                  </h2>

                  {/* Due date chip */}
                  {due && (
                    <div className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5",
                      due.overdue
                        ? "bg-red-50 text-red-600 ring-1 ring-red-100"
                        : "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-100",
                    )}>
                      <Calendar className="h-3.5 w-3.5" />
                      {due.overdue && <span className="font-bold">Overdue ·</span>}
                      {due.label}
                    </div>
                  )}
                </div>

                {/* Scrollable content */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="px-6 py-5 space-y-5">

                    {/* Assignees — managers get a picker; others see read-only chips */}
                    {canAssignSubtask && task && (
                      <div className="space-y-2">
                        <label
                          htmlFor="sheet-subtask-assignee"
                          className="flex items-center gap-1.5 text-[11px] text-zinc-400 uppercase tracking-wider font-medium"
                        >
                          <User className="h-3 w-3" />
                          Assign to
                        </label>
                        <select
                          id="sheet-subtask-assignee"
                          disabled={assignSaving}
                          value={(task.assigned_to_users as string[] | null)?.[0] ?? ""}
                          onChange={(e) => handleAssignChange(e.target.value)}
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 disabled:opacity-60"
                        >
                          <option value="">Unassigned</option>
                          {workspaceMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {!canAssignSubtask && assignees.length > 0 && (
                      <div className="space-y-2">
                        <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 uppercase tracking-wider font-medium">
                          <User className="h-3 w-3" />Assigned to
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {assignees.map((a) => (
                            <div key={a.id} className="flex items-center gap-1.5 rounded-full bg-white ring-1 ring-zinc-100 pl-1 pr-2.5 py-0.5">
                              <InitialAvatar name={a.full_name} />
                              <span className="text-xs font-medium text-zinc-700">{a.full_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meta chips row */}
                    {(task.estimated_minutes || (Array.isArray(task.tags) && task.tags.length > 0)) && (
                      <div className="flex flex-wrap gap-2">
                        {task.estimated_minutes && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 px-2.5 py-1.5 text-xs text-zinc-500">
                            <Clock className="h-3 w-3" />
                            {fmtMinutes(task.estimated_minutes)} est.
                          </span>
                        )}
                        {Array.isArray(task.tags) && (task.tags as string[]).map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 px-2.5 py-1.5 text-xs text-zinc-500">
                            <Tag className="h-3 w-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {task.notes && (
                      <div className="rounded-xl border border-zinc-100 bg-white p-4 space-y-1.5">
                        <p className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Notes</p>
                        <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">{task.notes}</p>
                      </div>
                    )}

                    {/* Progress section */}
                    <div className="rounded-xl border border-zinc-100 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 uppercase tracking-wider font-medium">
                          <SlidersHorizontal className="h-3 w-3" />Progress
                        </p>
                        <span className="text-xs font-semibold text-zinc-700">
                          {progress}%
                          {isPending && <Loader2 className="inline ml-1.5 h-3 w-3 animate-spin text-zinc-400" />}
                        </span>
                      </div>

                      {/* Progress bar track + filled */}
                      <div className="relative h-2 rounded-full bg-zinc-100 overflow-visible">
                        <div
                          className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-[#F0D060] transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      <input
                        type="range"
                        min={0} max={100} step={5}
                        value={progress}
                        onChange={(e) => handleProgressChange(Number(e.target.value))}
                        disabled={isPending}
                        className="w-full accent-[#D4AF37] cursor-pointer disabled:opacity-50"
                        aria-label={`Progress: ${progress}%`}
                      />

                      {/* Status milestone markers */}
                      <div className="flex justify-between text-[10px] text-zinc-300">
                        <span className={cn("flex items-center gap-1", progress === 0 && "text-zinc-500 font-medium")}>
                          <AlertCircle className="h-3 w-3" />Not started
                        </span>
                        <span className={cn("flex items-center gap-1", progress >= 50 && progress < 100 && "text-zinc-500 font-medium")}>
                          <Layers className="h-3 w-3" />In progress
                        </span>
                        <span className={cn("flex items-center gap-1", progress === 100 && "text-emerald-500 font-medium")}>
                          <CheckCircle2 className="h-3 w-3" />Done
                        </span>
                      </div>
                    </div>

                    {/* Remarks timeline */}
                    <div>
                      <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-3">
                        <MessageSquare className="h-3 w-3" />
                        Updates
                        {remarks.length > 0 && (
                          <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-zinc-100 text-zinc-500 text-[10px]">
                            {remarks.length}
                          </span>
                        )}
                      </p>

                      {remarks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-200 p-5 flex flex-col items-center gap-2">
                          <MessageSquare className="h-5 w-5 text-zinc-200" />
                          <p className="text-xs text-zinc-400 text-center">No updates yet.<br />Log the first one below.</p>
                        </div>
                      ) : (
                        <RemarkTimeline remarks={remarks} />
                      )}
                      <div ref={bottomRef} />
                    </div>

                  </div>
                </ScrollArea>

                {/* Add remark footer */}
                <div className="flex-shrink-0 border-t border-zinc-200/70 bg-[#FAFAF8] px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">
                    Log Update
                  </p>
                  <AddRemarkForm
                    taskId={taskId}
                    currentStatus={task.atlas_status ?? "todo"}
                    currentProgress={task.progress ?? 0}
                    onSuccess={handleRemarkAdded}
                  />
                </div>

              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

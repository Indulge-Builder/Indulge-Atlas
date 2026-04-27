"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isToday, isTomorrow, isYesterday } from "date-fns";
import {
  X, Crown, Send, Loader2,
  CalendarDays, Clock, CheckCircle2, AlertCircle,
  Phone, MessageCircle, Mail, FileText, RefreshCw,
  BarChart3, Users, DollarSign, TrendingUp,
  User, Layers,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getTaskById, addTaskProgress } from "@/lib/actions/tasks";
import type { TaskWithLead, TaskType, TaskProgressUpdate } from "@/lib/types/database";

// ── Type metadata ─────────────────────────────────────────────────────────────

const TASK_TYPE_META: Record<TaskType, { label: string; icon: React.ElementType; color: string }> = {
  call:                { label: "Call",            icon: Phone,        color: "#4F46E5" },
  whatsapp_message:    { label: "WhatsApp",        icon: MessageCircle,color: "#10B981" },
  email:               { label: "Email",           icon: Mail,         color: "#6366F1" },
  file_dispatch:       { label: "File Dispatch",   icon: FileText,     color: "#8B5CF6" },
  general_follow_up:   { label: "Follow-up",       icon: RefreshCw,    color: "#F97316" },
  campaign_review:     { label: "Campaign Review", icon: BarChart3,    color: "#D4AF37" },
  strategy_meeting:    { label: "Strategy",        icon: Users,        color: "#0D9488" },
  budget_approval:     { label: "Budget",          icon: DollarSign,   color: "#DC2626" },
  performance_analysis:{ label: "Analytics",       icon: TrendingUp,   color: "#7C3AED" },
};

const STATUS_META = {
  pending:     { label: "Pending",     icon: Clock,         bg: "bg-amber-50",   text: "text-amber-700",  ring: "ring-amber-200"  },
  in_progress: { label: "In Progress", icon: Layers,        bg: "bg-blue-50",    text: "text-blue-700",   ring: "ring-blue-200"   },
  completed:   { label: "Completed",   icon: CheckCircle2,  bg: "bg-emerald-50", text: "text-emerald-700",ring: "ring-emerald-200" },
  cancelled:   { label: "Cancelled",   icon: AlertCircle,   bg: "bg-zinc-100",   text: "text-zinc-500",   ring: "ring-zinc-200"   },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function fmtDue(iso: string): { label: string; overdue: boolean } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: "No due date", overdue: false };
  const overdue = d < new Date() && !isToday(d);
  if (isToday(d))     return { label: `Today · ${format(d, "h:mm a")}`,     overdue: false };
  if (isTomorrow(d))  return { label: `Tomorrow · ${format(d, "h:mm a")}`,  overdue: false };
  if (isYesterday(d)) return { label: `Yesterday · ${format(d, "h:mm a")}`, overdue: true  };
  return { label: format(d, "MMM d, yyyy · h:mm a"), overdue };
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  if (isToday(d))    return `Today · ${format(d, "h:mm a")}`;
  if (isYesterday(d))return `Yesterday · ${format(d, "h:mm a")}`;
  return format(d, "MMM d · h:mm a");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InitialAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const colors = [
    ["bg-violet-100", "text-violet-700"],
    ["bg-amber-100",  "text-amber-700" ],
    ["bg-emerald-100","text-emerald-700"],
    ["bg-blue-100",   "text-blue-700"  ],
    ["bg-rose-100",   "text-rose-700"  ],
  ];
  const [bg, text] = colors[name.charCodeAt(0) % colors.length];
  const dim = size === "md" ? "h-8 w-8 text-xs" : "h-6 w-6 text-[10px]";
  return (
    <span className={cn("rounded-full flex items-center justify-center font-bold flex-shrink-0", dim, bg, text)}>
      {getInitials(name)}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TaskDetailSheetProps {
  taskId:           string | null;
  onClose:          () => void;
  onProgressAdded?: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function TaskDetailSheet({ taskId, onClose, onProgressAdded }: TaskDetailSheetProps) {
  const [task,              setTask]             = useState<TaskWithLead | null>(null);
  const [loading,           setLoading]          = useState(true);
  const [updateText,        setUpdateText]       = useState("");
  const [posting,           setPosting]          = useState(false);
  const [optimisticUpdates, setOptimisticUpdates] = useState<TaskProgressUpdate[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!taskId) { setTask(null); setOptimisticUpdates([]); return; }
    setLoading(true);
    getTaskById(taskId).then((t) => { setTask(t ?? null); setLoading(false); });
  }, [taskId]);

  const allUpdates = [
    ...(task?.progress_updates ?? []),
    ...optimisticUpdates,
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Scroll timeline to bottom when new update added
  useEffect(() => {
    if (allUpdates.length) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allUpdates.length]);

  const typeMeta   = task ? (TASK_TYPE_META[task.task_type] ?? TASK_TYPE_META.general_follow_up) : null;
  const statusMeta = task ? (STATUS_META[task.status as keyof typeof STATUS_META] ?? STATUS_META.pending) : null;

  const createdByRole = (task as (TaskWithLead & { created_by_profile?: { role?: string } | null }) | null)?.created_by_profile?.role;
  const assignedRole  = (task as (TaskWithLead & { assigned_to_profile?:  { role?: string } | null }) | null)?.assigned_to_profile?.role;
  const isFoundersTask = createdByRole === "admin" && (assignedRole === "agent" || assignedRole === "manager");

  const assignedProfiles = (task as (TaskWithLead & { assigned_to_profiles?: { id: string; full_name: string }[] }) | null)?.assigned_to_profiles ?? [];

  async function handlePost() {
    const trimmed = updateText.trim();
    if (!trimmed || !taskId || posting) return;

    const temp: TaskProgressUpdate = {
      timestamp: new Date().toISOString(),
      message:   trimmed,
      user_id:   "temp",
      user_name: "You",
    };
    setOptimisticUpdates((p) => [...p, temp]);
    setUpdateText("");
    setPosting(true);

    const result = await addTaskProgress(taskId, trimmed);
    setPosting(false);

    if (result.success) {
      setOptimisticUpdates((p) => p.filter((u) => u.timestamp !== temp.timestamp));
      onProgressAdded?.();
      if (task) setTask({ ...task, progress_updates: [...(task.progress_updates ?? []), result.update!] });
    } else {
      setOptimisticUpdates((p) => p.filter((u) => u.timestamp !== temp.timestamp));
      setUpdateText(trimmed);
    }
  }

  if (!taskId) return null;

  const due = task?.due_date ? fmtDue(task.due_date) : null;

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="bd"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[4px]"
        aria-hidden
      />

      {/* Dialog */}
      <motion.div
        key="dlg"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{   opacity: 0, scale: 0.97,  y: 10 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Task details"
        className={cn(
          "fixed z-[60] inset-x-0 mx-auto",
          "top-[4vh] bottom-[4vh]",
          "w-full max-w-xl",
          "flex flex-col",
          "bg-[#FAFAF8] rounded-2xl overflow-hidden",
          "shadow-[0_40px_80px_-16px_rgba(0,0,0,0.28),0_0_0_1px_rgba(0,0,0,0.06),0_8px_20px_-4px_rgba(0,0,0,0.12)]",
        )}
      >
        {/* ── Gold accent top line ── */}
        <div className="h-[3px] w-full bg-gradient-to-r from-[#D4AF37] via-[#F0D060] to-[#A88B25] flex-shrink-0" />

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-zinc-100 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>My Tasks</span>
            <span>/</span>
            <span className="text-zinc-600 font-medium">Detail</span>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
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
            {/* ── Hero ── */}
            <div className="px-6 pt-5 pb-4 bg-white border-b border-zinc-100 flex-shrink-0 space-y-3">

              {/* Badges row */}
              <div className="flex items-center gap-2 flex-wrap">
                {typeMeta && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1"
                    style={{
                      backgroundColor: `${typeMeta.color}12`,
                      color:            typeMeta.color,
                      borderColor:      `${typeMeta.color}30`,
                    }}
                  >
                    <typeMeta.icon className="h-3 w-3" />
                    {typeMeta.label}
                  </span>
                )}
                {statusMeta && (
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", statusMeta.bg, statusMeta.text, statusMeta.ring)}>
                    <statusMeta.icon className="h-3 w-3" />
                    {statusMeta.label}
                  </span>
                )}
                {isFoundersTask && (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200 shadow-[0_0_12px_rgba(212,175,55,0.18)]">
                    <Crown className="h-3 w-3" />
                    Founder&apos;s Task
                  </span>
                )}
              </div>

              {/* Title */}
              <h2
                className="text-[18px] font-bold leading-snug text-zinc-900"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {task.title}
              </h2>

              {/* Due date */}
              {due && (
                <div className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5",
                  due.overdue
                    ? "bg-red-50 text-red-600 ring-1 ring-red-100"
                    : "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-100",
                )}>
                  <CalendarDays className="h-3.5 w-3.5" />
                  {due.overdue && <span className="font-bold">Overdue ·</span>}
                  {due.label}
                </div>
              )}
            </div>

            {/* ── Scrollable content ── */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 py-4 space-y-5">

                {/* Lead context */}
                {task.lead && (
                  <div className="rounded-xl border border-zinc-100 bg-white p-3.5 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-0.5">Lead</p>
                      <p className="text-sm font-semibold text-zinc-800 truncate">
                        {task.lead.first_name} {task.lead.last_name ?? ""}
                      </p>
                      <p className="text-xs text-zinc-400 truncate">{task.lead.phone_number}</p>
                    </div>
                    <span className={cn(
                      "text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full tracking-wide flex-shrink-0",
                      task.lead.status === "won"  ? "bg-emerald-50 text-emerald-600" :
                      task.lead.status === "lost" ? "bg-red-50 text-red-500" :
                      "bg-zinc-100 text-zinc-500"
                    )}>
                      {task.lead.status?.replace(/_/g, " ")}
                    </span>
                  </div>
                )}

                {/* Assignees */}
                {assignedProfiles.length > 0 && (
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Assigned to</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {assignedProfiles.map((p) => (
                        <div key={p.id} className="flex items-center gap-1.5 rounded-full bg-white ring-1 ring-zinc-100 pl-1 pr-2.5 py-0.5">
                          <InitialAvatar name={p.full_name} size="sm" />
                          <span className="text-xs font-medium text-zinc-700">{p.full_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {task.notes?.trim() && (
                  <div className="rounded-xl border border-zinc-100 bg-white p-4 space-y-1.5">
                    <p className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Notes</p>
                    <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">
                      {task.notes.trim()}
                    </p>
                  </div>
                )}

                {/* Timeline */}
                <div>
                  <p className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium mb-3">
                    Progress Timeline
                    {allUpdates.length > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-zinc-100 text-zinc-500 text-[10px]">
                        {allUpdates.length}
                      </span>
                    )}
                  </p>

                  {allUpdates.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-200 p-6 flex flex-col items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-zinc-50 flex items-center justify-center">
                        <Send className="h-3.5 w-3.5 text-zinc-300" />
                      </div>
                      <p className="text-xs text-zinc-400 text-center">
                        No updates yet.<br />Post the first one below.
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Vertical connector line */}
                      <div className="absolute left-3.5 top-4 bottom-4 w-px bg-zinc-100" />

                      <div className="space-y-4">
                        {allUpdates.map((upd, i) => (
                          <motion.div
                            key={upd.timestamp ? `${upd.timestamp}-${i}` : `upd-${i}`}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: i * 0.03 }}
                            className="relative flex gap-3 pl-1"
                          >
                            {/* Avatar — sits on the line */}
                            <div className="relative z-10 flex-shrink-0">
                              <InitialAvatar name={upd.user_name} size="md" />
                            </div>

                            <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-baseline gap-2 mb-1.5">
                                <span className="text-xs font-semibold text-zinc-700">{upd.user_name}</span>
                                <span className="text-[11px] text-zinc-400">{fmtTimestamp(upd.timestamp)}</span>
                              </div>
                              <div className="rounded-xl bg-white border border-zinc-100 px-3.5 py-2.5 shadow-sm">
                                <p className="text-sm text-zinc-700 leading-relaxed">{upd.message}</p>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                        <div ref={bottomRef} />
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </ScrollArea>

            {/* ── Compose footer ── */}
            <div className="flex-shrink-0 bg-white border-t border-zinc-100 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <input
                  type="text"
                  value={updateText}
                  onChange={(e) => setUpdateText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePost(); }
                  }}
                  placeholder="Add a progress update…"
                  disabled={posting}
                  className={cn(
                    "flex-1 h-9 px-3.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm",
                    "text-zinc-800 placeholder:text-zinc-400",
                    "focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37]/60 focus:bg-white",
                    "transition-all disabled:opacity-50",
                  )}
                />
                <button
                  onClick={handlePost}
                  disabled={!updateText.trim() || posting}
                  className={cn(
                    "h-9 w-9 flex items-center justify-center rounded-xl transition-all flex-shrink-0",
                    updateText.trim() && !posting
                      ? "bg-[#1A1814] text-white hover:bg-zinc-700 shadow-sm"
                      : "bg-zinc-100 text-zinc-300 cursor-not-allowed",
                  )}
                  aria-label="Post update"
                >
                  {posting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

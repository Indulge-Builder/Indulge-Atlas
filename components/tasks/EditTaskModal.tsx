"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pencil, CalendarDays, FileText, CheckCircle2, Clock, Layers, AlertCircle } from "lucide-react";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { updateTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils";
import type { TaskWithLead, TaskType } from "@/lib/types/database";

// ── Type metadata (same palette as TaskDetailSheet) ───────────────────────────

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call:                 "Call",
  whatsapp_message:     "WhatsApp",
  email:                "Email",
  file_dispatch:        "File Dispatch",
  general_follow_up:    "Follow-up",
  campaign_review:      "Campaign Review",
  strategy_meeting:     "Strategy Meeting",
  budget_approval:      "Budget Approval",
  performance_analysis: "Performance Analysis",
};

const STATUS_META = {
  pending:     { label: "Pending",     icon: Clock,        bg: "bg-amber-50",   text: "text-amber-700",  ring: "ring-amber-200"  },
  in_progress: { label: "In Progress", icon: Layers,       bg: "bg-blue-50",    text: "text-blue-700",   ring: "ring-blue-200"   },
  completed:   { label: "Completed",   icon: CheckCircle2, bg: "bg-emerald-50", text: "text-emerald-700",ring: "ring-emerald-200" },
  cancelled:   { label: "Cancelled",   icon: AlertCircle,  bg: "bg-zinc-100",   text: "text-zinc-500",   ring: "ring-zinc-200"   },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface EditTaskModalProps {
  task:       TaskWithLead;
  onClose:    () => void;
  onSuccess?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditTaskModal({ task, onClose, onSuccess }: EditTaskModalProps) {
  const [notes,   setNotes]   = useState(task.notes ?? "");
  const [dueDate, setDueDate] = useState<Date | undefined>(
    task.due_date && !isNaN(new Date(task.due_date).getTime())
      ? new Date(task.due_date)
      : undefined,
  );
  const [saving, setSaving] = useState(false);

  const statusMeta = STATUS_META[task.status as keyof typeof STATUS_META] ?? STATUS_META.pending;
  const typeLabel  = TASK_TYPE_LABELS[task.task_type] ?? task.task_type;

  async function handleSave() {
    if (!dueDate || saving) return;
    setSaving(true);
    await updateTask({ taskId: task.id, notes: notes.trim() || null, dueAt: dueDate });
    setSaving(false);
    onSuccess?.();
    onClose();
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="edit-bd"
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
        key="edit-dlg"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{   opacity: 0, scale: 0.97,  y: 10 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Edit task"
        className={cn(
          "fixed z-[60] inset-x-0 mx-auto",
          "top-1/2 -translate-y-1/2",
          "w-full max-w-md",
          "flex flex-col",
          "bg-[#FAFAF8] rounded-2xl overflow-hidden",
          "shadow-[0_40px_80px_-16px_rgba(0,0,0,0.28),0_0_0_1px_rgba(0,0,0,0.06),0_8px_20px_-4px_rgba(0,0,0,0.12)]",
        )}
      >
        {/* Gold accent line */}
        <div className="h-[3px] w-full bg-gradient-to-r from-[#D4AF37] via-[#F0D060] to-[#A88B25] flex-shrink-0" />

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-zinc-100">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>My Tasks</span>
            <span>/</span>
            <span className="text-zinc-600 font-medium flex items-center gap-1.5">
              <Pencil className="h-3 w-3" />
              Edit
            </span>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hero — task identity */}
        <div className="px-6 pt-5 pb-4 bg-white border-b border-zinc-100 space-y-2.5">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200">
              {typeLabel}
            </span>
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
              statusMeta.bg, statusMeta.text, statusMeta.ring,
            )}>
              <statusMeta.icon className="h-3 w-3" />
              {statusMeta.label}
            </span>
          </div>

          {/* Title */}
          <h2
            className="text-[17px] font-bold leading-snug text-zinc-900"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {task.title}
          </h2>
        </div>

        {/* Form body */}
        <div className="px-6 py-5 space-y-5">

          {/* Due date */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <CalendarDays className="h-3 w-3" />
              Due Date &amp; Time
            </label>
            <LuxuryDatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder="Select date & time"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <FileText className="h-3 w-3" />
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Add context or notes…"
              className={cn(
                "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5",
                "text-sm text-zinc-700 placeholder:text-zinc-400 leading-relaxed resize-none",
                "focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37]/60",
                "transition-all",
              )}
            />
            <p className="text-right text-[10px] text-zinc-300">{notes.length}/2000</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!dueDate || saving}
            className={cn(
              "px-5 py-2 rounded-xl text-xs font-semibold transition-all",
              !dueDate || saving
                ? "bg-zinc-100 text-zinc-300 cursor-not-allowed"
                : "bg-[#1A1814] text-white hover:bg-zinc-700 shadow-sm",
            )}
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border border-zinc-400 border-t-white animate-spin" />
                Saving…
              </span>
            ) : "Save Changes"}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

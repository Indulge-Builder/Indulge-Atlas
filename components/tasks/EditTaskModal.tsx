"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;
import { X, Pencil } from "lucide-react";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { updateTask } from "@/lib/actions/tasks";
import type { TaskWithLead } from "@/lib/types/database";

interface EditTaskModalProps {
  task: TaskWithLead;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditTaskModal({ task, onClose, onSuccess }: EditTaskModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [notes, setNotes] = useState(task.notes ?? "");
  const [dueDate, setDueDate] = useState<Date | undefined>(new Date(task.due_date));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!dueDate || saving) return;
    setSaving(true);
    await updateTask({
      taskId: task.id,
      notes: notes.trim() || null,
      dueAt: dueDate,
    });
    setSaving(false);
    onSuccess?.();
    onClose();
  }

  return (
    <AnimatePresence>
      <motion.div
        key="edit-task-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        key="edit-task-modal"
        initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96, y: prefersReducedMotion ? 0 : 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96, y: prefersReducedMotion ? 0 : 10 }}
        transition={{ duration: 0.5, ease: luxuryEasing }}
        style={{ willChange: "transform, opacity" }}
        className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none px-4"
      >
        <div
          className="w-full max-w-md bg-[#121212] border border-white/10 rounded-2xl shadow-2xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <Pencil className="w-4 h-4 text-[#D4AF37]/70" strokeWidth={1.75} />
              <h2
                className="text-[15px] font-semibold text-white/85"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Edit Task
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5">
            {/* Task title (read-only) */}
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">
                Task
              </p>
              <p className="text-[14px] text-white/70 font-medium leading-snug">{task.title}</p>
            </div>

            {/* Due date & time */}
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">
                Due Date & Time
              </p>
              <LuxuryDatePicker
                value={dueDate}
                onChange={setDueDate}
                placeholder="Select date & time"
              />
            </div>

            {/* Notes */}
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">
                Notes
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add context or notes…"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/20 resize-none transition-colors duration-400 leading-relaxed"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!dueDate || saving}
              className="px-5 py-2 rounded-xl text-[12px] font-semibold bg-[#D4AF37]/15 text-[#D4AF37] hover:bg-[#D4AF37]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

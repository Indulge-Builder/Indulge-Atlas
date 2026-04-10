"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogPortal,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { X, Loader2, CalendarDays, Snowflake, Trash2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import {
  processFollowUpAttempted,
  processFollowUpNext,
  processFollowUpDisposition,
} from "@/lib/actions/tasks";
import {
  dispatchTaskAlertAfterCompleteOrDelete,
  dispatchTaskAlertRefresh,
} from "@/lib/task-alert-refresh";
import type { TaskWithLead, FollowUpHistoryEntry, UserRole } from "@/lib/types/database";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;

interface FollowUpModalProps {
  open: boolean;
  onClose: () => void;
  task: TaskWithLead;
  onSuccess: () => void;
  userRole: UserRole;
}

export function FollowUpModal({
  open,
  onClose,
  task,
  onSuccess,
  userRole,
}: FollowUpModalProps) {
  const isReadOnly = userRole === "manager" || userRole === "founder";
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);

  const step = (task as { follow_up_step?: number }).follow_up_step ?? 1;
  const history = ((task as { follow_up_history?: FollowUpHistoryEntry[] }).follow_up_history ??
    []) as FollowUpHistoryEntry[];
  const leadId = task.lead_id ?? task.lead?.id;
  const leadName = task.lead
    ? `${task.lead.first_name} ${task.lead.last_name ?? ""}`.trim()
    : "Lead";

  const isStep3 = step >= 3;

  function handleOpenChange(v: boolean) {
    if (!v) {
      setNote("");
      setShowDatePicker(false);
      setScheduledDate(undefined);
      setServerError(null);
      onClose();
    }
  }

  async function handleMoveToAttempted() {
    setSubmitting(true);
    setServerError(null);
    const result = await processFollowUpAttempted({ taskId: task.id, note });
    setSubmitting(false);
    if (!result.success) {
      setServerError(result.error ?? "Failed to update");
      return;
    }
    toast.success("Lead marked as Connected.");
    dispatchTaskAlertAfterCompleteOrDelete({
      status: task.status,
      due_date: task.due_date,
    });
    onSuccess();
    onClose();
  }

  async function handleCreateNextFollowUp() {
    if (!scheduledDate) {
      setServerError("Please select a date and time.");
      return;
    }
    setSubmitting(true);
    setServerError(null);
    const result = await processFollowUpNext({
      taskId: task.id,
      note,
      dueAt: scheduledDate,
    });
    setSubmitting(false);
    if (!result.success) {
      setServerError(result.error ?? "Failed to schedule");
      return;
    }
    toast.success(`Follow-up ${step + 1} scheduled.`);
    dispatchTaskAlertRefresh({ action: "fetch" });
    onSuccess();
    onClose();
  }

  async function handleDisposition(disposition: "cold" | "trash" | "connected") {
    setSubmitting(true);
    setServerError(null);
    const result = await processFollowUpDisposition({
      taskId: task.id,
      note,
      disposition,
    });
    setSubmitting(false);
    if (!result.success) {
      setServerError(result.error ?? "Failed to update");
      return;
    }
    const messages = {
      cold: "Lead moved to Nurturing (Cold).",
      trash: "Lead moved to Trash.",
      connected: "Lead marked as Connected.",
    };
    toast.success(messages[disposition]);
    dispatchTaskAlertAfterCompleteOrDelete({
      status: task.status,
      due_date: task.due_date,
    });
    onSuccess();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-50 bg-stone-900/30 backdrop-blur-md"
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.45, ease: luxuryEasing }}
            style={{ willChange: "transform, opacity" }}
            className={cn(
              "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
              "rounded-2xl border border-stone-200/80 bg-white/95 shadow-2xl backdrop-blur-xl",
              "p-6"
            )}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <DialogTitle
                  className="text-stone-800 text-base font-semibold"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  Follow-up · {leadName}
                </DialogTitle>
                <DialogDescription className="text-stone-500 text-xs mt-0.5">
                  Attempt {step} of 3
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                {isReadOnly && (
                  <span className="text-[10px] font-medium text-stone-500 bg-stone-100 rounded-md px-2 py-1 uppercase tracking-wider">
                    Agent Notes
                  </span>
                )}
                <DialogClose asChild>
                  <button
                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </DialogClose>
              </div>
            </div>

            {/* History timeline — premium styling, expanded when read-only */}
            {(history.length > 0 || isReadOnly) && (
              <div className={cn(isReadOnly ? "mb-0" : "mb-5")}>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-3">
                  {isReadOnly ? "Follow-up history" : "Previous notes"}
                </p>
                {history.length === 0 && isReadOnly ? (
                  <p className="text-sm text-stone-500 italic py-4">No notes recorded yet.</p>
                ) : history.length > 0 ? (
                <div className="border-l border-stone-200 pl-4 space-y-0">
                  {history.map((entry, i) => {
                    const dateStr = entry.date
                      ? (() => {
                          try {
                            const d = entry.date.includes("T")
                              ? parseISO(entry.date)
                              : new Date(entry.date + "T00:00:00");
                            return format(d, "MMM d, yyyy");
                          } catch {
                            return entry.date;
                          }
                        })()
                      : "—";
                    return (
                      <div key={i} className="relative -ml-4 pl-4 pb-4 last:pb-0">
                        <div className="absolute left-0 top-0 w-2 h-2 rounded-full bg-stone-300 -translate-x-1/2 mt-1.5" />
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex w-fit bg-stone-100 text-stone-500 rounded-md px-2 py-1 text-xs font-medium">
                            Follow-up {entry.step}
                          </span>
                          <p className="text-[11px] text-stone-600 font-medium">{dateStr}</p>
                          <p className="text-sm text-stone-700 mt-1 leading-relaxed">
                            {entry.note || "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                ) : null}
              </div>
            )}

            {/* Current notes textarea — hidden when read-only */}
            {!isReadOnly && (
              <div className="space-y-1.5 mb-5">
                <Label className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">
                  Notes for Follow-up {step}
                </Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Did not pick up, left voicemail…"
                  rows={3}
                  className={cn(
                    "resize-none rounded-xl border-stone-200 bg-stone-50/50",
                    "text-stone-800 placeholder:text-stone-400",
                    "focus-visible:ring-indigo-200/50 focus-visible:border-indigo-300"
                  )}
                />
              </div>
            )}

            {/* Date picker (inline, for step 1 or 2) — hidden when read-only */}
            {!isReadOnly && !isStep3 && showDatePicker && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-5 overflow-hidden"
              >
                <Label className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest block mb-2">
                  Schedule next follow-up
                </Label>
                <LuxuryDatePicker
                  value={scheduledDate}
                  onChange={(d) => setScheduledDate(d)}
                  placeholder="Pick date & time…"
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </motion.div>
            )}

            <AnimatePresence>
              {serverError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl mb-4"
                >
                  {serverError}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Action buttons — hidden when read-only */}
            {!isReadOnly && (
            <div className="flex flex-wrap gap-2 pt-1">
              {isStep3 ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisposition("cold")}
                    disabled={submitting}
                    className="rounded-xl border-stone-200 text-stone-600 hover:bg-stone-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Snowflake className="w-3.5 h-3.5" />
                        Mark as Cold
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisposition("trash")}
                    disabled={submitting}
                    className="rounded-xl border-stone-200 text-stone-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                  >
                    {submitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        Move to Trash
                      </>
                    )}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleDisposition("connected")}
                    disabled={submitting}
                    className="rounded-xl"
                  >
                    {submitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Connected / In Progress
                      </>
                    )}
                  </Button>
                </>
              ) : showDatePicker ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDatePicker(false)}
                    disabled={submitting}
                    className="rounded-xl"
                  >
                    Back
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleCreateNextFollowUp}
                    disabled={submitting || !scheduledDate}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
                  >
                    {submitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <CalendarDays className="w-3.5 h-3.5" />
                        Create Follow-up {step + 1}
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMoveToAttempted}
                    disabled={submitting}
                    className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Move to Connected"
                    )}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowDatePicker(true)}
                    disabled={submitting}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    Create Follow-up {step + 1}
                  </Button>
                </>
              )}
            </div>
            )}
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

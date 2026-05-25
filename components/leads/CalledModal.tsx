"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { addLeadCallNote, type CallOutcome } from "@/lib/actions/leads";

interface CalledModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  onSuccess: () => void;
}

const OUTCOMES: { value: CallOutcome; label: string; emoji: string; desc: string }[] = [
  { value: "rnr",           label: "RNR",            emoji: "📵", desc: "Ringing, no response" },
  { value: "switched_off",  label: "Switched Off",   emoji: "🔇", desc: "Number switched off" },
  { value: "wrong_number",  label: "Wrong Number",   emoji: "❓", desc: "Incorrect contact" },
  { value: "conversing",    label: "Conversing",     emoji: "💬", desc: "Had a conversation" },
  { value: "other",         label: "Other",          emoji: "📋", desc: "Something else" },
];

const OUTCOME_COLORS: Record<CallOutcome, { pill: string; pillActive: string; ring: string }> = {
  rnr:           { pill: "bg-amber-50 text-amber-700 border-amber-200",   pillActive: "bg-amber-100 border-amber-400 text-amber-800 shadow-amber-100",   ring: "ring-amber-400/40" },
  switched_off:  { pill: "bg-slate-50 text-slate-600 border-slate-200",   pillActive: "bg-slate-100 border-slate-400 text-slate-800 shadow-slate-100",   ring: "ring-slate-400/40" },
  wrong_number:  { pill: "bg-rose-50 text-rose-600 border-rose-200",      pillActive: "bg-rose-100 border-rose-400 text-rose-800 shadow-rose-100",      ring: "ring-rose-400/40" },
  conversing:    { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", pillActive: "bg-emerald-100 border-emerald-400 text-emerald-800 shadow-emerald-100", ring: "ring-emerald-400/40" },
  other:         { pill: "bg-stone-50 text-stone-600 border-stone-200",   pillActive: "bg-stone-100 border-stone-400 text-stone-800 shadow-stone-100",   ring: "ring-stone-400/40" },
};

export function CalledModal({ open, onClose, leadId, onSuccess }: CalledModalProps) {
  const [selected, setSelected] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setSelected(null);
    setNotes("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    if (!selected) return;
    if (!notes.trim()) {
      toast.error("Please add a note before saving.");
      return;
    }

    startTransition(async () => {
      const result = await addLeadCallNote(leadId, notes.trim(), selected);
      if (!result.success) {
        toast.error(result.error ?? "Could not save note");
        return;
      }
      toast.success("Call logged successfully");
      reset();
      onSuccess();
    });
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <div className="overflow-hidden rounded-2xl border border-[#E5E4DF] bg-white shadow-[0_24px_60px_-12px_rgb(0_0_0/0.18),0_8px_24px_-6px_rgb(0_0_0/0.08)]">
              {/* Gold accent */}
              <div
                className="h-0.5 w-full"
                style={{ background: "linear-gradient(90deg, transparent 0%, #D4AF37 40%, #D4AF37 60%, transparent 100%)" }}
              />

              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5f5348]/8">
                    <Phone className="h-4 w-4 text-[#5f5348]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#1A1A1A]">Call Outcome</p>
                    <p className="text-[11px] text-[#9E9E9E]">What was the result of your call?</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9E9E9E] transition-colors hover:bg-stone-100 hover:text-[#1A1A1A]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-6 pb-6 space-y-4">
                {/* Outcome pills */}
                <div>
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
                    Select outcome
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {OUTCOMES.map((o) => {
                      const colors = OUTCOME_COLORS[o.value];
                      const isSelected = selected === o.value;
                      return (
                        <button
                          key={o.value}
                          onClick={() => setSelected(o.value)}
                          className={`
                            rounded-full border px-3 py-1.5
                            text-[12px] font-medium transition-all duration-150
                            ${isSelected
                              ? `${colors.pillActive} shadow-sm ring-2 ${colors.ring}`
                              : `${colors.pill} hover:shadow-sm`
                            }
                          `}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes textarea — appears when outcome selected */}
                <AnimatePresence>
                  {selected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
                        Notes
                        <span className="ml-1 text-[#C0392B]">*</span>
                      </p>
                      <textarea
                        autoFocus
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={
                          selected === "conversing"
                            ? "What did you discuss? What's the next step?"
                            : selected === "rnr"
                            ? "Any context — how many rings, time of call, etc."
                            : "Add any relevant context…"
                        }
                        rows={4}
                        className="w-full resize-none rounded-xl border border-[#E5E4DF] bg-[#FAFAF8] px-3.5 py-3 text-[13px] leading-relaxed text-[#1A1A1A] placeholder:text-[#C4BDBB] focus:border-[#D4AF37]/60 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 transition-all"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={handleClose}
                    className="rounded-lg px-4 py-2 text-[13px] text-[#9E9E9E] transition-colors hover:bg-stone-100 hover:text-[#1A1A1A]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!selected || !notes.trim() || isPending}
                    className="flex items-center gap-2 rounded-lg bg-[#5f5348] px-5 py-2 text-[13px] font-medium text-white transition-all hover:bg-[#4a4039] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Log Call
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

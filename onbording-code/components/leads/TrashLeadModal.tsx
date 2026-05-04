"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;
import {
  Dialog,
  DialogPortal,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { markLeadTrash } from "@/lib/actions/leads";
import { toast } from "sonner";
import type { TrashReason } from "@/lib/types/database";

const TRASH_REASONS: { id: TrashReason; label: string; description: string }[] = [
  { id: "Incorrect Data", label: "Incorrect Data", description: "Wrong number / fake" },
  { id: "Not our TG", label: "Not our TG", description: "Unqualified / Student" },
  { id: "Spam", label: "Spam", description: "Spam or irrelevant" },
];

interface TrashLeadModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  onSuccess: () => void;
}

export function TrashLeadModal({
  open,
  onClose,
  leadId,
  onSuccess,
}: TrashLeadModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [selectedReason, setSelectedReason] = useState<TrashReason | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(v: boolean) {
    if (!v) {
      setSelectedReason(null);
      onClose();
    }
  }

  async function handleSubmit() {
    if (!selectedReason) return;
    setSubmitting(true);

    const result = await markLeadTrash(leadId, selectedReason);

    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to mark as trash.");
      return;
    }

    toast.success("Lead marked as trash.");
    setSelectedReason(null);
    onSuccess();
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
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
        </DialogPrimitive.Overlay>

        <DialogPrimitive.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96, y: prefersReducedMotion ? 0 : 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96, y: prefersReducedMotion ? 0 : 10 }}
            transition={{ duration: 0.5, ease: luxuryEasing }}
            style={{ willChange: "transform, opacity" }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-[460px] -translate-x-1/2 -translate-y-1/2
                       bg-[#1A1814] rounded-2xl shadow-[0_20px_60px_-12px_rgba(0,0,0,0.5)]
                       border border-white/10 overflow-hidden"
          >
            {/* Dark charcoal accent strip */}
            <div className="h-1 w-full bg-zinc-600/50" />

            <div className="p-6">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                    <Trash2 className="w-4.5 h-4.5 text-white/50" />
                  </div>
                  <div>
                    <DialogTitle
                      className="text-white/90 text-base font-semibold"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      Mark as Trash
                    </DialogTitle>
                    <DialogDescription className="text-white/50 text-xs mt-0.5">
                      Select a reason to keep your pipeline clean.
                    </DialogDescription>
                  </div>
                </div>
                <DialogClose asChild>
                  <button className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </DialogClose>
              </div>

              <div className="mb-5">
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2.5">
                  Reason <span className="text-[#D4AF37]">*</span>
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {TRASH_REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedReason(r.id)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-300",
                        selectedReason === r.id
                          ? "border-[#D4AF37]/50 bg-[#D4AF37]/10"
                          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]"
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border-2 shrink-0 transition-colors",
                          selectedReason === r.id
                            ? "border-[#D4AF37] bg-[#D4AF37]"
                            : "border-white/20"
                        )}
                      >
                        {selectedReason === r.id && (
                          <div className="w-full h-full rounded-full flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#1A1814]" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white/90">{r.label}</p>
                        <p className="text-[11px] text-white/50 mt-0.5">{r.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-10 rounded-xl border-white/20 text-white/70 bg-transparent hover:bg-white/5"
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!selectedReason || submitting}
                  className={cn(
                    "flex-1 h-10 rounded-xl text-sm font-medium transition-all",
                    selectedReason
                      ? "bg-zinc-600 hover:bg-zinc-500 text-white"
                      : "bg-white/10 text-white/30 cursor-not-allowed"
                  )}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    "Confirm Trash"
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

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
import { X, Loader2, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import { markLeadNurturing } from "@/lib/actions/leads";
import { toast } from "sonner";
import type { NurtureReason } from "@/lib/types/database";

const NURTURE_REASONS: { id: NurtureReason; label: string; description: string }[] = [
  { id: "Future Prospect", label: "Future Prospect", description: "Timing isn't right now" },
  { id: "Cold", label: "Cold", description: "Followed up 3x, no response" },
];

interface NurtureModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  onSuccess: () => void;
}

export function NurtureModal({
  open,
  onClose,
  leadId,
  onSuccess,
}: NurtureModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [selectedReason, setSelectedReason] = useState<NurtureReason | null>(null);
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

    const result = await markLeadNurturing(leadId, selectedReason);

    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to move to nurturing.");
      return;
    }

    toast.success("Lead moved to nurturing with 3-month reminder.");
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
            <div className="h-1 w-full bg-cyan-500/40" aria-hidden />

            <div className="p-6">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                    <Leaf className="w-4.5 h-4.5 text-cyan-400" />
                  </div>
                  <div>
                    <DialogTitle
                      className="text-white/90 text-base font-semibold"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      Move to Nurturing
                    </DialogTitle>
                    <DialogDescription className="text-white/50 text-xs mt-0.5">
                      Select a reason to schedule long-term follow-up.
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
                  {NURTURE_REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedReason(r.id)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-300",
                        selectedReason === r.id
                          ? "border-cyan-500/50 bg-cyan-500/10"
                          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]"
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border-2 shrink-0 transition-colors",
                          selectedReason === r.id
                            ? "border-cyan-400 bg-cyan-400"
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
                      ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                      : "bg-white/10 text-white/30 cursor-not-allowed"
                  )}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    "Confirm Nurturing"
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

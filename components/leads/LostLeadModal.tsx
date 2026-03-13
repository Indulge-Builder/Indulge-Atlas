"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
import { Textarea } from "@/components/ui/textarea";
import { X, Loader2, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { markLeadLost } from "@/lib/actions/leads";
import { toast } from "sonner";
import type { LostReasonTag } from "@/lib/types/database";

// ── Tag options ──────────────────────────────────────────────────────────────

interface TagOption {
  id: LostReasonTag;
  label: string;
  description: string;
}

const LOST_REASON_TAGS: TagOption[] = [
  {
    id:          "budget_exceeded",
    label:       "Budget Exceeded",
    description: "Cost was beyond their capacity",
  },
  {
    id:          "irrelevant_unqualified",
    label:       "Irrelevant / Unqualified",
    description: "Didn't match our target profile",
  },
  {
    id:          "timing_not_ready",
    label:       "Timing / Not Ready",
    description: "Not in the right stage to buy",
  },
  {
    id:          "went_with_competitor",
    label:       "Went with Competitor",
    description: "Chose an alternative provider",
  },
  {
    id:          "ghosted_unresponsive",
    label:       "Ghosted / Unresponsive",
    description: "Stopped responding entirely",
  },
];

// ── Component ────────────────────────────────────────────────────────────────

interface LostLeadModalProps {
  open:      boolean;
  onClose:   () => void;
  leadId:    string;
  onSuccess: () => void;
}

export function LostLeadModal({
  open,
  onClose,
  leadId,
  onSuccess,
}: LostLeadModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [selectedTag, setSelectedTag] = useState<LostReasonTag | null>(null);
  const [notes, setNotes]             = useState("");
  const [submitting, setSubmitting]   = useState(false);

  function handleOpenChange(v: boolean) {
    if (!v) {
      setSelectedTag(null);
      setNotes("");
      onClose();
    }
  }

  async function handleSubmit() {
    if (!selectedTag) return;
    setSubmitting(true);

    const result = await markLeadLost(leadId, selectedTag, notes || undefined);

    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to log lost analysis.");
      return;
    }

    toast.success("Lead marked as lost with analysis logged.");
    setSelectedTag(null);
    setNotes("");
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
                       bg-[#FAFAF8] rounded-2xl shadow-[0_20px_60px_-12px_rgba(0,0,0,0.22)]
                       border border-[#E5E4DF] overflow-hidden"
          >
            {/* Crimson accent strip */}
            <div className="h-1 w-full bg-linear-to-r from-[#8B1A1A] via-[#C0392B] to-[#8B1A1A]" />

            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FAEAE8] flex items-center justify-center">
                    <TrendingDown className="w-4.5 h-4.5 text-[#C0392B]" />
                  </div>
                  <div>
                    <DialogTitle
                      className="text-[#1A1A1A] text-base font-semibold"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      Log Lost Lead Analysis
                    </DialogTitle>
                    <DialogDescription className="text-[#9E9E9E] text-xs mt-0.5">
                      Select a reason to record this loss for reporting.
                    </DialogDescription>
                  </div>
                </div>
                <DialogClose asChild>
                  <button className="p-1.5 rounded-lg text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-[#F4F4F0] transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </DialogClose>
              </div>

              {/* Tag selector */}
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest mb-2.5">
                  Primary Reason <span className="text-[#C0392B]">*</span>
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {LOST_REASON_TAGS.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => setSelectedTag(tag.id)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-300",
                        selectedTag === tag.id
                          ? "border-[#C0392B]/50 bg-[#FAEAE8] shadow-[0_0_0_1px_rgba(192,57,43,0.2)]"
                          : "border-[#E5E4DF] bg-white hover:border-[#C0392B]/30 hover:bg-[#FEF8F7]"
                      )}
                    >
                      {/* Selection indicator */}
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border-2 shrink-0 transition-colors",
                          selectedTag === tag.id
                            ? "border-[#C0392B] bg-[#C0392B]"
                            : "border-[#D0C8BE]"
                        )}
                      >
                        {selectedTag === tag.id && (
                          <div className="w-full h-full rounded-full flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-sm font-medium leading-tight",
                            selectedTag === tag.id
                              ? "text-[#8B1A1A]"
                              : "text-[#1A1A1A]"
                          )}
                        >
                          {tag.label}
                        </p>
                        <p className="text-[11px] text-[#9E9E9E] mt-0.5">
                          {tag.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="mb-5">
                <p className="text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest mb-2">
                  Agent Notes / Reasoning
                  <span className="normal-case font-normal text-[#B5A99A] ml-1.5">
                    (optional)
                  </span>
                </p>
                <Textarea
                  placeholder="Add any additional context about why this lead was lost…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="text-sm bg-white border-[#E5E4DF] resize-none
                             focus-visible:ring-1 focus-visible:ring-[#C0392B]/30
                             placeholder:text-[#C8C0B8] rounded-xl"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-10 rounded-xl border-[#E8E8E0] text-[#4A4A4A] text-sm"
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!selectedTag || submitting}
                  className={cn(
                    "flex-1 h-10 rounded-xl text-sm font-medium transition-all",
                    selectedTag
                      ? "bg-[#C0392B] hover:bg-[#8B1A1A] text-white"
                      : "bg-[#E8E8E0] text-[#B5A99A] cursor-not-allowed"
                  )}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Logging…
                    </span>
                  ) : (
                    "Confirm Lost"
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

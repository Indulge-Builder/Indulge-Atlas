"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;
import { Trophy, X, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { closeWonDeal } from "@/lib/actions/leads";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DURATION_OPTIONS = [
  { value: "1 Year",   label: "1 Year"   },
  { value: "6 Months", label: "6 Months" },
  { value: "3 Months", label: "3 Months" },
  { value: "1 Month",  label: "1 Month"  },
  { value: "Custom",   label: "Custom"   },
] as const;

// Preset price map for auto-sync
const DURATION_TO_VALUE: Record<string, number> = {
  "1 Year":   400000,
  "6 Months": 200000,
  "3 Months": 100000,
};

const VALUE_TO_DURATION: Record<number, string> = {
  400000: "1 Year",
  200000: "6 Months",
  100000: "3 Months",
};

interface WonDealModalProps {
  open:      boolean;
  onClose:   () => void;
  leadId:    string;
  leadName:  string;
  onSuccess?: () => void;
}

export function WonDealModal({ open, onClose, leadId, leadName, onSuccess }: WonDealModalProps) {
  const prefersReducedMotion = useReducedMotion();
  // Raw integer value stored as number; 0 means empty
  const [dealValue,    setDealValue]    = useState<number>(400000);
  const [dealDuration, setDealDuration] = useState<string>("1 Year");
  const [submitting,   setSubmitting]   = useState(false);

  // Format a number with Indian comma grouping (2,2,3 pattern)
  function formatINR(n: number): string {
    if (!n) return "";
    return n.toLocaleString("en-IN");
  }

  // Handle duration change — auto-sync value for preset durations
  function handleDurationChange(duration: string) {
    setDealDuration(duration);
    if (duration in DURATION_TO_VALUE) {
      setDealValue(DURATION_TO_VALUE[duration]);
    }
    // For "1 Month" and "Custom" leave deal_value untouched
  }

  // Handle manual value input — auto-sync duration based on known presets
  function handleValueChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, "");
    const n = digits ? Number(digits) : 0;
    setDealValue(n);

    if (n in VALUE_TO_DURATION) {
      setDealDuration(VALUE_TO_DURATION[n]);
    } else {
      setDealDuration("Custom");
    }
  }

  async function handleSubmit() {
    if (!dealValue || dealValue <= 0) {
      toast.error("Please enter a valid deal value.");
      return;
    }

    setSubmitting(true);
    const result = await closeWonDeal(leadId, dealValue, dealDuration);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to close deal. Please try again.");
      return;
    }

    toast.success(`Deal closed. ${leadName} is now Won.`, {
      description: `₹${formatINR(dealValue)} · ${dealDuration}`,
    });
    onSuccess ? onSuccess() : onClose();
  }

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
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Modal panel */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96, y: prefersReducedMotion ? 0 : 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{   opacity: 0, scale: prefersReducedMotion ? 1 : 0.96, y: prefersReducedMotion ? 0 : 10 }}
            transition={{ duration: 0.5, ease: luxuryEasing }}
            style={{ willChange: "transform, opacity" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: "#1A1814" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Gold accent hairline */}
              <div
                className="h-px w-full"
                style={{
                  background: "linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.6) 40%, rgba(212,175,55,0.6) 60%, transparent 100%)",
                }}
              />

              {/* Header */}
              <div className="px-6 pt-5 pb-4 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center">
                    <Trophy className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div>
                    <h2
                      className="text-[15px] font-semibold text-white/90 leading-none"
                      style={{ fontFamily: "var(--font-playfair), serif" }}
                    >
                      Finalize Membership
                    </h2>
                    <p className="text-[11px] text-white/35 mt-0.5 truncate max-w-[240px]">
                      {leadName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-white/40" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5">
                {/* Deal Value */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-white/40 uppercase tracking-wider font-medium">
                    Deal Value (INR)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#D4AF37]/70 text-sm font-medium select-none pointer-events-none">
                      ₹
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dealValue ? formatINR(dealValue) : ""}
                      onChange={(e) => handleValueChange(e.target.value)}
                      className="w-full pl-8 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.08]
                                 hover:border-white/[0.14] focus:border-[#D4AF37]/40
                                 rounded-lg text-white/90 text-sm font-medium tabular-nums
                                 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/25
                                 transition-colors duration-400 placeholder:text-white/20"
                      placeholder="4,00,000"
                    />
                  </div>
                  <p className="text-[10px] text-white/25">
                    Preset: ₹4,00,000 · 1 Yr &nbsp;|&nbsp; ₹2,00,000 · 6 Mo &nbsp;|&nbsp; ₹1,00,000 · 3 Mo
                  </p>
                </div>

                {/* Membership Duration */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-white/40 uppercase tracking-wider font-medium">
                    Membership Duration
                  </Label>
                  <Select value={dealDuration} onValueChange={handleDurationChange}>
                    <SelectTrigger
                      className="w-full bg-white/[0.04] border-white/[0.08] hover:border-white/[0.14]
                                 text-white/80 focus:ring-[#D4AF37]/25 focus:border-[#D4AF37]/40"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      className="bg-[#1C1A16] border-white/[0.10] text-white/80"
                    >
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem
                          key={opt.value}
                          value={opt.value}
                          className="focus:bg-white/[0.06] focus:text-white"
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Footer — actions */}
              <div className="px-6 pb-5 flex items-center gap-3">
                {/* Send to Finance — ghost outlined */}
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 border-white/[0.12] text-white/50 bg-transparent
                             hover:bg-white/[0.04] hover:text-white/70 hover:border-white/[0.20]"
                  onClick={() => {
                    toast.info("Finance Integration Coming Soon", {
                      description: "Direct ledger sync will be available in the next release.",
                    });
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                  Send to Finance
                </Button>

                {/* Save & Close — primary gold-warm */}
                <Button
                  type="button"
                  className="flex-1 gap-2 bg-[#D4AF37]/90 hover:bg-[#D4AF37] text-[#1A1208]
                             font-semibold border-0 shadow-[0_2px_12px_rgba(212,175,55,0.25)]"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trophy className="w-3.5 h-3.5" />
                  )}
                  Save &amp; Close Deal
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

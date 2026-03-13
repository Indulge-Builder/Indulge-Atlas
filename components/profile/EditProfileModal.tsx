"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateProfile } from "@/lib/actions/profile";
import type { Profile } from "@/lib/types/database";

// ── Zod schema ────────────────────────────────────────────────

const schema = z.object({
  phone: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || v.replace(/\D/g, "").length >= 10,
      "Phone must have at least 10 digits"
    )
    .optional()
    .or(z.literal("")),
  dob: z
    .string()
    .refine(
      (v) =>
        v === "" ||
        (!isNaN(Date.parse(v)) && new Date(v) <= new Date()),
      "Please enter a valid past date"
    )
    .optional()
    .or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

// ── Input styles ──────────────────────────────────────────────
// Warm earth-tone focus ring (soft chocolate/olive) — no harsh blue.

const inputCx = (hasError?: boolean) =>
  cn(
    "w-full h-11 px-4 rounded-xl text-sm text-[#1A1A1A]",
    "bg-white border transition-all duration-400 outline-none",
    "placeholder:text-[#C0BDB5]",
    "focus:ring-2",
    hasError
      ? "border-[#C0392B]/40 focus:border-[#C0392B]/60 focus:ring-[#C0392B]/10"
      : "border-[#D4D0C8] focus:border-[#7A6652] focus:ring-[#7A6652]/15"
  );

const labelCx =
  "block text-[9px] font-semibold text-[#9E9E9E] uppercase tracking-[0.18em] mb-2";

// ── Modal ─────────────────────────────────────────────────────

interface EditProfileModalProps {
  profile: Profile;
  open: boolean;
  onClose: () => void;
}

export function EditProfileModal({
  profile,
  open,
  onClose,
}: EditProfileModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      phone: profile.phone ?? "",
      dob:   profile.dob ?? "",
    },
  });

  function handleClose() {
    reset({ phone: profile.phone ?? "", dob: profile.dob ?? "" });
    setSaved(false);
    setServerError(null);
    onClose();
  }

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    startTransition(async () => {
      const result = await updateProfile({
        phone: values.phone?.trim() || null,
        dob:   values.dob || null,
      });

      if (result.success) {
        setSaved(true);
        setTimeout(() => {
          handleClose();
        }, 1600);
      } else {
        setServerError(result.error ?? "Something went wrong.");
      }
    });
  };

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
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[3px]"
            onClick={handleClose}
          />

          {/* Dialog */}
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96, y: prefersReducedMotion ? 0 : 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96, y: prefersReducedMotion ? 0 : 10 }}
            transition={{ duration: 0.5, ease: luxuryEasing }}
            style={{ willChange: "transform, opacity" }}
            className={cn(
              "fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "w-full max-w-sm bg-[#F9F9F6] rounded-3xl",
              "shadow-[0_24px_80px_rgba(0,0,0,0.16),0_0_0_1px_rgba(0,0,0,0.05)]"
            )}
          >
            {/* Saved state overlay */}
            <AnimatePresence>
              {saved && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 rounded-3xl bg-[#F9F9F6] flex flex-col items-center justify-center gap-3"
                >
                  <motion.div
                    initial={{ scale: prefersReducedMotion ? 1 : 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.45, ease: luxuryEasing }}
                  >
                    <CheckCircle2 className="w-12 h-12 text-[#4A7C59]" />
                  </motion.div>
                  <p
                    className="text-[#1A1A1A] text-base font-semibold"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    Dossier updated.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex items-start justify-between px-7 pt-7 pb-5">
              <div>
                <h2
                  className="text-[#1A1A1A] text-lg font-semibold leading-snug"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  Update Dossier.
                </h2>
                <p className="text-[#9E9E9E] text-xs mt-0.5">
                  Personal details · profile information
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-xl text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/[0.06] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="px-7 pb-7 space-y-5">
              {/* Phone */}
              <div>
                <label className={labelCx}>Phone</label>
                <input
                  {...register("phone")}
                  type="tel"
                  placeholder="+91 98765 43210"
                  className={inputCx(!!errors.phone)}
                  autoComplete="tel"
                />
                {errors.phone && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[11px] text-[#C0392B] mt-1.5"
                  >
                    {errors.phone.message}
                  </motion.p>
                )}
              </div>

              {/* Date of Birth */}
              <div>
                <label className={labelCx}>Date of Birth</label>
                <input
                  {...register("dob")}
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  className={cn(inputCx(!!errors.dob), "text-sm")}
                />
                {errors.dob && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[11px] text-[#C0392B] mt-1.5"
                  >
                    {errors.dob.message}
                  </motion.p>
                )}
              </div>

              {/* Server error */}
              {serverError && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[12px] text-[#C0392B] text-center -mt-1"
                >
                  {serverError}
                </motion.p>
              )}

              {/* Divider */}
              <div className="h-px bg-[#1A1A1A]/[0.06]" />

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className={cn(
                    "flex-1 h-11 rounded-xl text-sm font-medium",
                    "bg-[#F0EDE8] text-[#1A1A1A]/50",
                    "hover:bg-[#E8E5E0] transition-colors duration-150"
                  )}
                >
                  Cancel
                </button>

                <motion.button
                  type="submit"
                  disabled={isSubmitting}
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    "flex-1 h-11 rounded-xl text-sm font-semibold",
                    "bg-[#1A1A1A] text-white",
                    "hover:bg-[#2A2A2A] transition-colors duration-150",
                    "flex items-center justify-center gap-2",
                    "disabled:opacity-60 disabled:cursor-not-allowed"
                  )}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Save Dossier"
                  )}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

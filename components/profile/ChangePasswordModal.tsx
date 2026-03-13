"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updatePasswordSchema, type UpdatePasswordFormValues } from "@/lib/schemas/password";
import { updatePassword } from "@/lib/actions/auth";
import { toast } from "sonner";

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordFormValues>({
    resolver: zodResolver(updatePasswordSchema),
  });

  async function onSubmit(values: UpdatePasswordFormValues) {
    const result = await updatePassword(values.newPassword);

    if (result.success) {
      toast.success("Password updated successfully.", {
        style: { borderColor: "rgba(212,175,55,0.4)" },
      });
      reset();
      onClose();
    } else {
      toast.error(result.error ?? "Failed to update password.", {
        style: { borderColor: "rgba(180,83,69,0.5)" },
      });
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl p-8 shadow-2xl"
              style={{
                background: "#F9F9F6",
                boxShadow:
                  "0 24px 64px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.9)",
              }}
            >
              <div className="flex items-center justify-between mb-8">
                <h2
                  className="text-xl font-serif text-[#1A1A1A]"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  Change password
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 text-[#5A5550] hover:text-[#1A1A1A] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label className="block text-[#5A5550] text-[9px] tracking-[0.45em] uppercase font-medium mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNew ? "text" : "password"}
                      {...register("newPassword")}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full bg-white/80 border border-[#1A1A1A]/12 rounded-xl px-4 py-3 text-[#1A1A1A] text-sm outline-none placeholder:text-[#9E9E9E] focus:border-[#D4AF37]/60 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A5550] hover:text-[#D4AF37]/70"
                    >
                      {showNew ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {errors.newPassword && (
                    <p className="mt-1 text-xs text-[#C0392B]">
                      {errors.newPassword.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[#5A5550] text-[9px] tracking-[0.45em] uppercase font-medium mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      {...register("confirmPassword")}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full bg-white/80 border border-[#1A1A1A]/12 rounded-xl px-4 py-3 text-[#1A1A1A] text-sm outline-none placeholder:text-[#9E9E9E] focus:border-[#D4AF37]/60 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A5550] hover:text-[#D4AF37]/70"
                    >
                      {showConfirm ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-1 text-xs text-[#C0392B]">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-3 rounded-xl border border-[#1A1A1A]/18 text-[#1A1A1A]/70 text-sm font-medium hover:bg-[#1A1A1A]/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-3 rounded-xl text-[#090807] text-sm font-semibold tracking-wide disabled:opacity-50 transition-opacity"
                    style={{
                      background:
                        "linear-gradient(135deg, #D4AF37 0%, #E8D06A 50%, #D4AF37 100%)",
                    }}
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : (
                      "Update"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

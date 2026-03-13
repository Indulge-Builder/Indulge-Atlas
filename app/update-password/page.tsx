"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updatePasswordSchema, type UpdatePasswordFormValues } from "@/lib/schemas/password";
import { updatePassword } from "@/lib/actions/auth";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace("/login?error=Invalid_Link");
    });
  }, [router]);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordFormValues>({
    resolver: zodResolver(updatePasswordSchema),
  });

  async function onSubmit(values: UpdatePasswordFormValues) {
    const result = await updatePassword(values.newPassword);

    if (result.success) {
      toast.success("Password updated. Welcome back.", {
        style: { borderColor: "rgba(212,175,55,0.4)" },
      });
      router.push("/workspace");
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to update password.", {
        style: { borderColor: "rgba(180,83,69,0.5)" },
      });
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "#090807" }}
    >
      {/* Grain texture */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div
          className="rounded-2xl p-10 shadow-2xl"
          style={{
            background: "#F9F9F6",
            boxShadow:
              "0 24px 64px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
        >
          <h1
            className="text-2xl font-serif text-[#1A1A1A] mb-2"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Set new password.
          </h1>
          <p className="text-sm text-[#5A5550] mb-10">
            Choose a strong password to secure your account.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-[#5A5550] text-[9px] tracking-[0.45em] uppercase font-medium mb-3">
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
                <p className="mt-1.5 text-xs text-[#C0392B]">
                  {errors.newPassword.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[#5A5550] text-[9px] tracking-[0.45em] uppercase font-medium mb-3">
                Confirm New Password
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
                <p className="mt-1.5 text-xs text-[#C0392B]">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-between px-6 py-4 text-[#090807] text-sm font-semibold tracking-widest uppercase rounded-xl overflow-hidden transition-all duration-300 disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, #D4AF37 0%, #E8D06A 50%, #D4AF37 100%)",
                backgroundSize: "200% 100%",
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating</span>
                  <span />
                </>
              ) : (
                <>
                  <span />
                  <span>Update Password</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

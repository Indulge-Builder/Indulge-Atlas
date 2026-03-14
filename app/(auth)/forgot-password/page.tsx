"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, ArrowLeft } from "lucide-react";
import { requestPasswordReset } from "@/lib/actions/auth";
import { toast } from "sonner";
import { z } from "zod";

const emailSchema = z.string().email("Please enter a valid email address");

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }

    setLoading(true);
    const result = await requestPasswordReset(parsed.data);
    setLoading(false);

    if (result.success) {
      toast.success("Check your email", {
        description: "We've sent you a link to reset your password.",
        style: { borderColor: "rgba(212,175,55,0.4)" },
      });
    } else {
      setError(result.error ?? "Something went wrong.");
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center overflow-hidden px-6"
      style={{ background: "#121212" }}
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
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div
          className="rounded-lg p-10 sm:p-12"
          style={{
            background: "rgba(26, 26, 26, 0.85)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.06)",
          }}
        >
          {/* Heading */}
          <h1
            className="text-[#F5F0E8] leading-tight mb-2"
            style={{
              fontFamily:
                "var(--font-playfair), 'Playfair Display', Georgia, serif",
              fontSize: "2rem",
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            Reset Password
          </h1>
          <p
            className="text-[#5A5550] text-sm mb-10 leading-relaxed"
            style={{ letterSpacing: "0.02em" }}
          >
            Enter your email address and we will send you a link to reset your
            password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="group">
              <label className="block text-[#5A5550] text-[9px] tracking-[0.45em] uppercase font-medium mb-3">
                Email
              </label>
              <input
                type="email"
                placeholder="agent@indulgeglobal.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
                className="w-full bg-transparent text-[#F5F0E8] text-sm pb-3 pr-4 outline-none placeholder:text-[#2E2B27] border-b transition-all duration-300 disabled:opacity-60"
                style={{
                  borderBottomColor: email
                    ? "rgba(212,175,55,0.6)"
                    : "rgba(255,255,255,0.08)",
                  caretColor: "#D4AF37",
                }}
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5 text-xs"
                style={{ color: "#C0392B" }}
              >
                <div
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ background: "#C0392B" }}
                />
                {error}
              </motion.div>
            )}

            <div className="pt-2 space-y-6">
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex items-center justify-between px-6 py-4 text-[#090807] text-sm font-semibold tracking-widest uppercase overflow-hidden transition-all duration-300 disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, #D4AF37 0%, #E8D06A 50%, #D4AF37 100%)",
                  backgroundSize: "200% 100%",
                  letterSpacing: "0.12em",
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending</span>
                    <span />
                  </>
                ) : (
                  <>
                    <span />
                    <span>Send Reset Link</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <Link
                href="/login"
                className="flex items-center gap-2 text-[#5A5550] hover:text-[#D4AF37]/80 text-xs tracking-wider uppercase transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Login
              </Link>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

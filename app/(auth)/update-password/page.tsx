"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { updatePassword } from "@/lib/actions/auth";
import { toast } from "sonner";
import { updatePasswordSchema } from "@/lib/schemas/password";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkExpired, setLinkExpired] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "Invalid_Link") {
      setLinkExpired(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = updatePasswordSchema.safeParse({
      newPassword,
      confirmPassword,
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      setError(firstIssue?.message ?? "Invalid input");
      return;
    }

    setLoading(true);
    const result = await updatePassword(parsed.data.newPassword);
    setLoading(false);

    if (result.success) {
      toast.success("Password updated successfully", {
        style: { borderColor: "rgba(212,175,55,0.4)" },
      });
      router.push("/login");
      router.refresh();
    } else {
      if (
        result.error?.toLowerCase().includes("expired") ||
        result.error?.toLowerCase().includes("invalid") ||
        result.error?.toLowerCase().includes("session")
      ) {
        setLinkExpired(true);
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    }
  }

  if (linkExpired) {
    return (
      <div
        className="min-h-screen flex items-center justify-center overflow-hidden px-6"
        style={{ background: "#121212" }}
      >
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
            className="rounded-lg p-10 sm:p-12 text-center"
            style={{
              background: "rgba(26, 26, 26, 0.85)",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow:
                "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.06)",
            }}
          >
            <h1
              className="text-[#F5F0E8] leading-tight mb-3"
              style={{
                fontFamily:
                  "var(--font-playfair), 'Playfair Display', Georgia, serif",
                fontSize: "1.75rem",
                fontWeight: 400,
                letterSpacing: "-0.01em",
              }}
            >
              Link Expired
            </h1>
            <p
              className="text-[#5A5550] text-sm mb-10 leading-relaxed"
              style={{ letterSpacing: "0.02em" }}
            >
              This link has expired. Please request a new one.
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex items-center gap-2 px-6 py-4 text-[#090807] text-sm font-semibold tracking-widest uppercase transition-all duration-300"
              style={{
                background:
                  "linear-gradient(135deg, #D4AF37 0%, #E8D06A 50%, #D4AF37 100%)",
                letterSpacing: "0.12em",
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Request New Link
            </Link>
          </div>
        </motion.div>
      </div>
    );
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
            Create New Password
          </h1>
          <p
            className="text-[#5A5550] text-sm mb-10 leading-relaxed"
            style={{ letterSpacing: "0.02em" }}
          >
            Enter your new password below. Use at least 8 characters with one
            uppercase letter and one number.
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="group">
              <label className="block text-[#5A5550] text-[9px] tracking-[0.45em] uppercase font-medium mb-3">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full bg-transparent text-[#F5F0E8] text-sm pb-3 pr-10 outline-none placeholder:text-[#2E2B27] border-b transition-all duration-300 disabled:opacity-60"
                  style={{
                    borderBottomColor: newPassword
                      ? "rgba(212,175,55,0.6)"
                      : "rgba(255,255,255,0.08)",
                    caretColor: "#D4AF37",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-0 bottom-3 text-[#3A3530] hover:text-[#D4AF37]/60 transition-colors"
                >
                  {showNewPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="group">
              <label className="block text-[#5A5550] text-[9px] tracking-[0.45em] uppercase font-medium mb-3">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full bg-transparent text-[#F5F0E8] text-sm pb-3 pr-10 outline-none placeholder:text-[#2E2B27] border-b transition-all duration-300 disabled:opacity-60"
                  style={{
                    borderBottomColor: confirmPassword
                      ? "rgba(212,175,55,0.6)"
                      : "rgba(255,255,255,0.08)",
                    caretColor: "#D4AF37",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-0 bottom-3 text-[#3A3530] hover:text-[#D4AF37]/60 transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
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
                className="group relative w-full flex items-center justify-center gap-2 px-6 py-4 text-[#090807] text-sm font-semibold tracking-widest uppercase overflow-hidden transition-all duration-300 disabled:opacity-50"
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
                    <span>Updating</span>
                  </>
                ) : (
                  "Update Password"
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

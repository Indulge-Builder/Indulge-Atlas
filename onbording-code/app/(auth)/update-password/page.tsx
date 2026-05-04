"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowLeft, Check, Circle, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { updatePassword } from "@/lib/actions/auth";
import { toast } from "sonner";
import { mapAuthError, mapAuthQueryError } from "@/lib/utils/auth-errors";
import { IndulgeField } from "@/components/ui/indulge-field";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Input } from "@/components/ui/input";

function passwordRequirements(pw: string) {
  return {
    len: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
  };
}

function allRequirementsMet(req: ReturnType<typeof passwordRequirements>) {
  return req.len && req.upper && req.lower && req.digit;
}

function PasswordReqRow({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      {met ? (
        <Check className="w-3.5 h-3.5 shrink-0 text-[#D4AF37]" strokeWidth={2.5} />
      ) : (
        <Circle className="w-3 h-3 shrink-0 text-[#5A5550]" />
      )}
      <span className={met ? "text-[#C5A059]" : "text-[#6B6560]"}>{label}</span>
    </div>
  );
}

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkExpired, setLinkExpired] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [flow, setFlow] = useState<"first" | "reset" | null>(null);

  const isWelcomeJourney = flow === "first";
  const isResetJourney = flow === "reset";
  const copyReady = flow !== null;

  const reqs = useMemo(() => passwordRequirements(newPassword), [newPassword]);
  const passwordsMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    allRequirementsMet(reqs) && passwordsMatch && !loading;

  // Sync URL + session once on mount (client-only).
  /* eslint-disable react-hooks/set-state-in-effect -- intentional hydration of flow from searchParams */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    const f = params.get("flow");
    if (f === "first" || f === "reset") setFlow(f);
    if (err === "Invalid_Link" || err === "auth_callback_failed") {
      setLinkExpired(true);
      return;
    }

    const supabase = createClient();
    void supabase.auth
      .getUser()
      .then(({ data: { user } }: { data: { user: User | null } }) => {
      if (!user) {
        setLinkExpired(true);
        return;
      }
      setSessionEmail(user.email ?? null);
      if (f === "first" || f === "reset") {
        return;
      }
      const created = new Date(user.created_at ?? 0).getTime();
      const confirmedAt = user.email_confirmed_at
        ? new Date(user.email_confirmed_at).getTime()
        : null;
      if (!confirmedAt || confirmedAt - created < 120_000) {
        setFlow("first");
      } else {
        setFlow("reset");
      }
    });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!allRequirementsMet(reqs)) {
      setError("Please meet all password requirements.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await updatePassword(newPassword);
    setLoading(false);

    if (result.success) {
      toast.success("Welcome to Atlas", {
        description: "Your password is set. Loading your workspace…",
        style: { borderColor: "rgba(212,175,55,0.4)" },
      });
      router.push("/");
      router.refresh();
    } else {
      const msg = result.error ?? mapAuthError(null);
      if (
        msg.toLowerCase().includes("expired") ||
        msg.toLowerCase().includes("invalid") ||
        msg.toLowerCase().includes("session") ||
        msg.toLowerCase().includes("not authenticated")
      ) {
        setLinkExpired(true);
      } else {
        toast.error(msg);
        setError(msg);
      }
    }
  }

  const heading = !copyReady
    ? "Set your password"
    : isWelcomeJourney
      ? "Welcome to Indulge Atlas"
      : "Set your new password";

  const subtext = !copyReady
    ? "Loading your session…"
    : isWelcomeJourney
      ? "Set your password to get started. You are signing in as:"
      : isResetJourney
        ? "Choose a strong password you have not used here before."
        : "Choose a strong password for your account.";

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
              Link expired
            </h1>
            <p
              className="text-[#5A5550] text-sm mb-10 leading-relaxed"
              style={{ letterSpacing: "0.02em" }}
            >
              {mapAuthQueryError("auth_callback_failed")}
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
              Request new link
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center overflow-hidden px-6 py-12"
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
          className="rounded-lg p-10 sm:p-12"
          style={{
            background: "rgba(26, 26, 26, 0.85)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.06)",
          }}
        >
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
            {heading}
          </h1>
          <p
            className="text-[#5A5550] text-sm mb-2 leading-relaxed"
            style={{ letterSpacing: "0.02em" }}
          >
            {subtext}
          </p>
          {sessionEmail && isWelcomeJourney && (
            <p className="text-[#D4AF37]/90 text-sm font-medium mb-8 break-all">
              {sessionEmail}
            </p>
          )}
          {!(sessionEmail && isWelcomeJourney) && <div className="mb-8" />}

          <form onSubmit={handleSubmit} className="space-y-6">
            <IndulgeField label="New password" required htmlFor="new-password">
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  size="lg"
                  placeholder="••••••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A6E] hover:text-[#D4AF37]/80 transition-colors"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </IndulgeField>

            <div
              className="rounded-lg border border-[#2A2824] bg-[#161513]/80 px-3 py-3 space-y-1.5 -mt-2"
              aria-live="polite"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#6B6560] mb-2">
                Password requirements
              </p>
              <PasswordReqRow met={reqs.len} label="At least 8 characters" />
              <PasswordReqRow met={reqs.upper} label="One uppercase letter" />
              <PasswordReqRow met={reqs.lower} label="One lowercase letter" />
              <PasswordReqRow met={reqs.digit} label="One number" />
            </div>

            <IndulgeField
              label="Confirm password"
              required
              htmlFor="confirm-password"
              error={passwordsMismatch ? "Passwords do not match" : undefined}
            >
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  size="lg"
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={loading}
                  error={passwordsMismatch}
                  className="pr-16"
                />
                <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center">
                  {passwordsMatch && (
                    <Check className="w-4 h-4 text-emerald-500" strokeWidth={2.5} />
                  )}
                  {passwordsMismatch && (
                    <X className="w-4 h-4 text-[#C0392B]" strokeWidth={2.5} />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A6E] hover:text-[#D4AF37]/80 transition-colors"
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </IndulgeField>

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
              <IndulgeButton
                type="submit"
                variant="gold"
                className="w-full tracking-widest uppercase"
                loading={loading}
                disabled={!canSubmit}
              >
                Set Password & Enter Atlas
              </IndulgeButton>

              <Link
                href="/login"
                className="flex items-center gap-2 text-[#5A5550] hover:text-[#D4AF37]/80 text-xs tracking-wider uppercase transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to login
              </Link>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

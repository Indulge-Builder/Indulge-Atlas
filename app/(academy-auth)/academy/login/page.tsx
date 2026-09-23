"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, GraduationCap, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/utils/auth-errors";

/**
 * Academy's own front door.
 *
 * Lives in the (academy-auth) group — deliberately outside the (academy)
 * layout, which redirects unauthenticated users here. Gating the login page
 * with the gate it serves would loop.
 *
 * Same Supabase project as Atlas, so this is a separate entry point rather
 * than a separate identity system. Interns land on /academy and, per the
 * dashboard gate, cannot reach Atlas screens.
 */
export default function AcademyLoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(mapAuthError(authError.message));
      setLoading(false);
      return;
    }

    router.push("/academy");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1A1814] px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-10 flex flex-col items-center text-center">
          <GraduationCap className="mb-4 h-7 w-7 text-brand-gold" aria-hidden />
          <h1
            className="text-3xl font-normal text-[#F5F0E8]"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Indulge Training
          </h1>
          <p className="mt-2 text-[12px] tracking-wide text-white/40">
            Concierge training
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <label
              htmlFor="academy-email"
              className="mb-3 block text-[9px] font-medium uppercase tracking-[0.45em] text-white/35"
            >
              Login
            </label>
            <input
              id="academy-email"
              type="email"
              placeholder="intern@indulgeglobal.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full border-b border-white/10 bg-transparent pb-3 text-sm text-[#F5F0E8] outline-none transition-colors duration-300 placeholder:text-white/15 focus:border-brand-gold"
              style={{ caretColor: "var(--color-brand-gold)" }}
            />
          </div>

          <div>
            <label
              htmlFor="academy-password"
              className="mb-3 block text-[9px] font-medium uppercase tracking-[0.45em] text-white/35"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="academy-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border-b border-white/10 bg-transparent pb-3 pr-8 text-sm text-[#F5F0E8] outline-none transition-colors duration-300 placeholder:text-white/15 focus:border-brand-gold"
                style={{ caretColor: "var(--color-brand-gold)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute bottom-3 right-0 text-white/25 transition-colors hover:text-brand-gold"
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="mt-2.5 block w-full text-right text-[11px] tracking-wider text-white/35 transition-colors hover:text-brand-gold"
            >
              Forgot your password?
            </button>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="flex items-center gap-2.5 text-xs text-danger"
            >
              <span className="h-1 w-1 shrink-0 rounded-full bg-danger" />
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group flex w-full items-center justify-between bg-brand-gold px-6 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-surface transition-colors duration-300 hover:bg-brand-gold-dark disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>Signing in</span>
                <span />
              </>
            ) : (
              <>
                <span />
                <span>Enter</span>
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  aria-hidden
                />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

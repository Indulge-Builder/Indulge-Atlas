"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ── Quote corpus ───────────────────────────────────────────
// 50 short reflections on luxury, mastery, and presence.
// Selection is deferred to useEffect to stay hydration-safe.

const QUOTES: string[] = [
  "Anticipate the Unspoken need.",
  "Silence is the ultimate Luxury.",
  "Excellence is an Invisible habit.",
  "Let beauty be what you Do.",
  "What you seek is Seeking you.",
  "Elegance is simply Refusal.",
  "Curate the Exceptional.",
  "Mastery requires a Quiet mind.",
  "Time is the only True currency.",
  "Detail is the signature of Care.",
  "Look past the Obvious.",
  "Service is the highest Art.",
  "Stillness speaks the Loudest.",
  "Beyond words, there is Experience.",
  "Luxury is Peace of Mind.",
  "Observe deeply, act Softly.",
  "The magic is in the Unseen.",
  "Patience is a premium Asset.",
  "Quiet the mind, elevate the Moment.",
  "True wealth is a curated Life.",
  "Design the unforgettable.",
  "Simplicity is the ultimate sophistication.",
  "Grace under pressure.",
  "Find the universe in the details.",
  "Deliver the impossible, quietly.",
  "Where attention goes, energy flows.",
  "Cultivate absolute presence.",
  "Art is how we decorate space.",
  "Listen before they speak.",
  "Every interaction is a masterpiece.",
  "Elevate the ordinary.",
  "Frictionless execution.",
  "Embrace the profound silence.",
  "Trust the unseen process.",
  "Crafting moments out of time.",
  "Be empty of worrying.",
  "The aesthetic of absolute calm.",
  "Precision without the pressure.",
  "A sanctuary of service.",
  "Notice what others ignore.",
  "Respond to every true call.",
  "Exclusivity is a feeling, not a price.",
  "Walk as if kissing the earth.",
  "The space between the notes.",
  "Protect the client's peace.",
  "Leave no detail to chance.",
  "Intuition is the highest logic.",
  "Calm is a superpower.",
  "Do it beautifully or not at all.",
  "Begin with absolute clarity.",
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  // Hydration-safe quote: always starts null (server), set on client mount.
  const [quote, setQuote] = useState<string | null>(null);
  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "Invalid_Link") {
      setError(
        "This reset link is invalid or has expired. Please request a new one.",
      );
    }
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError("Invalid credentials. Please try again.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    const destination = profile?.role === "agent" ? "/" : "/workspace";

    router.push(destination);
    router.refresh();
  }

  return (
    <div
      className="min-h-screen flex overflow-hidden"
      style={{ background: "#090807" }}
    >
      {/* ── GRAIN TEXTURE ─────────────────────────────── */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
        }}
      />

      {/* ── LEFT: BRAND PANEL ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="hidden lg:flex lg:w-[58%] relative flex-col p-16 overflow-hidden"
        style={{
          background:
            "linear-gradient(145deg, #0D0B09 0%, #0A0804 60%, #0F0D07 100%)",
        }}
      >
        {/* Radial gold glow — top left */}
        <div
          className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.07) 0%, transparent 70%)",
          }}
        />
        {/* Radial gold glow — bottom right */}
        <div
          className="absolute -bottom-48 -right-24 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.05) 0%, transparent 70%)",
          }}
        />

        {/* Gold vertical rule */}
        <div
          className="absolute right-0 top-0 bottom-0 w-px"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgba(212,175,55,0.25) 30%, rgba(212,175,55,0.25) 70%, transparent)",
          }}
        />

        {/* ── Center composition — logo + title + quote ─── */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8">
          {/* Company Logo */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex justify-center mb-10"
            style={{
              filter:
                "drop-shadow(0 0 28px rgba(212,175,55,0.22)) drop-shadow(0 0 60px rgba(212,175,55,0.10))",
            }}
          >
            <img
              src="/logo.svg"
              alt="Indulge Global"
              width={110}
              height={118}
              className="object-contain select-none"
              style={{ opacity: 0.92 }}
            />
          </motion.div>

          {/* Thin gold rule between logo and wordmark */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 1.0, delay: 0.6, ease: "easeOut" }}
            className="mb-7"
            style={{
              width: "2.5rem",
              height: "1px",
              background:
                "linear-gradient(to right, transparent, rgba(212,175,55,0.55), transparent)",
            }}
          />

          {/* "Atlas" — The Marble Anchor */}
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
            className="text-center select-none bg-gradient-to-r from-[#C5A059] via-[#E8D06A] to-[#F3E5AB] bg-clip-text text-transparent uppercase"
            style={{
              fontFamily: "var(--font-forum), 'Forum', cursive, serif",
              fontSize: "clamp(4.2rem, 7vw, 6.4rem)",
              fontWeight: 700,
              letterSpacing: "0.42em",
              lineHeight: 1,
              filter:
                "drop-shadow(0 0 28px rgba(212,175,55,0.25)) drop-shadow(0 0 56px rgba(212,175,55,0.12))",
            }}
          >
            Atlas
          </motion.h1>

          {/* Company name — elegant subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.4, delay: 0.8, ease: "easeOut" }}
            className="mt-4 text-center select-none tracking-[0.28em] uppercase"
            style={{
              color: "rgba(212,175,55,0.45)",
              fontFamily:
                "var(--font-playfair), 'Playfair Display', Georgia, serif",
              fontSize: "clamp(0.6rem, 0.85vw, 0.72rem)",
              fontWeight: 400,
              letterSpacing: "0.32em",
            }}
          >
            Indulge Global
          </motion.p>

          {/* Generous breathing space between title and quote */}
          <div className="h-14 lg:h-16" />

          {/* Rotating quote — philosophical subtitle */}
          <AnimatePresence mode="wait">
            {quote && (
              <motion.div
                key={quote}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 1.4, delay: 0.5, ease: "easeOut" }}
                className="max-w-[380px] text-center"
              >
                <p
                  className="text-[#F5F0E8]/55 leading-[1.4]"
                  style={{
                    fontFamily:
                      "var(--font-playfair), 'Playfair Display', Georgia, serif",
                    fontSize: "clamp(1.0rem, 1.5vw, 1.25rem)",
                    fontWeight: 300,
                    letterSpacing: "0.03em",
                  }}
                >
                  {quote}
                </p>

                {/* Signature gold em dash */}
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1.0, delay: 1.0, ease: "easeOut" }}
                  className="block mt-4 text-[#D4AF37]/40 tracking-[0.14em]"
                  style={{
                    fontFamily:
                      "var(--font-playfair), 'Playfair Display', Georgia, serif",
                    fontSize: "0.95rem",
                  }}
                >
                  —
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ── RIGHT: FORM PANEL ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="w-full lg:w-[42%] flex flex-col justify-center px-10 sm:px-16 lg:px-20"
      >
        {/* Mobile wordmark */}
        <div className="lg:hidden flex items-center gap-3 mb-14">
          <img
            src="/logo.svg"
            alt="Indulge Global"
            width={24}
            height={24}
            className="object-contain"
          />
          <span className="text-[#F5F0E8] tracking-[0.3em] text-xs uppercase font-medium">
            Indulge Global
          </span>
        </div>

        <div className="w-full max-w-sm mx-auto">
          {/* Heading */}
          <div className="mb-12">
            <h2
              className="font-serif text-[#F5F0E8] leading-tight"
              style={{
                fontFamily:
                  "var(--font-playfair), 'Playfair Display', Georgia, serif",
                fontSize: "2.25rem",
                fontWeight: 400,
                letterSpacing: "-0.01em",
              }}
            >
              Welcome back.
            </h2>
          </div>

          <motion.form
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={handleSubmit}
            className="space-y-10"
          >
                {/* Email field — underline style */}
                <div className="group">
                  <label className="block text-[#5A5550] text-[9px] tracking-[0.45em] uppercase font-medium mb-3">
                    Login
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="agent@indulgeglobal.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full bg-transparent text-[#F5F0E8] text-sm pb-3 pr-4 outline-none placeholder:text-[#2E2B27] border-b transition-all duration-300"
                      style={{
                        borderBottomColor: email
                          ? "rgba(212,175,55,0.6)"
                          : "rgba(255,255,255,0.08)",
                        caretColor: "#D4AF37",
                      }}
                      onFocus={(e) =>
                        (e.currentTarget.style.borderBottomColor =
                          "rgba(212,175,55,0.8)")
                      }
                      onBlur={(e) =>
                        (e.currentTarget.style.borderBottomColor = email
                          ? "rgba(212,175,55,0.4)"
                          : "rgba(255,255,255,0.08)")
                      }
                    />
                  </div>
                </div>

                {/* Password field — underline style */}
                <div className="group">
                  <label className="block text-[#5A5550] text-[9px] tracking-[0.45em] uppercase font-medium mb-3">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full bg-transparent text-[#F5F0E8] text-sm pb-3 pr-8 outline-none placeholder:text-[#2E2B27] border-b transition-all duration-300"
                      style={{
                        borderBottomColor: password
                          ? "rgba(212,175,55,0.6)"
                          : "rgba(255,255,255,0.08)",
                        caretColor: "#D4AF37",
                      }}
                      onFocus={(e) =>
                        (e.currentTarget.style.borderBottomColor =
                          "rgba(212,175,55,0.8)")
                      }
                      onBlur={(e) =>
                        (e.currentTarget.style.borderBottomColor = password
                          ? "rgba(212,175,55,0.4)"
                          : "rgba(255,255,255,0.08)")
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 bottom-3 text-[#3A3530] hover:text-[#D4AF37]/60 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <button
                      type="button"
                      onClick={() => router.push("/forgot-password")}
                      className="mt-2.5 block w-full text-right text-[#5A5550] hover:text-[#D4AF37]/70 text-[11px] tracking-wider transition-colors"
                    >
                      Forgot your password?
                    </button>
                </div>

                {/* Error */}
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

                {/* Submit */}
                <div className="pt-2">
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
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundPosition =
                        "right center")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundPosition = "left center")
                    }
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Signing In</span>
                        <span />
                      </>
                    ) : (
                      <>
                        <span />
                        <span>Enter</span>
                        <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                      </>
                    )}
                  </button>

                  {/* Hairline below button */}
                  <div
                    className="mt-4 h-px"
                    style={{
                      background:
                        "linear-gradient(to right, rgba(212,175,55,0.3), transparent)",
                    }}
                  />
                </div>
              </motion.form>

          {/* Footer */}
        </div>
      </motion.div>
    </div>
  );
}

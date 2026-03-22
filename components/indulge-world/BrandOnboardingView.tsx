"use client";

import { useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Handshake, Loader2, Sparkles, Store } from "lucide-react";

/** Calm, simple easing — no bouncy layout morph */
const EASE_OUT = [0.25, 0.1, 0.25, 1] as const;

const PILLOWY_CARD =
  "rounded-2xl backdrop-blur-2xl ring-1 ring-black/5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-300";

const PLAN_CARD_BG = {
  unpaid: "bg-slate-50",
  paid: "bg-amber-50/90",
  /** Soft purple / indigo / mint — airy “premium” tier on cream page */
  premium:
    "bg-gradient-to-br from-violet-50/95 via-indigo-50/88 to-emerald-50/80",
} as const;

const TEXT_COLOR = {
  whatsapp: "text-emerald-600 font-medium",
  instagram: "text-rose-600 font-medium",
  genies: "text-amber-600 font-medium",
  vendor: "text-sky-600 font-medium",
  jokers: "text-purple-600 font-medium",
  newsroom: "text-slate-600 font-medium",
  app: "text-amber-600 font-medium",
} as const;

type Step = 0 | 1 | 2;
type PlanId = "unpaid" | "paid" | "premium" | null;

const PLANS = [
  { id: "unpaid" as const, label: "Unpaid", icon: Globe },
  { id: "paid" as const, label: "Paid", icon: Store },
  { id: "premium" as const, label: "Premium", icon: Sparkles },
] as const;

const stepVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

const STEP_TRANSITION = { duration: 0.32, ease: EASE_OUT };
const TIER_DETAIL_TRANSITION = { duration: 0.3, ease: EASE_OUT };

function TierFeatureHeading({
  title,
  variant,
}: {
  title: string;
  variant: "unpaid" | "paid" | "premium";
}) {
  const accent = {
    unpaid: "from-slate-400 via-slate-500 to-slate-400",
    paid: "from-amber-400 via-amber-500 to-amber-400",
    premium: "from-violet-400 via-indigo-500 to-emerald-500/90",
  }[variant];

  return (
    <div className="mb-6 w-full max-w-lg mx-auto px-1">
      <div
        className={`mx-auto mb-4 h-0.5 w-14 rounded-full bg-gradient-to-r ${accent} opacity-90`}
        aria-hidden
      />
      <h4 className="text-lg md:text-xl font-semibold tracking-tight text-slate-900 text-balance leading-snug">
        {title}
      </h4>
      <div
        className="mt-4 h-px w-full max-w-xs mx-auto bg-gradient-to-r from-transparent via-slate-200/90 to-transparent"
        aria-hidden
      />
    </div>
  );
}

function NumberedFeatureList({
  items,
}: {
  items: ReactNode[];
}) {
  return (
    <ol className="list-none space-y-4 text-sm text-slate-600 max-w-md mx-auto text-left">
      {items.map((node, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100/90 text-[11px] font-semibold tabular-nums text-slate-500 ring-1 ring-slate-200/80"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 leading-relaxed pt-0.5">{node}</span>
        </li>
      ))}
    </ol>
  );
}

export function BrandOnboardingView() {
  const [step, setStep] = useState<Step>(0);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(null);

  useEffect(() => {
    if (step !== 1) return;
    const t = setTimeout(() => setStep(2), 2000);
    return () => clearTimeout(t);
  }, [step]);

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div
        className={`flex flex-col items-center gap-6 md:gap-8 ${
          step === 2 ? "pt-2 md:pt-3" : "pt-8 md:pt-12"
        }`}
      >
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step-0"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={STEP_TRANSITION}
              className="w-full max-w-md"
            >
              <button
                onClick={() => setStep(1)}
                className={`w-full p-8 flex flex-col items-center gap-4 bg-white/80 ${PILLOWY_CARD} hover:shadow-[0_12px_40px_rgb(0,0,0,0.04)] hover:-translate-y-0.5 hover:ring-1 hover:ring-black/5 cursor-pointer text-left`}
              >
                <div className="p-3 rounded-xl bg-sky-50/80 ring-1 ring-sky-200/40">
                  <Handshake
                    className="h-8 w-8 text-sky-500"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="text-slate-800 font-semibold text-lg tracking-tight">
                  Brand Website Form Application
                </h3>
                <p className="text-slate-500 text-sm">
                  Click to begin your brand onboarding journey
                </p>
              </button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step-1"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={STEP_TRANSITION}
              className="w-full max-w-md"
            >
              <div
                className={`w-full p-8 flex flex-col items-center gap-5 bg-white/80 ${PILLOWY_CARD}`}
              >
                <h3 className="text-slate-800 font-semibold text-lg tracking-tight">
                  AI Profiling in Progress…
                </h3>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-slate-500 text-sm flex items-center gap-2">
                    <Loader2
                      className="h-4 w-4 animate-spin text-slate-400"
                      strokeWidth={2}
                    />
                    Running Indulge Quality Check…
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={STEP_TRANSITION}
              className="flex w-full min-h-[min(62vh,36rem)] flex-col justify-center gap-6 md:gap-8 py-2 md:py-4"
            >
              <div className="text-center">
                <h2 className="text-xl md:text-2xl font-semibold text-slate-800 tracking-tight mb-1">
                  Our 3-Tiers
                </h2>
                <p className="text-sm text-slate-500">
                  Choose your tier to explore features
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {PLANS.map((plan) => {
                  const isActive = selectedPlan === plan.id;
                  const isPaidOrPremium =
                    plan.id === "paid" || plan.id === "premium";
                  const Icon = plan.icon;
                  const activeClasses =
                    isActive && plan.id === "premium"
                      ? "ring-2 ring-violet-400/40 shadow-[0_12px_40px_rgba(139,92,246,0.12)]"
                      : isActive && isPaidOrPremium
                        ? "ring-2 ring-amber-500/30 shadow-[0_12px_40px_rgb(251,191,36,0.08)]"
                        : isActive
                          ? "ring-2 ring-slate-300/50 shadow-[0_12px_40px_rgb(0,0,0,0.04)]"
                          : "hover:shadow-[0_12px_40px_rgb(0,0,0,0.04)] hover:-translate-y-0.5";
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(isActive ? null : plan.id)}
                      className={`p-6 flex flex-col items-center justify-center gap-3 ${PILLOWY_CARD} ${PLAN_CARD_BG[plan.id]} cursor-pointer transition-all duration-300 ease-out ${activeClasses}`}
                    >
                      <Icon
                        strokeWidth={1.5}
                        className={`h-5 w-5 ${
                          plan.id === "unpaid"
                            ? "text-slate-500"
                            : plan.id === "premium"
                              ? "text-violet-600"
                              : "text-amber-600"
                        }`}
                      />
                      <h3
                        className={`text-sm font-semibold ${
                          plan.id === "premium"
                            ? "text-indigo-950"
                            : "text-slate-700"
                        }`}
                      >
                        {plan.label}
                      </h3>
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                {selectedPlan && (
                  <motion.div
                    key={selectedPlan}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={TIER_DETAIL_TRANSITION}
                  >
                    <div
                      className={`pt-4 px-6 pb-6 min-h-[280px] flex flex-col items-center justify-center text-center ${PILLOWY_CARD} bg-white/80 border-t border-slate-100/80`}
                    >
                      {selectedPlan === "unpaid" && (
                        <>
                          <TierFeatureHeading
                            variant="unpaid"
                            title="The Unpaid Ecosystem"
                          />
                          <NumberedFeatureList
                            items={[
                              <>
                                Join our exclusive{" "}
                                <span className={TEXT_COLOR.whatsapp}>
                                  WhatsApp Communities
                                </span>
                                .
                              </>,
                              <>
                                Be part of the{" "}
                                <span className={TEXT_COLOR.instagram}>
                                  Instagram Community
                                </span>
                                .
                              </>,
                              <>
                                Gain read-only visibility into current demands
                                requested by our{" "}
                                <span className={TEXT_COLOR.genies}>Genies</span>
                                .
                              </>,
                            ]}
                          />
                        </>
                      )}

                      {selectedPlan === "paid" && (
                        <>
                          <TierFeatureHeading
                            variant="paid"
                            title="The Paid Vendor Advantage"
                          />
                          <NumberedFeatureList
                            items={[
                              <>
                                Earn the elite{" "}
                                <span className={TEXT_COLOR.vendor}>
                                  Preferred Vendor
                                </span>{" "}
                                tag.
                              </>,
                              <>
                                Receive priority routing for requests from the
                                Shop and Concierge{" "}
                                <span className={TEXT_COLOR.genies}>Genies</span>
                                .
                              </>,
                              <>
                                Get your catalogs featured in official{" "}
                                <span className={TEXT_COLOR.instagram}>
                                  Insta Recommendations
                                </span>
                                .
                              </>,
                              <>
                                Our{" "}
                                <span className={TEXT_COLOR.jokers}>Jokers</span>{" "}
                                will actively favor your products when curating
                                bespoke suggestions for clients.
                              </>,
                            ]}
                          />
                        </>
                      )}

                      {selectedPlan === "premium" && (
                        <>
                          <TierFeatureHeading
                            variant="premium"
                            title="Premium Partnership"
                          />
                          <NumberedFeatureList
                            items={[
                              <>All Paid Vendor features included.</>,
                              <>
                                Exclusive access to the internal{" "}
                                <span className={TEXT_COLOR.newsroom}>
                                  Newsroom
                                </span>
                                .
                              </>,
                              <>
                                Permanent prime listing on the proprietary{" "}
                                <span className={TEXT_COLOR.app}>
                                  Indulge Shop App
                                </span>
                                .
                              </>,
                              <>
                                Maximum push by Jokers and absolute top
                                preference by Genies for Concierge requests. We
                                actively scale your brand with us.
                              </>,
                            ]}
                          />
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

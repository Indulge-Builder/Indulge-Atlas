"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Handshake, Loader2, Sparkles, Store } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const PILLOWY_CARD =
  "rounded-2xl backdrop-blur-2xl ring-1 ring-black/5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-300";

const PLAN_CARD_BG = {
  unpaid: "bg-slate-50",
  paid: "bg-amber-50/90",
  premium: "bg-amber-100/80",
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
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const TRANSITION = { duration: 0.35, ease: EASE };
const LAYOUT_TRANSITION = { layout: { duration: 0.4, ease: EASE } };

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
      <motion.div
        layout
        className="flex flex-col items-center gap-8"
        transition={LAYOUT_TRANSITION}
      >
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step-0"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={TRANSITION}
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
              transition={TRANSITION}
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
              transition={TRANSITION}
              className="w-full flex flex-col gap-8"
            >
              <div className="text-center">
                <h2 className="text-lg font-semibold text-slate-800 tracking-tight mb-1">
                  Our 3-Tiers
                </h2>
                <p className="text-sm text-slate-500">
                  Choose your tier to explore features
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {PLANS.map((plan) => {
                  const isActive = selectedPlan === plan.id;
                  const isPaidOrPremium =
                    plan.id === "paid" || plan.id === "premium";
                  const Icon = plan.icon;
                  const activeClasses =
                    isActive && isPaidOrPremium
                      ? "ring-2 ring-amber-500/30 shadow-[0_12px_40px_rgb(251,191,36,0.08)]"
                      : isActive
                        ? "ring-2 ring-slate-300/50 shadow-[0_12px_40px_rgb(0,0,0,0.04)]"
                        : "hover:shadow-[0_12px_40px_rgb(0,0,0,0.04)] hover:-translate-y-0.5";
                  return (
                    <motion.button
                      key={plan.id}
                      layout
                      onClick={() => setSelectedPlan(isActive ? null : plan.id)}
                      className={`p-6 flex flex-col items-center justify-center gap-3 ${PILLOWY_CARD} ${PLAN_CARD_BG[plan.id]} cursor-pointer transition-all duration-300 ${activeClasses}`}
                    >
                      <Icon
                        strokeWidth={1.5}
                        className={`h-5 w-5 ${
                          plan.id === "unpaid"
                            ? "text-slate-500"
                            : "text-amber-600"
                        }`}
                      />
                      <h3 className="text-sm font-semibold text-slate-700">
                        {plan.label}
                      </h3>
                    </motion.button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                {selectedPlan && (
                  <motion.div
                    key={selectedPlan}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={TRANSITION}
                  >
                    <div
                      className={`pt-4 px-6 pb-6 min-h-[280px] flex flex-col items-center justify-center text-center ${PILLOWY_CARD} bg-white/80 border-t border-slate-100/80`}
                    >
                      {selectedPlan === "unpaid" && (
                        <>
                          <h4 className="text-slate-800 font-semibold text-base mb-4">
                            The Unpaid Ecosystem
                          </h4>
                          <ul className="space-y-3 text-sm text-slate-600 list-none text-center max-w-md mx-auto">
                            <li>
                              Join our exclusive{" "}
                              <span className={TEXT_COLOR.whatsapp}>
                                WhatsApp Communities
                              </span>
                              .
                            </li>
                            <li>
                              Be part of the{" "}
                              <span className={TEXT_COLOR.instagram}>
                                Instagram Community
                              </span>
                              .
                            </li>
                            <li>
                              Gain read-only visibility into current demands
                              requested by our{" "}
                              <span className={TEXT_COLOR.genies}>Genies</span>.
                            </li>
                          </ul>
                        </>
                      )}

                      {selectedPlan === "paid" && (
                        <>
                          <h4 className="text-slate-800 font-semibold text-base mb-4">
                            The Paid Vendor Advantage
                          </h4>
                          <ul className="space-y-3 text-sm text-slate-600 list-none text-center max-w-md mx-auto">
                            <li>
                              Earn the elite{" "}
                              <span className={TEXT_COLOR.vendor}>
                                Preferred Vendor
                              </span>{" "}
                              tag.
                            </li>
                            <li>
                              Receive priority routing for requests from the
                              Shop and Concierge{" "}
                              <span className={TEXT_COLOR.genies}>Genies</span>.
                            </li>
                            <li>
                              Get your catalogs featured in official{" "}
                              <span className={TEXT_COLOR.instagram}>
                                Insta Recommendations
                              </span>
                              .
                            </li>
                            <li>
                              Our{" "}
                              <span className={TEXT_COLOR.jokers}>Jokers</span>{" "}
                              will actively favor your products when curating
                              bespoke suggestions for clients.
                            </li>
                          </ul>
                        </>
                      )}

                      {selectedPlan === "premium" && (
                        <>
                          <h4 className="text-slate-800 font-semibold text-base mb-4">
                            Premium Partnership
                          </h4>
                          <ul className="space-y-3 text-sm text-slate-600 list-none text-center max-w-md mx-auto">
                            <li>All Paid Vendor features included.</li>
                            <li>
                              Exclusive access to the internal{" "}
                              <span className={TEXT_COLOR.newsroom}>
                                Newsroom
                              </span>
                              .
                            </li>
                            <li>
                              Permanent prime listing on the proprietary{" "}
                              <span className={TEXT_COLOR.app}>
                                Indulge Shop App
                              </span>
                              .
                            </li>
                            <li>
                              Maximum push by Jokers and absolute top preference
                              by Genies for Concierge requests. We actively
                              scale your brand with us.
                            </li>
                          </ul>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

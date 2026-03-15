"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Smartphone, FileSpreadsheet } from "lucide-react";
import { TermTooltip } from "./TermTooltip";
import { Crown } from "lucide-react";

type TabId = "paid" | "unpaid";

const PILLOWY_CARD =
  "rounded-xl bg-white/90 backdrop-blur-2xl ring-1 ring-stone-200/50 border border-stone-100/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5";

const SOFT_ACCENT = "text-[#A8986D]";
const SOFT_ACCENT_BG = "bg-[#A8986D]/[0.08]";
const SOFT_ACCENT_BORDER = "border-[#A8986D]/25";
const SOFT_ACCENT_RING = "ring-[#A8986D]/10";

const staggerTransition = {
  duration: 0.5,
  ease: [0.22, 1, 0.36, 1] as const,
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: staggerTransition },
};

const pillarContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

// ── Paid Member: Two pillars after profile ──────────────────────────────────
const PAID_PILLARS = {
  app: {
    title: "The App",
    icon: Smartphone,
    cards: [
      {
        title: "Geo-Suggest",
        subtitle: (
          <>
            Location-based lifestyle and itinerary suggestions via{" "}
            <span className="text-sky-600 font-medium">Indulge App</span>
          </>
        ),
      },
      {
        title: "The Shop",
        subtitle: (
          <>
            Personalized <TermTooltip term="joker">Joker</TermTooltip>{" "}
            recommendations from pens to villas
          </>
        ),
      },
      {
        title: "HNI Network",
        subtitle:
          "Connect and network with other ultra-high-net-worth individuals",
      },
      {
        title: "Live Dashboard",
        subtitle:
          "Track live tickets, ongoing concierge requests, balance, and historical impact metrics",
      },
    ],
  },
  concierge: {
    title: "Concierge",
    icon: MessageCircle,
    cards: [
      {
        title: "WhatsApp Group",
        subtitle: (
          <>
            Direct requests & wish fulfillment via{" "}
            <span className="text-teal-600 font-medium">WhatsApp</span>
          </>
        ),
      },
      {
        title: "Instagram Page",
        subtitle: (
          <>
            Exclusive daily <TermTooltip term="joker">Joker</TermTooltip>{" "}
            suggestions and luxury curation via{" "}
            <span className="text-rose-600 font-medium">Instagram</span>
          </>
        ),
      },
      {
        title: "Joker Spoiling Group",
        subtitle: (
          <>
            <TermTooltip term="joker">Jokers</TermTooltip> post daily
            suggestions based on profiled interests: Sports, Music, Food,
            Travel. Predictive curation based on special dates/anniversaries.
          </>
        ),
      },
    ],
  },
};

// ── Unpaid Prospect: Funnel steps ──────────────────────────────────────────
const UNPAID_STEPS = [
  {
    title: "Initial Data Profiling",
    subtitle: (
      <>
        <span className="text-violet-600 font-medium">Typeform</span> data
        collection to identify interests
      </>
    ),
  },
  {
    title: "WhatsApp Community",
    subtitle: (
      <>
        Access to the public shop community via{" "}
        <span className="text-teal-600 font-medium">WhatsApp</span> to view
        available products and demand
      </>
    ),
  },
  {
    title: "Public Social",
    subtitle: (
      <>
        Following Indulge public{" "}
        <span className="text-rose-600 font-medium">Instagram</span> pages
      </>
    ),
  },
  {
    title: "Shop App Access",
    subtitle: (
      <>
        Delayed/Restricted access to the marketplace via{" "}
        <span className="text-sky-600 font-medium">Indulge App</span> to drive
        FOMO and conversion
      </>
    ),
  },
];

function PillarCard({
  title,
  subtitle,
  variants = itemVariants,
}: {
  title: string;
  subtitle: React.ReactNode;
  variants?: typeof itemVariants;
}) {
  return (
    <motion.div
      variants={variants}
      className={`${PILLOWY_CARD} p-4 text-center`}
    >
      <h4 className="text-sm font-semibold text-stone-600">{title}</h4>
      <p className="text-xs text-stone-500/90 mt-1 leading-relaxed">
        {subtitle}
      </p>
    </motion.div>
  );
}

export function ClientJourneyView() {
  const [activeTab, setActiveTab] = useState<TabId>("paid");

  return (
    <div className="max-w-5xl mx-auto text-center w-full">
      <h2
        className={`text-xl md:text-2xl lg:text-3xl font-semibold ${SOFT_ACCENT} tracking-tight mb-1`}
      >
        The Client Journey
      </h2>
      <p className="text-sm text-stone-500/90 mb-8">
        How users interact with the Indulge ecosystem — from prospect to paid
        member
      </p>

      {/* Phase 1: Sub-navigation toggle */}
      <div className="flex justify-center mb-12">
        <div className="relative inline-flex items-center gap-0.5 p-1.5 rounded-2xl bg-stone-100/90 border border-stone-200 shadow-[0_2px_8px_rgb(0,0,0,0.06)]">
          <button
            onClick={() => setActiveTab("paid")}
            className="relative z-10 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors duration-300"
          >
            {activeTab === "paid" && (
              <motion.span
                layoutId="clientJourneyTab"
                className="absolute inset-0 rounded-xl bg-white shadow-[0_2px_6px_rgb(0,0,0,0.08)] ring-1 ring-stone-200/60"
                transition={{
                  type: "spring",
                  bounce: 0.15,
                  duration: 0.45,
                }}
              />
            )}
            <span
              className={`relative z-10 inline-flex items-center gap-2 ${
                activeTab === "paid"
                  ? "text-stone-800 font-semibold"
                  : "text-stone-600 hover:text-stone-700"
              }`}
            >
              <Crown strokeWidth={1} className="h-4 w-4 text-amber-800 shrink-0" />
              Paid Member
            </span>
          </button>
          <button
            onClick={() => setActiveTab("unpaid")}
            className="relative z-10 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors duration-300"
          >
            {activeTab === "unpaid" && (
              <motion.span
                layoutId="clientJourneyTab"
                className="absolute inset-0 rounded-xl bg-white shadow-[0_2px_6px_rgb(0,0,0,0.08)] ring-1 ring-stone-200/60"
                transition={{
                  type: "spring",
                  bounce: 0.15,
                  duration: 0.45,
                }}
              />
            )}
            <span
              className={`relative z-10 ${
                activeTab === "unpaid"
                  ? "text-stone-800 font-semibold"
                  : "text-stone-600 hover:text-stone-700"
              }`}
            >
              Unpaid
            </span>
          </button>
        </div>
      </div>

      {/* Phase 2 & 3: Content based on tab */}
      <AnimatePresence mode="wait">
        {activeTab === "paid" ? (
          <motion.div
            key="paid"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="relative"
          >
            {/* Apex — top center */}
            <motion.div
              variants={itemVariants}
              className="flex justify-center mb-4 md:mb-6"
            >
              <div
                className={`${PILLOWY_CARD} px-6 py-4 md:px-8 md:py-5 ${SOFT_ACCENT_BORDER} ${SOFT_ACCENT_RING} shadow-[0_0_24px_rgba(168,152,109,0.08)] w-full max-w-xl text-center`}
              >
                <h3 className={`text-base font-semibold ${SOFT_ACCENT}`}>
                  Client Entry & Elite Profiling
                </h3>
                <p className="text-xs text-stone-500 mt-1 flex items-center justify-center gap-1.5 flex-wrap">
                  <FileSpreadsheet
                    strokeWidth={1.5}
                    className="h-3.5 w-3.5 text-violet-400 shrink-0"
                  />
                  <span className="text-violet-600 font-medium">Typeform</span>{" "}
                  Data Capture &{" "}
                  <TermTooltip term="kingdom">Kingdom</TermTooltip> Assignment
                </p>
              </div>
            </motion.div>

            {/* Flow label — clear visual break; vertical connector on mobile, horizontal on desktop */}
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center justify-center my-8 md:my-12 lg:my-14 gap-4"
            >
              {/* Connector: vertical on mobile, horizontal on desktop */}
              <div
                className="w-px h-8 mx-auto lg:w-full lg:h-px lg:mx-0 border-stone-200/60 border-l lg:border-l-0 lg:border-t"
                aria-hidden
              />
              <span className="px-4 py-2 rounded-full bg-stone-100/80 text-xs font-medium text-stone-500 uppercase tracking-widest ring-1 ring-stone-200/40">
                Then access to
              </span>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <span className="px-5 py-2.5 rounded-xl bg-sky-50/90 text-sky-600 text-sm font-semibold ring-1 ring-sky-200/50">
                  The App
                </span>
                <span className="text-stone-300 font-light">+</span>
                <span className="px-5 py-2.5 rounded-xl bg-teal-50/90 text-teal-600 text-sm font-semibold ring-1 ring-teal-200/50">
                  Concierge
                </span>
              </div>
            </motion.div>

            {/* Two pillars: The App & Concierge — vertical on mobile, horizontal on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
              {/* Pillar 1: The App */}
              <motion.div
                variants={itemVariants}
                className="flex flex-col items-center"
              >
                <h4
                  className={`text-xs font-medium ${SOFT_ACCENT} uppercase tracking-wider mb-4 inline-flex items-center gap-2`}
                >
                  <Smartphone
                    strokeWidth={1.5}
                    className="h-3.5 w-3.5 text-sky-400 shrink-0"
                  />
                  {PAID_PILLARS.app.title}
                </h4>
                <motion.div
                  variants={pillarContainerVariants}
                  initial="hidden"
                  animate="show"
                  className="space-y-3 w-full"
                >
                  {PAID_PILLARS.app.cards.map((card, i) => (
                    <PillarCard
                      key={i}
                      title={card.title}
                      subtitle={card.subtitle}
                    />
                  ))}
                </motion.div>
              </motion.div>

              {/* Pillar 2: Concierge */}
              <motion.div
                variants={itemVariants}
                className="flex flex-col items-center"
              >
                <h4 className="text-xs font-medium text-stone-500/90 uppercase tracking-wider mb-4 inline-flex items-center gap-2">
                  <MessageCircle
                    strokeWidth={1.5}
                    className="h-3.5 w-3.5 text-teal-500 shrink-0"
                  />
                  {PAID_PILLARS.concierge.title}
                </h4>
                <motion.div
                  variants={pillarContainerVariants}
                  initial="hidden"
                  animate="show"
                  className="space-y-3 w-full"
                >
                  {PAID_PILLARS.concierge.cards.map((card, i) => (
                    <PillarCard
                      key={i}
                      title={card.title}
                      subtitle={card.subtitle}
                    />
                  ))}
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="unpaid"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="relative max-w-2xl mx-auto"
          >
            {/* Vertical connector — soft dashed with pulse (mobile-first stepping stones) */}
            <motion.div
              className="absolute left-[19px] top-6 bottom-24 w-px border-l-2 border-dashed border-stone-200/50"
              aria-hidden
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {UNPAID_STEPS.map((step, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                className="relative flex items-center gap-6 pb-8 last:pb-0"
              >
                <div className="relative z-10 flex-shrink-0 self-center">
                  <motion.div
                    className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md ${PILLOWY_CARD}`}
                    whileHover={{ scale: 1.05 }}
                  >
                    <span className="text-xs font-semibold text-stone-600">
                      {i + 1}
                    </span>
                  </motion.div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className={`${PILLOWY_CARD} p-5 text-center`}>
                    <h3 className="text-base font-semibold text-stone-600">
                      {step.title}
                    </h3>
                    <p className="text-sm text-stone-500/90 mt-1 leading-relaxed">
                      {step.subtitle}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Final conversion prompt */}
            <motion.div
              variants={itemVariants}
              className="relative flex items-center gap-6 mt-4"
            >
              <div className="relative z-10 flex-shrink-0 w-10">
                <div className="w-10 h-10 rounded-full bg-[#A8986D]/15 border border-[#A8986D]/30 flex items-center justify-center backdrop-blur-md" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div
                  className={`rounded-2xl ${SOFT_ACCENT_BG} ${SOFT_ACCENT_BORDER} backdrop-blur-md p-5 shadow-[0_0_24px_rgba(168,152,109,0.06)] ring-1 ${SOFT_ACCENT_RING} text-center`}
                >
                  <h3 className={`text-base font-semibold ${SOFT_ACCENT}`}>
                    AI-Driven Conversion to Paid
                  </h3>
                  <p className="text-sm text-stone-500/90 mt-1">
                    Targeted conversion prompts based on profiled interests and
                    engagement
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

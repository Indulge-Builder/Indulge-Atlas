"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { TermTooltip } from "./TermTooltip";

const PILLOWY_CARD =
  "rounded-2xl bg-white/90 backdrop-blur-2xl ring-1 ring-stone-200/50 border border-stone-100/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5";

const SOFT_ACCENT = "text-[#A8986D]";
const SOFT_ACCENT_BG = "bg-[#A8986D]/[0.08]";
const SOFT_ACCENT_BORDER = "border-[#A8986D]/25";
const SOFT_ACCENT_RING = "ring-[#A8986D]/10";

const ORIGINS = ["Meta", "Events", "Word of Mouth", "App"];

const LANE_A = [
  <>
    Access to Shop community via{" "}
    <span className="text-sky-600 font-medium">Indulge App</span>
  </>,
  <>
    Public <span className="text-rose-600 font-medium">Instagram</span> visibility
  </>,
  <>
    <span className="text-violet-600 font-medium">Typeform</span> profiling for AI
    conversion targeting
  </>,
];

const LANE_B = [
  <>
    Access to Private{" "}
    <span className="text-rose-600 font-medium">Instagram</span>
  </>,
  <>
    Full <span className="text-sky-600 font-medium">Indulge App</span> Shop access
  </>,
  <>
    <TermTooltip term="queendom">Queendom</TermTooltip> assignment
  </>,
  <>
    Deep <span className="text-violet-600 font-medium">Typeform</span> profiling for{" "}
    <TermTooltip term="joker">Joker</TermTooltip> personalization
  </>,
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

export function ClientOnboardingView() {
  return (
    <div className="max-w-4xl mx-auto text-center w-full">
      <h2 className={`text-lg font-semibold ${SOFT_ACCENT} tracking-tight mb-1`}>
        Split-Lane Flow
      </h2>
      <p className="text-sm text-stone-500/90 mb-10">
        Clients enter from multiple origins and flow into Unpaid or Paid lanes
      </p>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-8"
      >
        {/* Origin nodes */}
        <motion.div variants={item} className="flex flex-wrap gap-3 justify-center">
          <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">
            Origin
          </span>
          {ORIGINS.map((origin) => (
            <span
              key={origin}
              className="px-4 py-2 rounded-lg bg-white/90 text-sm text-stone-600 ring-1 ring-stone-200/50 border border-stone-100/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5"
            >
              {origin}
            </span>
          ))}
        </motion.div>

        {/* Split lanes */}
        <motion.div
          variants={item}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {/* Lane A — Unpaid */}
          <div className={`${PILLOWY_CARD} p-6 text-center`}>
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-stone-400/80" />
              <h3 className="text-sm font-semibold text-stone-600">
                Lane A — Unpaid
              </h3>
            </div>
            <ul className="space-y-2.5 flex flex-col items-center">
              {LANE_A.map((laneItem, i) => (
                <li
                  key={i}
                  className="flex items-center justify-center gap-2 text-sm text-stone-500/90 text-center"
                >
                  <span className="text-[#A8986D]/70 mt-0.5">•</span>
                  {laneItem}
                </li>
              ))}
            </ul>
          </div>

          {/* Lane B — Paid */}
          <div className={`rounded-2xl ${SOFT_ACCENT_BG} ${SOFT_ACCENT_BORDER} p-6 ring-1 ${SOFT_ACCENT_RING} shadow-[0_4px_20px_rgba(168,152,109,0.08)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] transition-all duration-300 hover:shadow-[0_8px_30px_rgba(168,152,109,0.1)] hover:-translate-y-0.5 text-center`}>
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[#A8986D]/80" />
              <h3 className={`text-sm font-semibold ${SOFT_ACCENT} flex items-center gap-2`}>
                <Crown strokeWidth={1.5} className="h-4 w-4" />
                Lane B — Paid
              </h3>
            </div>
            <ul className="space-y-2.5 flex flex-col items-center">
              {LANE_B.map((laneItem, i) => (
                <li
                  key={i}
                  className="flex items-center justify-center gap-2 text-sm text-stone-600/90 text-center"
                >
                  <span className={`${SOFT_ACCENT} mt-0.5`}>•</span>
                  {laneItem}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Flow connector visual — soft dashed with pulse */}
        <motion.div
          variants={item}
          className="flex justify-center py-4"
          aria-hidden
        >
          <motion.div
            className="h-px w-32 border-t-2 border-dashed border-stone-200/50"
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

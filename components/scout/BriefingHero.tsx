"use client";

import { motion } from "framer-motion";

interface BriefingHeroProps {
  greeting:       string;
  firstName:      string;
  summaryLine:    string;
  attentionCount: number;
}

// Renders summary with a gold-tinted span around the attention count.
function SummaryWithGoldNumbers({ text, count }: { text: string; count: number }) {
  return (
    <p className="text-[#7A7A7A] text-[14px] leading-relaxed max-w-2xl">
      {text}
      {count > 0 && (
        <>
          {" "}You have{" "}
          <span className="text-[#D4AF37] font-semibold">{count}</span>{" "}
          item{count > 1 ? "s" : ""} requiring attention.
        </>
      )}
      {count === 0 && (
        <>
          {" "}
          <span className="text-[#4A7C59]">Everything is running smoothly.</span>
        </>
      )}
    </p>
  );
}

export function BriefingHero({
  greeting,
  firstName,
  summaryLine,
  attentionCount,
}: BriefingHeroProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 pb-8 border-b border-[#EAEAE5]"
    >
      {/* Date pill */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="text-[10px] font-semibold text-[#B0ADA8] uppercase tracking-[0.28em] mb-4"
      >
        {new Date().toLocaleDateString("en-IN", {
          weekday: "long",
          day:     "numeric",
          month:   "long",
          year:    "numeric",
        })}
      </motion.p>

      {/* Main greeting */}
      <h1
        className="text-[#1A1A1A] text-[2.4rem] font-semibold tracking-tight leading-snug"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {greeting},{" "}
        <span className="text-[#1A1A1A]">{firstName}</span>
        <span className="text-[#D4AF37]">.</span>
      </h1>

      {/* Summary line */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.18 }}
        className="mt-2.5"
      >
        <SummaryWithGoldNumbers text={summaryLine} count={attentionCount} />
      </motion.div>
    </motion.div>
  );
}

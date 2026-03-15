"use client";

import { motion } from "framer-motion";

interface DailyAnchorProps {
  greeting:  string;
  firstName: string;
}

export function DailyAnchor({ greeting, firstName }: DailyAnchorProps) {
  return (
    <div className="px-7 py-7">
      {/* ── Greeting ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Date whisper */}
        <p className="text-[10px] font-semibold text-[#B0ADA8] uppercase tracking-[0.28em] mb-3">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day:     "numeric",
            month:   "long",
          })}
        </p>

        {/* Main greeting */}
        <h2
          className="text-[#1A1A1A] leading-tight"
          style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
            fontSize:   "clamp(1.5rem, 2.2vw, 2rem)",
            fontWeight: 400,
          }}
        >
          {greeting},{" "}
          <span className="text-[#1A1A1A]">{firstName}</span>
          <span className="text-[#D4AF37]">.</span>
        </h2>
      </motion.div>
    </div>
  );
}

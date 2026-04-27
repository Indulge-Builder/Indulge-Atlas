"use client";

import { motion } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatLeadSource } from "@/lib/utils/lead-source-mapper";
import type { WinEntry } from "@/lib/actions/manager-analytics";

// ── Helpers ───────────────────────────────────────────────────

function abbreviateName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function fmtInr(v: number | null): string {
  if (!v) return "—";
  if (v >= 10_00_000) return `₹${(v / 10_00_000).toFixed(2)}Cr`;
  if (v >= 1_00_000)  return `₹${(v / 1_00_000).toFixed(2)}L`;
  if (v >= 1_000)     return `₹${(v / 1_000).toFixed(0)}k`;
  return `₹${Math.round(v)}`;
}

// ── Component ─────────────────────────────────────────────────

interface ConversionFeedProps {
  recentWins: WinEntry[];
}

export function ConversionFeed({ recentWins }: ConversionFeedProps) {
  const totalValue = recentWins.reduce((s, w) => s + (w.deal_value ?? 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25, ease: "easeOut" }}
      className="bg-white border border-[#EAEAEA] rounded-2xl p-6 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3
            className="text-[#1A1A1A] font-semibold text-base"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Live Conversion Feed
          </h3>
          <p className="text-[#9E9E9E] text-xs mt-0.5">
            Most recent wins · latest closes first
          </p>
        </div>

        {/* Pulse indicator */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4A7C59] opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4A7C59]" />
          </span>
          <span className="text-[10px] text-[#4A7C59] font-medium">Live</span>
        </div>
      </div>

      {/* Win list */}
      <div className="flex-1 space-y-2.5">
        {recentWins.length === 0 ? (
          <p className="text-center text-[#9E9E9E] text-sm py-10">
            No recorded wins yet. Go close some deals!
          </p>
        ) : (
          recentWins.map((win, i) => {
            const { channel } = formatLeadSource(win.utm_source, win.utm_medium);

            return (
              <motion.div
                key={win.id}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.38,
                  delay: i * 0.07,
                  ease: "easeOut",
                }}
                className={cn(
                  "flex items-center gap-3 p-3.5 rounded-xl",
                  "bg-gradient-to-r from-[#FFFCF2] to-transparent",
                  "border border-[#F0E6C0]/60"
                )}
              >
                {/* ₹ badge */}
                <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[#D4AF37] text-sm font-bold">₹</span>
                </div>

                {/* Name + metadata */}
                <div className="flex-1 min-w-0">
                  <p className="text-[#1A1A1A] text-[13px] font-semibold leading-snug">
                    {abbreviateName((win.first_name + " " + (win.last_name ?? "")).trim())}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {channel && (
                      <span className="text-[10px] text-[#9E9E9E] truncate max-w-[80px]">
                        {channel}
                      </span>
                    )}
                    <span className="text-[#C8C8B8] text-[10px]">
                      {format(new Date(win.updated_at), "MMM d")}
                    </span>
                  </div>
                </div>

                {/* Deal value */}
                <p
                  className="text-[#D4AF37] font-semibold text-sm flex-shrink-0 tabular-nums"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {fmtInr(win.deal_value)}
                </p>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Total value footer */}
      {recentWins.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#F0EDE8] flex items-center justify-between">
          <span className="text-[10px] text-[#9E9E9E] uppercase tracking-wider">
            Combined value
          </span>
          <span
            className="text-[#D4AF37] text-sm font-semibold"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {fmtInr(totalValue)}
          </span>
        </div>
      )}
    </motion.div>
  );
}

"use client";

import { motion } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { RecentWin } from "@/lib/actions/performance";

// ── Formatters ────────────────────────────────────────────────

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

// ── Empty state ───────────────────────────────────────────────

function EmptyLedger() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10 gap-3">
      <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center">
        <span className="text-[#D4AF37] text-lg font-bold">₹</span>
      </div>
      <p className="text-[#9E9E9E] text-sm text-center leading-relaxed">
        No wins recorded yet.
        <br />
        Go close some deals!
      </p>
    </div>
  );
}

// ── Win row ───────────────────────────────────────────────────

function WinRow({ win, index }: { win: RecentWin; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      whileHover={{ x: -3, backgroundColor: "rgba(212, 175, 55, 0.05)" }}
      className={cn(
        "group flex items-center gap-3 px-3.5 py-3 rounded-xl",
        "transition-colors duration-150 cursor-default"
      )}
    >
      {/* Avatar initial */}
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-[#D4AF37]/10 border border-[#D4AF37]/20">
        <span
          className="text-[#D4AF37] text-xs font-semibold"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          {win.first_name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      </div>

      {/* Name + date */}
      <div className="flex-1 min-w-0">
        <p className="text-[#1A1A1A] text-[13px] font-semibold leading-tight truncate">
          {abbreviateName((win.first_name + " " + (win.last_name ?? "")).trim())}
        </p>
        <p className="text-[#B0ADA8] text-[10px] mt-0.5">
          {format(new Date(win.updated_at), "MMM d, yyyy")}
        </p>
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
}

// ── Component ─────────────────────────────────────────────────

interface RecentWinsLedgerProps {
  recentWins: RecentWin[];
  totalRevenue: number;
}

export function RecentWinsLedger({
  recentWins,
  totalRevenue,
}: RecentWinsLedgerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white border border-[#EAEAEA] rounded-2xl p-6 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3
            className="text-[#1A1A1A] font-semibold text-base"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Recent Wins
          </h3>
          <p className="text-[#9E9E9E] text-[12px] mt-0.5">
            Your latest successful closes
          </p>
        </div>

        {/* Live pulse */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D4AF37] opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#D4AF37]" />
          </span>
          <span className="text-[10px] text-[#D4AF37] font-medium uppercase tracking-[0.1em]">
            Live
          </span>
        </div>
      </div>

      {/* Column headers */}
      {recentWins.length > 0 && (
        <div className="flex items-center gap-3 px-3.5 mb-1">
          <div className="w-8 flex-shrink-0" />
          <p className="flex-1 text-[9px] uppercase tracking-[0.14em] text-[#C0BDB5]">
            Lead
          </p>
          <p className="text-[9px] uppercase tracking-[0.14em] text-[#C0BDB5] flex-shrink-0">
            Value
          </p>
        </div>
      )}

      {/* Win rows */}
      <div className="flex-1 space-y-0.5">
        {recentWins.length === 0 ? (
          <EmptyLedger />
        ) : (
          recentWins.map((win, i) => (
            <WinRow key={win.id} win={win} index={i} />
          ))
        )}
      </div>

      {/* Footer total */}
      {recentWins.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#F0EDE8] flex items-center justify-between">
          <span className="text-[9px] text-[#B0ADA8] uppercase tracking-[0.14em]">
            Total Closed
          </span>
          <span
            className="text-[#D4AF37] text-sm font-semibold"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {fmtInr(totalRevenue)}
          </span>
        </div>
      )}
    </motion.div>
  );
}

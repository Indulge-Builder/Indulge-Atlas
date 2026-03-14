"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AgentWithStats } from "@/lib/actions/team-stats";

// ── Avatar gradient palette ───────────────────────────────────
// Deterministic colour derived from the agent's first initial.

const GRADIENTS = [
  { from: "#D4AF37", to: "#A88B25" }, // gold
  { from: "#4A7C59", to: "#3A6249" }, // sage
  { from: "#2C6FAC", to: "#1E5A8E" }, // cobalt
  { from: "#6B4FBB", to: "#533B99" }, // plum
  { from: "#C5830A", to: "#9E6A08" }, // amber
  { from: "#7B5E52", to: "#5E4840" }, // terracotta
];

function pickGradient(name: string) {
  const idx = (name.charCodeAt(0) - 65 + 26) % GRADIENTS.length;
  return GRADIENTS[Math.abs(idx)];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Win-rate arc (SVG donut) ──────────────────────────────────

function WinRateArc({ rate }: { rate: number }) {
  const radius = 22;
  const stroke = 3;
  const norm = radius - stroke / 2;
  const circumference = 2 * Math.PI * norm;
  const filled = (Math.min(rate, 100) / 100) * circumference;

  return (
    <svg
      width={radius * 2 + 2}
      height={radius * 2 + 2}
      className="absolute -top-1 -right-1"
      style={{ transform: "rotate(-90deg)" }}
    >
      {/* Track */}
      <circle
        cx={radius + 1}
        cy={radius + 1}
        r={norm}
        fill="none"
        stroke="#E8E8E0"
        strokeWidth={stroke}
      />
      {/* Fill */}
      <circle
        cx={radius + 1}
        cy={radius + 1}
        r={norm}
        fill="none"
        stroke="#D4AF37"
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Card ──────────────────────────────────────────────────────

interface AgentCardProps {
  agent: AgentWithStats;
  index: number;
  onClick: (agent: AgentWithStats) => void;
}

export function AgentCard({ agent, index, onClick }: AgentCardProps) {
  const grad = pickGradient(agent.full_name);
  const initials = getInitials(agent.full_name);
  const firstName = agent.full_name.split(" ")[0];
  const winRate = agent.stats.winRate;
  const totalLeads = agent.stats.totalLeads;
  const wonLeads = agent.stats.byStatus["won"] ?? 0;
  const activeLeads =
    (agent.stats.byStatus["in_discussion"] ?? 0) +
    (agent.stats.byStatus["connected"] ?? 0) +
    (agent.stats.byStatus["attempted"] ?? 0) +
    (agent.stats.byStatus["new"] ?? 0);

  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.07, ease: "easeOut" }}
      whileHover={{ y: -3, boxShadow: "0 12px 40px rgba(0,0,0,0.10)" }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(agent)}
      className={cn(
        "relative group w-full text-left",
        "bg-white border border-[#EAEAEA] rounded-2xl p-6",
        "transition-colors duration-200 hover:border-[#D4AF37]/30",
        "cursor-pointer overflow-hidden"
      )}
    >
      {/* Subtle gold glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-[#D4AF37]/[0.03] to-transparent pointer-events-none rounded-2xl" />

      {/* Avatar + win-rate arc */}
      <div className="relative w-14 h-14 mb-5">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-semibold text-lg"
          style={{
            background: `linear-gradient(135deg, ${grad.from}99, ${grad.to}cc)`,
          }}
        >
          {initials}
        </div>
        <WinRateArc rate={winRate} />
      </div>

      {/* Name */}
      <p
        className="text-[#1A1A1A] text-base font-semibold leading-snug mb-0.5"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        {firstName}
      </p>
      <p className="text-[#9E9E9E] text-xs mb-4 truncate">
        {agent.full_name.split(" ").slice(1).join(" ") || "Agent"}
      </p>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-[#1A1A1A] text-sm font-semibold">{totalLeads}</p>
          <p className="text-[#C0BDB5] text-[9px] mt-0.5 uppercase tracking-[0.1em]">
            Total
          </p>
        </div>
        <div className="text-center border-x border-[#F0EDE8]">
          <p className="text-[#4A7C59] text-sm font-semibold">{wonLeads}</p>
          <p className="text-[#C0BDB5] text-[9px] mt-0.5 uppercase tracking-[0.1em]">
            Won
          </p>
        </div>
        <div className="text-center">
          <p className="text-[#2C6FAC] text-sm font-semibold">{activeLeads}</p>
          <p className="text-[#C0BDB5] text-[9px] mt-0.5 uppercase tracking-[0.1em]">
            Active
          </p>
        </div>
      </div>

      {/* Win rate — number leads, tiny label below */}
      <div className="mt-4 pt-4 border-t border-[#F0EDE8] flex items-baseline justify-between">
        <p
          className="text-[#1A1A1A] text-[1.4rem] font-semibold leading-none"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          {winRate.toFixed(1)}
          <span className="text-[13px] font-normal text-[#9E9E9E] ml-px">%</span>
        </p>
        <p className="text-[9px] text-[#C0BDB5] uppercase tracking-[0.16em]">
          Win Rate
        </p>
      </div>
    </motion.button>
  );
}

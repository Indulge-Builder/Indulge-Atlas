"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, TrendingUp, Target, IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentWithStats } from "@/lib/actions/team-stats";

// ── Animated progress bar ─────────────────────────────────────

function GoldProgressBar({
  value,
  max,
  delay = 0,
}: {
  value: number;
  max: number;
  delay?: number;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1 w-full bg-[#1A1A1A]/[0.08] rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1.1, ease: "easeOut", delay }}
        className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-[#A88B25]"
      />
    </div>
  );
}

// ── Metric row ────────────────────────────────────────────────

function MetricRow({
  icon,
  label,
  primary,
  secondary,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-[#F4F4F0] border border-[#EAEAEA] flex items-center justify-center">
          {icon}
        </div>
        <p className="text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider">
          {label}
        </p>
      </div>
      <div className="pl-10">
        <p
          className="text-[#1A1A1A] text-2xl font-semibold"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          {primary}
        </p>
        {secondary && (
          <p className="text-[#9E9E9E] text-xs mt-0.5">{secondary}</p>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────

interface AgentPerformanceModalProps {
  agent: AgentWithStats | null;
  onClose: () => void;
}

function formatInr(value: number): string {
  if (value >= 10_00_000)
    return `₹${(value / 10_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000)
    return `₹${(value / 1_00_000).toFixed(2)}L`;
  if (value >= 1_000)
    return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

export function AgentPerformanceModal({
  agent,
  onClose,
}: AgentPerformanceModalProps) {
  if (!agent) return null;

  const stats = agent.stats;
  const total = stats.totalLeads;
  const won = stats.byStatus["won"] ?? 0;
  const inDiscussion = stats.byStatus["in_discussion"] ?? 0;
  const attempted = stats.byStatus["attempted"] ?? 0;
  const active = inDiscussion + attempted;

  return (
    <AnimatePresence>
      {agent && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "w-full max-w-md bg-white rounded-3xl overflow-hidden",
              "shadow-[0_32px_80px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.06)]"
            )}
          >
            {/* Header band */}
            <div className="relative bg-[#0D0C0A] px-7 pt-7 pb-10">
              {/* Subtle gold glow */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

              <button
                onClick={onClose}
                className="absolute top-5 right-5 p-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white/50 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Avatar */}
              <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/30 flex items-center justify-center mb-4">
                <span
                  className="text-[#D4AF37] text-lg font-semibold"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {agent.full_name
                    .split(" ")
                    .slice(0, 2)
                    .map((n) => n[0]?.toUpperCase())
                    .join("")}
                </span>
              </div>

              <h2
                className="text-white text-xl font-semibold leading-snug"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {agent.full_name}
              </h2>
              <p className="text-white/40 text-xs mt-1 capitalize tracking-wider">
                Onboarding Scout
              </p>

              {/* Win-rate pill */}
              <div className="absolute bottom-0 right-7 translate-y-1/2">
                <div className="bg-white border border-[#EAEAEA] rounded-full px-4 py-1.5 shadow-sm">
                  <span className="text-[#1A1A1A] text-xs font-semibold">
                    {stats.winRate.toFixed(1)}% win rate
                  </span>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="px-7 pt-10 pb-7 space-y-7">
              {/* Pipeline health */}
              <MetricRow
                icon={<Target className="w-3.5 h-3.5 text-[#6B4FBB]" />}
                label="Pipeline Health"
                primary={`${active} active`}
                secondary={`${inDiscussion} in discussion · ${attempted} attempted`}
              >
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex justify-between text-[10px] text-[#9E9E9E]">
                    <span>In Discussion</span>
                    <span>{inDiscussion} leads</span>
                  </div>
                  <GoldProgressBar
                    value={inDiscussion}
                    max={total || 1}
                    delay={0.1}
                  />
                  <div className="flex justify-between text-[10px] text-[#9E9E9E] pt-1">
                    <span>Attempted</span>
                    <span>{attempted} leads</span>
                  </div>
                  <GoldProgressBar
                    value={attempted}
                    max={total || 1}
                    delay={0.2}
                  />
                </div>
              </MetricRow>

              {/* Divider */}
              <div className="h-px bg-[#F0EDE8]" />

              {/* Conversion power */}
              <MetricRow
                icon={<TrendingUp className="w-3.5 h-3.5 text-[#4A7C59]" />}
                label="Conversion Power"
                primary={`${won} / ${total}`}
                secondary={`${total - won} still in pipeline or lost`}
              >
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex justify-between text-[10px] text-[#9E9E9E]">
                    <span>Won leads</span>
                    <span>{won} of {total}</span>
                  </div>
                  <GoldProgressBar value={won} max={total || 1} delay={0.3} />
                </div>
              </MetricRow>

              {/* Divider */}
              <div className="h-px bg-[#F0EDE8]" />

              {/* Revenue */}
              <MetricRow
                icon={<IndianRupee className="w-3.5 h-3.5 text-[#D4AF37]" />}
                label="Revenue Generated"
                primary={formatInr(stats.wonRevenue)}
                secondary="Sum of deal_value across all won leads"
              />
            </div>

            {/* Footer */}
            <div className="px-7 pb-7 pt-0">
              <button
                onClick={onClose}
                className={cn(
                  "w-full py-2.5 rounded-xl text-sm font-medium",
                  "bg-[#F4F4F0] hover:bg-[#EAEAE4] text-[#1A1A1A]/60",
                  "transition-colors duration-150"
                )}
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

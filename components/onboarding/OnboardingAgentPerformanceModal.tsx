"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  TrendingUp,
  Phone,
  AlertCircle,
  Zap,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentWithOnboardingStats } from "@/lib/actions/team-stats";

interface OnboardingAgentPerformanceModalProps {
  agent: AgentWithOnboardingStats | null;
  onClose: () => void;
}

function formatInr(value: number): string {
  if (value >= 10_00_000) return `₹${(value / 10_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function OnboardingAgentPerformanceModal({
  agent,
  onClose,
}: OnboardingAgentPerformanceModalProps) {
  if (!agent) return null;

  const stats = agent.stats;
  const won = stats.byStatus["won"] ?? 0;

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]"
          onClick={onClose}
        />

        {/* Panel — bottom sheet on mobile, centered on desktop */}
        <motion.div
          key="panel"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "fixed z-50 inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2",
            "w-full md:w-[min(480px,calc(100vw-2rem))] max-h-[85vh]",
            "bg-white rounded-t-3xl md:rounded-2xl overflow-hidden flex flex-col",
            "shadow-[0_24px_60px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)]"
          )}
        >
          {/* Drag handle — mobile only */}
          <div className="block md:hidden w-12 h-1.5 bg-stone-300 rounded-full mx-auto mt-4 mb-2 flex-shrink-0" aria-hidden />
          {/* Header — fixed */}
          <div className="relative bg-stone-900 px-6 pt-6 pb-7 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/8 hover:bg-white/14 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-stone-700 flex items-center justify-center text-stone-300 text-sm font-semibold">
                {getInitials(agent.full_name)}
              </div>
              <div>
                <h2
                  className="text-white text-base font-semibold leading-snug"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {agent.full_name}
                </h2>
                <p className="text-stone-400 text-xs mt-0.5 capitalize">
                  {agent.role === "scout" ? "Scout" : "Sales Agent"}
                </p>
              </div>
            </div>
          </div>

          {/* Content — scrollable */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
            {/* Today's Hustle */}
            <section>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">
                  Today&apos;s Hustle
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-stone-50/80 p-3.5 ring-1 ring-stone-200/40">
                  <p className="text-stone-500 text-[11px] uppercase tracking-wider">Leads</p>
                  <p className="text-stone-900 text-lg font-semibold tabular-nums mt-1">
                    {stats.todayLeads}
                  </p>
                </div>
                <div className="rounded-xl bg-stone-50/80 p-3.5 ring-1 ring-stone-200/40">
                  <p className="text-stone-500 text-[11px] uppercase tracking-wider">Calls</p>
                  <p className="text-stone-900 text-lg font-semibold tabular-nums mt-1">
                    {stats.todayCalls}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50/80 p-3.5 ring-1 ring-emerald-200/40">
                  <p className="text-emerald-600 text-[11px] uppercase tracking-wider">Converted</p>
                  <p className="text-emerald-700 text-lg font-semibold tabular-nums mt-1">
                    {stats.todayConverted}
                  </p>
                </div>
              </div>
            </section>

            {/* Monthly Impact */}
            <section>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-violet-600" />
                </div>
                <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">
                  Monthly Impact
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-stone-50/80 p-3.5 ring-1 ring-stone-200/40">
                  <p className="text-stone-500 text-[11px] uppercase tracking-wider">Attended</p>
                  <p className="text-stone-900 text-lg font-semibold tabular-nums mt-1">
                    {stats.totalLeads}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50/80 p-3.5 ring-1 ring-emerald-200/40">
                  <p className="text-emerald-600 text-[11px] uppercase tracking-wider">Won</p>
                  <p className="text-emerald-700 text-lg font-semibold tabular-nums mt-1">
                    {won}
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50/80 p-3.5 ring-1 ring-amber-200/40">
                  <p className="text-amber-600 text-[11px] uppercase tracking-wider">Revenue</p>
                  <p className="text-amber-700 text-lg font-semibold tabular-nums mt-1">
                    {formatInr(stats.wonRevenue)}
                  </p>
                </div>
              </div>
            </section>

            {/* Deeper Metrics */}
            <section>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-sky-600" />
                </div>
                <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">
                  Deeper Metrics
                </h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl bg-stone-50/80 px-4 py-3 ring-1 ring-stone-200/40">
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-stone-500" />
                    <span className="text-stone-600 text-sm">Calls This Month</span>
                  </div>
                  <span className="text-stone-900 font-semibold tabular-nums text-base">
                    {stats.monthCalls}
                  </span>
                </div>
              </div>
            </section>

            {/* Lost Deal Reasons */}
            {stats.lostReasons.length > 0 && (
              <section>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  </div>
                  <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">
                    Lost Deal Reasons
                  </h3>
                </div>
                <div className="space-y-2">
                  {stats.lostReasons.map(({ reason, count }) => (
                    <div
                      key={reason}
                      className="flex items-center justify-between rounded-xl bg-stone-50/80 px-4 py-3 ring-1 ring-stone-200/40"
                    >
                      <span className="text-stone-600 text-sm">{reason}</span>
                      <span className="text-stone-900 font-semibold tabular-nums text-sm">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Footer — fixed */}
          <div className="px-6 pb-6 pt-3 shrink-0 border-t border-stone-100">
            <button
              onClick={onClose}
              className={cn(
                "w-full py-2 rounded-xl text-sm font-medium",
                "bg-stone-100 hover:bg-stone-200/80 text-stone-700",
                "transition-colors duration-150"
              )}
            >
              Close
            </button>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}

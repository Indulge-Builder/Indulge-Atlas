"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, TrendingUp, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MarketingAgent {
  id: string;
  name: string;
  postsCreated: number;
  avgEngagement: number;
  campaignsManaged: number;
  avatar: string;
}

interface MarketingAgentPerformanceModalProps {
  agent: MarketingAgent | null;
  onClose: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function MarketingAgentPerformanceModal({
  agent,
  onClose,
}: MarketingAgentPerformanceModalProps) {
  if (!agent) return null;

  return (
    <AnimatePresence>
      <>
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]"
          onClick={onClose}
        />

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
            "shadow-[0_24px_60px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)]",
            "ring-1 ring-stone-200/50",
          )}
        >
          {/* Drag handle — mobile only */}
          <div className="block md:hidden w-12 h-1.5 bg-stone-300 rounded-full mx-auto mt-4 mb-2 flex-shrink-0" aria-hidden />
          {/* Header — matches Onboarding/Shop */}
          <div className="relative bg-stone-900 px-6 pt-6 pb-7 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/8 hover:bg-white/14 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-stone-700 flex items-center justify-center text-stone-300 text-sm font-semibold">
                {getInitials(agent.name)}
              </div>
              <div>
                <h2
                  className="text-white text-base font-semibold leading-snug"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {agent.name}
                </h2>
                <p className="text-stone-400 text-xs mt-0.5">
                  Marketing Team
                </p>
              </div>
            </div>
          </div>

          {/* Content — scrollable */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
            {/* Content Metrics */}
            <section>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-rose-600" />
                </div>
                <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">
                  Content Output
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-stone-50/80 p-3.5 ring-1 ring-stone-200/40">
                  <p className="text-stone-500 text-[11px] uppercase tracking-wider">
                    Posts Created
                  </p>
                  <p className="text-stone-900 text-lg font-semibold tabular-nums mt-1">
                    {agent.postsCreated}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50/80 p-3.5 ring-1 ring-emerald-200/40">
                  <p className="text-emerald-600 text-[11px] uppercase tracking-wider">
                    Avg Engagement
                  </p>
                  <p className="text-emerald-700 text-lg font-semibold tabular-nums mt-1">
                    {agent.avgEngagement}%
                  </p>
                </div>
                <div className="rounded-xl bg-violet-50/80 p-3.5 ring-1 ring-violet-200/40">
                  <p className="text-violet-600 text-[11px] uppercase tracking-wider">
                    Campaigns
                  </p>
                  <p className="text-violet-700 text-lg font-semibold tabular-nums mt-1">
                    {agent.campaignsManaged}
                  </p>
                </div>
              </div>
            </section>

            {/* Campaign Highlights */}
            <section>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">
                  Recent Campaigns
                </h3>
              </div>
              <div className="space-y-2">
                {[
                  { name: "Monaco F1 Campaign", status: "Live" },
                  { name: "Rolex Curation Posts", status: "Completed" },
                ].map((campaign, i) => (
                  <div
                    key={campaign.name}
                    className="flex items-center justify-between rounded-xl bg-stone-50/80 px-4 py-3 ring-1 ring-stone-200/40"
                  >
                    <span className="text-stone-700 text-sm">{campaign.name}</span>
                    <span
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-medium",
                        campaign.status === "Live"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-stone-200/80 text-stone-600",
                      )}
                    >
                      {campaign.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Engagement Trend */}
            <section>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-sky-600" />
                </div>
                <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">
                  Engagement Trend
                </h3>
              </div>
              <div className="rounded-xl bg-stone-50/80 p-5 ring-1 ring-stone-200/40">
                <p className="text-stone-600 text-sm tabular-nums">
                  Last 7 days avg: {agent.avgEngagement}% engagement rate
                </p>
                <div className="mt-4 h-10 flex items-end gap-1.5">
                  {[40, 55, 48, 72, 65, 82, agent.avgEngagement * 15].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-sky-200/60 min-h-[4px]"
                      style={{ height: `${Math.min(h, 100)}%` }}
                    />
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-3 shrink-0 border-t border-stone-100">
            <button
              onClick={onClose}
              className={cn(
                "w-full py-2 rounded-xl text-sm font-medium",
                "bg-stone-100 hover:bg-stone-200/80 text-stone-700",
                "transition-colors duration-150",
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

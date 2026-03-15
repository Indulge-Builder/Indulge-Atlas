"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  TrendingUp,
  Package,
  IndianRupee,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ShopAgent {
  id: string;
  name: string;
  leadsCalled: number;
  ordersSourced: number;
  revenue: number;
  avatarColor: string;
}

interface ShopAgentModalProps {
  agent: ShopAgent | null;
  onClose: () => void;
}

function formatInr(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
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

// Mock sourcing timeline for the selected agent
const MOCK_SOURCING_TIMELINE: Record<
  string,
  { item: string; status: string; days: number }[]
> = {
  vikram: [
    { item: "Rolex Daytona", status: "Sourcing", days: 3 },
    { item: "Hermès Birkin", status: "In Transit", days: 5 },
    { item: "Patek Nautilus", status: "Fulfilled", days: 12 },
  ],
  harsh: [
    { item: "Coldplay VIP", status: "Fulfilled", days: 8 },
    { item: "Amanbagh Villa", status: "Fulfilled", days: 6 },
    { item: "Taylor Swift VIP", status: "Sourcing", days: 2 },
  ],
  katya: [
    { item: "Chanel Classic Flap", status: "In Transit", days: 4 },
    { item: "Bottega Veneta Bag", status: "Sourcing", days: 1 },
  ],
  nikita: [
    { item: "Louis Vuitton Capucines", status: "Fulfilled", days: 10 },
    { item: "Cartier Love Bracelet", status: "Sourcing", days: 5 },
  ],
};

export function ShopAgentModal({ agent, onClose }: ShopAgentModalProps) {
  if (!agent) return null;

  const timeline = MOCK_SOURCING_TIMELINE[agent.id] ?? [];
  const conversionRate =
    agent.leadsCalled > 0
      ? ((agent.ordersSourced / agent.leadsCalled) * 100).toFixed(1)
      : "0";

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
            "fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-[min(480px,calc(100vw-2rem))] max-h-[85vh]",
            "bg-white rounded-2xl overflow-hidden flex flex-col",
            "shadow-[0_24px_60px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)]",
            "ring-1 ring-stone-200/50"
          )}
        >
          {/* Header */}
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
                <h2 className="text-white text-base font-medium leading-snug">
                  {agent.name}
                </h2>
                <p className="text-stone-400 text-xs mt-0.5">
                  Shop Procurer & Sales
                </p>
              </div>
            </div>
          </div>

          {/* Content — scrollable */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
            {/* Conversion Metrics */}
            <section>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">
                  Conversion Metrics
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-stone-50/80 p-3.5 ring-1 ring-stone-200/40">
                  <p className="text-stone-500 text-[11px] uppercase tracking-wider">
                    Leads Called
                  </p>
                  <p className="text-stone-900 text-lg font-semibold tabular-nums mt-1">
                    {agent.leadsCalled}
                  </p>
                </div>
                <div className="rounded-xl bg-sky-50/80 p-3.5 ring-1 ring-sky-200/40">
                  <p className="text-sky-600 text-[11px] uppercase tracking-wider">
                    Orders Sourced
                  </p>
                  <p className="text-sky-700 text-lg font-semibold tabular-nums mt-1">
                    {agent.ordersSourced}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50/80 p-3.5 ring-1 ring-emerald-200/40">
                  <p className="text-emerald-600 text-[11px] uppercase tracking-wider">
                    Conv. Rate
                  </p>
                  <p className="text-emerald-700 text-lg font-semibold tabular-nums mt-1">
                    {conversionRate}%
                  </p>
                </div>
              </div>
            </section>

            {/* Revenue */}
            <section>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <IndianRupee className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">
                  Revenue (This Period)
                </h3>
              </div>
              <div className="rounded-xl bg-amber-50/80 p-5 ring-1 ring-amber-200/40">
                <p className="text-amber-700 text-2xl font-semibold tabular-nums tracking-tight">
                  {formatInr(agent.revenue)}
                </p>
              </div>
            </section>

            {/* Sourcing Timeline */}
            <section>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-violet-600" />
                </div>
                <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">
                  Active Sourcing Timeline
                </h3>
              </div>
              <div className="space-y-2">
                {timeline.length === 0 ? (
                  <p className="text-stone-500 text-sm py-3">
                    No active sourcing items.
                  </p>
                ) : (
                  timeline.map((entry, i) => (
                    <div
                      key={`${entry.item}-${i}`}
                      className="flex items-center justify-between rounded-xl bg-stone-50/80 px-4 py-3 ring-1 ring-stone-200/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Package className="w-4 h-4 text-stone-500 shrink-0" />
                        <span className="text-stone-700 text-sm truncate">
                          {entry.item}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-md text-xs font-medium",
                            entry.status === "Fulfilled" &&
                              "bg-emerald-50 text-emerald-700",
                            entry.status === "In Transit" &&
                              "bg-blue-50 text-blue-700",
                            entry.status === "Sourcing" &&
                              "bg-amber-50 text-amber-700"
                          )}
                        >
                          {entry.status}
                        </span>
                        <span className="text-stone-500 text-sm tabular-nums font-semibold">
                          {entry.days}d
                        </span>
                      </div>
                    </div>
                  ))
                )}
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

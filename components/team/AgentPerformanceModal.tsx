"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  TrendingUp,
  Phone,
  AlertCircle,
  Zap,
  Calendar,
  FileText,
  BarChart3,
  Package,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAgentPerformanceById } from "@/lib/actions/team-stats";
import type { AgentWithOnboardingStats } from "@/lib/actions/team-stats";
import { Skeleton } from "@/components/ui/skeleton";

// ── Mock agent types (Shop/Marketing use mock data until APIs exist) ──

export interface MarketingAgentData {
  id: string;
  name: string;
  postsCreated: number;
  avgEngagement: number;
  campaignsManaged: number;
  avatar: string;
}

export interface ShopAgentData {
  id: string;
  name: string;
  leadsCalled: number;
  ordersSourced: number;
  revenue: number;
  avatarColor: string;
}

export type AgentPerformanceData =
  | AgentWithOnboardingStats
  | MarketingAgentData
  | ShopAgentData;

function isOnboardingAgent(
  d: AgentPerformanceData
): d is AgentWithOnboardingStats {
  return "stats" in d && "byStatus" in (d as AgentWithOnboardingStats).stats;
}

function isMarketingAgent(d: AgentPerformanceData): d is MarketingAgentData {
  return "postsCreated" in d;
}

function isShopAgent(d: AgentPerformanceData): d is ShopAgentData {
  return "leadsCalled" in d;
}

// ── Props ─────────────────────────────────────────────────────

export interface AgentPerformanceModalProps {
  /** When set, modal is open and fetches agent data by ID (for scout/onboarding) */
  agentId: string | null;
  onClose: () => void;
  /** Optional pre-fetched data; when provided, skips fetch (for mock/legacy contexts) */
  agentData?: AgentPerformanceData | null;
}

function formatInr(value: number): string {
  if (value >= 10_00_000) return `₹${(value / 10_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

function formatInrShop(value: number): string {
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

// ── Skeleton loader (Light Quiet Luxury) ───────────────────────

function ModalSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="relative bg-stone-900 px-6 pt-6 pb-7 shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-xl bg-stone-700/50" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32 bg-stone-600/40" />
            <Skeleton className="h-3 w-20 bg-stone-600/30" />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-stone-100" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-stone-100" />
          ))}
        </div>
        <Skeleton className="h-14 rounded-xl bg-stone-100 w-full" />
      </div>
      <div className="px-6 pb-6 pt-3 shrink-0 border-t border-stone-100">
        <Skeleton className="h-10 rounded-xl w-full bg-stone-100" />
      </div>
    </div>
  );
}

// ── Modal content (when agent is loaded) ────────────────────────

function ModalContent({
  agent,
  onClose,
}: {
  agent: AgentWithOnboardingStats;
  onClose: () => void;
}) {
  const stats = agent.stats;
  const won = stats.byStatus["won"] ?? 0;

  return (
    <>
      {/* Drag handle — mobile only */}
      <div
        className="block md:hidden w-12 h-1.5 bg-stone-300 rounded-full mx-auto mt-4 mb-2 shrink-0"
        aria-hidden
      />
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
              <p className="text-stone-500 text-[11px] uppercase tracking-wider">
                Leads
              </p>
              <p className="text-stone-900 text-lg font-semibold tabular-nums mt-1">
                {stats.todayLeads}
              </p>
            </div>
            <div className="rounded-xl bg-stone-50/80 p-3.5 ring-1 ring-stone-200/40">
              <p className="text-stone-500 text-[11px] uppercase tracking-wider">
                Calls
              </p>
              <p className="text-stone-900 text-lg font-semibold tabular-nums mt-1">
                {stats.todayCalls}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50/80 p-3.5 ring-1 ring-emerald-200/40">
              <p className="text-emerald-600 text-[11px] uppercase tracking-wider">
                Converted
              </p>
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
              <p className="text-stone-500 text-[11px] uppercase tracking-wider">
                Attended
              </p>
              <p className="text-stone-900 text-lg font-semibold tabular-nums mt-1">
                {stats.totalLeads}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50/80 p-3.5 ring-1 ring-emerald-200/40">
              <p className="text-emerald-600 text-[11px] uppercase tracking-wider">
                Won
              </p>
              <p className="text-emerald-700 text-lg font-semibold tabular-nums mt-1">
                {won}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50/80 p-3.5 ring-1 ring-amber-200/40">
              <p className="text-amber-600 text-[11px] uppercase tracking-wider">
                Revenue
              </p>
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
            <div className="flex items-center justify-between rounded-xl bg-stone-50/80 px-4 py-3 ring-1 ring-stone-200/40">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-stone-500" />
                <span className="text-stone-600 text-sm">Win Rate</span>
              </div>
              <span className="text-stone-900 font-semibold tabular-nums text-base">
                {stats.winRate.toFixed(1)}%
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
    </>
  );
}

// ── Marketing content (mock data) ──────────────────────────────

function ModalMarketingContent({
  agent,
  onClose,
}: {
  agent: MarketingAgentData;
  onClose: () => void;
}) {
  const MOCK_CAMPAIGNS = [
    { name: "Monaco F1 Campaign", status: "Live" },
    { name: "Rolex Curation Posts", status: "Completed" },
  ];

  return (
    <>
      <div className="block md:hidden w-12 h-1.5 bg-stone-300 rounded-full mx-auto mt-4 mb-2 shrink-0" aria-hidden />
      <div className="relative bg-stone-900 px-6 pt-6 pb-7 shrink-0">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full bg-white/8 hover:bg-white/14 text-white/50 hover:text-white transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-stone-700 flex items-center justify-center text-stone-300 text-sm font-semibold">
            {getInitials(agent.name)}
          </div>
          <div>
            <h2 className="text-white text-base font-semibold leading-snug" style={{ fontFamily: "var(--font-playfair)" }}>
              {agent.name}
            </h2>
            <p className="text-stone-400 text-xs mt-0.5">Marketing Team</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
        <section>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-rose-600" />
            </div>
            <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">Content Output</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-stone-50/80 p-3.5 ring-1 ring-stone-200/40">
              <p className="text-stone-500 text-[11px] uppercase tracking-wider">Posts Created</p>
              <p className="text-stone-900 text-lg font-semibold tabular-nums mt-1">{agent.postsCreated}</p>
            </div>
            <div className="rounded-xl bg-emerald-50/80 p-3.5 ring-1 ring-emerald-200/40">
              <p className="text-emerald-600 text-[11px] uppercase tracking-wider">Avg Engagement</p>
              <p className="text-emerald-700 text-lg font-semibold tabular-nums mt-1">{agent.avgEngagement}%</p>
            </div>
            <div className="rounded-xl bg-violet-50/80 p-3.5 ring-1 ring-violet-200/40">
              <p className="text-violet-600 text-[11px] uppercase tracking-wider">Campaigns</p>
              <p className="text-violet-700 text-lg font-semibold tabular-nums mt-1">{agent.campaignsManaged}</p>
            </div>
          </div>
        </section>
        <section>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">Recent Campaigns</h3>
          </div>
          <div className="space-y-2">
            {MOCK_CAMPAIGNS.map((c) => (
              <div key={c.name} className="flex items-center justify-between rounded-xl bg-stone-50/80 px-4 py-3 ring-1 ring-stone-200/40">
                <span className="text-stone-700 text-sm">{c.name}</span>
                <span className={cn("px-2.5 py-1 rounded-md text-xs font-medium", c.status === "Live" ? "bg-emerald-50 text-emerald-700" : "bg-stone-200/80 text-stone-600")}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-sky-600" />
            </div>
            <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">Engagement Trend</h3>
          </div>
          <div className="rounded-xl bg-stone-50/80 p-5 ring-1 ring-stone-200/40">
            <p className="text-stone-600 text-sm tabular-nums">Last 7 days avg: {agent.avgEngagement}% engagement rate</p>
            <div className="mt-4 h-10 flex items-end gap-1.5">
              {[40, 55, 48, 72, 65, 82, agent.avgEngagement * 15].map((h, i) => (
                <div key={i} className="flex-1 rounded-sm bg-sky-200/60 min-h-[4px]" style={{ height: `${Math.min(h, 100)}%` }} />
              ))}
            </div>
          </div>
        </section>
      </div>
      <div className="px-6 pb-6 pt-3 shrink-0 border-t border-stone-100">
        <button onClick={onClose} className={cn("w-full py-2 rounded-xl text-sm font-medium", "bg-stone-100 hover:bg-stone-200/80 text-stone-700", "transition-colors duration-150")}>
          Close
        </button>
      </div>
    </>
  );
}

// ── Shop content (mock data) ───────────────────────────────────

const MOCK_SOURCING_TIMELINE: Record<string, { item: string; status: string; days: number }[]> = {
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

function ModalShopContent({ agent, onClose }: { agent: ShopAgentData; onClose: () => void }) {
  const timeline = MOCK_SOURCING_TIMELINE[agent.id] ?? [];
  const conversionRate = agent.leadsCalled > 0 ? ((agent.ordersSourced / agent.leadsCalled) * 100).toFixed(1) : "0";

  return (
    <>
      <div className="block md:hidden w-12 h-1.5 bg-stone-300 rounded-full mx-auto mt-4 mb-2 shrink-0" aria-hidden />
      <div className="relative bg-stone-900 px-6 pt-6 pb-7 shrink-0">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full bg-white/8 hover:bg-white/14 text-white/50 hover:text-white transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-stone-700 flex items-center justify-center text-stone-300 text-sm font-semibold">
            {getInitials(agent.name)}
          </div>
          <div>
            <h2 className="text-white text-base font-medium leading-snug">{agent.name}</h2>
            <p className="text-stone-400 text-xs mt-0.5">Shop Procurer & Sales</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
        <section>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">Conversion Metrics</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-stone-50/80 p-3.5 ring-1 ring-stone-200/40">
              <p className="text-stone-500 text-[11px] uppercase tracking-wider">Leads Called</p>
              <p className="text-stone-900 text-lg font-semibold tabular-nums mt-1">{agent.leadsCalled}</p>
            </div>
            <div className="rounded-xl bg-sky-50/80 p-3.5 ring-1 ring-sky-200/40">
              <p className="text-sky-600 text-[11px] uppercase tracking-wider">Orders Sourced</p>
              <p className="text-sky-700 text-lg font-semibold tabular-nums mt-1">{agent.ordersSourced}</p>
            </div>
            <div className="rounded-xl bg-emerald-50/80 p-3.5 ring-1 ring-emerald-200/40">
              <p className="text-emerald-600 text-[11px] uppercase tracking-wider">Conv. Rate</p>
              <p className="text-emerald-700 text-lg font-semibold tabular-nums mt-1">{conversionRate}%</p>
            </div>
          </div>
        </section>
        <section>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Package className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">Revenue (This Period)</h3>
          </div>
          <div className="rounded-xl bg-amber-50/80 p-5 ring-1 ring-amber-200/40">
            <p className="text-amber-700 text-2xl font-semibold tabular-nums tracking-tight">{formatInrShop(agent.revenue)}</p>
          </div>
        </section>
        <section>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-violet-600" />
            </div>
            <h3 className="text-stone-900 font-semibold text-sm uppercase tracking-wider">Active Sourcing Timeline</h3>
          </div>
          <div className="space-y-2">
            {timeline.length === 0 ? (
              <p className="text-stone-500 text-sm py-3">No active sourcing items.</p>
            ) : (
              timeline.map((entry, i) => (
                <div key={`${entry.item}-${i}`} className="flex items-center justify-between rounded-xl bg-stone-50/80 px-4 py-3 ring-1 ring-stone-200/40">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Package className="w-4 h-4 text-stone-500 shrink-0" />
                    <span className="text-stone-700 text-sm truncate">{entry.item}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("px-2.5 py-1 rounded-md text-xs font-medium", entry.status === "Fulfilled" && "bg-emerald-50 text-emerald-700", entry.status === "In Transit" && "bg-blue-50 text-blue-700", entry.status === "Sourcing" && "bg-amber-50 text-amber-700")}>
                      {entry.status}
                    </span>
                    <span className="text-stone-500 text-sm tabular-nums font-semibold">{entry.days}d</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <div className="px-6 pb-6 pt-3 shrink-0 border-t border-stone-100">
        <button onClick={onClose} className={cn("w-full py-2 rounded-xl text-sm font-medium", "bg-stone-100 hover:bg-stone-200/80 text-stone-700", "transition-colors duration-150")}>
          Close
        </button>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────

function renderModalContent(
  agent: AgentPerformanceData,
  onClose: () => void
): React.ReactNode {
  if (isOnboardingAgent(agent)) {
    return <ModalContent agent={agent} onClose={onClose} />;
  }
  if (isMarketingAgent(agent)) {
    return <ModalMarketingContent agent={agent} onClose={onClose} />;
  }
  if (isShopAgent(agent)) {
    return <ModalShopContent agent={agent} onClose={onClose} />;
  }
  return null;
}

export function AgentPerformanceModal({
  agentId,
  onClose,
  agentData,
}: AgentPerformanceModalProps) {
  const [agent, setAgent] = useState<AgentPerformanceData | null>(
    agentData ?? null
  );
  const [loading, setLoading] = useState(!agentData && !!agentId);

  const isOpen = !!agentId || !!agentData;

  useEffect(() => {
    if (agentData !== undefined) {
      setAgent(agentData);
      setLoading(false);
      return;
    }
    if (!agentId) {
      setAgent(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setAgent(null);
    getAgentPerformanceById(agentId).then((data) => {
      setAgent(data);
      setLoading(false);
    });
  }, [agentId, agentData]);

  if (!isOpen) return null;

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
          {loading ? (
            <ModalSkeleton />
          ) : agent ? (
            renderModalContent(agent, onClose)
          ) : (
            <ModalSkeleton />
          )}
        </motion.div>
      </>
    </AnimatePresence>
  );
}

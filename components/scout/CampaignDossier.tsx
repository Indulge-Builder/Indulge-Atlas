"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  X,
  TrendingUp,
  MousePointerClick,
  Users,
  Trophy,
  Eye,
  BadgeDollarSign,
  Percent,
  ArrowUpRight,
} from "lucide-react";
import type { CampaignWithAttribution, CampaignDossierData } from "@/lib/actions/campaigns";
import type { LeadStatus } from "@/lib/types/database";
import { getCampaignDossier } from "@/lib/actions/campaigns";

const STATUS_COLOURS: Record<LeadStatus, string> = {
  new:           "bg-[#D4AF37]/15 text-[#D4AF37]",
  attempted:     "bg-blue-500/15 text-blue-400",
  in_discussion: "bg-violet-500/15 text-violet-400",
  won:           "bg-emerald-500/15 text-emerald-400",
  lost:          "bg-red-500/15 text-red-400",
  nurturing:     "bg-orange-500/15 text-orange-400",
  trash:         "bg-zinc-700/30 text-zinc-500",
};

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatMoney(n: number) {
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`;
  if (n >= 1_000)     return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function formatBig(n: number) {
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(2)}L`;
  if (n >= 1_000)     return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function MetricChip({
  icon: Icon,
  label,
  value,
  gold,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
      <Icon className={`w-4 h-4 shrink-0 ${gold ? "text-[#D4AF37]" : "text-white/40"}`} />
      <div>
        <div className={`text-lg font-semibold leading-none ${gold ? "text-[#D4AF37]" : "text-white"}`}>
          {value}
        </div>
        <div className="text-[11px] text-white/40 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<LeadStatus, string> = {
  new:           "New",
  attempted:     "Attempted",
  in_discussion: "In Discussion",
  won:           "Won",
  lost:          "Lost",
  nurturing:     "Nurturing",
  trash:         "Trash",
};

function StatusPill({ status }: { status: LeadStatus }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOURS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Campaign grid card ─────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  onClick,
}: {
  campaign: CampaignWithAttribution;
  onClick: () => void;
}) {
  const winRate = campaign.leads_count > 0
    ? ((campaign.won_count / campaign.leads_count) * 100).toFixed(0)
    : "0";

  const platformColour: Record<string, string> = {
    meta:     "text-blue-400",
    google:   "text-red-400",
    website:  "text-emerald-400",
    events:   "text-violet-400",
    referral: "text-amber-400",
  };

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="relative group bg-[#111111] border border-white/[0.08] rounded-2xl p-6 text-left overflow-hidden cursor-pointer w-full"
    >
      {/* Ambient glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-[#D4AF37]/5 via-transparent to-transparent pointer-events-none rounded-2xl" />

      {/* Platform tag */}
      <div className="flex items-center justify-between mb-4">
        <span className={`text-[11px] font-semibold uppercase tracking-widest ${platformColour[campaign.platform] ?? "text-white/40"}`}>
          {campaign.platform}
        </span>
        <ArrowUpRight className="w-4 h-4 text-white/20 group-hover:text-[#D4AF37] transition-colors" />
      </div>

      {/* Campaign name */}
      <h3 className="text-white font-semibold text-base leading-snug mb-5 line-clamp-2">
        {campaign.campaign_name}
      </h3>

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[#D4AF37] font-bold text-sm">{formatMoney(campaign.amount_spent)}</div>
          <div className="text-white/35 text-[10px] mt-0.5">Spend</div>
        </div>
        <div>
          <div className="text-white font-semibold text-sm">{campaign.clicks.toLocaleString()}</div>
          <div className="text-white/35 text-[10px] mt-0.5">Clicks</div>
        </div>
        <div>
          <div className="text-white font-semibold text-sm">
            {campaign.cpl > 0 ? formatMoney(campaign.cpl) : "—"}
          </div>
          <div className="text-white/35 text-[10px] mt-0.5">CPL</div>
        </div>
      </div>

      {/* Pipeline summary */}
      <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-white/40 text-xs">
          <Users className="w-3.5 h-3.5" />
          <span>{campaign.leads_count} leads</span>
        </div>
        {campaign.won_count > 0 && (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
            <Trophy className="w-3.5 h-3.5" />
            <span>{winRate}% won · {formatMoney(campaign.revenue)}</span>
          </div>
        )}
      </div>
    </motion.button>
  );
}

// ── Dossier overlay ────────────────────────────────────────────────────────────

function DossierOverlay({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<CampaignDossierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch dossier data on first render
  useState(() => {
    getCampaignDossier(campaignId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ x: "100%", opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="ml-auto w-full max-w-5xl h-full bg-[#0D0D0D] border-l border-white/[0.08] overflow-hidden flex flex-col"
      >
        {/* Loading state */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37] animate-spin" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={onClose} className="text-white/40 text-xs hover:text-white/70">
              Close
            </button>
          </div>
        )}

        {/* Dossier content */}
        {data && !loading && (
          <>
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="px-8 pt-8 pb-6 border-b border-white/[0.07] shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
                      {data.campaign.platform}
                    </span>
                    <span className="text-white/10">·</span>
                    <span className="text-[11px] text-white/30 font-mono">
                      {data.campaign.campaign_id}
                    </span>
                  </div>
                  <h2
                    className="text-white text-2xl font-semibold leading-tight"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {data.campaign.campaign_name}
                  </h2>
                  <p className="text-white/30 text-xs mt-1.5">
                    Last synced: {new Date(data.campaign.last_synced_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-9 h-9 rounded-xl border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:border-white/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Live metrics strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                <MetricChip icon={BadgeDollarSign} label="Total Spend" value={formatMoney(data.campaign.amount_spent)} gold />
                <MetricChip icon={Eye}             label="Impressions"  value={data.campaign.impressions.toLocaleString()} />
                <MetricChip icon={MousePointerClick} label="Clicks"     value={data.campaign.clicks.toLocaleString()} />
                <MetricChip icon={TrendingUp}      label="CPC"          value={data.campaign.cpc > 0 ? `₹${data.campaign.cpc.toFixed(2)}` : "—"} />
              </div>
            </div>

            {/* ── Body — two-column split ──────────────────────────────────── */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden">

              {/* Left: Pipeline ─────────────────────────────────────────── */}
              <div className="border-r border-white/[0.06] overflow-y-auto">
                <div className="px-6 py-5 border-b border-white/[0.06] sticky top-0 bg-[#0D0D0D] z-10">
                  <h3 className="text-white/60 text-xs font-semibold uppercase tracking-widest">
                    Lead Pipeline
                  </h3>
                  <p className="text-white/25 text-[11px] mt-0.5">
                    {data.pipeline.length} total lead{data.pipeline.length !== 1 ? "s" : ""}
                  </p>
                </div>

                {data.pipeline.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-white/20 text-sm gap-2">
                    <Users className="w-8 h-8" />
                    <span>No leads from this campaign yet.</span>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {data.pipeline.map((lead, i) => (
                      <motion.div
                        key={lead.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.025, duration: 0.3 }}
                        className="px-6 py-4 hover:bg-white/[0.02] transition-colors group"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white text-sm font-medium truncate">
                                {lead.first_name} {lead.last_name ?? ""}
                              </span>
                              <StatusPill status={lead.status as LeadStatus} />
                            </div>
                            <div className="text-white/30 text-xs mt-0.5">
                              {lead.phone_number}
                              {lead.assigned_agent && (
                                <span className="ml-2 text-white/20">
                                  → {lead.assigned_agent.full_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <Link href={`/leads/${lead.id}`}>
                            <ArrowUpRight className="w-3.5 h-3.5 text-white/20 group-hover:text-[#D4AF37] transition-colors shrink-0" />
                          </Link>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Trophy Case ─────────────────────────────────────── */}
              <div className="overflow-y-auto flex flex-col">
                {/* Revenue hero */}
                <div className="px-6 py-6 bg-gradient-to-br from-[#D4AF37]/8 via-transparent to-transparent border-b border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className="w-4 h-4 text-[#D4AF37]" />
                    <span className="text-white/50 text-xs font-semibold uppercase tracking-widest">
                      Trophy Case
                    </span>
                  </div>
                  <div
                    className="text-[#D4AF37] font-bold leading-none mt-3"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                    }}
                  >
                    {formatBig(data.totalRevenue)}
                  </div>
                  <p className="text-white/30 text-xs mt-1.5">
                    Total Revenue Generated · {data.trophyCase.length} won deal{data.trophyCase.length !== 1 ? "s" : ""}
                  </p>

                  {/* ROI strip */}
                  {data.campaign.amount_spent > 0 && data.totalRevenue > 0 && (
                    <div className="flex items-center gap-4 mt-4">
                      <div>
                        <div className="text-emerald-400 text-lg font-bold">
                          {(data.totalRevenue / data.campaign.amount_spent).toFixed(1)}x
                        </div>
                        <div className="text-white/25 text-[10px]">ROAS</div>
                      </div>
                      <div>
                        <div className="text-white text-sm font-semibold">
                          {data.trophyCase.length > 0
                            ? formatMoney(data.campaign.amount_spent / data.trophyCase.length)
                            : "—"}
                        </div>
                        <div className="text-white/25 text-[10px]">Cost Per Win</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-white text-sm font-semibold">
                          <Percent className="w-3 h-3 text-white/30" />
                          {data.pipeline.length > 0
                            ? ((data.trophyCase.length / data.pipeline.length) * 100).toFixed(0)
                            : "0"}
                        </div>
                        <div className="text-white/25 text-[10px]">Win Rate</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Won leads list */}
                <div className="flex-1 overflow-y-auto">
                  {data.trophyCase.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-white/20 text-sm gap-2">
                      <Trophy className="w-8 h-8" />
                      <span>No won deals yet.</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.04]">
                      {data.trophyCase.map((lead, i) => (
                        <motion.div
                          key={lead.id}
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04, duration: 0.3 }}
                          className="px-6 py-4 hover:bg-white/[0.02] transition-colors group"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-white text-sm font-medium">
                                {lead.first_name} {lead.last_name ?? ""}
                              </div>
                              <div className="text-white/30 text-xs mt-0.5">
                                {lead.phone_number}
                                {lead.assigned_agent && (
                                  <span className="ml-1.5 text-white/20">
                                    · {lead.assigned_agent.full_name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              {lead.deal_value && (
                                <span className="text-[#D4AF37] font-bold text-sm">
                                  {formatMoney(lead.deal_value)}
                                </span>
                              )}
                              <Link href={`/leads/${lead.id}`}>
                                <ArrowUpRight className="w-3.5 h-3.5 text-white/20 group-hover:text-[#D4AF37] transition-colors" />
                              </Link>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Main export: CampaignGrid ──────────────────────────────────────────────────

export function CampaignGrid({
  campaigns,
}: {
  campaigns: CampaignWithAttribution[];
}) {
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#1A1A1A] border border-white/[0.07] flex items-center justify-center">
          <TrendingUp className="w-6 h-6 text-white/20" />
        </div>
        <p className="text-white/30 text-sm max-w-xs">
          No campaign metrics yet. Configure Pabbly to push to{" "}
          <code className="text-white/50 font-mono text-xs">/api/webhooks/ads</code>.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {campaigns.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <CampaignCard
              campaign={c}
              onClick={() => setActiveCampaignId(c.campaign_id)}
            />
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {activeCampaignId && (
          <DossierOverlay
            key={activeCampaignId}
            campaignId={activeCampaignId}
            onClose={() => setActiveCampaignId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

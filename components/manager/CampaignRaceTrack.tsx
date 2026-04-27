"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { CampaignLeaderboardItem } from "@/lib/actions/manager-analytics";

// ── Platform config ───────────────────────────────────────────

const PLATFORM: Record<string, { label: string; color: string }> = {
  meta:     { label: "Meta",    color: "#1877F2" },
  google:   { label: "Google",  color: "#EA4335" },
  website:  { label: "Web",     color: "#4A7C59" },
  events:   { label: "Event",   color: "#D4AF37" },
  referral: { label: "Ref.",    color: "#6B4FBB" },
};

// ── Formatters ────────────────────────────────────────────────

function fmtInr(v: number): string {
  if (v >= 10_00_000) return `₹${(v / 10_00_000).toFixed(1)}Cr`;
  if (v >= 1_00_000)  return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000)     return `₹${(v / 1_000).toFixed(0)}k`;
  if (v === 0)        return "—";
  return `₹${Math.round(v)}`;
}

// ── Component ─────────────────────────────────────────────────

interface CampaignRaceTrackProps {
  leaderboard: CampaignLeaderboardItem[];
}

export function CampaignRaceTrack({ leaderboard }: CampaignRaceTrackProps) {
  // Scale bars relative to the highest ROAS in this set
  const maxRoas = Math.max(...leaderboard.map((c) => c.roas), 1);

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <h3
          className="text-[#1A1A1A] font-semibold text-base"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          Campaign Race Track
        </h3>
        <p className="text-[#9E9E9E] text-xs mt-0.5">
          ROAS leaderboard · top {leaderboard.length} by return
        </p>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-[1fr_60px_60px_48px] gap-x-3 px-1 mb-3">
        {["Campaign", "Spend", "Revenue", "ROAS"].map((h) => (
          <p
            key={h}
            className={cn(
              "text-[9px] font-semibold text-[#9E9E9E] uppercase tracking-[0.1em]",
              h !== "Campaign" && "text-right"
            )}
          >
            {h}
          </p>
        ))}
      </div>

      {/* Race rows */}
      <div className="flex-1 space-y-4">
        {leaderboard.length === 0 ? (
          <p className="text-center text-[#9E9E9E] text-sm py-10">
            No campaigns yet — run a data sync.
          </p>
        ) : (
          leaderboard.map((campaign, i) => {
            const barPct   = (campaign.roas / maxRoas) * 100;
            const positive = campaign.roas >= 1;
            const plat     = PLATFORM[campaign.platform] ?? {
              label: campaign.platform,
              color: "#9E9E9E",
            };

            return (
              <motion.div
                key={campaign.campaign_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.38,
                  delay: i * 0.07,
                  ease: "easeOut",
                }}
                className="space-y-2"
              >
                {/* Data row */}
                <div className="grid grid-cols-[1fr_60px_60px_48px] gap-x-3 items-center px-1">
                  {/* Name + platform */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-[#C8C8B8] w-3 flex-shrink-0">
                      {i + 1}
                    </span>
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: plat.color }}
                    />
                    <span className="text-[12px] font-medium text-[#1A1A1A] truncate leading-snug">
                      {campaign.campaign_name}
                    </span>
                  </div>

                  {/* Spend */}
                  <span className="text-[11px] text-[#9E9E9E] text-right tabular-nums">
                    {fmtInr(campaign.amount_spent)}
                  </span>

                  {/* Revenue */}
                  <span
                    className={cn(
                      "text-[11px] font-medium text-right tabular-nums",
                      campaign.revenue_closed > 0
                        ? "text-[#4A7C59]"
                        : "text-[#9E9E9E]"
                    )}
                  >
                    {fmtInr(campaign.revenue_closed)}
                  </span>

                  {/* ROAS */}
                  <span
                    className={cn(
                      "text-[13px] font-bold text-right tabular-nums",
                      positive ? "text-[#D4AF37]" : "text-[#8A8A6E]"
                    )}
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {campaign.roas > 0 ? `${campaign.roas.toFixed(1)}×` : "—"}
                  </span>
                </div>

                {/* Animated race track */}
                <div className="ml-5 h-1.5 bg-[#1A1A1A]/[0.045] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barPct}%` }}
                    transition={{
                      duration: 1.3,
                      delay: 0.1 + i * 0.1,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="h-full rounded-full"
                    style={{
                      background: positive
                        ? "linear-gradient(90deg,#D4AF37 0%,#F0CF70 100%)"
                        : "linear-gradient(90deg,#8A8A6E 0%,#A8A890 100%)",
                    }}
                  />
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Legend */}
      <div className="mt-5 pt-4 border-t border-[#F0EDE8] flex items-center gap-5">
        {[
          { label: "Positive ROAS", from: "#D4AF37", to: "#F0CF70" },
          { label: "Building Pipeline", from: "#8A8A6E", to: "#A8A890" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div
              className="w-6 h-1 rounded-full"
              style={{
                background: `linear-gradient(90deg,${l.from},${l.to})`,
              }}
            />
            <span className="text-[10px] text-[#9E9E9E]">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

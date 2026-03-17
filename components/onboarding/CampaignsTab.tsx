"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Facebook, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdPlatform } from "@/lib/types/database";
import type { CampaignWithAttribution } from "@/lib/actions/campaigns";

function formatInr(value: number): string {
  if (value >= 10_00_000) return `₹${(value / 10_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

function PlatformIcon({ platform }: { platform: AdPlatform }) {
  if (platform === "meta") {
    return (
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-100 to-indigo-100 flex items-center justify-center">
        <Facebook className="w-5 h-5 text-rose-500/90" strokeWidth={1.5} />
      </div>
    );
  }
  if (platform === "google") {
    return (
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-red-100 flex items-center justify-center">
        <Globe className="w-5 h-5 text-blue-500/90" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center">
      <Globe className="w-5 h-5 text-stone-500" strokeWidth={1.5} />
    </div>
  );
}

interface CampaignsTabProps {
  campaigns: CampaignWithAttribution[];
}

export function CampaignsTab({ campaigns }: CampaignsTabProps) {
  const sortedCampaigns = useMemo(
    () =>
      [...campaigns].sort((a, b) => {
        const convA =
          a.leads_count > 0 ? (a.won_count / a.leads_count) * 100 : 0;
        const convB =
          b.leads_count > 0 ? (b.won_count / b.leads_count) * 100 : 0;
        return convB - convA;
      }),
    [campaigns]
  );

  if (sortedCampaigns.length === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl p-12 text-center",
          "bg-white/80 backdrop-blur-2xl",
          "ring-1 ring-black/[0.03]",
          "shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
        )}
      >
        <p className="text-stone-500 text-sm">No campaigns yet.</p>
        <p className="text-stone-400 text-xs mt-1">
          Sync campaigns from Meta or Google Ads to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {sortedCampaigns.map((campaign, i) => {
        const conversionRatio =
          campaign.leads_count > 0
            ? (campaign.won_count / campaign.leads_count) * 100
            : 0;
        return (
          <motion.div
            key={campaign.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: i * 0.05,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cn(
              "rounded-2xl p-5",
              "bg-white/80 backdrop-blur-2xl",
              "ring-1 ring-black/[0.03]",
              "shadow-[0_8px_30px_rgb(0,0,0,0.02)]",
              "hover:shadow-[0_12px_40px_rgb(0,0,0,0.04)] transition-shadow"
            )}
          >
            <div className="flex items-start gap-4">
              <PlatformIcon platform={campaign.platform} />
              <div className="min-w-0 flex-1">
                <h3 className="text-stone-900 font-semibold text-sm leading-snug">
                  {campaign.campaign_name}
                </h3>
                <p className="text-stone-500 text-xs mt-1 capitalize">
                  {campaign.platform}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-stone-900 text-sm font-semibold tabular-nums">
                      {formatInr(campaign.amount_spent)}
                    </p>
                    <p className="text-stone-500 text-[10px] uppercase tracking-wider">
                      Spend
                    </p>
                  </div>
                  <div>
                    <p className="text-stone-900 text-sm font-semibold tabular-nums">
                      {campaign.leads_count}
                    </p>
                    <p className="text-stone-500 text-[10px] uppercase tracking-wider">
                      Leads
                    </p>
                  </div>
                  <div>
                    <p className="text-emerald-600 text-sm font-semibold tabular-nums">
                      {conversionRatio.toFixed(1)}%
                    </p>
                    <p className="text-stone-500 text-[10px] uppercase tracking-wider">
                      Conv.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

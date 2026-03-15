"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Facebook, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdPlatform } from "@/lib/types/database";

// ── Mock campaign data (sorted by conversion ratio) ─────────────────────────
interface MockCampaign {
  id: string;
  name: string;
  platform: AdPlatform;
  spend: number;
  leadsGenerated: number;
  conversionRatio: number;
}

const MOCK_CAMPAIGNS: MockCampaign[] = [
  {
    id: "c1",
    name: "Indulge Global — VIP Experience",
    platform: "meta",
    spend: 185000,
    leadsGenerated: 42,
    conversionRatio: 38.1,
  },
  {
    id: "c2",
    name: "Shop Engine — Summer Collection",
    platform: "google",
    spend: 92000,
    leadsGenerated: 28,
    conversionRatio: 32.1,
  },
  {
    id: "c3",
    name: "The Indulge House — Heritage",
    platform: "meta",
    spend: 245000,
    leadsGenerated: 67,
    conversionRatio: 28.4,
  },
  {
    id: "c4",
    name: "Indulge Legacy — Membership Drive",
    platform: "google",
    spend: 156000,
    leadsGenerated: 38,
    conversionRatio: 26.3,
  },
  {
    id: "c5",
    name: "Griffin Event — Furak Party",
    platform: "meta",
    spend: 78000,
    leadsGenerated: 19,
    conversionRatio: 21.1,
  },
  {
    id: "c6",
    name: "Website Retargeting — High Intent",
    platform: "website",
    spend: 45000,
    leadsGenerated: 12,
    conversionRatio: 25.0,
  },
];

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

export function CampaignsTab() {
  const sortedCampaigns = useMemo(
    () => [...MOCK_CAMPAIGNS].sort((a, b) => b.conversionRatio - a.conversionRatio),
    []
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {sortedCampaigns.map((campaign, i) => (
        <motion.div
          key={campaign.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
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
                {campaign.name}
              </h3>
              <p className="text-stone-500 text-xs mt-1 capitalize">
                {campaign.platform}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-stone-900 text-sm font-semibold tabular-nums">
                    {formatInr(campaign.spend)}
                  </p>
                  <p className="text-stone-500 text-[10px] uppercase tracking-wider">
                    Spend
                  </p>
                </div>
                <div>
                  <p className="text-stone-900 text-sm font-semibold tabular-nums">
                    {campaign.leadsGenerated}
                  </p>
                  <p className="text-stone-500 text-[10px] uppercase tracking-wider">
                    Leads
                  </p>
                </div>
                <div>
                  <p className="text-emerald-600 text-sm font-semibold tabular-nums">
                    {campaign.conversionRatio.toFixed(1)}%
                  </p>
                  <p className="text-stone-500 text-[10px] uppercase tracking-wider">
                    Conv.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

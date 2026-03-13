"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { CampaignWithStats } from "@/lib/types/database";

interface CampaignsTableProps {
  campaigns: CampaignWithStats[];
  platform: "meta" | "google" | "website" | "events" | "referral";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function RoiBadge({ roi }: { roi: number }) {
  const isPositive = roi >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold",
        isPositive
          ? "bg-[#EBF4EF] text-[#4A7C59]"
          : "bg-[#FAEAE8] text-[#C0392B]"
      )}
    >
      {isPositive ? "+" : ""}
      {roi.toFixed(1)}%
    </span>
  );
}

const PLATFORM_ACCENT: Record<CampaignsTableProps["platform"], string> = {
  meta: "#1877F2",
  google: "#4285F4",
  website: "#10B981",
  events: "#8B5CF6",
  referral: "#F59E0B",
};

export function CampaignsTable({ campaigns, platform }: CampaignsTableProps) {
  if (campaigns.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-[#9E9E9E] text-sm">
          No campaigns found. Run a sync to load data.
        </p>
      </div>
    );
  }

  const accent = PLATFORM_ACCENT[platform];
  const showDigitalMetrics = platform !== "referral" && platform !== "events";

  const columns = [
    "Campaign",
    "Amount Spent",
    ...(showDigitalMetrics ? ["Impressions", "Clicks"] : []),
    "Leads Generated",
    "Revenue Closed",
    "ROI",
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#F0F0EC]">
            {columns.map((col) => (
              <th
                key={col}
                className="text-left py-3 px-4 text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, idx) => (
            <motion.tr
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className="border-b border-[#F9F9F6] hover:bg-[#FAFAFA] transition-colors group"
            >
              <td className="py-4 px-4">
                <div className="flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: accent }}
                  />
                  <span className="font-medium text-[#1A1A1A] truncate max-w-[220px]">
                    {c.campaign_name}
                  </span>
                </div>
              </td>
              <td className="py-4 px-4 text-[#4A4A4A] font-medium tabular-nums">
                {c.amount_spent > 0 ? formatCurrency(c.amount_spent) : "—"}
              </td>
              {showDigitalMetrics && (
                <>
                  <td className="py-4 px-4 text-[#9E9E9E] tabular-nums">
                    {formatNumber(c.impressions)}
                  </td>
                  <td className="py-4 px-4 text-[#9E9E9E] tabular-nums">
                    {formatNumber(c.clicks)}
                  </td>
                </>
              )}
              <td className="py-4 px-4 text-[#4A4A4A] font-medium tabular-nums">
                {formatNumber(c.leads_generated)}
              </td>
              <td className="py-4 px-4 tabular-nums">
                <span
                  className={cn(
                    "font-semibold",
                    c.revenue_closed > 0 ? "text-[#4A7C59]" : "text-[#9E9E9E]"
                  )}
                >
                  {c.revenue_closed > 0
                    ? formatCurrency(c.revenue_closed)
                    : "—"}
                </span>
              </td>
              <td className="py-4 px-4">
                <RoiBadge roi={c.roi} />
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampaignPlatformBadge } from "@/components/scout/CampaignPlatformBadge";
import type { CampaignTableRow } from "@/lib/types/campaigns";
import type { AdPlatform } from "@/lib/types/database";
import { surfaceCardVariants } from "@/components/ui/card";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;

function formatRupee(n: number) {
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function Th({
  children,
  align = "left",
  tight = false,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  tight?: boolean;
}) {
  return (
    <th
      className={`${tight ? "px-4" : "px-6"} py-3.5 text-[10px] font-semibold text-[#B5A99A] uppercase tracking-widest whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function StatusPill({ status }: { status: "active" | "paused" }) {
  const isActive = status === "active";
  return (
    <span
      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
        isActive ? "bg-emerald-500/15 text-emerald-600" : "bg-stone-200/80 text-stone-500"
      }`}
    >
      {isActive ? "Active" : "Paused"}
    </span>
  );
}

interface CampaignsTableProps {
  campaigns: CampaignTableRow[];
  platformFilter: AdPlatform | "events";
  onPlatformChange: (p: AdPlatform | "events") => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function CampaignsTable({
  campaigns,
  platformFilter,
  onPlatformChange,
  searchQuery,
  onSearchChange,
}: CampaignsTableProps) {
  const router = useRouter();
  const filtered = campaigns.filter((c) => {
    const matchPlatform =
      platformFilter === "events"
        ? c.platform === "events"
        : c.platform === platformFilter;
    const matchSearch =
      !searchQuery ||
      c.campaign_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchPlatform && matchSearch;
  });

  return (
    <div className="space-y-4">
      <div className="relative flex-1 min-w-[220px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B5A99A]" />
        <Input
          placeholder="Search campaigns…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 bg-white/80 backdrop-blur-sm border-[#E5E4DF] focus-visible:ring-1 focus-visible:ring-indigo-400/30"
        />
      </div>

      <div
        className={surfaceCardVariants({
          tone: "glass",
          elevation: "xs",
          overflow: "hidden",
        })}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "900px" }}>
            <thead>
              <tr className="border-b border-[#EEEDE9] bg-[#FAFAF8]/80">
                <Th>Campaign Name</Th>
                <Th tight>Status</Th>
                <Th align="right">Impressions</Th>
                <Th align="right">Spend</Th>
                <Th align="right">Conversions</Th>
                <Th align="right">Leads</Th>
                <Th align="right">CPA</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-20 text-[#C8C4BC] text-sm"
                    >
                      No campaigns found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row, i) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        delay: Math.min(i, 7) * 0.03,
                        duration: 0.35,
                        ease: luxuryEasing,
                      }}
                      onClick={() =>
                        router.push(`/scout/campaigns/${row.campaign_id}`)
                      }
                      className="border-b border-[#F4F3EF] last:border-0 hover:bg-[#FAFAF8]/80 transition-colors duration-300 cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <CampaignPlatformBadge platform={row.platform} />
                          <span className="font-medium text-[#1A1A1A] truncate max-w-[220px]">
                            {row.campaign_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusPill status={row.status} />
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums text-[#4A4A4A]">
                        {row.total_impressions.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-[#1A1A1A] tabular-nums">
                        {formatRupee(row.total_spend)}
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums text-[#4A4A4A]">
                        {row.total_conversions}
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums text-[#4A4A4A]">
                        {row.leads_generated}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-[#1A1A1A] tabular-nums">
                        {row.cpa > 0 ? formatRupee(row.cpa) : "—"}
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

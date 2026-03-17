"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CampaignsTable } from "@/components/scout/CampaignsTable";
import { CampaignSyncButton } from "@/components/scout/CampaignSyncButton";
import type { CampaignTableRow } from "@/lib/types/campaigns";
import type { AdPlatform } from "@/lib/types/database";

const TABS: { id: AdPlatform | "events"; label: string }[] = [
  { id: "meta", label: "Meta" },
  { id: "google", label: "Google" },
  { id: "events", label: "Events" },
];

interface CampaignsPageClientProps {
  campaigns: CampaignTableRow[];
}

export function CampaignsPageClient({ campaigns }: CampaignsPageClientProps) {
  const [platformFilter, setPlatformFilter] = useState<AdPlatform | "events">("meta");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="space-y-8">
      {/* Tabs + Sync button row */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-wrap items-center gap-4"
      >
        {/* Pill-shaped tab switcher */}
        <div className="inline-flex items-center gap-0.5 p-1 rounded-full bg-white/60 backdrop-blur-sm border border-[#E5E4DF] shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        {TABS.map((tab) => {
          const isActive = platformFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setPlatformFilter(tab.id)}
              className="relative px-5 py-2 text-sm font-medium rounded-full transition-colors duration-200"
            >
              {isActive && (
                <motion.span
                  layoutId="campaign-pill-bg"
                  className="absolute inset-0 rounded-full bg-white border border-[#E5E4DF] shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span
                className={`relative z-10 ${
                  isActive ? "text-[#1A1A1A]" : "text-[#9E9E9E] hover:text-[#4A4A4A]"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
        </div>

        {/* Sync Data button */}
        <CampaignSyncButton />
      </motion.div>

      {/* Data table */}
      <AnimatePresence mode="wait">
        <motion.div
          key={platformFilter}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3 }}
        >
          <CampaignsTable
            campaigns={campaigns}
            platformFilter={platformFilter}
            onPlatformChange={setPlatformFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

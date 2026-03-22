"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentWithOnboardingStats } from "@/lib/actions/team-stats";
import type { CampaignWithAttribution } from "@/lib/actions/campaigns";
import {
  Megaphone,
  UsersRound,
  List,
  LayoutDashboard,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { CampaignsTab } from "@/components/onboarding/CampaignsTab";
import { TeamPerformanceTab } from "@/components/onboarding/TeamPerformanceTab";
import { AddLeadModal } from "@/components/leads/AddLeadModal";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "pulse", label: "Founder's Pulse", icon: LayoutDashboard },
  { id: "team", label: "Team Performance", icon: UsersRound },
  { id: "campaigns", label: "Running Campaigns", icon: Megaphone },
  { id: "leads", label: "Live Leads", icon: List },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface OnboardingOversightClientProps {
  agents: AgentWithOnboardingStats[];
  campaigns: CampaignWithAttribution[];
  /** Server-rendered Founder's Pulse dashboard */
  pulseSlot: React.ReactNode;
  children: React.ReactNode;
}

export function OnboardingOversightClient({
  agents,
  campaigns,
  pulseSlot,
  children,
}: OnboardingOversightClientProps) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const tabFromUrl = (urlSearchParams.get("tab") as TabId) || "pulse";
  const isValidTab = TABS.some((t) => t.id === tabFromUrl);
  const activeTab: TabId = isValidTab ? tabFromUrl : "pulse";

  const handleTabClick = (tabId: TabId) => {
    const next = new URLSearchParams(urlSearchParams.toString());
    next.set("tab", tabId);
    router.push(`/admin/onboarding?${next.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Onboarding Oversight"
        subtitle="Macro-level founder dashboard for pipeline health and team performance"
        actions={activeTab === "leads" ? <AddLeadModal /> : undefined}
      />

      <div className="px-4 md:px-6 lg:px-8 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 rounded-2xl bg-stone-200/40 backdrop-blur-md ring-1 ring-stone-300/40 shadow-sm w-fit">
          {TABS.map((tab) => (
            <motion.button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "relative px-5 py-2.5 rounded-xl text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-[#D4AF37]"
                  : "text-stone-600 hover:text-stone-800",
              )}
            >
              {activeTab === tab.id && (
                <motion.span
                  layoutId="onboarding-tab-indicator"
                  className="absolute inset-0 rounded-xl bg-sidebar-active shadow-[0_2px_8px_rgb(0,0,0,0.15)] ring-1 ring-stone-800/30"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <tab.icon className="w-4 h-4" strokeWidth={1.5} />
                {tab.label}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "pulse" && (
            <motion.div
              key="pulse"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {pulseSlot}
            </motion.div>
          )}
          {activeTab === "team" && (
            <motion.div
              key="team"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <TeamPerformanceTab agents={agents} />
            </motion.div>
          )}
          {activeTab === "campaigns" && (
            <motion.div
              key="campaigns"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <CampaignsTab campaigns={campaigns} />
            </motion.div>
          )}
          {activeTab === "leads" && (
            <motion.div
              key="leads"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

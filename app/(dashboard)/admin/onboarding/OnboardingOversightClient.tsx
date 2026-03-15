"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentWithOnboardingStats } from "@/lib/actions/team-stats";
import {
  Users,
  TrendingUp,
  IndianRupee,
  Megaphone,
  UsersRound,
  List,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { CampaignsTab } from "@/components/onboarding/CampaignsTab";
import { TeamPerformanceTab } from "@/components/onboarding/TeamPerformanceTab";
import { AddLeadModal } from "@/components/leads/AddLeadModal";
import { cn } from "@/lib/utils";

// Tab order: Team Performance (first), Running Campaigns, Live Leads
const TABS = [
  { id: "team", label: "Team Performance", icon: UsersRound },
  { id: "campaigns", label: "Running Campaigns", icon: Megaphone },
  { id: "leads", label: "Live Leads", icon: List },
] as const;

type TabId = (typeof TABS)[number]["id"];

const APEX_METRICS = [
  {
    label: "Total Leads Attended (This Month)",
    value: "247",
    icon: Users,
    iconClass: "text-violet-500/90",
    bgClass: "bg-violet-50/80",
  },
  {
    label: "Overall Conversion Rate",
    value: "34.2%",
    icon: TrendingUp,
    iconClass: "text-emerald-500/90",
    bgClass: "bg-emerald-50/80",
  },
  {
    label: "Total Revenue Pipeline",
    value: "₹1.2Cr",
    icon: IndianRupee,
    iconClass: "text-amber-600/90",
    bgClass: "bg-amber-50/80",
  },
  {
    label: "Active Ad Campaigns",
    value: "12",
    icon: Megaphone,
    iconClass: "text-rose-500/90",
    bgClass: "bg-rose-50/80",
  },
];

interface OnboardingOversightClientProps {
  agents: AgentWithOnboardingStats[];
  searchParams: Record<string, string | undefined>;
  children: React.ReactNode;
}

export function OnboardingOversightClient({
  agents,
  searchParams,
  children,
}: OnboardingOversightClientProps) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const tabFromUrl = (urlSearchParams.get("tab") as TabId) || "team";
  const isValidTab = TABS.some((t) => t.id === tabFromUrl);
  const [activeTab, setActiveTab] = useState<TabId>(
    isValidTab ? tabFromUrl : "team",
  );

  useEffect(() => {
    if (isValidTab && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, isValidTab, activeTab]);

  const handleTabClick = (tabId: TabId) => {
    setActiveTab(tabId);
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
        {/* Apex Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
          {APEX_METRICS.map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: i * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={cn(
                "rounded-2xl p-5",
                "bg-white/80 backdrop-blur-2xl",
                "ring-1 ring-black/[0.03]",
                "shadow-[0_8px_30px_rgb(0,0,0,0.02)]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    metric.bgClass,
                  )}
                >
                  <metric.icon
                    className={cn("w-5 h-5", metric.iconClass)}
                    strokeWidth={1.5}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-stone-500 text-xs font-medium uppercase tracking-wider">
                    {metric.label}
                  </p>
                  <p className="text-stone-900 text-xl font-semibold mt-1 tabular-nums">
                    {metric.value}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

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
              <CampaignsTab />
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

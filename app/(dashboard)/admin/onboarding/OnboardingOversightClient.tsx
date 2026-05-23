"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { OverviewDateFilter, presetBounds } from "@/components/onboarding/OverviewDateFilter";
import type { DateRangeBounds } from "@/components/onboarding/OverviewDateFilter";
import type { OnboardingOverviewData } from "@/lib/types/onboarding-overview";
import { OnboardingOverviewTab } from "@/components/onboarding/OnboardingOverviewTab";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "team", label: "Team Performance", icon: UsersRound },
  { id: "campaigns", label: "Running Campaigns", icon: Megaphone },
  { id: "leads", label: "Live Leads", icon: List },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface OnboardingOversightClientProps {
  agents: AgentWithOnboardingStats[];
  campaigns: CampaignWithAttribution[];
  initialOverviewData: OnboardingOverviewData;
  children: React.ReactNode;
}

export function OnboardingOversightClient({
  agents,
  campaigns,
  initialOverviewData,
  children,
}: OnboardingOversightClientProps) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const rawTab = urlSearchParams.get("tab");
  const normalizedTab =
    rawTab === "pulse" ? "overview" : (rawTab as TabId | null);
  const isValidTab =
    normalizedTab !== null && TABS.some((t) => t.id === normalizedTab);
  const activeTab: TabId = isValidTab ? normalizedTab! : "overview";

  const [dateRange, setDateRange] = useState<DateRangeBounds>(
    () => presetBounds("this_month"),
  );

  const handleTabChange = (tabId: string) => {
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

      <div className="px-4 md:px-6 lg:px-8 py-6 md:py-8 pb-10 md:pb-12">
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          indicatorLayoutId="onboarding-tab-indicator"
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList>
              {TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  <tab.icon className="h-4 w-4" strokeWidth={1.5} />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {activeTab === "overview" && (
              <OverviewDateFilter value={dateRange} onChange={setDateRange} />
            )}
          </div>

          <TabsContent value="overview" className="mt-6">
            <OnboardingOverviewTab
              initialData={initialOverviewData}
              dateRange={dateRange}
            />
          </TabsContent>
          <TabsContent value="team">
            <TeamPerformanceTab agents={agents} />
          </TabsContent>
          <TabsContent value="campaigns">
            <CampaignsTab campaigns={campaigns} />
          </TabsContent>
          <TabsContent value="leads">
            {children}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import type { OverviewDomainKey } from "@/lib/constants/onboarding-overview";

export type { OverviewDomainKey } from "@/lib/constants/onboarding-overview";

export type OverviewPipelineStage = {
  key: string;
  label: string;
  count: number;
  colorClass: string;
};

export type OverviewDomainMonthlyCard = {
  domain: OverviewDomainKey;
  label: string;
  leadsThisMonth: number;
};

export type OverviewAgentRow = {
  agentId: string;
  fullName: string;
  totalLeads: number;
  new: number;
  attempted: number;
  inDiscussion: number;
  junk: number;
  todayLeads: number;
  conversions: number;
};

export type OverviewDomainSlice = {
  domain: OverviewDomainKey;
  label: string;
  pipelineStages: OverviewPipelineStage[];
  agents: OverviewAgentRow[];
};

export type OnboardingOverviewData = {
  monthLabel: string;
  monthlyCards: OverviewDomainMonthlyCard[];
  domains: Record<OverviewDomainKey, OverviewDomainSlice>;
};

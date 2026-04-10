/** Roles that may see org-wide executive briefing metrics (domain-scoped). */
export const EXECUTIVE_BRIEFING_ROLES = [
  "admin",
  "founder",
  "manager",
] as const;

export function canViewExecutiveData(role: string | undefined | null): boolean {
  if (!role) return false;
  return (EXECUTIVE_BRIEFING_ROLES as readonly string[]).includes(role);
}

export type YesterdayAgentRank = { name: string; tasks: number };

/** Week-over-week % change; `null` when the prior-week baseline is zero (avoid ÷0). */
export type BriefingTrendMetric = {
  value: number;
  deltaPercent: number | null;
};

export type BriefingAssignee = { id: string; full_name: string };

export type BriefingPipelinePulse = {
  new: number;
  attempted: number;
  connected: number;
  in_discussion: number;
  nurturing: number;
  /** Unexpected statuses in the open-pipeline query (should stay 0). */
  other: number;
  total: number;
};

export type BriefingRecentWin = {
  id: string;
  leadName: string;
  agent: BriefingAssignee | null;
};

export type BriefingStagnantLead = {
  id: string;
  leadName: string;
  createdAt: string;
  /** Pre-formatted on the server, e.g. "3 days ago" */
  staleLabel: string;
  agent: BriefingAssignee | null;
};

export interface YesterdayExecutiveBriefing {
  /** e.g. "For Thursday, March 19" — calendar date of the IST "yesterday" window */
  dateLabel: string;
  executiveSummary: string;
  newLeads: BriefingTrendMetric;
  tasksCompleted: BriefingTrendMetric;
  dealsWon: number;
  dealsLost: number;
  topAgents: YesterdayAgentRank[];
  /** Leads still in `new` whose `created_at` is older than 48 hours (domain-scoped). */
  staleLeadsCount: number;
  /** Distribution of open pipeline (excludes won / lost / trash). */
  pipelinePulse: BriefingPipelinePulse;
  /** Leads marked won with `updated_at` in yesterday’s IST window. */
  recentWins: BriefingRecentWin[];
  /** Stale new leads (over 48h); list capped server-side for the UI. */
  stagnantLeadsList: BriefingStagnantLead[];
}

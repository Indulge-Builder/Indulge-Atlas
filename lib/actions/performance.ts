"use server";

import { createClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/types/database";
import type { PeriodValue } from "@/components/scout/MonthSelector";

function getDateRange(period: PeriodValue): { start: string; end: string } {
  const now = new Date();
  switch (period) {
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: start.toISOString(), end: now.toISOString() };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "ytd": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start: start.toISOString(), end: now.toISOString() };
    }
  }
}

export interface PipelineStage {
  stage:  string;
  status: LeadStatus;
  value:  number;
  isWon:  boolean;
}

export interface RecentWin {
  id:         string;
  first_name: string;
  last_name:  string | null;
  deal_value: number | null;
  updated_at: string;
}

export interface AgentPerformanceData {
  activePipeline: number;
  winRate:        number;
  revenueClosed:  number;
  avgDealValue:   number;
  winsCount:      number;
  pipelineStages: PipelineStage[];
  recentWins:     RecentWin[];
}

const STAGE_DEFS: { stage: string; status: LeadStatus; isWon: boolean }[] = [
  { stage: "New",        status: "new",          isWon: false },
  { stage: "Attempted",  status: "attempted",    isWon: false },
  { stage: "Discussion", status: "in_discussion", isWon: false },
  { stage: "Nurturing",  status: "nurturing",    isWon: false },
  { stage: "Won",        status: "won",          isWon: true  },
];

export async function getAgentPerformance(
  period: PeriodValue
): Promise<AgentPerformanceData> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "agent") throw new Error("Forbidden");

  const { start, end } = getDateRange(period);

  const [periodLeadsResult, recentWinsResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id, status, deal_value")
      .eq("assigned_to", user.id)
      .gte("created_at", start)
      .lte("created_at", end),

    supabase
      .from("leads")
      .select("id, first_name, last_name, deal_value, updated_at")
      .eq("assigned_to", user.id)
      .eq("status", "won")
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const leads      = periodLeadsResult.data ?? [];
  const recentWins = (recentWinsResult.data ?? []) as RecentWin[];

  const activePipeline = leads.filter((l) =>
    ["attempted", "in_discussion"].includes(l.status)
  ).length;

  const wonLeads  = leads.filter((l) => l.status === "won");
  const winsCount = wonLeads.length;

  const attended = leads.filter(
    (l) => !["new", "trash"].includes(l.status)
  );
  const winRate =
    attended.length > 0 ? (winsCount / attended.length) * 100 : 0;

  const revenueClosed = wonLeads.reduce(
    (sum, l) => sum + (l.deal_value ?? 0), 0
  );
  const avgDealValue = winsCount > 0 ? revenueClosed / winsCount : 0;

  const bySt: Partial<Record<LeadStatus, number>> = {};
  for (const lead of leads) {
    const s = lead.status as LeadStatus;
    bySt[s] = (bySt[s] ?? 0) + 1;
  }

  const pipelineStages: PipelineStage[] = STAGE_DEFS.map((def) => ({
    ...def,
    value: bySt[def.status] ?? 0,
  }));

  return {
    activePipeline,
    winRate,
    revenueClosed,
    avgDealValue,
    winsCount,
    pipelineStages,
    recentWins,
  };
}

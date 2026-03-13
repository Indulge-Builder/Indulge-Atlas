"use server";

import { createClient } from "@/lib/supabase/server";
import type { TaskWithLead } from "@/lib/types/database";

async function requireScoutUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["scout", "admin"].includes(profile.role)) {
    throw new Error("Forbidden");
  }

  return { supabase, userId: user.id };
}

export interface CampaignLeaderboardItem {
  campaign_id:    string;
  campaign_name:  string;
  platform:       string;
  amount_spent:   number;
  revenue_closed: number;
  leads_count:    number;
  won_count:      number;
  roas:           number;
}

export interface FunnelStage {
  stage: string;
  value: number;
  pct:   number;
}

export interface WinEntry {
  id:          string;
  first_name:  string;
  last_name:   string | null;
  deal_value:  number | null;
  source:      string | null;
  campaign_id: string | null;
  updated_at:  string;
}

export interface ScoutAnalyticsData {
  tasks:       TaskWithLead[];
  leaderboard: CampaignLeaderboardItem[];
  funnelData:  FunnelStage[];
  totalClicks: number;
  recentWins:  WinEntry[];
}

export async function getScoutAnalytics(): Promise<ScoutAnalyticsData> {
  const { supabase, userId } = await requireScoutUser();

  const [tasksResult, campaignResult, adLeadsResult, winsResult] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(
          "*, lead:leads!lead_id(id, first_name, last_name, phone_number, email, status)"
        )
        .eq("assigned_to", userId)
        .eq("status", "pending")
        .order("due_date", { ascending: true })
        .limit(8),

      supabase
        .from("campaign_metrics")
        .select("campaign_id, campaign_name, platform, amount_spent, clicks"),

      supabase
        .from("leads")
        .select("campaign_id, status, deal_value")
        .not("campaign_id", "is", null),

      supabase
        .from("leads")
        .select(
          "id, first_name, last_name, deal_value, source, campaign_id, updated_at"
        )
        .eq("status", "won")
        .not("deal_value", "is", null)
        .order("updated_at", { ascending: false })
        .limit(5),
    ]);

  const campaigns = campaignResult.data ?? [];
  const adLeads   = adLeadsResult.data ?? [];

  const leaderboard: CampaignLeaderboardItem[] = campaigns
    .map((c) => {
      const cLeads    = adLeads.filter((l) => l.campaign_id === c.campaign_id);
      const wonLeads  = cLeads.filter((l) => l.status === "won");
      const revenueClosed = wonLeads.reduce((s, l) => s + (l.deal_value ?? 0), 0);
      const roas = c.amount_spent > 0 ? revenueClosed / c.amount_spent : 0;
      return {
        campaign_id:    c.campaign_id,
        campaign_name:  c.campaign_name,
        platform:       c.platform,
        amount_spent:   c.amount_spent,
        revenue_closed: revenueClosed,
        leads_count:    cLeads.length,
        won_count:      wonLeads.length,
        roas,
      };
    })
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 5);

  const totalClicks  = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);
  const totalAdLeads = adLeads.length;
  const inDiscussion = adLeads.filter((l) => l.status === "in_discussion").length;
  const won          = adLeads.filter((l) => l.status === "won").length;
  const base         = totalAdLeads || 1;

  const funnelData: FunnelStage[] = [
    { stage: "Leads In",   value: totalAdLeads,  pct: 100 },
    { stage: "Discussion", value: inDiscussion,  pct: parseFloat(((inDiscussion / base) * 100).toFixed(1)) },
    { stage: "Won",        value: won,           pct: parseFloat(((won / base) * 100).toFixed(1)) },
  ];

  return {
    tasks:      (tasksResult.data ?? []) as TaskWithLead[],
    leaderboard,
    funnelData,
    totalClicks,
    recentWins: (winsResult.data ?? []) as WinEntry[],
  };
}

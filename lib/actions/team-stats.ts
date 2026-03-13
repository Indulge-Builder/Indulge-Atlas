"use server";

import { createClient } from "@/lib/supabase/server";
import type { LeadStatus, Profile } from "@/lib/types/database";

async function requireScout() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["scout", "admin"].includes(profile.role)) {
    throw new Error("Forbidden");
  }

  return { supabase };
}

export interface AgentStats {
  totalLeads: number;
  byStatus:   Partial<Record<LeadStatus, number>>;
  wonRevenue: number;
  winRate:    number;
}

export interface AgentWithStats extends Profile {
  stats: AgentStats;
}

function computeStats(
  leads: Array<{ status: string; deal_value: number | null }>
): AgentStats {
  if (!leads || leads.length === 0) {
    return { totalLeads: 0, byStatus: {}, wonRevenue: 0, winRate: 0 };
  }

  const byStatus: Partial<Record<LeadStatus, number>> = {};
  let wonRevenue = 0;

  for (const lead of leads) {
    const s = lead.status as LeadStatus;
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    if (s === "won" && lead.deal_value) wonRevenue += lead.deal_value;
  }

  const wonCount = byStatus["won"] ?? 0;
  const winRate  = leads.length > 0 ? (wonCount / leads.length) * 100 : 0;

  return { totalLeads: leads.length, byStatus, wonRevenue, winRate };
}

export async function getAllAgentsWithStats(): Promise<AgentWithStats[]> {
  const { supabase } = await requireScout();

  const { data: agents } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("full_name");

  if (!agents || agents.length === 0) return [];

  const agentIds = agents.map((a) => a.id);

  const { data: allLeads } = await supabase
    .from("leads")
    .select("assigned_to, status, deal_value")
    .in("assigned_to", agentIds);

  const leadMap = new Map<
    string,
    Array<{ status: string; deal_value: number | null }>
  >();

  for (const lead of allLeads ?? []) {
    if (!lead.assigned_to) continue;
    const bucket = leadMap.get(lead.assigned_to) ?? [];
    bucket.push(lead);
    leadMap.set(lead.assigned_to, bucket);
  }

  return agents.map((agent) => ({
    ...(agent as Profile),
    stats: computeStats(leadMap.get(agent.id) ?? []),
  }));
}

export interface ScoutDashboardMetrics {
  totalSpend:    number;
  totalRevenue:  number;
  roas:          number;
  cpa:           number;
  wonCount:      number;
  monthlyTrend:  Array<{ month: string; revenue: number; spend: number }>;
}

export async function getScoutDashboardData(): Promise<ScoutDashboardMetrics> {
  const { supabase } = await requireScout();

  const [{ data: campaigns }, { data: wonLeads }, { count: wonCount }] =
    await Promise.all([
      supabase.from("campaign_metrics").select("amount_spent"),
      supabase
        .from("leads")
        .select("deal_value, updated_at")
        .eq("status", "won")
        .not("deal_value", "is", null)
        .order("updated_at", { ascending: true }),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "won"),
    ]);

  const totalSpend =
    campaigns?.reduce((s, c) => s + (c.amount_spent ?? 0), 0) ?? 0;
  const totalRevenue =
    wonLeads?.reduce((s, l) => s + (l.deal_value ?? 0), 0) ?? 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const cpa  = (wonCount ?? 0) > 0 ? totalSpend / (wonCount ?? 1) : 0;

  const now = new Date();
  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    const monthEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const monthRevenue =
      wonLeads
        ?.filter((l) => l.updated_at >= monthStart && l.updated_at <= monthEnd)
        .reduce((s, l) => s + (l.deal_value ?? 0), 0) ?? 0;

    return {
      month:   label,
      revenue: monthRevenue,
      spend:   Math.round(campaigns && campaigns.length > 0 ? totalSpend / 6 : 0),
    };
  });

  return { totalSpend, totalRevenue, roas, cpa, wonCount: wonCount ?? 0, monthlyTrend };
}

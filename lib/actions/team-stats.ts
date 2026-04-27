"use server";

import { createClient } from "@/lib/supabase/server";
import type { LeadStatus, Profile } from "@/lib/types/database";

async function requireManager() {
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

  if (!profile || !["admin", "founder", "manager"].includes(profile.role)) {
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
  const { supabase } = await requireManager();

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

export interface ManagerDashboardMetrics {
  totalSpend:    number;
  totalRevenue:  number;
  roas:          number;
  cpa:           number;
  wonCount:      number;
  monthlyTrend:  Array<{ month: string; revenue: number; spend: number }>;
}

export async function getManagerDashboardData(): Promise<ManagerDashboardMetrics> {
  const { supabase } = await requireManager();

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

// ── Onboarding Oversight: extended agent stats for founder dashboard ────────

export interface OnboardingAgentStats extends AgentStats {
  todayLeads: number;
  todayCalls: number;
  todayConverted: number;
  monthCalls: number;
  lostReasons: { reason: string; count: number }[];
}

export interface AgentWithOnboardingStats extends Profile {
  stats: OnboardingAgentStats;
}

export async function getOnboardingAgentsWithStats(): Promise<
  AgentWithOnboardingStats[]
> {
  const { supabase } = await requireManager();

  // Include both agents and managers for founder oversight
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["agent", "manager", "founder"])
    .eq("is_active", true)
    .order("role")
    .order("full_name");

  if (!profiles || profiles.length === 0) return [];

  const memberIds = profiles.map((p) => p.id);

  const { data: allLeads } = await supabase
    .from("leads")
    .select("assigned_to, status, deal_value")
    .in("assigned_to", memberIds);

  const leadMap = new Map<string, Array<{ status: string; deal_value: number | null }>>();
  for (const lead of allLeads ?? []) {
    if (!lead.assigned_to) continue;
    const bucket = leadMap.get(lead.assigned_to) ?? [];
    bucket.push(lead);
    leadMap.set(lead.assigned_to, bucket);
  }

  const baseAgents: AgentWithStats[] = profiles.map((p) => ({
    ...(p as Profile),
    stats: computeStats(leadMap.get(p.id) ?? []),
  }));
  const agentIds = baseAgents.map((a) => a.id);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [
    { data: todayLeadsData },
    { data: callActivities },
    { data: monthCallActivities },
    { data: lostLeads },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("assigned_to")
      .in("assigned_to", agentIds)
      .gte("assigned_at", todayStart)
      .lte("assigned_at", todayEnd),
    supabase
      .from("lead_activities")
      .select("performed_by")
      .eq("type", "call_attempt")
      .in("performed_by", agentIds)
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd),
    supabase
      .from("lead_activities")
      .select("performed_by")
      .eq("type", "call_attempt")
      .in("performed_by", agentIds)
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd),
    supabase
      .from("leads")
      .select("assigned_to, lost_reason")
      .eq("status", "lost")
      .in("assigned_to", agentIds)
      .not("lost_reason", "is", null),
  ]);

  const todayLeadsMap = new Map<string, number>();
  for (const row of todayLeadsData ?? []) {
    if (row.assigned_to) {
      todayLeadsMap.set(row.assigned_to, (todayLeadsMap.get(row.assigned_to) ?? 0) + 1);
    }
  }

  const todayCallsMap = new Map<string, number>();
  for (const row of callActivities ?? []) {
    todayCallsMap.set(row.performed_by, (todayCallsMap.get(row.performed_by) ?? 0) + 1);
  }

  const monthCallsMap = new Map<string, number>();
  for (const row of monthCallActivities ?? []) {
    monthCallsMap.set(row.performed_by, (monthCallsMap.get(row.performed_by) ?? 0) + 1);
  }

  const lostReasonsMap = new Map<string, Map<string, number>>();
  for (const row of lostLeads ?? []) {
    if (!row.assigned_to || !row.lost_reason) continue;
    const reason = String(row.lost_reason).trim();
    const agentMap = lostReasonsMap.get(row.assigned_to) ?? new Map();
    agentMap.set(reason, (agentMap.get(reason) ?? 0) + 1);
    lostReasonsMap.set(row.assigned_to, agentMap);
  }

  const { data: todayWonRows } = await supabase
    .from("leads")
    .select("assigned_to")
    .eq("status", "won")
    .in("assigned_to", agentIds)
    .gte("updated_at", todayStart)
    .lte("updated_at", todayEnd);

  const todayConvertedMap = new Map<string, number>();
  for (const row of todayWonRows ?? []) {
    if (row.assigned_to) {
      todayConvertedMap.set(row.assigned_to, (todayConvertedMap.get(row.assigned_to) ?? 0) + 1);
    }
  }

  return baseAgents.map((agent) => {
    const lostReasons = Array.from(lostReasonsMap.get(agent.id)?.entries() ?? [])
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return {
      ...agent,
      stats: {
        ...agent.stats,
        todayLeads: todayLeadsMap.get(agent.id) ?? 0,
        todayCalls: todayCallsMap.get(agent.id) ?? 0,
        todayConverted: todayConvertedMap.get(agent.id) ?? 0,
        monthCalls: monthCallsMap.get(agent.id) ?? 0,
        lostReasons,
      },
    };
  });
}

// ── Single agent fetch (for shared AgentPerformanceModal) ────────
// Optimized: fetches ONLY the requested agent's data instead of all agents + leads.

export async function getAgentPerformanceById(
  agentId: string | null
): Promise<AgentWithOnboardingStats | null> {
  if (!agentId) return null;
  const { supabase } = await requireManager();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [
    { data: profile },
    { data: allLeads },
    { data: todayLeadsData },
    { data: callActivities },
    { data: monthCallActivities },
    { data: lostLeads },
    { data: todayWonRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, dob, role, domain, is_active, created_at, updated_at")
      .eq("id", agentId)
      .in("role", ["agent", "manager", "founder"])
      .eq("is_active", true)
      .single(),
    supabase
      .from("leads")
      .select("assigned_to, status, deal_value")
      .eq("assigned_to", agentId),
    supabase
      .from("leads")
      .select("assigned_to")
      .eq("assigned_to", agentId)
      .gte("assigned_at", todayStart)
      .lte("assigned_at", todayEnd),
    supabase
      .from("lead_activities")
      .select("performed_by")
      .eq("type", "call_attempt")
      .eq("performed_by", agentId)
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd),
    supabase
      .from("lead_activities")
      .select("performed_by")
      .eq("type", "call_attempt")
      .eq("performed_by", agentId)
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd),
    supabase
      .from("leads")
      .select("assigned_to, lost_reason")
      .eq("status", "lost")
      .eq("assigned_to", agentId)
      .not("lost_reason", "is", null),
    supabase
      .from("leads")
      .select("assigned_to")
      .eq("status", "won")
      .eq("assigned_to", agentId)
      .gte("updated_at", todayStart)
      .lte("updated_at", todayEnd),
  ]);

  if (!profile) return null;

  const leads = allLeads ?? [];
  const stats = computeStats(leads);

  const lostReasons = (lostLeads ?? [])
    .filter((r) => r.assigned_to && r.lost_reason)
    .reduce<Map<string, number>>((acc, r) => {
      const reason = String(r.lost_reason).trim();
      acc.set(reason, (acc.get(reason) ?? 0) + 1);
      return acc;
    }, new Map());
  const lostReasonsSorted = Array.from(lostReasons.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    ...(profile as Profile),
    stats: {
      ...stats,
      todayLeads: todayLeadsData?.length ?? 0,
      todayCalls: callActivities?.length ?? 0,
      todayConverted: todayWonRows?.length ?? 0,
      monthCalls: monthCallActivities?.length ?? 0,
      lostReasons: lostReasonsSorted,
    },
  };
}

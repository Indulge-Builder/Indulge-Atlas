"use server";

import { createClient } from "@/lib/supabase/server";
import type { CampaignMetric, Lead } from "@/lib/types/database";
import type { CampaignTableRow } from "@/lib/types/campaigns";
import { MOCK_CAMPAIGNS } from "@/lib/data/campaigns-mock";
import { LEADS_TABLE_SELECT } from "@/lib/leads/leadsTableSelect";

// ── Auth guard ─────────────────────────────────────────────────────────────────
async function requireManagerOrAdmin() {
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

// ── Campaign list with attribution stats ───────────────────────────────────────

export interface CampaignWithAttribution extends CampaignMetric {
  leads_count:   number;
  won_count:     number;
  revenue:       number;
  cpl:           number; // Cost Per Lead = amount_spent / leads_count
}

export async function getCampaignsWithAttribution(): Promise<CampaignWithAttribution[]> {
  const { supabase } = await requireManagerOrAdmin();

  // Fetch all campaign metrics rows
  const { data: campaigns, error: campaignsErr } = await supabase
    .from("campaign_metrics")
    .select("*")
    .order("amount_spent", { ascending: false });

  if (campaignsErr) throw new Error(campaignsErr.message);
  if (!campaigns?.length) return [];

  // Fetch all leads with attribution in one query
  const campaignIds = campaigns.map((c) => c.campaign_id);

  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("utm_campaign, status, deal_value")
    .in("utm_campaign", campaignIds);

  if (leadsErr) throw new Error(leadsErr.message);

  // Build attribution map
  const statsMap = new Map<
    string,
    { leads_count: number; won_count: number; revenue: number }
  >();

  for (const lead of leads ?? []) {
    if (!lead.utm_campaign) continue;
    const existing = statsMap.get(lead.utm_campaign) ?? {
      leads_count: 0,
      won_count: 0,
      revenue: 0,
    };
    existing.leads_count += 1;
    if (lead.status === "won") {
      existing.won_count += 1;
      existing.revenue += lead.deal_value ?? 0;
    }
    statsMap.set(lead.utm_campaign, existing);
  }

  return campaigns.map((c) => {
    const stats = statsMap.get(c.campaign_id) ?? {
      leads_count: 0,
      won_count: 0,
      revenue: 0,
    };
    const cpl =
      stats.leads_count > 0 ? c.amount_spent / stats.leads_count : 0;
    return { ...c, ...stats, cpl };
  });
}

/** Convert to table row format; use mock data when DB is empty */
export async function getCampaignsForTable(): Promise<CampaignTableRow[]> {
  const db = await getCampaignsWithAttribution();
  if (db.length > 0) {
    return db.map((c) => {
      const leadsCount = c.leads_count;
      const conversions = c.conversions ?? leadsCount;
      return {
        id: c.id,
        campaign_id: c.campaign_id,
        campaign_name: c.campaign_name,
        platform: c.platform,
        status: (c.status ?? "active") as "active" | "paused",
        total_impressions: c.impressions,
        total_spend: c.amount_spent,
        total_conversions: conversions,
        leads_generated: leadsCount,
        cpa: c.cpl,
        last_synced_at: c.last_synced_at,
      };
    });
  }
  return MOCK_CAMPAIGNS;
}

export interface NextTask {
  id: string;
  lead_id: string;
  title: string;
  due_date: string;
  task_type: string;
}

/** Fetch leads for a specific campaign (for dossier Leads tab).
 * Matches leads by utm_campaign = campaign_id OR campaign_name = campaign_name
 * so that leads attributed by any of these fields appear in the tab. */
export async function getLeadsForCampaign(
  campaignId: string,
  opts: {
    page?: number;
    q?: string;
    status?: string;
    agent?: string;
  }
): Promise<{
  leads: import("@/lib/types/database").Lead[];
  totalCount: number;
  agents: { id: string; full_name: string }[];
  nextTaskMap: Record<string, NextTask>;
}> {
  const { supabase } = await requireManagerOrAdmin();
  const PAGE_SIZE = 20;
  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Fetch campaign to get campaign_name for matching
  const { data: campaign } = await supabase
    .from("campaign_metrics")
    .select("campaign_name")
    .eq("campaign_id", campaignId)
    .single();

  const campaignName = campaign?.campaign_name ?? null;

  let query = supabase
    .from("leads")
    .select(LEADS_TABLE_SELECT, {
      count: "exact",
    });

  // Match leads by utm_campaign = campaign_id OR utm_campaign = campaign_name OR campaign_name = campaign_name
  // Escape values with spaces/special chars for PostgREST
  const esc = (v: string) =>
    /^[a-zA-Z0-9_-]+$/.test(v) ? v : `"${String(v).replace(/"/g, '""')}"`;

  if (campaignName) {
    query = query.or(
      `utm_campaign.eq.${esc(campaignId)},utm_campaign.eq.${esc(campaignName)},campaign_name.eq.${esc(campaignName)}`,
    );
  } else {
    query = query.eq("utm_campaign", campaignId);
  }

  if (opts.status && opts.status !== "ALL") {
    query = query.eq("status", opts.status as import("@/lib/types/database").LeadStatus);
  }
  if (opts.agent && opts.agent !== "ALL") {
    query = query.eq("assigned_to", opts.agent);
  }
  if (opts.q?.trim()) {
    const sanitized = opts.q.replace(/[(),'"]/g, "").trim();
    const q = `%${sanitized}%`;
    query = query.or(
      `first_name.ilike.${q},last_name.ilike.${q},phone_number.ilike.${q},email.ilike.${q},city.ilike.${q},utm_campaign.ilike.${q}`
    );
  }

  const { data: rawLeads, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const leads = (rawLeads ?? []) as unknown as import("@/lib/types/database").Lead[];
  const leadIds = leads.map((l) => l.id);
  let nextTaskMap: Record<string, NextTask> = {};

  if (leadIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, lead_id, title, due_date, task_type")
      .in("lead_id", leadIds)
      .neq("status", "completed")
      .order("due_date", { ascending: true });
    (taskRows ?? []).forEach((t) => {
      if (t.lead_id && !nextTaskMap[t.lead_id]) {
        nextTaskMap[t.lead_id] = t as NextTask;
      }
    });
  }

  const { data: agentRows } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "agent")
    .eq("is_active", true);
  const agents = (agentRows ?? []) as { id: string; full_name: string }[];

  return {
    leads,
    totalCount: count ?? 0,
    agents,
    nextTaskMap,
  };
}

/** Get campaign dossier — from DB or mock when not found */
export async function getCampaignDossierOrMock(
  campaignId: string
): Promise<CampaignDossierData | null> {
  try {
    return await getCampaignDossier(campaignId);
  } catch {
    const mock = MOCK_CAMPAIGNS.find((c) => c.campaign_id === campaignId);
    if (!mock) return null;
    return {
      campaign: {
        id: mock.id,
        platform: mock.platform,
        campaign_id: mock.campaign_id,
        campaign_name: mock.campaign_name,
        amount_spent: mock.total_spend,
        impressions: mock.total_impressions,
        clicks: mock.total_conversions * 3,
        cpc: mock.cpa / 3,
        last_synced_at: mock.last_synced_at,
        created_at: mock.last_synced_at,
      },
      pipeline: [],
      trophyCase: [],
      totalRevenue: 0,
    };
  }
}

// ── Campaign dossier detail (leads for a specific campaign) ────────────────────

export interface DossierLead extends Pick<Lead,
  "id" | "first_name" | "last_name" | "phone_number" |
  "email" | "status" | "deal_value" | "created_at" | "utm_source" | "utm_medium"
> {
  assigned_agent?: { full_name: string } | null;
}

export interface CampaignDossierData {
  campaign:     CampaignMetric;
  pipeline:     DossierLead[];
  trophyCase:   DossierLead[];
  totalRevenue: number;
}

export async function getCampaignDossier(
  campaignId: string
): Promise<CampaignDossierData> {
  const { supabase } = await requireManagerOrAdmin();

  const [{ data: campaign, error: cErr }, { data: leads, error: lErr }] =
    await Promise.all([
      supabase
        .from("campaign_metrics")
        .select("*")
        .eq("campaign_id", campaignId)
        .single(),
      supabase
        .from("leads")
        .select(
          "id, first_name, last_name, phone_number, email, status, deal_value, created_at, utm_source, utm_medium, assigned_agent:profiles!assigned_to(full_name)"
        )
        .eq("utm_campaign", campaignId)
        .order("created_at", { ascending: false }),
    ]);

  if (cErr) throw new Error(`Campaign not found: ${cErr.message}`);
  if (lErr) throw new Error(lErr.message);

  const allLeads = (leads ?? []).map((l) => ({
    ...l,
    assigned_agent: Array.isArray(l.assigned_agent)
      ? (l.assigned_agent[0] ?? null)
      : (l.assigned_agent ?? null),
  })) as DossierLead[];
  const wonLeads = allLeads.filter((l) => l.status === "won");
  const totalRevenue = wonLeads.reduce((sum, l) => sum + (l.deal_value ?? 0), 0);

  return {
    campaign,
    pipeline:     allLeads,
    trophyCase:   wonLeads,
    totalRevenue,
  };
}

// ── Distinct UTM campaigns for filter dropdown ─────────────────────────────────

export async function getDistinctUtmCampaigns(): Promise<string[]> {
  const { supabase } = await requireManagerOrAdmin();

  const { data, error } = await supabase
    .from("leads")
    .select("utm_campaign")
    .not("utm_campaign", "is", null)
    .order("utm_campaign");

  if (error) throw new Error(error.message);

  const unique = [
    ...new Set((data ?? []).map((r) => r.utm_campaign).filter(Boolean) as string[]),
  ];
  return unique;
}


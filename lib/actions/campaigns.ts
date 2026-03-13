"use server";

import { createClient } from "@/lib/supabase/server";
import type { CampaignMetric, Lead } from "@/lib/types/database";

// ── Auth guard ─────────────────────────────────────────────────────────────────
async function requireScoutOrAdmin() {
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

// ── Campaign list with attribution stats ───────────────────────────────────────

export interface CampaignWithAttribution extends CampaignMetric {
  leads_count:   number;
  won_count:     number;
  revenue:       number;
  cpl:           number; // Cost Per Lead = amount_spent / leads_count
}

export async function getCampaignsWithAttribution(): Promise<CampaignWithAttribution[]> {
  const { supabase } = await requireScoutOrAdmin();

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
  const { supabase } = await requireScoutOrAdmin();

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
  const { supabase } = await requireScoutOrAdmin();

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


"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CampaignWithStats } from "@/lib/types/database";

// ── Auth guard: manager or admin only ────────────────────────

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

  if (!profile || !["scout", "admin"].includes(profile.role)) {
    throw new Error("Forbidden");
  }

  return { supabase, user, role: profile.role };
}

// ── Manager Dashboard Overview ────────────────────────────────

export interface ManagerOverviewData {
  totalSpend: number;
  totalRevenue: number;
  roas: number;
  monthlyTrend: Array<{
    month: string;
    revenue: number;
    spend: number;
  }>;
}

export async function getManagerOverview(): Promise<ManagerOverviewData> {
  const { supabase } = await requireManager();

  // Total ad spend from all campaigns
  const { data: campaigns } = await supabase
    .from("campaign_metrics")
    .select("amount_spent");

  const totalSpend =
    campaigns?.reduce((sum, c) => sum + (c.amount_spent ?? 0), 0) ?? 0;

  // Total revenue from WON leads
  const { data: wonLeads } = await supabase
    .from("leads")
    .select("deal_value, updated_at")
    .eq("status", "won")
    .not("deal_value", "is", null)
    .order("updated_at", { ascending: true });

  const totalRevenue =
    wonLeads?.reduce((sum, l) => sum + (l.deal_value ?? 0), 0) ?? 0;

  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Build monthly trend for the last 6 months
  const now = new Date();
  const months: Array<{ month: string; revenue: number; spend: number }> = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    const monthEnd = new Date(
      d.getFullYear(),
      d.getMonth() + 1,
      0,
      23,
      59,
      59
    ).toISOString();

    const monthRevenue =
      wonLeads
        ?.filter(
          (l) => l.updated_at >= monthStart && l.updated_at <= monthEnd
        )
        .reduce((sum, l) => sum + (l.deal_value ?? 0), 0) ?? 0;

    // Distribute total spend proportionally across months as an approximation
    // (real implementation would pull per-month snapshots from an append log)
    const spendShare =
      campaigns && campaigns.length > 0 ? totalSpend / 6 : 0;

    months.push({ month: label, revenue: monthRevenue, spend: Math.round(spendShare) });
  }

  return { totalSpend, totalRevenue, roas, monthlyTrend: months };
}

// ── Campaign Performance ──────────────────────────────────────

export async function getCampaignStats(
  platform: "meta" | "google" | "website" | "events" | "referral"
): Promise<CampaignWithStats[]> {
  const { supabase } = await requireManager();

  const { data: campaigns } = await supabase
    .from("campaign_metrics")
    .select("*")
    .eq("platform", platform)
    .order("amount_spent", { ascending: false });

  if (!campaigns || campaigns.length === 0) return [];

  const campaignIds = campaigns.map((c) => c.campaign_id);

  // Batch: two queries for all campaigns instead of 2N queries
  const [{ data: allLeads }, { data: wonLeads }] = await Promise.all([
    supabase
      .from("leads")
      .select("campaign_id")
      .in("campaign_id", campaignIds),
    supabase
      .from("leads")
      .select("campaign_id, deal_value")
      .in("campaign_id", campaignIds)
      .eq("status", "won")
      .not("deal_value", "is", null),
  ]);

  // Aggregate counts and revenue in memory
  const leadCountByCampaign = new Map<string, number>();
  for (const row of allLeads ?? []) {
    if (row.campaign_id) {
      leadCountByCampaign.set(row.campaign_id, (leadCountByCampaign.get(row.campaign_id) ?? 0) + 1);
    }
  }

  const revenueByCampaign = new Map<string, number>();
  for (const row of wonLeads ?? []) {
    if (row.campaign_id) {
      revenueByCampaign.set(row.campaign_id, (revenueByCampaign.get(row.campaign_id) ?? 0) + (row.deal_value ?? 0));
    }
  }

  const enriched = campaigns.map((c) => {
    const leadsGenerated = leadCountByCampaign.get(c.campaign_id) ?? 0;
    const revenueClosed = revenueByCampaign.get(c.campaign_id) ?? 0;
    const roi =
      c.amount_spent > 0
        ? ((revenueClosed - c.amount_spent) / c.amount_spent) * 100
        : 0;

    return {
      ...c,
      leads_generated: leadsGenerated,
      revenue_closed: revenueClosed,
      roi,
    } as CampaignWithStats;
  });

  return enriched;
}

// ── Sync Campaign Data (Mock) ─────────────────────────────────
// In production, this would call Meta Graph API and Google Ads API,
// then upsert the results. For now it generates realistic mock data.

export async function syncCampaignData(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    await requireManager();
    const supabase = await createServiceClient();

    const mockMeta = [
      {
        platform: "meta" as const,
        campaign_id: "meta_001",
        campaign_name: "Indulge Global — Awareness Q1",
        amount_spent: 12450.0,
        impressions: 284500,
        clicks: 3210,
        last_synced_at: new Date().toISOString(),
      },
      {
        platform: "meta" as const,
        campaign_id: "meta_002",
        campaign_name: "Concierge Luxury Retargeting",
        amount_spent: 7800.0,
        impressions: 96800,
        clicks: 1540,
        last_synced_at: new Date().toISOString(),
      },
      {
        platform: "meta" as const,
        campaign_id: "meta_003",
        campaign_name: "High Net Worth Lookalike",
        amount_spent: 9200.0,
        impressions: 142300,
        clicks: 2080,
        last_synced_at: new Date().toISOString(),
      },
    ];

    const mockGoogle = [
      {
        platform: "google" as const,
        campaign_id: "goog_001",
        campaign_name: "Branded Search — Indulge Global",
        amount_spent: 4350.0,
        impressions: 52400,
        clicks: 4210,
        last_synced_at: new Date().toISOString(),
      },
      {
        platform: "google" as const,
        campaign_id: "goog_002",
        campaign_name: "Luxury Concierge Keywords",
        amount_spent: 8600.0,
        impressions: 118700,
        clicks: 3870,
        last_synced_at: new Date().toISOString(),
      },
      {
        platform: "google" as const,
        campaign_id: "goog_003",
        campaign_name: "Display — Affluent Audience",
        amount_spent: 5100.0,
        impressions: 320000,
        clicks: 1120,
        last_synced_at: new Date().toISOString(),
      },
    ];

    const mockWebsite = [
      {
        platform: "website" as const,
        campaign_id: "web_001",
        campaign_name: "SEO — Luxury Concierge Landing",
        amount_spent: 3200.0,
        impressions: 48600,
        clicks: 2940,
        last_synced_at: new Date().toISOString(),
      },
      {
        platform: "website" as const,
        campaign_id: "web_002",
        campaign_name: "Blog — High Net Worth Lifestyle",
        amount_spent: 1800.0,
        impressions: 31200,
        clicks: 1670,
        last_synced_at: new Date().toISOString(),
      },
      {
        platform: "website" as const,
        campaign_id: "web_003",
        campaign_name: "Landing Page — Membership Drive",
        amount_spent: 2500.0,
        impressions: 19800,
        clicks: 1320,
        last_synced_at: new Date().toISOString(),
      },
    ];

    const mockEvents = [
      {
        platform: "events" as const,
        campaign_id: "evt_001",
        campaign_name: "Dubai Luxury Expo 2025",
        amount_spent: 18000.0,
        impressions: 5200,
        clicks: 870,
        last_synced_at: new Date().toISOString(),
      },
      {
        platform: "events" as const,
        campaign_id: "evt_002",
        campaign_name: "Mumbai Private Members Evening",
        amount_spent: 12500.0,
        impressions: 3100,
        clicks: 540,
        last_synced_at: new Date().toISOString(),
      },
      {
        platform: "events" as const,
        campaign_id: "evt_003",
        campaign_name: "Bangalore Business Gala",
        amount_spent: 9800.0,
        impressions: 2600,
        clicks: 420,
        last_synced_at: new Date().toISOString(),
      },
    ];

    const mockReferral = [
      {
        platform: "referral" as const,
        campaign_id: "ref_001",
        campaign_name: "Partner — Prestige Realty Group",
        amount_spent: 0,
        impressions: 0,
        clicks: 0,
        last_synced_at: new Date().toISOString(),
      },
      {
        platform: "referral" as const,
        campaign_id: "ref_002",
        campaign_name: "Client Referral Programme",
        amount_spent: 4500.0,
        impressions: 0,
        clicks: 0,
        last_synced_at: new Date().toISOString(),
      },
      {
        platform: "referral" as const,
        campaign_id: "ref_003",
        campaign_name: "Partner — Elite Travel Agents",
        amount_spent: 2200.0,
        impressions: 0,
        clicks: 0,
        last_synced_at: new Date().toISOString(),
      },
    ];

    const allMock = [
      ...mockMeta,
      ...mockGoogle,
      ...mockWebsite,
      ...mockEvents,
      ...mockReferral,
    ];

    const { error } = await supabase
      .from("campaign_metrics")
      .upsert(allMock, { onConflict: "platform,campaign_id" });

    if (error) throw new Error(error.message);

    revalidatePath("/manager/campaigns");
    revalidatePath("/manager/dashboard");

    return { success: true, message: "Data synced successfully" };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Sync failed unexpectedly";
    return { success: false, message };
  }
}

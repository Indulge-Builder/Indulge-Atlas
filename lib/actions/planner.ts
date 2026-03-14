"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { AdPlatform, CampaignDraft } from "@/lib/types/database";

const adPlatformSchema = z.enum(["meta", "google", "website", "events", "referral"]);
const saveDraftSchema = z.object({
  campaign_name: z.string().min(1).max(200),
  platform: adPlatformSchema,
  objective: z.string().max(500).nullable(),
  total_budget: z.number().min(0),
  target_cpa: z.number().min(0),
  projected_revenue: z.number().min(0),
});

// ── Auth guard ────────────────────────────────────────────────

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

  return { supabase, userId: user.id };
}

// ── Fetch drafts ──────────────────────────────────────────────

export async function getCampaignDrafts(): Promise<CampaignDraft[]> {
  const { supabase } = await requireScout();

  const { data } = await supabase
    .from("campaign_drafts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []) as CampaignDraft[];
}

// ── Save a new draft ──────────────────────────────────────────

export interface SaveDraftInput {
  campaign_name: string;
  platform: AdPlatform;
  objective: string | null;
  total_budget: number;
  target_cpa: number;
  projected_revenue: number;
}

export async function saveCampaignDraft(
  input: unknown
): Promise<{ success: boolean; draft?: CampaignDraft; error?: string }> {
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const { supabase, userId } = await requireScout();

    const { data, error } = await supabase
      .from("campaign_drafts")
      .insert({
        campaign_name:     parsed.data.campaign_name,
        platform:          parsed.data.platform,
        objective:         parsed.data.objective || null,
        total_budget:      parsed.data.total_budget,
        target_cpa:        parsed.data.target_cpa,
        projected_revenue: parsed.data.projected_revenue,
        status:            "draft",
        created_by:        userId,
      })
      .select()
      .single();

    if (error || !data) {
      console.error("[planner/save] Supabase error:", error?.message);
      return { success: false, error: "Failed to save draft." };
    }

    revalidatePath("/scout/planner");
    return { success: true, draft: data as CampaignDraft };
  } catch (err) {
    console.error("[planner/save] Unexpected:", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

// ── Historical performance data ───────────────────────────────
// Used to pre-populate the Forecasting Studio defaults with
// the team's actual win rate and average deal size.

export interface HistoricalData {
  winRate: number;       // percent, e.g. 14.5
  avgDealValue: number;  // INR, e.g. 2500000
}

export async function getHistoricalData(): Promise<HistoricalData> {
  const { supabase } = await requireScout();

  const [leadsResult, wonResult] = await Promise.all([
    // All non-junk leads for win rate calculation
    supabase
      .from("leads")
      .select("id, status")
      .not("status", "in", '("trash")'),
    // Won leads with deal_value for average deal computation
    supabase
      .from("leads")
      .select("deal_value")
      .eq("status", "won")
      .not("deal_value", "is", null),
  ]);

  const allLeads = leadsResult.data ?? [];
  const wonLeads = wonResult.data ?? [];

  const total = allLeads.length;
  const won   = allLeads.filter((l) => l.status === "won").length;

  // Round win rate to one decimal place; default 15 % if no data
  const winRate =
    total > 0 ? Math.round((won / total) * 1000) / 10 : 15;

  // Default ₹25L — representative luxury concierge deal size
  const avgDealValue =
    wonLeads.length > 0
      ? wonLeads.reduce((s, l) => s + (l.deal_value ?? 0), 0) / wonLeads.length
      : 25_00_000;

  return { winRate, avgDealValue };
}

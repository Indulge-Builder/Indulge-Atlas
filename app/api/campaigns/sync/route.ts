import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchMetaAdsData, fetchGoogleAdsData } from "@/lib/services/campaign-sync";

/**
 * POST /api/campaigns/sync
 *
 * On-Demand Sync — Orchestrator for Meta & Google Ads campaign metrics.
 * Fetches from both platforms (skeleton with mock for now), merges, upserts to DB.
 *
 * Auth: Requires authenticated scout or admin (session cookie).
 * Fault-tolerant: If Meta succeeds but Google fails, saves Meta data and returns partial success.
 */
export async function POST() {
  // ── Step 1: Authenticate ─────────────────────────────────────────────────
  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseAuth
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !profile?.role ||
    !["admin", "founder", "manager"].includes(profile.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Step 2: Fetch from both platforms (fault-tolerant) ───────────────────
  const allRows: Array<{
    campaign_id: string;
    campaign_name: string;
    platform: "meta" | "google";
    status: string;
    amount_spent: number;
    impressions: number;
    clicks: number;
    conversions: number;
    cpc: number;
  }> = [];
  const errors: string[] = [];

  try {
    const metaData = await fetchMetaAdsData();
    allRows.push(...metaData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Meta fetch failed";
    errors.push(`Meta: ${msg}`);
    console.error("[campaigns/sync] Meta API failed — error.message:", msg);
    if (e instanceof Error && e.stack) {
      console.error("[campaigns/sync] Meta stack:", e.stack);
    }
  }

  try {
    const googleData = await fetchGoogleAdsData();
    allRows.push(...googleData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google fetch failed";
    errors.push(`Google: ${msg}`);
    console.error("[campaigns/sync] Google API failed — error.message:", msg);
  }

  if (allRows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No data could be fetched",
        details: errors.join("; "),
      },
      { status: 502 }
    );
  }

  // ── Step 3: Upsert to campaign_metrics ────────────────────────────────────
  const supabase = await createServiceClient();
  const lastSynced = new Date().toISOString();

  const rows = allRows.map((r) => ({
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    platform: r.platform,
    status: r.status ?? "active",
    amount_spent: r.amount_spent,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions ?? 0,
    cpc: r.cpc,
    last_synced_at: lastSynced,
  }));

  const { error: upsertError } = await supabase
    .from("campaign_metrics")
    .upsert(rows, {
      onConflict: "platform,campaign_id",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    console.error("[campaigns/sync] Upsert failed:", upsertError.message);
    return NextResponse.json(
      {
        success: false,
        error: "Database update failed",
        details: upsertError.message,
      },
      { status: 500 }
    );
  }

  // ── Step 4: Response ────────────────────────────────────────────────────
  const partialWarning =
    errors.length > 0
      ? `Partial sync: ${errors.join("; ")}. Saved ${allRows.length} campaign(s).`
      : undefined;

  return NextResponse.json(
    {
      success: true,
      updated_count: rows.length,
      last_synced: lastSynced,
      ...(partialWarning && { warning: partialWarning }),
    },
    { status: 200 }
  );
}

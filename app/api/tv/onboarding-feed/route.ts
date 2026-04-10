import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getTvTokenFromRequest,
  tvDashboardTokenValid,
} from "@/lib/tv/tvDashboardAuth";

/**
 * GET /api/tv/onboarding-feed?token=...
 * or Authorization: Bearer <TV_DASHBOARD_SECRET>
 *
 * JSON feed for the live TV display (no CRM login). Protect with TV_DASHBOARD_SECRET.
 */
export async function GET(request: NextRequest) {
  const token = getTvTokenFromRequest(request);
  if (!tvDashboardTokenValid(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("onboarding_leads")
    .select("id, client_name, amount, agent_name, assigned_to, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[api/tv/onboarding-feed]", error.message);
    return NextResponse.json(
      { error: "Failed to load conversions." },
      { status: 500 },
    );
  }

  return NextResponse.json({ rows: data ?? [] });
}

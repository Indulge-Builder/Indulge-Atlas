"use server";

import { createClient } from "@/lib/supabase/server";

export interface BriefingAlert {
  id:        string;
  type:      "win" | "warning" | "neutral";
  headline:  string;
  detail:    string;
  timestamp: string;
}

export interface BriefingData {
  greeting:       string;
  firstName:      string;
  summaryLine:    string;
  attentionCount: number;
  alerts:         BriefingAlert[];
}

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function fmtDealValue(v: number | null): string {
  const n = v ?? 0;
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)} Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(1)} L`;
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(0)} K`;
  return `₹${Math.round(n)}`;
}

export async function getBriefingData(_callerUserId?: string): Promise<BriefingData> {
  const supabase = await createClient();

  // Always derive userId from the authenticated session — never trust caller input
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthenticated");
  }

  const userId = user.id;

  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [profileR, metricsR, winsR, pipelineR] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single(),

    supabase
      .from("campaign_metrics")
      .select("platform, campaign_name, amount_spent, last_synced_at")
      .order("amount_spent", { ascending: false })
      .limit(10),

    supabase
      .from("leads")
      .select("id, first_name, last_name, deal_value, updated_at")
      .eq("status", "won")
      .gte("updated_at", sevenDaysAgo)
      .order("updated_at", { ascending: false })
      .limit(3),

    supabase
      .from("leads")
      .select("id, status")
      .in("status", ["in_discussion", "attempted"]),
  ]);

  const profile   = profileR.data;
  const firstName = profile?.full_name?.split(" ")[0] ?? "Andreas";
  const greeting  = getGreeting(new Date().getHours());

  const metrics = metricsR.data ?? [];

  const platformLabels: Record<string, string> = {
    meta:   "Meta",
    google: "Google",
  };

  const platforms = [
    ...new Set(metrics.map((m) => platformLabels[m.platform] ?? m.platform)),
  ];

  const summaryLine = (() => {
    if (metrics.length === 0) {
      return "No campaigns are actively synced yet. Head to the Ad Planner to model your next initiative.";
    }
    const pStr =
      platforms.length === 1
        ? platforms[0]
        : platforms.slice(0, -1).join(", ") + " and " + platforms[platforms.length - 1];
    return `Your ${metrics.length} active campaign${
      metrics.length > 1 ? "s" : ""
    } across ${pStr} are being monitored.`;
  })();

  const alerts: BriefingAlert[] = [];

  const wins = winsR.data ?? [];
  wins.forEach((lead) => {
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
    alerts.push({
      id:        `win-${lead.id}`,
      type:      "win",
      headline:  `${name} — ${fmtDealValue(lead.deal_value)} won`,
      detail:    "Lead successfully converted by your onboarding team this week.",
      timestamp: lead.updated_at,
    });
  });

  const pipeline  = pipelineR.data ?? [];
  const inDiscuss = pipeline.filter((l) => l.status === "in_discussion").length;
  const attempted = pipeline.filter((l) => l.status === "attempted").length;

  if (inDiscuss > 0 || attempted > 0) {
    alerts.push({
      id:        "pipeline-health",
      type:      "neutral",
      headline:  `Pipeline: ${inDiscuss} in discussion · ${attempted} attempted`,
      detail:    "Active engagements across the onboarding team. Review momentum.",
      timestamp: new Date().toISOString(),
    });
  }

  const topSpend = metrics[0];
  if (topSpend && topSpend.amount_spent > 50_000) {
    alerts.push({
      id:        `spend-${topSpend.campaign_name}`,
      type:      "warning",
      headline:  `"${topSpend.campaign_name}" — ${fmtDealValue(topSpend.amount_spent)} spent`,
      detail:    "Verify budget caps are in place and pacing is on target.",
      timestamp: topSpend.last_synced_at,
    });
  }

  const attentionCount = alerts.filter((a) => a.type === "warning").length;

  return { greeting, firstName, summaryLine, attentionCount, alerts };
}

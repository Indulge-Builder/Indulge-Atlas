"use server";

import { formatDistanceToNowStrict, subDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import {
  formatIST,
  getIstDayUtcBoundsIso,
  SYSTEM_TIMEZONE,
} from "@/lib/utils/time";
import {
  canViewExecutiveData,
  type BriefingAssignee,
  type BriefingPipelinePulse,
  type BriefingRecentWin,
  type BriefingStagnantLead,
  type BriefingTrendMetric,
  type YesterdayAgentRank,
  type YesterdayExecutiveBriefing,
} from "@/lib/briefing/executiveBriefing";
import { createClient } from "@/lib/supabase/server";
import type { IndulgeDomain } from "@/lib/types/database";

export type {
  BriefingAssignee,
  BriefingPipelinePulse,
  BriefingRecentWin,
  BriefingStagnantLead,
  BriefingTrendMetric,
  YesterdayAgentRank,
  YesterdayExecutiveBriefing,
} from "@/lib/briefing/executiveBriefing";

const ACTIVE_PIPELINE_STATUSES = [
  "new",
  "attempted",
  "connected",
  "in_discussion",
  "nurturing",
] as const;

const STAGNANT_LIST_LIMIT = 50;

function oneAssignee(
  raw:
    | BriefingAssignee
    | BriefingAssignee[]
    | null
    | undefined,
): BriefingAssignee | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function leadDisplayName(first: unknown, last: unknown): string {
  const a = typeof first === "string" ? first.trim() : "";
  const b = typeof last === "string" ? last.trim() : "";
  const name = [a, b].filter(Boolean).join(" ");
  return name || "Unnamed lead";
}

function buildPipelinePulse(
  rows: Array<{ status: string | null | undefined }>,
): BriefingPipelinePulse {
  const pulse: BriefingPipelinePulse = {
    new: 0,
    attempted: 0,
    connected: 0,
    in_discussion: 0,
    nurturing: 0,
    other: 0,
    total: 0,
  };
  for (const r of rows) {
    const s = (r.status ?? "").toLowerCase();
    pulse.total += 1;
    if (s === "new") pulse.new += 1;
    else if (s === "attempted") pulse.attempted += 1;
    else if (s === "connected") pulse.connected += 1;
    else if (s === "in_discussion") pulse.in_discussion += 1;
    else if (s === "nurturing") pulse.nurturing += 1;
    else pulse.other += 1;
  }
  return pulse;
}

type ActivityRow = {
  id: string;
  actor_id: string | null;
  action_type: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor: { id: string; full_name: string } | null;
};

function normalizeActivityRows(raw: unknown[]): ActivityRow[] {
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    let actor = r.actor as ActivityRow["actor"] | ActivityRow["actor"][] | null | undefined;
    if (Array.isArray(actor)) actor = actor[0] ?? null;
    return {
      id: String(r.id),
      actor_id: (r.actor_id as string | null) ?? null,
      action_type: (r.action_type as string | null) ?? null,
      details: (r.details as Record<string, unknown> | null) ?? null,
      created_at: String(r.created_at),
      actor: actor ?? null,
    };
  });
}

/** Yesterday and the same weekday last week (IST calendar dates). */
function istYesterdayAndBenchmarkWindows(): {
  dateLabel: string;
  yesterday: { startIso: string; endIso: string };
  benchmark: { startIso: string; endIso: string };
} {
  const todayYmd = formatIST(new Date(), "yyyy-MM-dd");
  const todayNoonIst = fromZonedTime(`${todayYmd}T12:00:00`, SYSTEM_TIMEZONE);
  const yesterdayNoonIst = subDays(todayNoonIst, 1);
  const yesterdayYmd = formatIST(yesterdayNoonIst, "yyyy-MM-dd");
  const benchmarkNoonIst = subDays(yesterdayNoonIst, 7);
  const benchmarkYmd = formatIST(benchmarkNoonIst, "yyyy-MM-dd");
  const yesterday = getIstDayUtcBoundsIso(yesterdayYmd);
  const benchmark = getIstDayUtcBoundsIso(benchmarkYmd);
  const endUtc = fromZonedTime(`${yesterdayYmd}T23:59:59.999`, SYSTEM_TIMEZONE);
  const dateLabel = `For ${formatIST(endUtc, "EEEE, MMMM d")}`;
  return { dateLabel, yesterday, benchmark };
}

function wowDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  const raw = ((current - previous) / previous) * 100;
  return Math.round(raw * 10) / 10;
}

function asTrendMetric(value: number, benchmark: number): BriefingTrendMetric {
  return { value, deltaPercent: wowDeltaPercent(value, benchmark) };
}

function detailString(details: unknown, key: string): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const v = (details as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

function normalizeStatus(raw: string | undefined): string | undefined {
  return raw?.trim().toLowerCase();
}

function processActivities(activities: ActivityRow[]): {
  tasksCompleted: number;
  dealsWon: number;
  dealsLost: number;
  topAgents: YesterdayAgentRank[];
} {
  let tasksCompleted = 0;
  let dealsWon = 0;
  let dealsLost = 0;
  const taskCountByActor = new Map<string, { name: string; tasks: number }>();

  for (const row of activities) {
    const type = row.action_type ?? "";
    if (type === "task_completed" || type === "note_added") {
      tasksCompleted += 1;
    }
    if (type === "status_changed") {
      const ns = normalizeStatus(detailString(row.details, "new_status"));
      if (ns === "won") dealsWon += 1;
      if (ns === "lost") dealsLost += 1;
    }
    if (type === "task_completed" && row.actor_id) {
      const name = row.actor?.full_name?.trim() || "Teammate";
      const cur = taskCountByActor.get(row.actor_id) ?? { name, tasks: 0 };
      cur.tasks += 1;
      taskCountByActor.set(row.actor_id, cur);
    }
  }

  const topAgents = [...taskCountByActor.values()]
    .sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name))
    .slice(0, 3);

  return { tasksCompleted, dealsWon, dealsLost, topAgents };
}

function buildExecutiveSummary(input: {
  newLeads: number;
  tasksCompleted: number;
  dealsWon: number;
  dealsLost: number;
  topAgents: YesterdayAgentRank[];
  staleLeadsCount: number;
}): string {
  const { newLeads, tasksCompleted, dealsWon, dealsLost, topAgents, staleLeadsCount } =
    input;
  if (
    newLeads === 0 &&
    tasksCompleted === 0 &&
    dealsWon === 0 &&
    dealsLost === 0
  ) {
    let msg = "No significant team activity was recorded yesterday.";
    if (staleLeadsCount > 0) {
      msg += `\nNote: There are currently ${staleLeadsCount} lead${staleLeadsCount === 1 ? "" : "s"} sitting in 'New' for over 48 hours.`;
    }
    return msg;
  }

  const segments: string[] = [];
  if (newLeads > 0) {
    segments.push(
      `brought in ${newLeads} new lead${newLeads === 1 ? "" : "s"}`,
    );
  }
  if (tasksCompleted > 0) {
    segments.push(
      `completed ${tasksCompleted} follow-up${tasksCompleted === 1 ? "" : "s"}`,
    );
  }
  if (dealsWon > 0) {
    segments.push(
      `successfully closed ${dealsWon} deal${dealsWon === 1 ? "" : "s"}`,
    );
  }
  if (dealsLost > 0) {
    segments.push(
      `marked ${dealsLost} deal${dealsLost === 1 ? "" : "s"} as lost`,
    );
  }

  let body = "Yesterday, your team ";
  if (segments.length === 1) {
    body += `${segments[0]}.`;
  } else if (segments.length === 2) {
    body += `${segments[0]} and ${segments[1]}.`;
  } else {
    body += `${segments.slice(0, -1).join(", ")}, and ${segments[segments.length - 1]}.`;
  }

  const lead = topAgents[0];
  if (lead && lead.tasks > 0) {
    body += ` ${lead.name} led the floor with ${lead.tasks} task${lead.tasks === 1 ? "" : "s"} completed.`;
  }

  if (staleLeadsCount > 0) {
    body += `\nNote: There are currently ${staleLeadsCount} lead${staleLeadsCount === 1 ? "" : "s"} sitting in 'New' for over 48 hours.`;
  }

  return body;
}

/**
 * Yesterday 00:00–23:59:59.999 Asia/Kolkata, scoped to the signed-in profile's domain.
 * Parallel data fetch (new lead count + activities). No LLM calls.
 */
export async function getYesterdayBriefing(): Promise<YesterdayExecutiveBriefing | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, domain")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "";
  const domain = profile?.domain as IndulgeDomain | undefined;
  if (!canViewExecutiveData(role) || !domain) return null;

  const { dateLabel, yesterday, benchmark } = istYesterdayAndBenchmarkWindows();
  const staleCutoffIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const [
    leadsCountYesterdayRes,
    activitiesYesterdayRes,
    leadsCountBenchmarkRes,
    followUpsBenchmarkRes,
    staleLeadsRes,
    activePipelineRes,
    recentWinsRes,
    stagnantLeadsListRes,
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("domain", domain)
      .gte("created_at", yesterday.startIso)
      .lte("created_at", yesterday.endIso),
    supabase
      .from("lead_activities")
      .select(
        "id, lead_id, actor_id, action_type, details, created_at, actor:actor_id(id, full_name), leads!inner(domain)",
      )
      .eq("leads.domain", domain)
      .gte("created_at", yesterday.startIso)
      .lte("created_at", yesterday.endIso),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("domain", domain)
      .gte("created_at", benchmark.startIso)
      .lte("created_at", benchmark.endIso),
    supabase
      .from("lead_activities")
      .select("id, leads!inner(domain)", { count: "exact", head: true })
      .eq("leads.domain", domain)
      .in("action_type", ["task_completed", "note_added"])
      .gte("created_at", benchmark.startIso)
      .lte("created_at", benchmark.endIso),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("domain", domain)
      .eq("status", "new")
      .lt("created_at", staleCutoffIso),
    supabase
      .from("leads")
      .select("id, status")
      .eq("domain", domain)
      .in("status", [...ACTIVE_PIPELINE_STATUSES]),
    supabase
      .from("leads")
      .select(
        "id, first_name, last_name, assigned_agent:profiles!assigned_to(id, full_name)",
      )
      .eq("domain", domain)
      .eq("status", "won")
      .gte("updated_at", yesterday.startIso)
      .lte("updated_at", yesterday.endIso)
      .order("updated_at", { ascending: false }),
    supabase
      .from("leads")
      .select(
        "id, first_name, last_name, created_at, assigned_agent:profiles!assigned_to(id, full_name)",
      )
      .eq("domain", domain)
      .eq("status", "new")
      .lt("created_at", staleCutoffIso)
      .order("created_at", { ascending: true })
      .limit(STAGNANT_LIST_LIMIT),
  ]);

  const newLeadsYesterday = leadsCountYesterdayRes.count ?? 0;
  const newLeadsBenchmark = leadsCountBenchmarkRes.count ?? 0;
  const followUpsBenchmark = followUpsBenchmarkRes.count ?? 0;
  const staleLeadsCount = staleLeadsRes.count ?? 0;

  const activities = normalizeActivityRows(activitiesYesterdayRes.data ?? []);

  const { tasksCompleted, dealsWon, dealsLost, topAgents } =
    processActivities(activities);

  const executiveSummary = buildExecutiveSummary({
    newLeads: newLeadsYesterday,
    tasksCompleted,
    dealsWon,
    dealsLost,
    topAgents,
    staleLeadsCount,
  });

  const pipelinePulse = buildPipelinePulse(activePipelineRes.data ?? []);

  const recentWins: BriefingRecentWin[] = (recentWinsRes.data ?? []).map(
    (row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        leadName: leadDisplayName(r.first_name, r.last_name),
        agent: oneAssignee(r.assigned_agent as BriefingAssignee | BriefingAssignee[] | null),
      };
    },
  );

  const stagnantLeadsList: BriefingStagnantLead[] = (
    stagnantLeadsListRes.data ?? []
  ).map((row) => {
    const r = row as Record<string, unknown>;
    const createdAt = String(r.created_at ?? "");
    const created = new Date(createdAt);
    const staleLabel = Number.isNaN(created.getTime())
      ? "—"
      : formatDistanceToNowStrict(created, { addSuffix: true });
    return {
      id: String(r.id),
      leadName: leadDisplayName(r.first_name, r.last_name),
      createdAt,
      staleLabel,
      agent: oneAssignee(r.assigned_agent as BriefingAssignee | BriefingAssignee[] | null),
    };
  });

  return {
    dateLabel,
    executiveSummary,
    newLeads: asTrendMetric(newLeadsYesterday, newLeadsBenchmark),
    tasksCompleted: asTrendMetric(tasksCompleted, followUpsBenchmark),
    dealsWon,
    dealsLost,
    topAgents,
    staleLeadsCount,
    pipelinePulse,
    recentWins,
    stagnantLeadsList,
  };
}

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
      .in("status", ["in_discussion", "connected", "attempted"]),
  ]);

  const profile   = profileR.data;
  const firstName = profile?.full_name?.split(" ")[0] ?? "Andreas";
  const hourIST = Number.parseInt(formatIST(new Date(), "H"), 10);
  const greeting = getGreeting(Number.isNaN(hourIST) ? new Date().getHours() : hourIST);

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

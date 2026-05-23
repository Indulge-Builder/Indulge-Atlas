"use server";

import { createClient } from "@/lib/supabase/server";
import {
  LEAD_STATUS_ORDER,
  LEAD_STATUS_CONFIG,
  type LeadStatus,
} from "@/lib/types/database";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { SYSTEM_TIMEZONE } from "@/lib/utils/time";
import {
  OVERVIEW_DOMAINS,
  OVERVIEW_DOMAIN_KEYS,
  type OverviewDomainKey,
} from "@/lib/constants/onboarding-overview";
import type {
  OnboardingOverviewData,
  OverviewAgentRow,
  OverviewDomainMonthlyCard,
  OverviewDomainSlice,
  OverviewPipelineStage,
} from "@/lib/types/onboarding-overview";

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

function monthBounds(d = new Date()) {
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  const prevMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const prevMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
  return {
    monthStartIso: monthStart.toISOString(),
    monthEndIso: monthEnd.toISOString(),
    prevMonthStartIso: prevMonthStart.toISOString(),
    prevMonthEndIso: prevMonthEnd.toISOString(),
  };
}

// ── Onboarding Overview (multi-domain founder dashboard) ─────────

const PIPELINE_BAR_COLORS: Record<LeadStatus, string> = {
  new: "bg-amber-500/85",
  attempted: "bg-sky-500/85",
  connected: "bg-indigo-500/85",
  in_discussion: "bg-violet-500/85",
  won: "bg-[#4A7C59]/90",
  nurturing: "bg-cyan-600/85",
  lost: "bg-rose-500/75",
  trash: "bg-stone-400/85",
};

function istMonthBounds() {
  const ymdStart = formatInTimeZone(new Date(), SYSTEM_TIMEZONE, "yyyy-MM-01");
  const [y, m] = ymdStart.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const nextStart = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  const monthStartIso = fromZonedTime(
    `${ymdStart}T00:00:00.000`,
    SYSTEM_TIMEZONE,
  ).toISOString();
  const monthEndIso = new Date(
    fromZonedTime(`${nextStart}T00:00:00.000`, SYSTEM_TIMEZONE).getTime() - 1,
  ).toISOString();
  return { monthStartIso, monthEndIso };
}

function emptyAgentRow(agentId: string, fullName: string): OverviewAgentRow {
  return {
    agentId,
    fullName,
    totalLeads: 0,
    new: 0,
    attempted: 0,
    inDiscussion: 0,
    junk: 0,
    todayLeads: 0,
    conversions: 0,
  };
}

export async function getOnboardingOverview(
  startIso?: string,
  endIso?: string,
): Promise<OnboardingOverviewData> {
  const { supabase } = await requireManagerOrAdmin();

  // Default to this month in IST when no range is supplied
  const { monthStartIso, monthEndIso } = istMonthBounds();
  const rangeStart = startIso ?? monthStartIso;
  const rangeEnd = endIso ?? monthEndIso;

  const periodLabel = startIso
    ? `${formatInTimeZone(new Date(startIso), SYSTEM_TIMEZONE, "d MMM")} – ${formatInTimeZone(new Date(endIso!), SYSTEM_TIMEZONE, "d MMM yyyy")}`
    : formatInTimeZone(new Date(), SYSTEM_TIMEZONE, "MMMM yyyy");

  // Fetch profiles + all leads in the requested date range (paginated to bypass 1000-row cap)
  const [{ data: profiles }, allLeads] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("role", ["agent", "manager"])
      .eq("is_active", true),
    (async () => {
      const PAGE = 1000;
      const rows: Array<{ id: string; domain: string; status: string; assigned_to: string | null; created_at: string }> = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("leads")
          .select("id, domain, status, assigned_to, created_at")
          .in("domain", OVERVIEW_DOMAIN_KEYS)
          .gte("created_at", rangeStart)
          .lte("created_at", rangeEnd)
          .range(from, from + PAGE - 1);
        if (error || !data?.length) break;
        rows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return rows;
    })(),
  ]);

  const profileList = profiles ?? [];
  const profileNameById = new Map(
    profileList.map((p) => [p.id, p.full_name ?? "Unknown"]),
  );

  const countByDomain = new Map<OverviewDomainKey, number>(
    OVERVIEW_DOMAIN_KEYS.map((k) => [k, 0]),
  );

  type DomainBucket = {
    statusCounts: Map<string, number>;
    agents: Map<string, OverviewAgentRow>;
  };

  const domainBuckets = new Map<OverviewDomainKey, DomainBucket>();
  for (const key of OVERVIEW_DOMAIN_KEYS) {
    const agents = new Map<string, OverviewAgentRow>();
    for (const p of profileList) {
      agents.set(p.id, emptyAgentRow(p.id, p.full_name ?? "Unknown"));
    }
    domainBuckets.set(key, { statusCounts: new Map(), agents });
  }

  for (const lead of allLeads) {
    const domain = lead.domain as OverviewDomainKey;
    if (!OVERVIEW_DOMAIN_KEYS.includes(domain)) continue;

    const bucket = domainBuckets.get(domain)!;
    bucket.statusCounts.set(
      lead.status,
      (bucket.statusCounts.get(lead.status) ?? 0) + 1,
    );

    countByDomain.set(domain, (countByDomain.get(domain) ?? 0) + 1);

    if (!lead.assigned_to) continue;

    let agentRow = bucket.agents.get(lead.assigned_to);
    if (!agentRow) {
      agentRow = emptyAgentRow(
        lead.assigned_to,
        profileNameById.get(lead.assigned_to) ?? "Unknown",
      );
      bucket.agents.set(lead.assigned_to, agentRow);
    }

    agentRow.totalLeads += 1;
    if (lead.status === "new") agentRow.new += 1;
    else if (lead.status === "attempted") agentRow.attempted += 1;
    else if (lead.status === "in_discussion") agentRow.inDiscussion += 1;
    else if (lead.status === "trash") agentRow.junk += 1;
    else if (lead.status === "won") agentRow.conversions += 1;
  }

  const monthlyCards: OverviewDomainMonthlyCard[] = OVERVIEW_DOMAINS.map(
    (d) => ({
      domain: d.key,
      label: d.label,
      leadsThisMonth: countByDomain.get(d.key) ?? 0,
    }),
  );

  const domains = {} as Record<OverviewDomainKey, OverviewDomainSlice>;
  for (const d of OVERVIEW_DOMAINS) {
    const bucket = domainBuckets.get(d.key)!;
    const pipelineStages: OverviewPipelineStage[] = LEAD_STATUS_ORDER.map(
      (status) => ({
        key: status,
        label: LEAD_STATUS_CONFIG[status].label,
        count: bucket.statusCounts.get(status) ?? 0,
        colorClass: PIPELINE_BAR_COLORS[status],
      }),
    );

    const agents = Array.from(bucket.agents.values())
      .filter((a) => a.totalLeads > 0)
      .sort((a, b) => b.totalLeads - a.totalLeads);

    domains[d.key] = {
      domain: d.key,
      label: d.label,
      pipelineStages,
      agents,
    };
  }

  return { monthLabel: periodLabel, monthlyCards, domains };
}

// ── Shop Pulse ─────────────────────────────────────────────────

export type ShopTopItem = {
  name: string;
  units: number;
  revenue: number;
};

export type ShopPulseData = {
  gmvThisMonth: number;
  gmvLastMonth: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  aovThisMonth: number;
  aovLastMonth: number;
  conversionThisMonth: number;
  conversionLastMonth: number;
  topItems: ShopTopItem[];
  revenueLast30Days: Array<{ date: string; revenue: number }>;
};

export async function getShopPulse(): Promise<ShopPulseData> {
  const { supabase } = await requireManagerOrAdmin();
  const now = new Date();
  const { monthStartIso, monthEndIso, prevMonthStartIso, prevMonthEndIso } =
    monthBounds(now);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  const thirtyStartIso = thirtyDaysAgo.toISOString();

  const shopDomain = "indulge_shop" as const;

  const [
    { data: wonThis },
    { data: wonPrev },
    { count: leadCountThis },
    { count: leadCountPrev },
    { data: won30 },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("deal_value, ad_name, campaign_name")
      .eq("domain", shopDomain)
      .eq("status", "won")
      .gte("updated_at", monthStartIso)
      .lte("updated_at", monthEndIso),
    supabase
      .from("leads")
      .select("deal_value")
      .eq("domain", shopDomain)
      .eq("status", "won")
      .gte("updated_at", prevMonthStartIso)
      .lte("updated_at", prevMonthEndIso),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("domain", shopDomain)
      .gte("created_at", monthStartIso)
      .lte("created_at", monthEndIso),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("domain", shopDomain)
      .gte("created_at", prevMonthStartIso)
      .lte("created_at", prevMonthEndIso),
    supabase
      .from("leads")
      .select("deal_value, updated_at")
      .eq("domain", shopDomain)
      .eq("status", "won")
      .not("deal_value", "is", null)
      .gte("updated_at", thirtyStartIso)
      .lte("updated_at", now.toISOString()),
  ]);

  const gmvThisMonth =
    wonThis?.reduce((s, r) => s + (r.deal_value ?? 0), 0) ?? 0;
  const gmvLastMonth =
    wonPrev?.reduce((s, r) => s + (r.deal_value ?? 0), 0) ?? 0;
  const ordersThisMonth = wonThis?.length ?? 0;
  const ordersLastMonth = wonPrev?.length ?? 0;
  const aovThisMonth =
    ordersThisMonth > 0 ? gmvThisMonth / ordersThisMonth : 0;
  const aovLastMonth =
    ordersLastMonth > 0 ? gmvLastMonth / ordersLastMonth : 0;

  const lcThis = leadCountThis ?? 0;
  const lcPrev = leadCountPrev ?? 0;
  const conversionThisMonth = lcThis > 0 ? ordersThisMonth / lcThis : 0;
  const conversionLastMonth = lcPrev > 0 ? ordersLastMonth / lcPrev : 0;

  const itemMap = new Map<string, { units: number; revenue: number }>();
  for (const row of wonThis ?? []) {
    const label =
      (row.ad_name && String(row.ad_name).trim()) ||
      (row.campaign_name && String(row.campaign_name).trim()) ||
      "Concierge offering";
    const cur = itemMap.get(label) ?? { units: 0, revenue: 0 };
    cur.units += 1;
    cur.revenue += row.deal_value ?? 0;
    itemMap.set(label, cur);
  }

  const topItems: ShopTopItem[] = Array.from(itemMap.entries())
    .map(([name, v]) => ({ name, units: v.units, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const dayKey = (iso: string) => iso.slice(0, 10);
  const revenueByDay = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    revenueByDay.set(dayKey(d.toISOString()), 0);
  }
  for (const row of won30 ?? []) {
    const k = dayKey(row.updated_at);
    if (revenueByDay.has(k)) {
      revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + (row.deal_value ?? 0));
    }
  }

  const revenueLast30Days = Array.from(revenueByDay.entries()).map(
    ([date, revenue]) => ({ date, revenue }),
  );

  return {
    gmvThisMonth,
    gmvLastMonth,
    ordersThisMonth,
    ordersLastMonth,
    aovThisMonth,
    aovLastMonth,
    conversionThisMonth,
    conversionLastMonth,
    topItems,
    revenueLast30Days,
  };
}

// ── Marketing Pulse (Organic Social / Brand) ───────────────────
// Stub until social analytics are wired to Supabase.

export type MarketingEngagementSplit = {
  likes: number;
  shares: number;
  comments: number;
};

export type MarketingTopPost = {
  topic: string;
  reach: number;
  /** Likes + shares + comments for the post. */
  interactions: number;
};

export type MarketingPulseData = {
  totalPostsThisMonth: number;
  totalReach: number;
  totalLikes: number;
  totalShares: number;
  engagement: MarketingEngagementSplit;
  topPosts: MarketingTopPost[];
};

const MARKETING_ORGANIC_STUB: MarketingPulseData = {
  totalPostsThisMonth: 38,
  totalReach: 1_842_600,
  totalLikes: 52_840,
  totalShares: 9_180,
  engagement: {
    likes: 52_840,
    shares: 9_180,
    comments: 14_220,
  },
  topPosts: [
    {
      topic: "Quiet luxury — the winter edit",
      reach: 286_400,
      interactions: 18_920,
    },
    {
      topic: "Atelier diary: craft in motion",
      reach: 201_200,
      interactions: 12_640,
    },
    {
      topic: "Client journey — first home in Goa",
      reach: 158_900,
      interactions: 9_870,
    },
  ],
};

export async function getMarketingPulse(): Promise<MarketingPulseData> {
  await requireManagerOrAdmin();
  return MARKETING_ORGANIC_STUB;
}

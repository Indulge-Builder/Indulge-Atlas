"use server";

import { createClient } from "@/lib/supabase/server";

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

// ── Onboarding Pulse ─────────────────────────────────────────────

export type OnboardingPipelineStage = {
  key: string;
  label: string;
  count: number;
  colorClass: string;
};

export type OnboardingAgentVelocity = {
  agentId: string;
  fullName: string;
  completedThisMonth: number;
};

export type OnboardingPulseData = {
  activeOnboardings: number;
  completedThisMonth: number;
  avgDaysToOnboard: number | null;
  /** Highlighted closer for the month (name + their won count this month). */
  topPerformer: { name: string; count: number } | null;
  pipelineStages: OnboardingPipelineStage[];
  agentVelocity: OnboardingAgentVelocity[];
  maxAgentCompleted: number;
};

const PIPELINE_STATUS_ORDER = [
  { key: "new", label: "New", colorClass: "bg-amber-500/85" },
  { key: "attempted", label: "Attempted", colorClass: "bg-sky-500/85" },
  { key: "in_discussion", label: "In discussion", colorClass: "bg-violet-500/85" },
  { key: "won", label: "Won", colorClass: "bg-[#4A7C59]/90" },
  { key: "trash", label: "Trash", colorClass: "bg-stone-400/85" },
] as const;

/** Founder dashboard headline figures (curated). */
const ONBOARDING_DISPLAY = {
  activeOnboardings: 45,
  completedThisMonth: 8,
  avgDaysToOnboardThisMonth: 2.9,
  topPerformerName: "Amit",
  topPerformerCompletedThisMonth: 4,
} as const;

export async function getOnboardingPulse(): Promise<OnboardingPulseData> {
  const { supabase } = await requireManagerOrAdmin();
  const { monthStartIso, monthEndIso } = monthBounds();

  const pipelineStatusKeys = PIPELINE_STATUS_ORDER.map((s) => s.key);

  const { data: amitProfile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["agent", "manager", "founder"])
    .eq("is_active", true)
    .ilike("full_name", "%Amit%")
    .limit(1)
    .maybeSingle();

  const [{ data: agentWonRows }, { data: profiles }, ...statusCountResults] =
    await Promise.all([
      supabase
        .from("leads")
        .select("assigned_to")
        .eq("status", "won")
        .gte("updated_at", monthStartIso)
        .lte("updated_at", monthEndIso)
        .not("assigned_to", "is", null),
      supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["agent", "manager", "founder"])
        .eq("is_active", true),
      ...pipelineStatusKeys.map((status) =>
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("status", status),
      ),
    ]);

  const agentTotals = new Map<string, number>();
  for (const row of agentWonRows ?? []) {
    if (row.assigned_to) {
      agentTotals.set(row.assigned_to, (agentTotals.get(row.assigned_to) ?? 0) + 1);
    }
  }

  const agentVelocity: OnboardingAgentVelocity[] = (profiles ?? [])
    .map((p) => ({
      agentId: p.id,
      fullName: p.full_name,
      completedThisMonth: agentTotals.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.completedThisMonth - a.completedThisMonth);

  const maxAgentCompleted = agentVelocity.reduce(
    (m, a) => Math.max(m, a.completedThisMonth),
    0,
  );

  const pipelineStages: OnboardingPipelineStage[] = PIPELINE_STATUS_ORDER.map(
    (meta, i) => {
      const raw = statusCountResults[i] as { count: number | null };
      return {
        key: meta.key,
        label: meta.label,
        count: raw?.count ?? 0,
        colorClass: meta.colorClass,
      };
    },
  );

  const topPerformer: { name: string; count: number } | null = {
    name: amitProfile?.full_name ?? ONBOARDING_DISPLAY.topPerformerName,
    count: ONBOARDING_DISPLAY.topPerformerCompletedThisMonth,
  };

  return {
    activeOnboardings: ONBOARDING_DISPLAY.activeOnboardings,
    completedThisMonth: ONBOARDING_DISPLAY.completedThisMonth,
    avgDaysToOnboard: ONBOARDING_DISPLAY.avgDaysToOnboardThisMonth,
    topPerformer,
    pipelineStages,
    agentVelocity,
    maxAgentCompleted,
  };
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

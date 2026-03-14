import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getScoutAnalytics } from "@/lib/actions/scout-analytics";
import { getScoutDashboardData } from "@/lib/actions/team-stats";
import { AnimatedMetricCard } from "@/components/manager/AnimatedMetricCard";
import { StrategicTaskPanel } from "@/components/scout/StrategicTaskPanel";
import { CampaignRaceTrack } from "@/components/scout/CampaignRaceTrack";
import { VelocityFunnel } from "@/components/scout/VelocityFunnel";
import { ConversionFeed } from "@/components/scout/ConversionFeed";
import { TopBar } from "@/components/layout/TopBar";
import { MonthSelector } from "@/components/scout/MonthSelector";
import { CommandCenterAnimator } from "@/components/scout/CommandCenterAnimator";
import { Skeleton } from "@/components/ui/skeleton";
import type { PeriodValue } from "@/components/scout/MonthSelector";
import { Wallet, TrendingUp, BarChart3, MousePointerClick } from "lucide-react";

// ── Role guard ────────────────────────────────────────────────

async function getAuthorisedProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.role === "agent") redirect("/");

  return profile;
}

// ── Skeletons ─────────────────────────────────────────────────

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-4"
        >
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function BentoTopSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-24" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 items-center">
            <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="lg:col-span-2 bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3 w-32" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex gap-3 items-center">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-14 flex-shrink-0" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BentoBottomSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-[220px] w-full rounded-xl" />
        <div className="flex gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 flex-1 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-3">
        <Skeleton className="h-5 w-44" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex gap-3 items-center p-3 rounded-xl bg-[#F9F9F6]"
          >
            <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
            <Skeleton className="h-4 w-14 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Headline metrics (independent Suspense) ───────────────────

async function MetricsRow() {
  const metrics = await getScoutDashboardData();

  const roasTrend =
    metrics.roas >= 3
      ? "Strong ROAS"
      : metrics.roas >= 1
        ? "Break-even"
        : "Below target";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
      <AnimatedMetricCard
        label="Total Ad Spend"
        value={metrics.totalSpend}
        prefix="₹"
        icon={<Wallet className="w-5 h-5 text-[#8A8A6E]" />}
        delay={0}
      />
      <AnimatedMetricCard
        label="Total Revenue"
        value={metrics.totalRevenue}
        prefix="₹"
        icon={<TrendingUp className="w-5 h-5 text-[#8A8A6E]" />}
        delay={0.08}
      />
      <AnimatedMetricCard
        label="Global ROAS"
        value={metrics.roas}
        suffix="x"
        decimals={2}
        icon={<BarChart3 className="w-5 h-5 text-[#D4AF37]" />}
        trend={roasTrend}
        trendPositive={metrics.roas >= 1}
        delay={0.16}
        highlight
      />
      <AnimatedMetricCard
        label="Avg. Cost Per Acquisition"
        value={metrics.cpa}
        prefix="₹"
        icon={<MousePointerClick className="w-5 h-5 text-[#8A8A6E]" />}
        delay={0.24}
      />
    </div>
  );
}

// ── Bento panels (one fetch, all four panels) ─────────────────

async function BentoContent() {
  const analytics = await getScoutAnalytics();

  return (
    <>
      {/* Row 1: Strategic Tasks (1/3) + Campaign Race Track (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <StrategicTaskPanel initialTasks={analytics.tasks} />
        </div>
        <div className="lg:col-span-2">
          <CampaignRaceTrack leaderboard={analytics.leaderboard} />
        </div>
      </div>

      {/* Row 2: Velocity Funnel (1/2) + Conversion Feed (1/2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <VelocityFunnel
          data={analytics.funnelData}
          totalClicks={analytics.totalClicks}
        />
        <ConversionFeed recentWins={analytics.recentWins} />
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default async function ScoutDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await getAuthorisedProfile();

  const { period: rawPeriod = "this_month" } = await searchParams;
  // Validate against known values; fall back to default
  const period: PeriodValue = (
    ["this_month", "last_month", "ytd"] as const
  ).includes(rawPeriod as PeriodValue)
    ? (rawPeriod as PeriodValue)
    : "this_month";

  return (
    <div className="bg-[#F9F9F6]">
      <TopBar
        title="Command Center."
        actions={<MonthSelector initialPeriod={period} />}
      />

      <div className="px-8 py-8 max-w-7xl">
        {/* Page header */}
        <div className="mb-8">
          <h1
            className="text-[#1A1A1A] text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Campagin Overview<span className="text-[#D4AF37]">.</span>
          </h1>
          <p className="text-[#9E9E9E] text-[13px] mt-1.5 leading-relaxed">
            Global campaign performance and revenue velocity.
          </p>
        </div>

        {/* Animated wrapper — swaps with soft spring on period change */}
        <CommandCenterAnimator period={period}>
          <div className="space-y-5">
            {/* Headline KPIs */}
            <Suspense fallback={<MetricsSkeleton />}>
              <MetricsRow />
            </Suspense>

            {/* Bento analytics panels */}
            <Suspense
              fallback={
                <>
                  <BentoTopSkeleton />
                  <BentoBottomSkeleton />
                </>
              }
            >
              <BentoContent />
            </Suspense>
          </div>
        </CommandCenterAnimator>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAgentPerformance } from "@/lib/actions/performance";
import { AnimatedMetricCard } from "@/components/manager/AnimatedMetricCard";
import { PipelineChart } from "@/components/performance/PipelineChart";
import { RecentWinsLedger } from "@/components/performance/RecentWinsLedger";
import { TopBar } from "@/components/layout/TopBar";
import { MonthSelector } from "@/components/scout/MonthSelector";
import { CommandCenterAnimator } from "@/components/scout/CommandCenterAnimator";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Target, Wallet, TrendingUp } from "lucide-react";
import type { PeriodValue } from "@/components/scout/MonthSelector";

export const dynamic = "force-dynamic";

// ── Auth + Role guard ─────────────────────────────────────────

async function getAuthorisedAgent() {
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

  // This page is strictly for agents. Scouts and admins have their
  // own analytics views; silently redirect them to their root.
  if (profile.role !== "agent") redirect("/");

  return profile;
}

// ── Skeleton loaders ──────────────────────────────────────────
// Mirror the exact bento-box shapes so the layout never jumps
// and skeleton-to-content transitions are invisible.

function MetricRowSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-4"
        >
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-3.5 w-24 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function BottomGridSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-5">
        <div className="flex justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-36 rounded-md" />
            <Skeleton className="h-3.5 w-52 rounded-md" />
          </div>
          <div className="text-right space-y-1.5">
            <Skeleton className="h-7 w-12 rounded-md ml-auto" />
            <Skeleton className="h-3 w-20 rounded-md" />
          </div>
        </div>
        {/* Bar chart placeholder */}
        <div className="flex items-end gap-4 h-[200px] px-4 pt-4">
          {[65, 45, 55, 35, 80].map((h, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-lg"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-4">
        <div className="flex justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-28 rounded-md" />
            <Skeleton className="h-3.5 w-36 rounded-md" />
          </div>
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4 rounded-md" />
              <Skeleton className="h-2.5 w-20 rounded-md" />
            </div>
            <Skeleton className="h-3.5 w-12 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformanceSkeleton() {
  return (
    <>
      {/* TopBar placeholder */}
      <div className="sticky top-0 z-30 h-[65px] border-b border-black/[0.05] bg-[#F9F9F6]/80 backdrop-blur-xl" />
      <div className="px-8 py-8 space-y-7 max-w-[1400px] mx-auto">
        <MetricRowSkeleton />
        <BottomGridSkeleton />
      </div>
    </>
  );
}

// ── Async data layer ──────────────────────────────────────────

async function PerformanceContent({ period }: { period: PeriodValue }) {
  const data = await getAgentPerformance(period);

  const winRateAboveThreshold = data.winRate > 30;

  return (
    <>
      <CommandCenterAnimator period={period}>
        <div className="px-8 py-8 space-y-7 max-w-[1400px] mx-auto">
          {/* ── Metric cards ──────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <AnimatedMetricCard
              label="Active Pipeline"
              value={data.activePipeline}
              icon={
                <Activity
                  className="w-5 h-5 text-[#1A1A1A]"
                  strokeWidth={1.75}
                />
              }
              delay={0}
            />
            <AnimatedMetricCard
              label="Win Rate"
              value={data.winRate}
              suffix="%"
              decimals={1}
              icon={
                <Target
                  className="w-5 h-5"
                  strokeWidth={1.75}
                  style={{ color: winRateAboveThreshold ? "#D4AF37" : "#1A1A1A" }}
                />
              }
              highlight={winRateAboveThreshold}
              delay={0.07}
            />
            <AnimatedMetricCard
              label="Revenue Closed"
              value={data.revenueClosed / 1_00_000}
              prefix="₹"
              suffix="L"
              decimals={2}
              icon={
                <Wallet
                  className="w-5 h-5 text-[#1A1A1A]"
                  strokeWidth={1.75}
                />
              }
              delay={0.14}
            />
            <AnimatedMetricCard
              label="Avg. Deal Value"
              value={data.avgDealValue / 1_00_000}
              prefix="₹"
              suffix="L"
              decimals={2}
              icon={
                <TrendingUp
                  className="w-5 h-5 text-[#1A1A1A]"
                  strokeWidth={1.75}
                />
              }
              delay={0.21}
            />
          </div>

          {/* ── Bottom bento grid ─────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <PipelineChart stages={data.pipelineStages} />
            </div>
            <div className="lg:col-span-1">
              <RecentWinsLedger
                recentWins={data.recentWins}
                totalRevenue={data.revenueClosed}
              />
            </div>
          </div>
        </div>
      </CommandCenterAnimator>
    </>
  );
}

// ── Page entry point ──────────────────────────────────────────

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  // 1. Auth + role guard (agent only)
  await getAuthorisedAgent();

  // 2. Resolve + validate the period from the URL
  const { period: rawPeriod = "this_month" } = await searchParams;
  const VALID: PeriodValue[] = ["this_month", "last_month", "ytd"];
  const period: PeriodValue = VALID.includes(rawPeriod as PeriodValue)
    ? (rawPeriod as PeriodValue)
    : "this_month";

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      {/* TopBar is outside Suspense so it's always immediately visible */}
      <TopBar
        title="My Performance."
        subtitle="Personal conversion metrics and pipeline velocity."
        actions={<MonthSelector initialPeriod={period} />}
      />

      <Suspense fallback={<PerformanceSkeleton />}>
        <PerformanceContent period={period} />
      </Suspense>
    </div>
  );
}

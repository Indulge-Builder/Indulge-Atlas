import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManagerOverview } from "@/lib/actions/manager";
import { AnimatedMetricCard } from "@/components/manager/AnimatedMetricCard";
import { RevenueChart } from "@/components/manager/RevenueChart";
import { TopBar } from "@/components/layout/TopBar";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import { TrendingUp, Wallet, BarChart3 } from "lucide-react";

const iconClassGold = "w-5 h-5 text-[#D4AF37]";
const iconClassMuted = "w-5 h-5 text-[#8A8A6E]";

// ── Server-side role guard ────────────────────────────────────

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

// ── Skeleton loader for metrics row ──────────────────────────

function MetricsRowSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-4"
        >
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6">
      <Skeleton className="h-5 w-40 mb-2" />
      <Skeleton className="h-3.5 w-24 mb-6" />
      <Skeleton className="h-[280px] w-full rounded-xl" />
    </div>
  );
}

// ── Async data component (Suspense boundary target) ──────────

async function DashboardContent() {
  const data = await getManagerOverview();

  const roasDisplay = data.roas;
  const roasTrend =
    roasDisplay >= 3 ? "Strong ROAS" : roasDisplay >= 1 ? "Break-even" : "Below break-even";
  const roasPositive = roasDisplay >= 1;

  return (
    <>
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <AnimatedMetricCard
          label="Total Ad Spend"
          value={data.totalSpend}
          prefix="₹"
          icon={<Wallet className={iconClassMuted} />}
          delay={0}
        />
        <AnimatedMetricCard
          label="Total Revenue (Won Leads)"
          value={data.totalRevenue}
          prefix="₹"
          icon={<TrendingUp className={iconClassMuted} />}
          delay={0.1}
        />
        <AnimatedMetricCard
          label="Return on Ad Spend"
          value={roasDisplay}
          suffix="x"
          decimals={2}
          icon={<BarChart3 className={iconClassGold} />}
          trend={roasTrend}
          trendPositive={roasPositive}
          delay={0.2}
          highlight
        />
      </div>

      {/* Revenue Chart */}
      <RevenueChart data={data.monthlyTrend} />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default async function ManagerDashboardPage() {
  const profile = await getAuthorisedProfile();

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Revenue Overview"
        subtitle={`Marketing performance · ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`}
      />

      <div className="px-8 py-8 max-w-6xl">
        {/* Page Header */}
        <div className="mb-8">
          <h1
            className="text-[#1A1A1A] text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Revenue Overview
          </h1>
          <p className="text-[#9E9E9E] text-sm mt-1">
            Welcome back, {profile.full_name}. Here is your marketing ROI
            summary.
          </p>
        </div>

        <div className="space-y-6">
          <Suspense
            fallback={
              <>
                <MetricsRowSkeleton />
                <ChartSkeleton />
              </>
            }
          >
            <DashboardContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

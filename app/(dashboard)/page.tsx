import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/actions/leads";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { UnattainedLeadsQueue } from "@/components/dashboard/UnattainedLeadsQueue";
import { MyTasksWidget } from "@/components/dashboard/MyTasksWidget";
import { ConversionHistory } from "@/components/dashboard/ConversionHistory";
import { PastLeadsList } from "@/components/dashboard/PastLeadsList";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lead, Task } from "@/lib/types/database";

export const dynamic = "force-dynamic";

// ── Loading skeleton ───────────────────────────────────────

function DashboardSkeleton() {
  return (
    <>
      {/* Hero placeholder */}
      <Skeleton className="h-[320px] w-full rounded-none" />
      <div className="px-8 py-6 space-y-6">
        <div className="grid grid-cols-3 gap-5">
          <Skeleton className="col-span-2 h-[320px] rounded-xl" />
          <Skeleton className="h-[320px] rounded-xl" />
          <Skeleton className="col-span-2 h-[280px] rounded-xl" />
          <Skeleton className="h-[280px] rounded-xl" />
        </div>
      </div>
    </>
  );
}

// ── Async content — streams behind Suspense ────────────────

async function DashboardContent({ userId }: { userId: string }) {
  const supabase = await createClient();

  // Date range for "tasks due today"
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  ).toISOString();

  // All queries fire in parallel — no serial waterfall
  const [
    { data: rawProfile },
    { unattainedLeads, pastLeads, upcomingTasks },
    { count: newLeadsCount },
    { count: activeCount },
    { count: tasksTodayCount },
    { count: wonCount },
    { data: allWonLeads },
  ] = await Promise.all([
    // Profile for first name
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single(),

    // Grid-widget data (unattained queue + past leads + tasks)
    getDashboardData(),

    // Live metric: new leads assigned to me
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "new")
      .eq("assigned_to", userId),

    // Live metric: leads actively in discussion
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "in_discussion")
      .eq("assigned_to", userId),

    // Live metric: tasks due strictly today
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", userId)
      .gte("due_date", todayStart)
      .lt("due_date", todayEnd),

    // Live metric: total won leads for me
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "won")
      .eq("assigned_to", userId),

    // Conversions feed — won leads, newest close first, generous limit
    supabase
      .from("leads")
      .select("id, first_name, last_name, deal_value, updated_at, city")
      .eq("status", "won")
      .eq("assigned_to", userId)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const profile = rawProfile as { full_name: string } | null;
  const firstName = profile?.full_name?.split(" ")[0] ?? "Agent";

  const hour = now.getHours();
  const timeOfDay: "Morning" | "Afternoon" | "Evening" =
    hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  return (
    <>
      {/* ── Phase 1–3: Zen hero + editorial greeting + metric cards */}
      <DashboardHero
        firstName={firstName}
        timeOfDay={timeOfDay}
        metrics={{
          newLeads:   newLeadsCount  ?? 0,
          active:     activeCount    ?? 0,
          tasksToday: tasksTodayCount ?? 0,
          won:        wonCount       ?? 0,
        }}
      />

      {/* ── Phase 4 + existing widgets ──────────────────────── */}
      <div className="px-8 py-6 space-y-5">
        <div className="grid grid-cols-3 gap-5">
          {/* New leads queue + conversion feed */}
          <UnattainedLeadsQueue leads={unattainedLeads as Lead[]} />
          <ConversionHistory wonLeads={(allWonLeads ?? []) as Lead[]} />

          {/* Tasks widget + past leads */}
          <div className="col-span-2">
            <MyTasksWidget tasks={upcomingTasks as Task[]} />
          </div>
          <PastLeadsList leads={pastLeads as Lead[]} />
        </div>
      </div>
    </>
  );
}

// ── Page entry point ───────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent userId={user.id} />
      </Suspense>
    </div>
  );
}

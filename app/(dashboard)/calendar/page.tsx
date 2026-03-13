import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCalendarTasks } from "@/lib/actions/smart-calendar";
import { TopBar } from "@/components/layout/TopBar";
import { LuxuryGrid } from "@/components/calendar/LuxuryGrid";
import { Skeleton } from "@/components/ui/skeleton";
import type { TaskWithLead } from "@/lib/types/database";

export const dynamic = "force-dynamic";

// ── Loading skeleton ───────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="px-7 py-5 flex flex-col h-[calc(100vh-72px)]">
      {/* Header */}
      <div className="flex items-end justify-between mb-5 shrink-0">
        <div>
          <Skeleton className="h-8 w-44 rounded-lg" />
          <div className="flex gap-3 mt-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-16 h-8 rounded-lg" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-7 border-t border-l border-[#EBEBEA] shrink-0">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            className="py-2.5 text-center text-[10px] text-[#C8C8C0] uppercase tracking-widest border-r border-[#EBEBEA]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 border-l border-[#EBEBEA] grid grid-cols-7">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            className="border-r border-b border-[#EBEBEA] p-2.5 flex flex-col gap-2"
          >
            <Skeleton className="w-6 h-4 rounded" />
            {i % 5 === 0 && <Skeleton className="w-full h-5 rounded-md" />}
            {i % 8 === 0 && <Skeleton className="w-4/5 h-5 rounded-md" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Data component ─────────────────────────────────────────

async function CalendarContent({ userId }: { userId: string }) {
  void userId; // used for RLS via auth cookie — not needed directly

  const tasks = await getCalendarTasks();

  return <LuxuryGrid tasks={tasks as TaskWithLead[]} />;
}

// ── Page entry point ───────────────────────────────────────

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-surface">
      <TopBar
        title="Calendar"
        subtitle="Click any day · type what needs to happen"
      />
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarContent userId={user.id} />
      </Suspense>
    </div>
  );
}

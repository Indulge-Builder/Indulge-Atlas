import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMyTasks, getLeadsForTaskModal } from "@/lib/actions/tasks";
import { TopBar } from "@/components/layout/TopBar";
import { TaskDashboardClient } from "@/components/tasks/TaskDashboardClient";
import { Skeleton } from "@/components/ui/skeleton";
import type { Profile, TaskWithLead } from "@/lib/types/database";

export const dynamic = "force-dynamic";

// ── Loading skeleton ───────────────────────────────────────

function TasksPageSkeleton() {
  return (
    <div className="px-8 py-6 flex gap-6">
      {/* Calendar skeleton */}
      <div className="w-[272px] shrink-0 space-y-4">
        <div className="bg-white rounded-2xl border border-[#EAEAEA] p-5 space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="w-6 h-6 rounded-lg" />
            <Skeleton className="w-24 h-8 rounded-lg" />
            <Skeleton className="w-6 h-6 rounded-lg" />
          </div>
          <div className="grid grid-cols-7 gap-y-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="w-8 h-8 rounded-full mx-auto" />
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#EAEAEA] p-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>
      </div>

      {/* Task list skeleton */}
      <div className="flex-1 space-y-3">
        <div className="flex justify-between items-center mb-5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
        <Skeleton className="h-6 w-32 rounded" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-[#EAEAEA] p-4 space-y-3"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="w-5 h-5 rounded-md" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="pl-8 flex gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const VALID_DOMAINS = ["indulge_global", "indulge_house", "indulge_shop", "indulge_legacy", "the_indulge_house"];

// ── Async data component ───────────────────────────────────

async function TasksContent({
  userId,
  domain,
}: {
  userId: string;
  domain?: string | null;
}) {
  const supabase = await createClient();

  const domainFilter =
    domain && VALID_DOMAINS.includes(domain) ? domain : null;

  const [{ data: rawProfile }, tasks, leads] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single(),
    getMyTasks({ domainFilter }),
    getLeadsForTaskModal({ domainFilter }),
  ]);

  const profile = rawProfile as Pick<Profile, "full_name" | "role"> | null;
  if (!profile) redirect("/login");

  return (
    <TaskDashboardClient
      tasks={tasks as TaskWithLead[]}
      leads={leads}
      profile={profile}
    />
  );
}

// ── Page entry point ───────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ domain?: string }>;
}

export default async function TasksPage(props: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await props.searchParams;

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar title="My Tasks" subtitle="Schedule and track your follow-ups" />
      <Suspense fallback={<TasksPageSkeleton />}>
        <TasksContent userId={user.id} domain={params.domain} />
      </Suspense>
    </div>
  );
}

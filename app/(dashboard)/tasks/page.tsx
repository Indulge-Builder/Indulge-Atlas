import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  getMasterTaskDetail,
  getMasterTasks,
  getMyTasks,
  getMySubTasks,
} from "@/lib/actions/tasks";
import { TasksDashboardShell } from "@/components/tasks/TasksDashboardShell";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  MasterTask,
  SubTask,
  TaskGroup,
  PersonalTask,
} from "@/lib/types/database";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

type TabKey = "my-tasks" | "atlas-tasks";

interface AtlasTasksData {
  masterTask: MasterTask;
  taskGroups: Array<TaskGroup & { tasks: SubTask[] }>;
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <div className="px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-36 rounded-xl" />
          </div>
        </div>
        <div className="flex gap-1 border-b border-[#E5E4DF] pb-0">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
      <div className="px-6 pt-6 max-w-7xl mx-auto space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#E5E4DF] bg-white p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main data RSC ──────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AtlasTasksPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params  = await searchParams;
  const tabParam = params.tab;
  const initialTab: TabKey =
    tabParam === "my-tasks" || tabParam === "atlas-tasks" ? tabParam : "atlas-tasks";

  // Fetch current user profile
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, full_name, role, domain, department, job_title")
    .eq("id", user.id)
    .single();

  if (!profileRow) redirect("/login");

  const currentUser = {
    id:         profileRow.id as string,
    full_name:  (profileRow.full_name as string) ?? "Agent",
    job_title:  (profileRow.job_title as string | null) ?? null,
    role:       (profileRow.role as string) ?? "agent",
    department: (profileRow.department as string | null) ?? null,
  };

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <TasksDashboardData initialTab={initialTab} currentUser={currentUser} />
    </Suspense>
  );
}

// ── Async data fetcher (inner RSC) ─────────────────────────────────────────────

async function TasksDashboardData({
  initialTab,
  currentUser,
}: {
  initialTab: TabKey;
  currentUser: {
    id: string;
    full_name: string;
    job_title: string | null;
    role: string;
    department: string | null;
  };
}) {
  // Fetch all data in parallel
  const [
    masterTasksResult,
    personalTasksResult,
    subTasksResult,
  ] = await Promise.all([
    getMasterTasks({ archived: false }),
    getMyTasks(),
    getMySubTasks(),
  ]);

  const masterTasks: MasterTask[] = masterTasksResult.success
    ? (masterTasksResult.data ?? [])
    : [];

  const personalTasks: PersonalTask[] = personalTasksResult.success
    ? (personalTasksResult.data ?? [])
    : [];

  const subTasks: Array<SubTask & { masterTaskTitle: string | null }> =
    subTasksResult.success ? (subTasksResult.data ?? []) : [];

  // Fetch detail for each master task to get groups + subtasks
  // Do this in parallel batches
  const atlasTasks: AtlasTasksData[] = [];
  const detailResults = await Promise.allSettled(
    masterTasks.map((mt) => getMasterTaskDetail(mt.id)),
  );

  for (let i = 0; i < masterTasks.length; i++) {
    const result = detailResults[i];
    if (result.status === "fulfilled" && result.value.success && result.value.data) {
      atlasTasks.push({
        masterTask: result.value.data.masterTask,
        taskGroups: result.value.data.taskGroups,
      });
    } else {
      // Fallback: use the master task row with no groups
      atlasTasks.push({ masterTask: masterTasks[i], taskGroups: [] });
    }
  }

  // Count active tasks assigned to current user
  const activeTaskCount =
    personalTasks.filter((t) => t.atlas_status !== "done" && t.atlas_status !== "cancelled").length +
    subTasks.length;

  return (
    <TasksDashboardShell
      initialTab={initialTab}
      personalTasks={personalTasks}
      subTasks={subTasks}
      atlasTasks={atlasTasks}
      currentUser={currentUser}
      activeTaskCount={activeTaskCount}
    />
  );
}

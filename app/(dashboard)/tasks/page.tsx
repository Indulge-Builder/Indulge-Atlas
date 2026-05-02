import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  getMasterTaskDetail,
  getMasterTasks,
  getDailyPersonalTasks,
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

type TabKey = "my-tasks" | "atlas-tasks";

interface AtlasTasksData {
  masterTask: MasterTask;
  taskGroups: Array<TaskGroup & { tasks: SubTask[] }>;
}

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

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

/** Data path — `searchParams` is resolved on the page, not passed through this boundary (React 19). */
async function TasksPageData({ initialTab }: { initialTab: TabKey }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  const [
    masterTasksResult,
    personalTasksResult,
    dailySopResult,
    subTasksResult,
  ] = await Promise.all([
    getMasterTasks({ archived: false }),
    getMyTasks(),
    getDailyPersonalTasks(),
    getMySubTasks(),
  ]);

  const masterTasks: MasterTask[] = masterTasksResult.success
    ? (masterTasksResult.data ?? [])
    : [];

  const personalTasks: PersonalTask[] = personalTasksResult.success && personalTasksResult.data
    ? personalTasksResult.data.personalTasks
    : [];

  const dailySopTasks: PersonalTask[] =
    dailySopResult.success && dailySopResult.data ? dailySopResult.data.items : [];

  const subTasks: Array<SubTask & { masterTaskTitle: string | null }> =
    subTasksResult.success ? (subTasksResult.data ?? []) : [];

  const atlasTasks: AtlasTasksData[] = [];
  const detailResults = await Promise.allSettled(
    masterTasks.map((mt) => getMasterTaskDetail(mt.id)),
  );

  for (let i = 0; i < masterTasks.length; i++) {
    const result = detailResults[i];
    if (result.status === "fulfilled" && result.value.success && result.value.data) {
      atlasTasks.push({
        masterTask: {
          ...result.value.data.masterTask,
          members: result.value.data.members,
        },
        taskGroups: result.value.data.taskGroups,
      });
    } else {
      atlasTasks.push({ masterTask: masterTasks[i], taskGroups: [] });
    }
  }

  const activeTaskCount =
    personalTasks.filter((t) => t.atlas_status !== "done" && t.atlas_status !== "cancelled").length +
    dailySopTasks.filter((t) => t.atlas_status !== "done" && t.atlas_status !== "cancelled").length +
    subTasks.length;

  return (
    <TasksDashboardShell
      initialTab={initialTab}
      personalTasks={personalTasks}
      dailySopTasks={dailySopTasks}
      subTasks={subTasks}
      atlasTasks={atlasTasks}
      currentUser={currentUser}
      activeTaskCount={activeTaskCount}
    />
  );
}

export default async function AtlasTasksPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialTab: TabKey =
    params.tab === "my-tasks" || params.tab === "atlas-tasks" ? params.tab : "atlas-tasks";

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <TasksPageData initialTab={initialTab} />
    </Suspense>
  );
}

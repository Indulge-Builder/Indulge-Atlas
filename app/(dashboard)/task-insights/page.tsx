import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaskIntelligenceDashboard } from "@/components/task-intelligence/TaskIntelligenceDashboard";
import {
  getDepartmentTaskOverview,
  getMasterWorkspacesForDashboard,
} from "@/lib/actions/task-intelligence";

export const dynamic = "force-dynamic";

type TaskInsightsPageProps = {
  searchParams: Promise<{ dept?: string }>;
};

/**
 * Resolve `searchParams` here (not inside a nested Suspense child) so React 19 does not
 * warn about async payload cleanup off the parent Suspense boundary. Segment `loading.tsx`
 * covers navigation skeleton for this route.
 */
export default async function TaskInsightsPage({ searchParams }: TaskInsightsPageProps) {
  const params = await searchParams;
  const rawDeptQuery = params.dept?.trim().toLowerCase() ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, domain, department, job_title")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const role = (profile.role as string) ?? "agent";
  if (!["manager", "founder", "admin", "super_admin"].includes(role)) redirect("/");

  const currentUser = {
    id:        profile.id as string,
    full_name: (profile.full_name as string) ?? "User",
    job_title: (profile.job_title as string | null) ?? null,
  };

  const [overview, workspaces] = await Promise.all([
    getDepartmentTaskOverview(),
    getMasterWorkspacesForDashboard(),
  ]);

  const rows = overview.success ? (overview.data ?? []) : [];
  const loadError = overview.success ? null : (overview.error ?? "Could not load Task Insights.");
  const workspaceItems = workspaces.success && workspaces.data ? workspaces.data : [];

  const initialOpenDepartmentId =
    rawDeptQuery && rows.some((r) => r.departmentId === rawDeptQuery) ? rawDeptQuery : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TaskIntelligenceDashboard
        initialOverview={rows}
        initialWorkspaces={workspaceItems}
        currentUser={currentUser}
        loadError={loadError}
        initialOpenDepartmentId={initialOpenDepartmentId}
      />
    </div>
  );
}

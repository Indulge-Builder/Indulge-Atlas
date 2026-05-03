import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMasterTasks } from "@/lib/actions/tasks";
import { ImportWizardShell } from "@/components/tasks/ImportWizardShell";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserRole } from "@/lib/types/database";

function isPrivilegedRole(role: string) {
  return ["admin", "founder", "manager", "super_admin"].includes(role);
}

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ master_task_id?: string }>;
}

async function ImportContent({ masterTaskId }: { masterTaskId?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, department")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "agent") as UserRole;
  const dept = profile?.department as string | null;

  const canImport =
    isPrivilegedRole(role) || dept === "tech" || dept === "onboarding";

  if (!canImport) redirect("/tasks");

  const result = await getMasterTasks({ archived: false });
  const masterTasks = result.success ? (result.data ?? []) : [];

  // If a master_task_id was pre-selected via query param, verify it exists
  const preselectedTask = masterTaskId
    ? (masterTasks.find((t) => t.id === masterTaskId) ?? null)
    : null;

  return (
    <ImportWizardShell
      masterTasks={masterTasks.map((t) => ({ id: t.id, title: t.title }))}
      defaultMasterTaskId={preselectedTask?.id}
    />
  );
}

export default async function ImportPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;

  return (
    <div className="min-h-screen bg-[#F9F9F6] px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-[28px] font-bold text-zinc-900 leading-none mb-1">
            Import Tasks
          </h1>
          <p className="text-sm text-zinc-500">
            Upload a CSV exported from Google Sheets to bulk-import sub-tasks.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          }
        >
          <ImportContent masterTaskId={params.master_task_id} />
        </Suspense>
      </div>
    </div>
  );
}

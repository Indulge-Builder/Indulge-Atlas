import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMasterTaskDetail } from "@/lib/actions/tasks";
import { MasterTaskDetail } from "@/components/tasks/MasterTaskDetail";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

function DetailSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F9F9F6]">
      <div className="atlas-masthead-texture w-full max-w-7xl mx-auto px-6 pt-6 pb-0">
        <Skeleton className="mb-5 h-4 w-28" />
        <div className="mb-6 flex items-start gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
        </div>
        <Skeleton className="mb-6 h-[52px] w-full rounded-2xl" />
        <div className="flex gap-6 border-b border-[#E5E4DF]">
          <Skeleton className="h-9 w-28 rounded-none" />
          <Skeleton className="h-9 w-24 rounded-none" />
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto px-6 pt-6 max-w-7xl mx-auto w-full pb-8">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="w-72 shrink-0 rounded-xl border border-[#E5E4DF] bg-[#FAFAF8] p-3 space-y-2.5">
            <Skeleton className="h-5 w-32 mb-3" />
            {Array.from({ length: 3 }).map((_, row) => (
              <Skeleton key={row} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

async function DetailContent({
  taskId,
  userId,
  backHref,
}: {
  taskId: string;
  userId: string;
  backHref: string;
}) {
  const supabase = await createClient();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role, full_name, job_title")
    .eq("id", userId)
    .single();

  const canDeleteMaster = ["admin", "founder"].includes(
    (profileRow?.role as string | undefined) ?? "",
  );

  const currentUser = {
    id:        userId,
    full_name: (profileRow?.full_name as string | undefined) ?? "Agent",
    job_title: (profileRow?.job_title as string | null | undefined) ?? null,
  };

  const result = await getMasterTaskDetail(taskId);
  if (!result.success || !result.data) notFound();

  const { masterTask, taskGroups, members } = result.data;

  return (
    <MasterTaskDetail
      masterTask={masterTask}
      taskGroups={taskGroups}
      members={members}
      canDeleteMaster={canDeleteMaster}
      currentUser={currentUser}
      backHref={backHref}
    />
  );
}

export default async function MasterTaskPage({ params, searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { id } = await params;
  const { from } = await searchParams;
  const backHref = from === "task-insights" ? "/task-insights" : "/tasks";

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent taskId={id} userId={user.id} backHref={backHref} />
      </Suspense>
    </div>
  );
}

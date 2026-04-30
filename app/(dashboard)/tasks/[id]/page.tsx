import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMasterTaskDetail } from "@/lib/actions/tasks";
import { MasterTaskDetail } from "@/components/tasks/MasterTaskDetail";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-[#F9F9F6] flex flex-col">
      <div className="px-6 pt-6 max-w-7xl mx-auto w-full space-y-6 flex-1">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-4 items-start">
          <Skeleton className="h-14 w-14 rounded-2xl shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full max-w-md" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <Skeleton className="h-[52px] w-full rounded-2xl" />
        <Skeleton className="h-11 w-full max-w-md" />
        <div className="flex-1 min-h-[420px] w-full rounded-2xl border border-[#E5E4DF] bg-[#FAFAF8]/80 p-5">
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 3 }).map((_, col) => (
              <div key={col} className="w-72 shrink-0 space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

async function DetailContent({
  taskId,
  userId,
}: {
  taskId: string;
  userId: string;
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
    />
  );
}

export default async function MasterTaskPage({ params }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { id } = await params;

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent taskId={id} userId={user.id} />
      </Suspense>
    </div>
  );
}

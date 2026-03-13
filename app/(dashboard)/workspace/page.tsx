import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodaysTasks } from "@/lib/actions/workspace";
import { TopBar } from "@/components/layout/TopBar";
import { WorkspaceBoard } from "@/components/workspace/WorkspaceBoard";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

// ── Skeleton — matches bento grid geometry exactly ────────

function WorkspaceSkeleton() {
  return (
    <>
      {/* TopBar ghost */}
      <div className="sticky top-0 z-30 h-[65px] border-b border-black/[0.05]
                      bg-[#F9F9F6]/80 backdrop-blur-xl" />

      <div className="px-8 py-7">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[calc(100vh-120px)]">
          {/* Left column */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <Skeleton className="h-48 rounded-2xl bg-black/[0.04] animate-pulse" />
            <Skeleton className="h-64 rounded-2xl bg-black/[0.04] animate-pulse" />
            <Skeleton className="flex-1 min-h-[180px] rounded-2xl bg-black/[0.04] animate-pulse" />
          </div>

          {/* Right column */}
          <div className="lg:col-span-5">
            <Skeleton className="h-full min-h-[580px] rounded-2xl bg-black/[0.04] animate-pulse" />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Async content — fetches profile + today's tasks ───────

async function WorkspaceContent({ userId }: { userId: string }) {
  const supabase = await createClient();

  const [{ data: profile }, tasks] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single(),
    getTodaysTasks(),
  ]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const hour      = new Date().getHours();
  const greeting  =
    hour < 12 ? "Good morning"
    : hour < 18 ? "Good afternoon"
    : "Good evening";

  return (
    <>
      <TopBar
        title="Workspace."
        subtitle="Your calm, focused space."
      />
      <WorkspaceBoard
        greeting={greeting}
        firstName={firstName}
        todaysTasks={tasks}
        currentUserId={userId}
      />
    </>
  );
}

// ── Page entry point ──────────────────────────────────────

export default async function WorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <Suspense fallback={<WorkspaceSkeleton />}>
        <WorkspaceContent userId={user.id} />
      </Suspense>
    </div>
  );
}

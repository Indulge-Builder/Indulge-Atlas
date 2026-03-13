import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAllAgentsWithStats } from "@/lib/actions/team-stats";
import { TeamGrid } from "@/components/scout/TeamGrid";
import { TopBar } from "@/components/layout/TopBar";
import { Skeleton } from "@/components/ui/skeleton";

// ── Role guard ────────────────────────────────────────────────

async function getAuthorisedProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.role === "agent") redirect("/");

  return profile;
}

// ── Skeleton ──────────────────────────────────────────────────

function TeamSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white border border-[#EAEAEA] rounded-2xl p-6 space-y-4"
        >
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-8 w-full rounded-xl" />
          <Skeleton className="h-5 w-20 rounded-full ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ── Async data section ────────────────────────────────────────

async function TeamContent() {
  const agents = await getAllAgentsWithStats();
  return <TeamGrid agents={agents} />;
}

// ── Page ──────────────────────────────────────────────────────

export default async function ScoutTeamPage() {
  await getAuthorisedProfile();

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Our Team."
        subtitle="Conversion metrics and pipeline health."
      />

      <div className="px-8 py-8 max-w-7xl">
        {/* Page header */}
        <div className="mb-8">
          <h1
            className="text-[#1A1A1A] text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Our Team<span className="text-[#D4AF37]">.</span>
          </h1>
          <p className="text-[#9E9E9E] text-[13px] mt-1.5 leading-relaxed">
            Conversion metrics and pipeline health.
          </p>
        </div>

        <Suspense fallback={<TeamSkeleton />}>
          <TeamContent />
        </Suspense>
      </div>
    </div>
  );
}

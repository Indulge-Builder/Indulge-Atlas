import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCampaignsWithAttribution } from "@/lib/actions/campaigns";
import { CampaignGrid } from "@/components/scout/CampaignDossier";
import { TopBar } from "@/components/layout/TopBar";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

// ── Role guard ─────────────────────────────────────────────────────────────────
async function requireScout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["scout", "admin"].includes(profile.role)) {
    redirect("/");
  }
}

// ── Loading skeleton ───────────────────────────────────────────────────────────
function CampaignsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-[#111111] border border-white/[0.07] rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-16 bg-white/[0.07]" />
            <Skeleton className="h-3 w-3 bg-white/[0.07]" />
          </div>
          <Skeleton className="h-5 w-3/4 bg-white/[0.07]" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((j) => (
              <div key={j} className="space-y-1">
                <Skeleton className="h-4 w-12 bg-white/[0.07]" />
                <Skeleton className="h-2.5 w-8 bg-white/[0.07]" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
            <Skeleton className="h-3 w-20 bg-white/[0.07]" />
            <Skeleton className="h-3 w-24 bg-white/[0.07]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Data component ─────────────────────────────────────────────────────────────
async function CampaignsContent() {
  const campaigns = await getCampaignsWithAttribution();
  return <CampaignGrid campaigns={campaigns} />;
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default async function CampaignsPage() {
  await requireScout();

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <TopBar
        title="Live Campaigns."
        subtitle="Closed-loop attribution — ad spend linked directly to revenue."
      />

      <div className="px-8 py-8">
        <Suspense fallback={<CampaignsSkeleton />}>
          <CampaignsContent />
        </Suspense>
      </div>
    </div>
  );
}

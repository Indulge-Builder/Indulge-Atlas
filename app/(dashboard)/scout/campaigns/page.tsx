import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCampaignsForTable } from "@/lib/actions/campaigns";
import { CampaignsPageClient } from "@/components/scout/CampaignsPageClient";
import { TopBar } from "@/components/layout/TopBar";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

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

function CampaignsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="inline-flex gap-0.5 p-1 rounded-full bg-white/40 border border-[#E5E4DF]">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="bg-white/40 rounded-2xl border border-[#E5E4DF] overflow-hidden">
        <div className="px-6 py-3.5 border-b border-[#EEEDE9] bg-[#FAFAF8]/60 flex gap-10">
          {["Campaign", "Status", "Impressions", "Spend", "Leads", "CPA"].map(
            (col) => (
              <Skeleton key={col} className="h-2.5 w-16" />
            )
          )}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-10 px-6 py-4 border-b border-[#F4F3EF] last:border-0"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="w-16 h-6 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function CampaignsContent() {
  const campaigns = await getCampaignsForTable();
  return <CampaignsPageClient campaigns={campaigns} />;
}

export default async function CampaignsPage() {
  await requireScout();

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Campaigns."
        subtitle="Performance Marketing Command Center — closed-loop attribution."
      />

      <div className="px-8 py-8">
        <Suspense fallback={<CampaignsSkeleton />}>
          <CampaignsContent />
        </Suspense>
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { MarketingOversightClient } from "@/components/marketing/MarketingOversightClient";
import {
  MarketingDashboardTab,
  MarketingDashboardSkeleton,
} from "@/components/marketing/MarketingDashboardTab";
import { getMarketingPulse } from "@/lib/actions/dashboards";

export const dynamic = "force-dynamic";

async function MarketingPulseSection() {
  const data = await getMarketingPulse();
  return <MarketingDashboardTab data={data} />;
}

export default async function MarketingOversightPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profile = rawProfile as { role: string } | null;

  if (
    !profile?.role ||
    !["admin", "founder", "manager"].includes(profile.role)
  ) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Marketing Oversight"
        subtitle="Founder's view of content, community growth & team performance"
      />

      <div className="px-8 py-6">
        <MarketingOversightClient
          pulseSlot={
            <Suspense fallback={<MarketingDashboardSkeleton />}>
              <MarketingPulseSection />
            </Suspense>
          }
        />
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingAgentsWithStats } from "@/lib/actions/team-stats";
import { getCampaignsWithAttribution } from "@/lib/actions/campaigns";
import { getOnboardingOverview } from "@/lib/actions/dashboards";
import { OnboardingOversightClient } from "./OnboardingOversightClient";
import { OnboardingLeadsContent } from "@/components/onboarding/OnboardingLeadsContent";
import { LeadsTableSkeleton } from "@/components/leads/LeadsTable";
import type { UserRole } from "@/lib/types/database";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    status?: string;
    agent?: string;
    campaign?: string;
    page?: string;
  }>;
}

export default async function OnboardingOversightPage(props: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const searchParams = await props.searchParams;
  const rawTab = searchParams.tab ?? "overview";
  const activeTab = rawTab === "pulse" ? "overview" : rawTab;

  const [{ data: profile }, agents, campaigns, initialOverviewData] =
    await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).single(),
      getOnboardingAgentsWithStats(),
      getCampaignsWithAttribution(),
      getOnboardingOverview(), // defaults to this month
    ]);

  if (!profile?.role || !["admin", "manager"].includes(profile.role)) {
    redirect(profile?.role === "founder" ? "/workspace" : "/");
  }

  const leadsSlot =
    activeTab === "leads" ? (
      <Suspense fallback={<LeadsTableSkeleton />}>
        <OnboardingLeadsContent
          searchParams={searchParams}
          role={profile?.role as UserRole}
        />
      </Suspense>
    ) : (
      <LeadsTableSkeleton />
    );

  return (
    <OnboardingOversightClient
      agents={agents}
      campaigns={campaigns}
      initialOverviewData={initialOverviewData}
    >
      {leadsSlot}
    </OnboardingOversightClient>
  );
}

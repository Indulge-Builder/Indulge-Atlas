import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingAgentsWithStats } from "@/lib/actions/team-stats";
import { OnboardingOversightClient } from "./OnboardingOversightClient";
import { OnboardingLeadsContent } from "@/components/onboarding/OnboardingLeadsContent";
import { LeadsTableSkeleton } from "@/components/leads/LeadsTable";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "scout") {
    redirect("/");
  }

  const searchParams = await props.searchParams;
  const agents = await getOnboardingAgentsWithStats();

  return (
    <OnboardingOversightClient agents={agents} searchParams={searchParams}>
      <Suspense fallback={<LeadsTableSkeleton />}>
        <OnboardingLeadsContent searchParams={searchParams} />
      </Suspense>
    </OnboardingOversightClient>
  );
}

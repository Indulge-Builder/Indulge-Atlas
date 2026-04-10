import { createServiceClient } from "@/lib/supabase/server";
import { TvOnboardingConversionsClient } from "@/components/tv/TvOnboardingConversionsClient";
import type { TvFeedRow } from "@/components/tv/TvOnboardingConversionsClient";
import { tvDashboardTokenValid } from "@/lib/tv/tvDashboardAuth";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function TvConversionsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const token = searchParams.token?.trim() ?? "";

  if (!tvDashboardTokenValid(token)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0D0C0A] px-6 text-center">
        <p className="font-[family-name:var(--font-playfair)] text-2xl text-[#D4AF37]">
          Display unavailable
        </p>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-white/50">
          Open this page with a valid <code className="text-white/70">token</code>{" "}
          query parameter that matches{" "}
          <code className="text-white/70">TV_DASHBOARD_SECRET</code> in your
          deployment environment.
        </p>
      </div>
    );
  }

  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("onboarding_leads")
    .select("id, client_name, amount, agent_name, assigned_to, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const initialRows = (data ?? []) as TvFeedRow[];

  return <TvOnboardingConversionsClient token={token} initialRows={initialRows} />;
}

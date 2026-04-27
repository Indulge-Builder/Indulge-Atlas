import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCampaignDrafts, getHistoricalData } from "@/lib/actions/planner";
import { TopBar } from "@/components/layout/TopBar";
import { PlannerStudio } from "@/components/planner/PlannerStudio";

// ── Auth + role guard ─────────────────────────────────────────

async function getAuthorisedProfile() {
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

  if (
    !profile?.role ||
    !["admin", "founder", "manager"].includes(profile.role)
  ) {
    redirect("/");
  }

  return profile;
}

// ── Page ──────────────────────────────────────────────────────

export default async function PlannerPage() {
  await getAuthorisedProfile();

  const [drafts, historical] = await Promise.all([
    getCampaignDrafts(),
    getHistoricalData(),
  ]);

  return (
    <div className="min-h-screen">
      <TopBar
        title="Ad Planner."
        subtitle="Forecasting Studio · Andreas"
      />

      {/* Page canvas — dark textured */}
      <div className="layout-canvas min-h-[calc(100vh-65px)] px-8 py-8">
        <div className="max-w-7xl mx-auto space-y-2">

          {/* Page intro */}
          <div className="mb-8">
            <h1
              className="text-white/80 text-2xl font-semibold tracking-tight leading-snug"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Forecasting Studio
            </h1>
            <p className="text-white/35 text-[12px] mt-1.5 leading-relaxed">
              Model your next campaign. The Oracle calculates projected leads, wins,
              and ROAS in real time as you adjust your strategy.
            </p>
          </div>

          <PlannerStudio
            initialDrafts={drafts}
            avgDealValue={historical.avgDealValue}
            defaultWinRate={historical.winRate}
          />
        </div>
      </div>
    </div>
  );
}

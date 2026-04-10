import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCampaignDossierOrMock } from "@/lib/actions/campaigns";
import { CampaignDossierClient } from "@/components/scout/CampaignDossierClient";
import { CampaignDossierLeads } from "@/components/scout/CampaignDossierLeads";
import { TopBar } from "@/components/layout/TopBar";

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

  if (
    !profile?.role ||
    !["admin", "founder", "manager"].includes(profile.role)
  ) {
    redirect("/");
  }
}

export default async function CampaignDossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; q?: string; status?: string; agent?: string }>;
}) {
  await requireScout();
  const { id } = await params;
  const sp = await searchParams;

  const dossier = await getCampaignDossierOrMock(id);
  if (!dossier) notFound();

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title={dossier.campaign.campaign_name}
        subtitle={`${dossier.campaign.platform} · Campaign Dossier`}
      />

      <div className="px-8 py-6">
        <CampaignDossierClient
          campaignId={id}
          dossier={dossier}
          leadsTab={
            <CampaignDossierLeads campaignId={id} searchParams={sp} />
          }
        />
      </div>
    </div>
  );
}

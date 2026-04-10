import { getLeadsForCampaign } from "@/lib/actions/campaigns";
import { LeadsTable } from "@/components/leads/LeadsTable";
import type { UserRole } from "@/lib/types/database";

interface CampaignDossierLeadsProps {
  campaignId: string;
  searchParams: {
    page?: string;
    q?: string;
    status?: string;
    agent?: string;
  };
}

export async function CampaignDossierLeads({
  campaignId,
  searchParams,
}: CampaignDossierLeadsProps) {
  const { leads, totalCount, agents, nextTaskMap } = await getLeadsForCampaign(
    campaignId,
    {
      page: parseInt(searchParams.page ?? "1", 10),
      q: searchParams.q,
      status: searchParams.status,
      agent: searchParams.agent,
    }
  );

  const userRole: UserRole = "manager";

  return (
    <LeadsTable
      leads={leads}
      totalCount={totalCount}
      currentPage={parseInt(searchParams.page ?? "1", 10)}
      role={userRole}
      agents={agents}
      campaigns={[]}
      nextTaskMap={nextTaskMap}
      embedCampaignId={campaignId}
      embedQueryParams={{ tab: "leads" }}
    />
  );
}

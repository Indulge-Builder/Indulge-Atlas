import { getClientsDirectoryPageData } from "@/lib/actions/clients";
import { canManageAnyClient } from "@/lib/types/database";
import ClientsIndex from "@/components/clients/ClientsIndex";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { clients, total, stats, role } = await getClientsDirectoryPageData({
    page: 1,
    pageSize: 24,
    client_status: "active",
    sort: "profile_data",
  });

  return (
    <ClientsIndex
      initialClients={clients}
      initialTotal={total}
      stats={stats}
      showChettoMappingLink={canManageAnyClient(role)}
    />
  );
}

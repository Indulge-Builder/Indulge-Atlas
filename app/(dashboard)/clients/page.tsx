import { getClientsDirectoryPageData, getChettoUnmappedQueueStats, getChettoUnmappedBacklogCount } from "@/lib/actions/clients";
import { canManageAnyClient } from "@/lib/types/database";
import ClientsIndex from "@/components/clients/ClientsIndex";
import chettoBacklog from "@/scripts/chetto-unmapped-remaining.json";

export const dynamic = "force-dynamic";

const BACKLOG_CLIENT_IDS = chettoBacklog.clients.map((c) => c.id);

export default async function ClientsPage() {
  const { clients, total, stats, role } = await getClientsDirectoryPageData({
    page: 1,
    pageSize: 24,
    client_status: "active",
    sort: "profile_data",
  });

  const showChetto = canManageAnyClient(role);
  let chettoQueuePending = 0;
  if (showChetto) {
    const queueStats = await getChettoUnmappedQueueStats();
    chettoQueuePending = queueStats.success
      ? queueStats.pending
      : await getChettoUnmappedBacklogCount(BACKLOG_CLIENT_IDS);
  }

  return (
    <ClientsIndex
      initialClients={clients}
      initialTotal={total}
      stats={stats}
      showChettoMappingLink={showChetto}
      chettoQueuePending={chettoQueuePending}
    />
  );
}

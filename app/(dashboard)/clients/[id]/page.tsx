import { notFound } from "next/navigation";
import { getClientById } from "@/lib/actions/clients";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { canManageAnyClient } from "@/lib/types/database";
import { ClientDetailViewLoader } from "@/components/clients/ClientDetailViewLoader";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [clientRes, { user, role }] = await Promise.all([
    getClientById(id),
    getAuthUser(),
  ]);

  if (!clientRes.success || !clientRes.data) notFound();

  // Mirror assertCanEditClient: privileged roles, or the row's owner agent.
  const d = clientRes.data;
  const canEdit =
    canManageAnyClient(role) ||
    d.assigned_agent_id === user.id ||
    d.closed_by === user.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ClientDetailViewLoader initialDetail={d} canEdit={canEdit} />
    </div>
  );
}

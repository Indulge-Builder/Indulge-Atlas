import { notFound } from "next/navigation";
import { getClientById } from "@/lib/actions/clients";
import { ClientDetailView } from "@/components/clients/ClientDetailView";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;

  const clientRes = await getClientById(id);

  if (!clientRes.success || !clientRes.data) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ClientDetailView initialDetail={clientRes.data} />
    </div>
  );
}

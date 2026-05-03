import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClientById } from "@/lib/actions/clients";
import { ClientDetailView } from "@/components/clients/ClientDetailView";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const res = await getClientById(id);
  if (!res.success || !res.data) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ClientDetailView initialDetail={res.data} />
    </div>
  );
}

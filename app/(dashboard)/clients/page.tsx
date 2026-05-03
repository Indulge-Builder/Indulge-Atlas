import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getClients,
  getClientDirectoryStats,
} from "@/lib/actions/clients";
import ClientsIndex from "@/components/clients/ClientsIndex";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ clients, total }, stats] = await Promise.all([
    getClients({
      page: 1,
      pageSize: 24,
      client_status: "active",
      sort: "profile_data",
    }),
    getClientDirectoryStats(),
  ]);

  return (
    <ClientsIndex
      initialClients={clients}
      initialTotal={total}
      stats={stats}
    />
  );
}

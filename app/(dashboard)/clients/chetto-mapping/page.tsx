import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClientsChettoMappingPage } from "@/lib/actions/clients";
import { getChettoMappingCatalog } from "@/lib/actions/chetto-catalog";
import { canManageAnyClient } from "@/lib/types/database";
import { TopBar } from "@/components/layout/TopBar";
import { ChettoMappingClient } from "@/components/clients/chetto/ChettoMappingClient";

export const dynamic = "force-dynamic";

export default async function ChettoMappingPage() {
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

  const role = (profile?.role as string) ?? "agent";
  if (!canManageAnyClient(role)) redirect("/clients");

  const res = await getClientsChettoMappingPage({ page: 1, pageSize: 50 });
  const catalogRes = await getChettoMappingCatalog();
  if (!res.success) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <TopBar title="Chetto mapping" subtitle="Link clients to Joule group ids" />
        <div className="px-8 py-10 text-sm text-stone-600">
          {res.error ?? "Could not load clients."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F9F9F6]">
      <TopBar title="Chetto mapping" subtitle="Assign Joule group_id per client profile" />
      <div className="shrink-0 border-b border-[#E5E4DF] bg-[#F9F9F6] px-8 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/clients"
            className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
          >
            ← Back to Clients
          </Link>
          <Link
            href="/clients/chetto-unmapped"
            className="text-sm font-medium text-amber-800 underline-offset-2 hover:underline"
          >
            Chetto backlog
          </Link>
        </div>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <ChettoMappingClient
          initialClients={res.clients}
          initialTotal={res.total}
          groupCatalog={catalogRes.catalog?.groups ?? []}
          queendomOrgs={catalogRes.catalog?.queendomOrgs ?? []}
          nameByGroupId={catalogRes.catalog?.nameByGroupId ?? {}}
        />
      </main>
    </div>
  );
}

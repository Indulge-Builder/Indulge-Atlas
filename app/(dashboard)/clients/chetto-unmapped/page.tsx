import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getClientsChettoMappingPage,
  getChettoUnmappedQueueStats,
  getChettoUnmappedBacklogCount,
} from "@/lib/actions/clients";
import { getChettoMappingCatalog } from "@/lib/actions/chetto-catalog";
import { canManageAnyClient } from "@/lib/types/database";
import { TopBar } from "@/components/layout/TopBar";
import { ChettoMappingClient } from "@/components/clients/chetto/ChettoMappingClient";
import chettoBacklog from "@/scripts/chetto-unmapped-remaining.json";

export const dynamic = "force-dynamic";

const BACKLOG_CLIENT_IDS = chettoBacklog.clients.map((c) => c.id);

export default async function ChettoUnmappedPage() {
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

  const [res, catalogRes, queueStats] = await Promise.all([
    getClientsChettoMappingPage({
      page: 1,
      pageSize: 100,
      queueOnly: true,
      clientIds: BACKLOG_CLIENT_IDS,
    }),
    getChettoMappingCatalog(),
    getChettoUnmappedQueueStats(),
  ]);

  const fallbackPending = await getChettoUnmappedBacklogCount(BACKLOG_CLIENT_IDS);

  if (!res.success) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <TopBar
          title="Chetto backlog"
          subtitle="Clients still need WhatsApp group mapping"
        />
        <div className="space-y-3 px-8 py-10 text-sm text-stone-600">
          <p>{res.error ?? "Could not load backlog."}</p>
        </div>
      </div>
    );
  }

  const pending = queueStats.success ? queueStats.pending : fallbackPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F9F9F6]">
      <TopBar
        title="Chetto backlog"
        subtitle={`${pending} client${pending === 1 ? "" : "s"} from export still need group mapping`}
      />
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-[#E5E4DF] bg-[#F9F9F6] px-8 py-3">
        <Link
          href="/clients"
          className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
        >
          ← Back to Clients
        </Link>
        <Link
          href="/clients/chetto-mapping"
          className="text-sm font-medium text-[#9A7B2E] underline-offset-2 hover:underline"
        >
          All clients — Chetto mapping
        </Link>
        <Link
          href="/clients/unmapped"
          className="text-sm font-medium text-stone-500 underline-offset-2 hover:text-stone-800"
        >
          Unmapped (phone + Chetto)
        </Link>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <ChettoMappingClient
          initialClients={res.clients}
          initialTotal={res.total}
          groupCatalog={catalogRes.catalog?.groups ?? []}
          queendomOrgs={catalogRes.catalog?.queendomOrgs ?? []}
          nameByGroupId={catalogRes.catalog?.nameByGroupId ?? {}}
          initialOnlyUnmapped
          queueOnly
          backlogClientIds={BACKLOG_CLIENT_IDS}
          pageTitle="Chetto mapping backlog"
        />
      </main>
    </div>
  );
}

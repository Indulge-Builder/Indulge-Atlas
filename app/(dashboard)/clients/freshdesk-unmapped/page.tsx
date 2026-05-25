import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canManageAnyClient } from "@/lib/types/database";
import { getFreshdeskUnmappedClients } from "@/lib/actions/freshdesk";
import { TopBar } from "@/components/layout/TopBar";
import { FreshdeskUnmappedClient } from "@/components/clients/freshdesk-unmapped/FreshdeskUnmappedClient";

export const dynamic = "force-dynamic";

export default async function FreshdeskUnmappedPage() {
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

  const res = await getFreshdeskUnmappedClients({ page: 1, pageSize: 20 });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F9F9F6]">
      <TopBar
        title="Freshdesk unmapped."
        subtitle="Clients with a phone number but no Freshdesk contact match"
      />
      <div className="shrink-0 border-b border-[#E5E4DF] bg-[#F9F9F6] px-8 py-3">
        <Link
          href="/clients"
          className="text-sm font-medium text-stone-500 transition-colors hover:text-stone-900"
        >
          ← Back to Clients
        </Link>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {res.success ? (
          <FreshdeskUnmappedClient
            initialClients={res.clients}
            initialChecked={res.checkedCount}
            initialTotal={res.totalWithPhone}
            initialHasMore={res.hasMore}
          />
        ) : (
          <div className="px-8 py-10 text-sm text-stone-600">
            {res.error ?? "Could not load clients."}
          </div>
        )}
      </main>
    </div>
  );
}

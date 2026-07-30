import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole, CONCIERGE_GROUPS, type ConciergeGroup } from "@/lib/types/database";
import { getConciergeCategories, getAssignableAgents, getClientOptions } from "@/lib/actions/concierge-options";
import { NewTicketForm } from "@/components/concierge/tickets/NewTicketForm";

export const dynamic = "force-dynamic";

export default async function NewConciergeTicketPage() {
  const { supabase, user, role, department } = await getAuthUser();
  const isAdmin = isPrivilegedRole(role);
  const canCreate = isAdmin || (role === "manager" && department === "concierge");
  if (!canCreate) redirect("/concierge/tickets");

  const [clients, categories, agents] = await Promise.all([
    getClientOptions(),
    getConciergeCategories(),
    getAssignableAgents(),
  ]);

  // Caller's primary + full group membership (one agent → many groups).
  const [{ data: me }, { data: memRows }] = await Promise.all([
    supabase.from("profiles").select("concierge_group").eq("id", user.id).single(),
    supabase.from("concierge_agent_groups").select("org_group").eq("profile_id", user.id),
  ]);
  const primaryRaw = (me?.concierge_group as string | null) ?? null;
  const primary =
    primaryRaw && (CONCIERGE_GROUPS as readonly string[]).includes(primaryRaw)
      ? (primaryRaw as ConciergeGroup)
      : null;
  const myGroups = ((memRows as { org_group: string }[] | null) ?? [])
    .map((r) => r.org_group)
    .filter((g): g is ConciergeGroup => (CONCIERGE_GROUPS as readonly string[]).includes(g));
  const mySet = [...new Set<ConciergeGroup>([...(primary ? [primary] : []), ...myGroups])];

  // Admins may file under either Queendom; a bishop under any group they belong to.
  const groupOptions: readonly ConciergeGroup[] = isAdmin ? CONCIERGE_GROUPS : mySet;
  const canPickGroup = isAdmin || mySet.length > 1;
  const defaultGroup = primary ?? mySet[0] ?? null;

  return (
    <NewTicketForm
      initialClients={clients}
      categories={categories}
      agents={agents}
      defaultGroup={defaultGroup}
      canPickGroup={canPickGroup}
      groupOptions={groupOptions}
    />
  );
}

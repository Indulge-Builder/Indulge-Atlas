import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import { getMyTickets, getTicketQueue } from "@/lib/actions/concierge-tickets";
import { getConciergeCategories, getAssignableAgents } from "@/lib/actions/concierge-options";
import { TicketsIndex } from "@/components/concierge/tickets/TicketsIndex";

export const dynamic = "force-dynamic";

export default async function ConciergeTicketsPage() {
  const { role, department } = await getAuthUser();
  const isAdmin = isPrivilegedRole(role);
  const isConcierge = department === "concierge";
  const isFinance = department === "finance";
  const isWatcher = department === "watcher";
  if (!isAdmin && !isConcierge && !isFinance && !isWatcher) redirect("/");

  // Create/assign actions — Bishops (concierge managers) + admins.
  const canManageQueue = isAdmin || (role === "manager" && isConcierge);
  // See the whole Queendom queue read-only — also finance (invoice oversight) and
  // watchers (cross-Queendom oversight), who own no assigned tickets.
  const canViewQueue = canManageQueue || isFinance || isWatcher;
  // Oversight roles have no "My Tickets", so land them on the queue.
  const worksTickets = isConcierge && !isAdmin;
  const initialScope: "mine" | "queue" = worksTickets ? "mine" : "queue";

  const [tickets, categories, agents] = await Promise.all([
    initialScope === "queue" ? getTicketQueue({}) : getMyTickets({}),
    getConciergeCategories(),
    getAssignableAgents(),
  ]);

  return (
    <TicketsIndex
      initialTickets={tickets}
      scope={initialScope}
      canViewQueue={canViewQueue}
      canManageQueue={canManageQueue}
      isAdmin={isAdmin}
      categories={categories}
      agents={agents}
    />
  );
}

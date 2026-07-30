import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import { getTicketById } from "@/lib/actions/concierge-tickets";
import { getAssignableAgents, getCannedResponses } from "@/lib/actions/concierge-options";
import { getVendors } from "@/lib/actions/concierge-vendors";
import { TicketDetailView } from "@/components/concierge/tickets/TicketDetailView";

export const dynamic = "force-dynamic";

export default async function ConciergeTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, auth] = await Promise.all([getTicketById(id), getAuthUser()]);
  if (!detail) notFound();

  const { supabase, user, role, department } = auth;
  const isAdmin = isPrivilegedRole(role);

  // canEdit mirrors can_edit_concierge_ticket: privileged, or concierge who is a member
  // of the ticket's group AND is the assignee or a manager.
  let canEdit = isAdmin;
  if (!canEdit && department === "concierge") {
    const { data: mem } = await supabase
      .from("concierge_agent_groups")
      .select("org_group")
      .eq("profile_id", user.id)
      .eq("org_group", detail.ticket.org_group)
      .maybeSingle();
    canEdit = !!mem && (detail.ticket.assigned_to === user.id || role === "manager");
  }

  const [agents, vendors, canned] = await Promise.all([
    getAssignableAgents({ group: detail.ticket.org_group }),
    getVendors(),
    getCannedResponses(),
  ]);

  return (
    <TicketDetailView
      detail={detail}
      canEdit={canEdit}
      isAdmin={isAdmin}
      agents={agents}
      vendors={vendors}
      canned={canned}
    />
  );
}

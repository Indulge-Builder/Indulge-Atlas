"use server";

import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { ATLAS_SYSTEM_AUTHOR_ID } from "@/lib/types/database";
import { OVERDUE_THRESHOLD_MINUTES } from "@/lib/concierge/slaClock";
import { NON_OVERDUE_STATUSES } from "@/lib/concierge/ticketStateMachine";
import { insertTicketNotification } from "@/lib/services/ticketNotificationInsert";

/**
 * Hourly SLA overdue sweep (called by the protected cron route).
 * A ticket is OVERDUE when it has sat > 8h (calendar, 24/7) since its last status
 * change AND its status is not one of the paused statuses (resolved / ongoing_delivery
 * / nudge_client / closed). Clears the flag when a ticket leaves that condition.
 *
 * Runs under the service role (no user session).
 */
export async function sweepOverdueTickets(): Promise<{ markedOverdue: number; cleared: number }> {
  const service = getServiceSupabaseClient();
  const cutoff = new Date(Date.now() - OVERDUE_THRESHOLD_MINUTES * 60_000).toISOString();

  // Statuses that CAN go overdue (the complement of the paused set).
  const overdueEligible = ["open", "pending", "nudge_vendor", "invoice_due"];
  const pausedList = NON_OVERDUE_STATUSES.join(",");

  // Mark newly-overdue.
  const { data: toMark, error: markSelErr } = await service
    .from("concierge_tickets")
    .select("id, ref_number, assigned_to")
    .eq("is_overdue", false)
    .in("status", overdueEligible)
    .lte("status_changed_at", cutoff);
  if (markSelErr) console.error("[sweepOverdueTickets] mark-select", markSelErr.message);

  let markedOverdue = 0;
  if (toMark && toMark.length > 0) {
    const ids = toMark.map((t) => t.id as string);
    const { error } = await service.from("concierge_tickets").update({ is_overdue: true }).in("id", ids);
    if (error) {
      console.error("[sweepOverdueTickets] mark-update", error.message);
    } else {
      markedOverdue = ids.length;
      for (const t of toMark) {
        if (t.assigned_to) {
          insertTicketNotification({
            recipientId: t.assigned_to as string,
            actorId: ATLAS_SYSTEM_AUTHOR_ID,
            type: "ticket_status_changed",
            ticketId: t.id as string,
            title: `Ticket #${t.ref_number} is overdue`,
          });
        }
      }
    }
  }

  // Clear the flag where no longer applicable (paused status OR back within threshold).
  const { data: toClear } = await service
    .from("concierge_tickets")
    .select("id")
    .eq("is_overdue", true)
    .or(`status.in.(${pausedList}),status_changed_at.gt.${cutoff}`);
  let cleared = 0;
  if (toClear && toClear.length > 0) {
    const ids = toClear.map((t) => t.id as string);
    const { error } = await service.from("concierge_tickets").update({ is_overdue: false }).in("id", ids);
    if (error) console.error("[sweepOverdueTickets] clear", error.message);
    else cleared = ids.length;
  }

  return { markedOverdue, cleared };
}

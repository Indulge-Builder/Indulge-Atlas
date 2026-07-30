/**
 * Fire-and-forget insert helper for concierge_ticket_notifications.
 *
 * Mirrors lib/services/taskNotificationInsert.ts: service-role client (bypasses the
 * insert-less RLS), never throws (only console.error), and self-notify guard.
 * NOT a "use server" module — called from ticket server actions after a mutation.
 */
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import type { ConciergeTicketNotificationType } from "@/lib/types/database";

interface InsertTicketNotificationArgs {
  recipientId: string;
  actorId: string;
  type: ConciergeTicketNotificationType;
  ticketId: string;
  title: string;
  body?: string | null;
}

/** Insert one notification row for one recipient. No-op if recipient === actor. */
export function insertTicketNotification(args: InsertTicketNotificationArgs): void {
  const { recipientId, actorId, type, ticketId, title, body } = args;
  if (!recipientId || recipientId === actorId) return; // don't notify yourself

  void (async () => {
    try {
      const supabase = getServiceSupabaseClient();
      const { error } = await supabase.from("concierge_ticket_notifications").insert({
        recipient_id: recipientId,
        actor_id: actorId,
        type,
        ticket_id: ticketId,
        title,
        body: body ?? null,
      });
      if (error) console.error("[insertTicketNotification]", error.message);
    } catch (err) {
      console.error("[insertTicketNotification]", err);
    }
  })();
}

/**
 * Notify the whole Finance department (used on Invoice Due).
 * department = 'finance' is index-backed; admins/founders have NULL department and
 * are intentionally excluded (they are not the invoice queue owners).
 */
export function notifyFinanceDepartment(args: {
  actorId: string;
  ticketId: string;
  title: string;
  body?: string | null;
}): void {
  void (async () => {
    try {
      const supabase = getServiceSupabaseClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("department", "finance")
        .eq("is_active", true);
      if (error) {
        console.error("[notifyFinanceDepartment]", error.message);
        return;
      }
      for (const row of data ?? []) {
        insertTicketNotification({
          recipientId: row.id as string,
          actorId: args.actorId,
          type: "invoice_due",
          ticketId: args.ticketId,
          title: args.title,
          body: args.body ?? null,
        });
      }
    } catch (err) {
      console.error("[notifyFinanceDepartment]", err);
    }
  })();
}

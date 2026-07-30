"use server";

/**
 * Concierge ticket notifications — read + mark-read surface for the bell UI.
 *
 * Rows are written fire-and-forget by lib/services/ticketNotificationInsert.ts
 * (service role). Here we only READ the current user's own rows and flip read_at.
 * RLS on concierge_ticket_notifications already restricts SELECT to own rows and
 * UPDATE to read_at only, so the authed client is sufficient (no service role).
 */
import { getAuthUser } from "@/lib/auth/getAuthUser";
import type { ConciergeTicketNotification } from "@/lib/types/database";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

const NOTIFICATION_SELECT =
  "id, recipient_id, actor_id, type, ticket_id, title, body, read_at, created_at";

/** Recent notifications for the current user, newest first (default 20). */
export async function getConciergeNotifications(
  limit = 20,
): Promise<ConciergeTicketNotification[]> {
  try {
    const { supabase, user } = await getAuthUser();
    const { data, error } = await supabase
      .from("concierge_ticket_notifications")
      .select(NOTIFICATION_SELECT)
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error) {
      console.error("[getConciergeNotifications]", error.message);
      return [];
    }
    return (data as ConciergeTicketNotification[]) ?? [];
  } catch (err) {
    console.error("[getConciergeNotifications]", err);
    return [];
  }
}

/** Count of unread notifications for the current user (for the bell badge). */
export async function getConciergeUnreadCount(): Promise<number> {
  try {
    const { supabase, user } = await getAuthUser();
    const { count, error } = await supabase
      .from("concierge_ticket_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null);
    if (error) {
      console.error("[getConciergeUnreadCount]", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[getConciergeUnreadCount]", err);
    return 0;
  }
}

/** Mark a single notification read. No-op if already read or not the recipient's. */
export async function markConciergeNotificationRead(
  id: string,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();
    const { error } = await supabase
      .from("concierge_ticket_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("recipient_id", user.id)
      .is("read_at", null);
    if (error) return { success: false, error: "Could not update the notification." };
    return { success: true };
  } catch (err) {
    console.error("[markConciergeNotificationRead]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

/** Mark every unread notification for the current user as read. */
export async function markAllConciergeNotificationsRead(): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();
    const { error } = await supabase
      .from("concierge_ticket_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .is("read_at", null);
    if (error) return { success: false, error: "Could not update notifications." };
    return { success: true };
  } catch (err) {
    console.error("[markAllConciergeNotificationsRead]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

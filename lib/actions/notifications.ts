"use server";

import { createClient } from "@/lib/supabase/server";
import type { NotificationSummary, TaskNotification } from "@/lib/types/database";

async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Fetches the 50 most recent notifications for the current user.
 * Excludes notifications older than 30 days.
 */
export async function getMyNotifications(): Promise<NotificationSummary | { error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Unauthorized" };

  const supabase = await createClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("task_notifications")
    .select(
      `
      *,
      actor:profiles!task_notifications_actor_id_fkey(id, full_name, department)
    `,
    )
    .eq("recipient_id", userId)
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { error: error.message };

  const notifications = (data ?? []) as TaskNotification[];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return { notifications, unreadCount };
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<{ ok: true } | { error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Unauthorized" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("task_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", userId);

  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Marks all unread notifications for the current user as read.
 */
export async function markAllNotificationsRead(): Promise<{ ok: true } | { error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Unauthorized" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("task_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) return { error: error.message };
  return { ok: true };
}

import { getServiceSupabaseClient } from "@/lib/supabase/service";
import type { TaskNotificationType } from "@/lib/types/database";

/**
 * Called from task server actions. Uses service role to bypass RLS.
 * Fire-and-forget: never throws; failures are logged only.
 */
export function insertTaskNotification({
  recipientId,
  actorId,
  type,
  taskId,
  parentTaskId,
  title,
  body,
}: {
  recipientId: string;
  actorId: string;
  type: TaskNotificationType;
  taskId: string;
  parentTaskId?: string | null;
  title: string;
  body?: string | null;
}): void {
  if (recipientId === actorId) return;

  void (async () => {
    try {
      const supabase = getServiceSupabaseClient();
      const { error } = await supabase.from("task_notifications").insert({
        recipient_id: recipientId,
        actor_id: actorId,
        type,
        task_id: taskId,
        parent_task_id: parentTaskId ?? null,
        title,
        body: body ?? null,
      });
      if (error) console.error("[insertTaskNotification]", error.message);
    } catch (e) {
      console.error("[insertTaskNotification]", e);
    }
  })();
}

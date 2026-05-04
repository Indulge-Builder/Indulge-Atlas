import { getServiceSupabaseClient } from "@/lib/supabase/service";

export type WebhookLogSource = "meta" | "google" | "website";

/**
 * Fire-and-forget insert into webhook_logs. Does not block the HTTP response.
 */
export function enqueueWebhookLog(
  source: WebhookLogSource,
  rawPayload: Record<string, unknown>,
): void {
  void getServiceSupabaseClient()
    .from("webhook_logs")
    .insert({
      source,
      raw_payload: rawPayload,
    } as never)
    .then(({ error }) => {
      if (error) {
        console.error("[webhook_logs] insert failed:", error.message);
      }
    });
}

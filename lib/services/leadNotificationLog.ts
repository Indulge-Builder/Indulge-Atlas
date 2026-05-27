/**
 * Lead notification audit logger.
 * Fire-and-forget safe — never throws. All writes use the service role client.
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";

type EventType = "lead_received" | "notification_sent" | "notification_failed";

interface LogLeadReceivedParams {
  leadId: string;
  agentId: string | null;
  leadName: string;
  leadPhone: string;
  source: string;
}

interface LogNotificationParams {
  leadId: string;
  agentId: string;
  leadName: string;
  leadPhone: string;
  agentPhoneSuffix: string;   // last 4 chars only
  gupshupStatus: number;
  gupshupBody: string;
  delivered: boolean;
}

async function insertLog(
  eventType: EventType,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = getServiceSupabaseClient();
    const { error } = await supabase
      .from("lead_notification_logs")
      .insert({ event_type: eventType, ...fields } as never);
    if (error) {
      console.error("[leadNotificationLog] Insert failed:", error.message);
    }
  } catch (err) {
    console.error("[leadNotificationLog] Unexpected error:", err);
  }
}

/** Call immediately after a lead is created and assigned. */
export function logLeadReceived(params: LogLeadReceivedParams): void {
  void insertLog("lead_received", {
    lead_id: params.leadId,
    agent_id: params.agentId,
    lead_name: params.leadName,
    lead_phone: params.leadPhone,
    source: params.source,
  });
}

/** Call after a Gupshup template send attempt (success or failure). */
export function logNotificationAttempt(params: LogNotificationParams): void {
  const eventType: EventType = params.delivered
    ? "notification_sent"
    : "notification_failed";

  void insertLog(eventType, {
    lead_id: params.leadId,
    agent_id: params.agentId,
    lead_name: params.leadName,
    lead_phone: params.leadPhone,
    agent_phone: params.agentPhoneSuffix,
    gupshup_status: params.gupshupStatus,
    gupshup_body: params.gupshupBody.slice(0, 2000),
    delivered: params.delivered,
  });
}

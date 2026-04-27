/**
 * INDULGE ATLAS — Agent Routing Config Data Access
 *
 * Reads per-agent routing configuration (shift windows, daily caps, waterfall
 * priority) from the `agent_routing_config` table via the service role client.
 *
 * No in-memory caching — every call returns a fresh DB snapshot so that admin
 * edits (e.g. toggling is_active, adjusting daily_cap) take effect on the very
 * next webhook ingestion without a process restart.
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";
import type { AgentRoutingConfig } from "@/lib/types/database";

const supabase = getServiceSupabaseClient();

/**
 * Returns all active agent routing config rows for the given domain, ordered
 * by `priority ASC`. Uses the service role client — bypasses RLS.
 *
 * Returns an empty array on DB error so the caller can fall back gracefully.
 */
export async function getActiveAgentConfig(
  domain: string,
): Promise<AgentRoutingConfig[]> {
  const { data, error } = await supabase
    .from("agent_routing_config")
    .select(
      "id, user_id, email, domain, is_active, daily_cap, priority, shift_start, shift_end, notes, created_at, updated_at",
    )
    .eq("domain", domain)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) {
    console.error(
      "[agentRoutingConfig] Failed to fetch agent config:",
      error.message,
    );
    return [];
  }

  return (data ?? []) as AgentRoutingConfig[];
}

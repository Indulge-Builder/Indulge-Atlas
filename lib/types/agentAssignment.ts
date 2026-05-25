import type { IndulgeDomain } from "./database";

export type AgentPoolStatus = "receiving" | "paused" | "unmanaged";

export interface AgentWithRoutingStatus {
  // From profiles
  id: string;
  full_name: string;
  email: string;
  domain: IndulgeDomain;
  // From agent_routing_config (null if no row exists)
  config_id: string | null;
  is_active: boolean | null;
  daily_cap: number | null;
  priority: number;
  shift_start: string | null; // "HH:MM:SS" from DB
  shift_end: string | null;   // "HH:MM:SS" from DB
  notes: string | null;
  // Derived
  pool_status: AgentPoolStatus;
}

// Domains that participate in lead assignment — indulge_global excluded
export const LEAD_DOMAINS: IndulgeDomain[] = [
  "indulge_concierge",
  "indulge_shop",
  "indulge_house",
  "indulge_legacy",
];

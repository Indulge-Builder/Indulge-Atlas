"use client";

import type { Profile } from "@/lib/types/database";
import { AgentSLAAlert } from "./AgentSLAAlert";
import { ScoutSLAAlerts } from "./ScoutSLAAlerts";

interface SLAProviderProps {
  profile: Profile;
  children: React.ReactNode;
}

/**
 * Renders SLA-related UI based on user role:
 * - Agents: Quiet luxury toast at bottom-center when they have breached leads
 * - Scouts/Admins: Muted warning bell in top-right that opens Escalated Leads panel
 */
export function SLAProvider({ profile, children }: SLAProviderProps) {
  return (
    <>
      {children}
      {profile.role === "agent" && (
        <AgentSLAAlert userId={profile.id} />
      )}
      {(profile.role === "scout" || profile.role === "admin") && (
        <ScoutSLAAlerts userId={profile.id} />
      )}
    </>
  );
}

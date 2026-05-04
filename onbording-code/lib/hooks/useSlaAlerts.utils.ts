import { createClient } from "@/lib/supabase/client";
import { computeBreachLevel } from "@/lib/hooks/useSLA_Monitor";
import type { BreachedLead } from "@/lib/hooks/useSLA_Monitor";

type LeadRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  assigned_at: string;
  created_at: string;
  is_off_duty?: boolean;
};

/**
 * Fetches leads assigned to the user that have breached SLA and are not dismissed.
 * Filters by sla_alert_dismissed = false so acknowledged alerts never return.
 */
export async function fetchUnreadSlaAlerts(userId: string): Promise<BreachedLead[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, assigned_at, created_at, is_off_duty")
    .eq("status", "new")
    .eq("assigned_to", userId)
    .eq("sla_alert_dismissed", false)
    .not("assigned_at", "is", null);

  if (error) {
    console.error("[useSlaAlerts] Fetch failed:", error.message);
    return [];
  }

  const rows: LeadRow[] = Array.isArray(data) ? (data as unknown as LeadRow[]) : [];
  const breached: BreachedLead[] = [];

  for (const row of rows) {
    const isOffDuty = row.is_off_duty ?? false;
    const level = computeBreachLevel(
      row.assigned_at,
      row.created_at ?? row.assigned_at,
      isOffDuty
    );
    if (level) {
      breached.push({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        assigned_at: row.assigned_at,
        created_at: row.created_at ?? row.assigned_at,
        is_off_duty: isOffDuty,
        breachLevel: level,
      });
    }
  }

  // Sort: level 3 first, then 2, then 1; within same level, oldest first
  breached.sort((a, b) => {
    if (a.breachLevel !== b.breachLevel) return b.breachLevel - a.breachLevel;
    return new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime();
  });

  return breached;
}

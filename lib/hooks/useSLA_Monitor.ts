"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types/database";

// ── SLA thresholds (hours) ───────────────────────────────────────────────────
const LEVEL_1_HOURS = 3;
const LEVEL_2_HOURS = 5;

export type SLABreachLevel = 1 | 2;

export interface BreachedLead {
  id: string;
  first_name: string;
  last_name: string | null;
  assigned_at: string;
  breachLevel: SLABreachLevel;
  assigned_agent?: { id: string; full_name: string } | null;
}

interface UseSLA_MonitorReturn {
  breachedLeads: BreachedLead[];
  breachLevel: SLABreachLevel | null;
  loading: boolean;
  refetch: () => void;
}

function computeBreachLevel(assignedAt: string): SLABreachLevel | null {
  const diffMs = Date.now() - new Date(assignedAt).getTime();
  const diffHours = diffMs / (60 * 60 * 1000);
  if (diffHours >= LEVEL_2_HOURS) return 2;
  if (diffHours >= LEVEL_1_HOURS) return 1;
  return null;
}

function getLeadDisplayName(first: string, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Unknown Lead";
}

/**
 * Global React hook that checks SLA status of leads on a 60-second interval.
 * - Agents: sees only their own breached leads (assigned_to = userId)
 * - Scouts/Admins: sees all breached leads across all agents
 *
 * Rules:
 * - Level 1 Breach: assigned_at older than 3 hours, less than 5 hours
 * - Level 2 Breach: assigned_at older than 5 hours
 * - Only leads with status === 'new' are considered
 */
export function useSLA_Monitor(
  userId: string | null,
  role: UserRole
): UseSLA_MonitorReturn {
  const [breachedLeads, setBreachedLeads] = useState<BreachedLead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBreachedLeads = useCallback(async () => {
    const supabase = createClient();
    if (!userId && role !== "scout" && role !== "admin") {
      setBreachedLeads([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const isScoutOrAdmin = role === "scout" || role === "admin";

    // Use assigned_at for SLA; fall back to created_at if column doesn't exist (migration 015)
    const selectCols = isScoutOrAdmin
      ? "id, first_name, last_name, assigned_at, assigned_to, assigned_agent:profiles!assigned_to(id, full_name)"
      : "id, first_name, last_name, assigned_at";

    let query = supabase
      .from("leads")
      .select(selectCols)
      .eq("status", "new")
      .not("assigned_at", "is", null);

    if (!isScoutOrAdmin) {
      query = query.eq("assigned_to", userId);
    }

    let { data, error } = await query;

    // Fallback: if assigned_at doesn't exist yet, use created_at (run: supabase db push)
    if (error?.message?.includes("assigned_at does not exist")) {
      if (typeof window !== "undefined") {
        console.warn(
          "[useSLA_Monitor] assigned_at missing — using created_at. Run: supabase db push"
        );
      }
      const fallbackCols = isScoutOrAdmin
        ? "id, first_name, last_name, created_at, assigned_to, assigned_agent:profiles!assigned_to(id, full_name)"
        : "id, first_name, last_name, created_at";
      query = supabase
        .from("leads")
        .select(fallbackCols)
        .eq("status", "new")
        .not("assigned_to", "is", null);
      if (!isScoutOrAdmin) query = query.eq("assigned_to", userId);
      const fallback = await query;
      data = fallback.data;
      error = fallback.error;
      // Rename created_at → assigned_at in response for uniform handling below
      if (data && Array.isArray(data)) {
        data = data.map((r: Record<string, unknown>) => ({
          ...r,
          assigned_at: r.assigned_at ?? r.created_at,
        }));
      }
    }

    if (error) {
      console.error("[useSLA_Monitor] Fetch failed:", error.message);
      setBreachedLeads([]);
      setLoading(false);
      return;
    }

    type LeadRow = {
      id: string;
      first_name: string;
      last_name: string | null;
      assigned_at: string;
      assigned_agent?: { id: string; full_name: string } | null;
    };
    const rows: LeadRow[] = Array.isArray(data) ? (data as unknown as LeadRow[]) : [];

    const breached: BreachedLead[] = [];
    for (const row of rows) {
      const level = computeBreachLevel(row.assigned_at);
      if (level) {
        breached.push({
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          assigned_at: row.assigned_at,
          breachLevel: level,
          assigned_agent: row.assigned_agent ?? null,
        });
      }
    }

    // Sort by breach level (2 first) then by assigned_at (oldest first)
    breached.sort((a, b) => {
      if (a.breachLevel !== b.breachLevel) return b.breachLevel - a.breachLevel;
      return new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime();
    });

    setBreachedLeads(breached);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- createClient is stable
  }, [userId, role]);

  // Initial fetch + 60-second interval
  useEffect(() => {
    fetchBreachedLeads();
    const interval = setInterval(fetchBreachedLeads, 60_000);
    return () => clearInterval(interval);
  }, [fetchBreachedLeads]);

  const breachLevel: SLABreachLevel | null =
    breachedLeads.length > 0
      ? breachedLeads.some((l) => l.breachLevel === 2)
        ? 2
        : 1
      : null;

  return {
    breachedLeads,
    breachLevel,
    loading,
    refetch: fetchBreachedLeads,
  };
}

export { getLeadDisplayName, LEVEL_1_HOURS, LEVEL_2_HOURS };

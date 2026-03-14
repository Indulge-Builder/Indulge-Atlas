"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import type { UserRole } from "@/lib/types/database";

const IST = "Asia/Kolkata";

// ── On-Duty SLA (Rule A): 5m, 10m, 15m ─────────────────────────────────────
const ON_DUTY_LEVEL_1_MINS = 5;
const ON_DUTY_LEVEL_2_MINS = 10;
const ON_DUTY_LEVEL_3_MINS = 15;

// ── Off-Duty SLA (Rule B): 60m, 90m, 120m from 9 AM IST ─────────────────────
const OFF_DUTY_LEVEL_1_MINS = 60;  // 10:00 AM
const OFF_DUTY_LEVEL_2_MINS = 90;  // 10:30 AM
const OFF_DUTY_LEVEL_3_MINS = 120; // 11:00 AM

export type SLABreachLevel = 1 | 2 | 3;

export interface BreachedLead {
  id: string;
  first_name: string;
  last_name: string | null;
  assigned_at: string;
  created_at: string;
  is_off_duty: boolean;
  breachLevel: SLABreachLevel;
  assigned_agent?: { id: string; full_name: string } | null;
}

interface UseSLA_MonitorReturn {
  breachedLeads: BreachedLead[];
  breachLevel: SLABreachLevel | null;
  loading: boolean;
  refetch: () => void;
}

/** 9:00 AM IST anchor for off-duty leads. Lead created 18:00–08:59 → next 9 AM. */
function getOffDutyAnchor(createdAt: string): Date {
  const created = new Date(createdAt);
  const h = parseInt(formatInTimeZone(created, IST, "H"), 10);
  const y = parseInt(formatInTimeZone(created, IST, "yyyy"), 10);
  const m = parseInt(formatInTimeZone(created, IST, "M"), 10);
  const d = parseInt(formatInTimeZone(created, IST, "d"), 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  const midnightIST = fromZonedTime(`${y}-${pad(m)}-${pad(d)}T00:00:00`, IST);
  const anchorDate = addDays(midnightIST, h >= 18 ? 1 : 0);
  const y2 = parseInt(formatInTimeZone(anchorDate, IST, "yyyy"), 10);
  const m2 = parseInt(formatInTimeZone(anchorDate, IST, "M"), 10);
  const d2 = parseInt(formatInTimeZone(anchorDate, IST, "d"), 10);
  return fromZonedTime(`${y2}-${pad(m2)}-${pad(d2)}T09:00:00`, IST);
}

function computeBreachLevel(
  assignedAt: string,
  createdAt: string,
  isOffDuty: boolean
): SLABreachLevel | null {
  const now = Date.now();

  if (isOffDuty) {
    const anchor = getOffDutyAnchor(createdAt);
    const diffMs = now - anchor.getTime();
    const diffMins = diffMs / 60_000;
    if (diffMins < 0) return null; // Before 9 AM, no breach yet
    if (diffMins >= OFF_DUTY_LEVEL_3_MINS) return 3;
    if (diffMins >= OFF_DUTY_LEVEL_2_MINS) return 2;
    if (diffMins >= OFF_DUTY_LEVEL_1_MINS) return 1;
    return null;
  }

  // On-duty: clock starts at created_at (or assigned_at if we use that)
  const clockStart = new Date(assignedAt).getTime();
  const diffMs = now - clockStart;
  const diffMins = diffMs / 60_000;
  if (diffMins >= ON_DUTY_LEVEL_3_MINS) return 3;
  if (diffMins >= ON_DUTY_LEVEL_2_MINS) return 2;
  if (diffMins >= ON_DUTY_LEVEL_1_MINS) return 1;
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
 * - On-Duty (is_off_duty=false): 5m / 10m / 15m escalation
 * - Off-Duty (is_off_duty=true): 60m / 90m / 120m from 9 AM IST
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

    const selectCols = isScoutOrAdmin
      ? "id, first_name, last_name, assigned_at, created_at, is_off_duty, assigned_to, assigned_agent:profiles!assigned_to(id, full_name)"
      : "id, first_name, last_name, assigned_at, created_at, is_off_duty";

    let query = supabase
      .from("leads")
      .select(selectCols)
      .eq("status", "new")
      .not("assigned_at", "is", null);

    if (!isScoutOrAdmin) {
      query = query.eq("assigned_to", userId);
    }

    const { data, error } = await query;

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
      created_at: string;
      is_off_duty?: boolean;
      assigned_agent?: { id: string; full_name: string } | null;
    };
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
          assigned_agent: row.assigned_agent ?? null,
        });
      }
    }

    // Sort: level 3 first, then 2, then 1; within same level, oldest first
    breached.sort((a, b) => {
      if (a.breachLevel !== b.breachLevel) return b.breachLevel - a.breachLevel;
      return new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime();
    });

    setBreachedLeads(breached);
    setLoading(false);
  }, [userId, role]);

  useEffect(() => {
    fetchBreachedLeads();
    const interval = setInterval(fetchBreachedLeads, 60_000);
    return () => clearInterval(interval);
  }, [fetchBreachedLeads]);

  const breachLevel: SLABreachLevel | null =
    breachedLeads.length > 0
      ? breachedLeads.some((l) => l.breachLevel === 3)
        ? 3
        : breachedLeads.some((l) => l.breachLevel === 2)
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

export function getMinsWaiting(assignedAt: string, createdAt: string, isOffDuty: boolean): number {
  const now = Date.now();
  if (isOffDuty) {
    const anchor = getOffDutyAnchor(createdAt);
    const elapsed = now - anchor.getTime();
    return Math.max(0, Math.floor(elapsed / 60_000));
  }
  return Math.floor((now - new Date(assignedAt).getTime()) / 60_000);
}

export {
  getLeadDisplayName,
  ON_DUTY_LEVEL_1_MINS,
  ON_DUTY_LEVEL_2_MINS,
  ON_DUTY_LEVEL_3_MINS,
  OFF_DUTY_LEVEL_1_MINS,
  OFF_DUTY_LEVEL_2_MINS,
  OFF_DUTY_LEVEL_3_MINS,
};

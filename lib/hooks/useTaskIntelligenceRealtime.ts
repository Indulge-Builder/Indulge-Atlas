"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Tasks UPDATE listener scoped to the caller's visible departments.
 * Bumps a counter so the Task Intelligence dashboard can re-fetch overview
 * aggregates. Subscribes one channel per department so each uses the
 * Supabase eq filter — avoids receiving every org-wide task mutation.
 *
 * @param visibleDepartmentIds - Dept IDs the current user can see.
 *   Pass an empty array to disable all subscriptions.
 */
export function useTaskIntelligenceRealtime(visibleDepartmentIds: string[]): number {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  // Stable key so the effect only re-runs when the dept set actually changes.
  const deptKey = visibleDepartmentIds.slice().sort().join(",");

  useEffect(() => {
    if (!deptKey) return;

    const depts = deptKey.split(",");
    const channels = depts.map((dept) =>
      supabase
        .channel(`task-intelligence:dept:${dept}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
            filter: `department=eq.${dept}`,
          },
          () => {
            setRefreshSignal((n) => n + 1);
          },
        )
        .subscribe(),
    );

    return () => {
      for (const ch of channels) supabase.removeChannel(ch);
    };
  }, [deptKey, supabase]);

  return refreshSignal;
}

/** Subscribes to task rows for an employee dossier refresh (creator-scoped tasks). */
export function useEmployeeDossierRealtime(agentId: string, onUpdate: () => void) {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!agentId) return;

    const channel = supabase
      .channel(`employee-dossier-${agentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `created_by=eq.${agentId}`,
        },
        onUpdate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId, onUpdate, supabase]);
}

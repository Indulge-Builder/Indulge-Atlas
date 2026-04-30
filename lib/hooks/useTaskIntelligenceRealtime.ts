"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Org-wide tasks UPDATE listener — bumps a counter so the Task Intelligence
 * dashboard can re-fetch overview aggregates (macro freshness).
 */
export function useTaskIntelligenceRealtime(): number {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase
      .channel("task-intelligence:overview")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        () => {
          setRefreshSignal((n) => n + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

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

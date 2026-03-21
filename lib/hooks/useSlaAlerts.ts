"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BreachedLead } from "@/lib/hooks/useSLA_Monitor";
import { fetchUnreadSlaAlerts } from "@/lib/hooks/useSlaAlerts.utils";

export interface SlaAlert extends BreachedLead {}

interface UseSlaAlertsReturn {
  unreadAlerts: SlaAlert[];
  loading: boolean;
  isOffline: boolean;
  refetch: () => Promise<void>;
}

/**
 * Intelligent SLA notification hook for agents.
 *
 * Step 1 (Catch-up on login): On mount, fetches all unread SLA alerts
 * (assigned_to = userId, sla_alert_dismissed = false) and exposes them for
 * UI toasts. Runs once when userId becomes available.
 *
 * Step 2 (Real-time watcher): Subscribes to leads table INSERT/UPDATE where
 * assigned_to = userId. When a payload arrives (e.g. new assignment, breach
 * state change), refetches so new alerts appear instantly.
 *
 * Dismissal is permanent via dismissSlaAlert(leadId) — alerts never fetch again.
 */
export function useSlaAlerts(userId: string | null): UseSlaAlertsReturn {
  const [unreadAlerts, setUnreadAlerts] = useState<SlaAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const lastFetchedUserId = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    if (!userId) {
      setUnreadAlerts([]);
      setLoading(false);
      setIsOffline(false);
      return;
    }
    setLoading(true);
    try {
      const alerts = await fetchUnreadSlaAlerts(userId);
      setUnreadAlerts(alerts);
      setIsOffline(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const networkDrop =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        errorMessage.includes("Failed to fetch");

      if (networkDrop) {
        setIsOffline(true);
        return;
      }

      console.error("[useSlaAlerts] Unexpected fetch error:", errorMessage);
      setUnreadAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Step 1: Catch-up on login — fetch once when userId is available
  useEffect(() => {
    if (!userId) {
      setUnreadAlerts([]);
      setLoading(false);
      lastFetchedUserId.current = null;
      return;
    }
    if (lastFetchedUserId.current === userId) return;
    lastFetchedUserId.current = userId;
    refetch();
  }, [userId, refetch]);

  // Step 2a: Real-time watcher — refetch when leads change for this user
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`sla-alerts:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `assigned_to=eq.${userId}`,
        },
        () => refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]); // refetch is stable (useCallback [userId]), avoid re-subscribe loops

  // Step 2b: Poll every 60s — "timer exactly ends" has no DB trigger, so we poll
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(refetch, 60_000);
    return () => clearInterval(interval);
  }, [userId, refetch]);

  return { unreadAlerts, loading, isOffline, refetch };
}

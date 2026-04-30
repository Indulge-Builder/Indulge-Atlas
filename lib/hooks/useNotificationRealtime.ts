"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to new task_notifications for the current user.
 * Calls onNew() when an INSERT arrives.
 * Auto-cleans up on unmount.
 */
export function useNotificationRealtime(userId: string | null, onNew: () => void) {
  const supabase = useMemo(() => createClient(), []);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`task-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => onNewRef.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, supabase]);
}

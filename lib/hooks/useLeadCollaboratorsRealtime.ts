"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/** Subscribes to collaborator rows for a lead (dossier team list + invitee refresh). */
export function useLeadCollaboratorsRealtime(
  leadId: string | null,
  onChange: () => void,
) {
  const supabase = useMemo(() => createClient(), []);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!leadId) return;

    const channel = supabase
      .channel(`lead-collaborators-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_collaborators",
          filter: `lead_id=eq.${leadId}`,
        },
        () => onChangeRef.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [leadId, supabase]);
}

/** When the current user is granted collaboration, refresh lists (e.g. /leads). */
export function useMyLeadCollaborationGrantsRealtime(
  userId: string | null,
  onGranted: () => void,
) {
  const supabase = useMemo(() => createClient(), []);
  const onGrantedRef = useRef(onGranted);
  onGrantedRef.current = onGranted;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`my-lead-collabs-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lead_collaborators",
          filter: `user_id=eq.${userId}`,
        },
        () => onGrantedRef.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, supabase]);
}

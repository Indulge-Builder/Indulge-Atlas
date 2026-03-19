"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { playNotificationSound } from "@/lib/utils/audio";
import type { IndulgeDomain, UserRole } from "@/lib/types/database";

type LeadInsertPayload = {
  domain?: string | null;
  assigned_to?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

function leadDisplayName(row: LeadInsertPayload): string {
  const parts = [row.first_name, row.last_name].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  const name = parts.join(" ").trim();
  return name || "New lead";
}

function shouldAlertForLeadInsert(
  lead: LeadInsertPayload,
  ctx: { userId: string; domain: IndulgeDomain; role: UserRole },
): boolean {
  const leadDomain = lead.domain;
  const assigned = lead.assigned_to;
  const sameDomain =
    typeof leadDomain === "string" && leadDomain === ctx.domain;
  const assignedToMe = typeof assigned === "string" && assigned === ctx.userId;

  if (ctx.role === "agent") {
    return sameDomain && assignedToMe;
  }

  if (
    ctx.role === "scout" ||
    ctx.role === "admin" ||
    ctx.role === "finance"
  ) {
    return sameDomain || assignedToMe;
  }

  return false;
}

interface LeadAlertProviderProps {
  children: React.ReactNode;
}

export function LeadAlertProvider({ children }: LeadAlertProviderProps) {
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(
    null,
  );

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("domain, role")
        .eq("id", user.id)
        .single();

      if (cancelled || profileError || !profile) {
        if (profileError) {
          console.warn("[LeadAlert] Could not load profile for lead alerts:", profileError);
        }
        return;
      }

      const ctx = {
        userId: user.id,
        domain: profile.domain as IndulgeDomain,
        role: profile.role as UserRole,
      };

      const channel = supabase
        .channel(`lead-alerts:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "leads",
          },
          (payload: {
            new: Record<string, unknown> | null;
          }) => {
            const row = payload.new as LeadInsertPayload | null;
            if (!row || !shouldAlertForLeadInsert(row, ctx)) return;

            playNotificationSound();
            const name = leadDisplayName(row);
            toast.success(`New lead arrived: ${name}`);
          },
        )
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            console.log("[LeadAlert] Subscribed to leads INSERT");
          }
        });

      if (cancelled) {
        supabase.removeChannel(channel);
        return;
      }
      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return <>{children}</>;
}

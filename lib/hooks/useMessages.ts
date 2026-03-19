"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message, MessageLeadPreview, LeadStatus, Profile } from "@/lib/types/database";

// ── Types ─────────────────────────────────────────────────────────────────────

type SenderInfo  = Pick<Profile, "id" | "full_name" | "role">;
type SenderMap   = Record<string, SenderInfo>;
type LeadMap     = Record<string, MessageLeadPreview>;
type RawMessage  = Omit<Message, "sender" | "lead">;

/** Row shape from `leads` select before mapping to MessageLeadPreview */
type LeadRowForMessages = {
  id: string;
  first_name: string;
  last_name: string | null;
  status: string;
  city: string | null;
};

interface UseMessagesReturn {
  messages:       Message[];
  loading:        boolean;
  bottomRef:      React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMessages(conversationId: string | null): UseMessagesReturn {
  const [rawMessages, setRawMessages] = useState<RawMessage[]>([]);
  const [senderMap,   setSenderMap]   = useState<SenderMap>({});
  const [leadMap,     setLeadMap]     = useState<LeadMap>({});
  const [loading,     setLoading]     = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  const scrollToBottom = useCallback(() => {
    const el = bottomRef.current;
    if (!el) return;
    // Scroll the overflow container, never the page
    const container = el.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // ── Build sender directory ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function buildDirectory() {
      const [{ data: directory }, { data: own }] = await Promise.all([
        supabase.rpc("get_messaging_directory"),
        supabase.rpc("get_my_messaging_profile"),
      ]);

      if (cancelled) return;

      const map: SenderMap = {};
      (directory ?? []).forEach((p: SenderInfo) => { map[p.id] = p; });
      (own       ?? []).forEach((p: SenderInfo) => { map[p.id] = p; });
      setSenderMap(map);
    }

    buildDirectory();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch historical messages ─────────────────────────────────────────────
  const fetchedLeadIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!conversationId) {
      setRawMessages([]);
      setLeadMap({});
      fetchedLeadIdsRef.current.clear();
      return;
    }

    fetchedLeadIdsRef.current.clear();
    let cancelled = false;
    setLoading(true);

    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, lead_id, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .then(({ data }: { data: RawMessage[] | null }) => {
        if (!cancelled) {
          setRawMessages(data ?? []);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [conversationId]);

  // ── Fetch lead previews for any lead_id referenced in messages ────────────
  // CRITICAL: Use ref to avoid re-fetch loop — leadMap must NOT be in deps
  useEffect(() => {
    const missingIds = rawMessages
      .filter((m) => m.lead_id && !fetchedLeadIdsRef.current.has(m.lead_id))
      .map((m) => m.lead_id as string)
      .filter((id, idx, arr) => arr.indexOf(id) === idx);

    if (missingIds.length === 0) return;

    supabase
      .from("leads")
      .select("id, first_name, last_name, status, city")
      .in("id", missingIds)
      .then(({ data }: { data: LeadRowForMessages[] | null }) => {
        if (!data?.length) return;
        const entries: LeadMap = {};
        data.forEach((l) => {
          fetchedLeadIdsRef.current.add(l.id);
          entries[l.id] = {
            id:        l.id,
            full_name: [l.first_name, l.last_name].filter(Boolean).join(" "),
            status:    l.status as LeadStatus,
            city:      l.city,
          };
        });
        setLeadMap((prev) => ({ ...prev, ...entries }));
      });
  }, [rawMessages]);

  // ── Real-time subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const raw = payload.new as RawMessage;
          setRawMessages((prev) => {
            if (prev.some((m) => m.id === raw.id)) return prev;
            return [...prev, raw];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // ── Enrich: merge senderMap + leadMap into final messages ─────────────────
  const messages: Message[] = rawMessages.map((m) => ({
    ...m,
    sender: senderMap[m.sender_id],
    lead:   m.lead_id ? (leadMap[m.lead_id] ?? null) : null,
  }));

  // ── Auto-scroll on new message ────────────────────────────────────────────
  useEffect(() => {
    if (rawMessages.length > 0) scrollToBottom();
  }, [rawMessages, scrollToBottom]);

  return { messages, loading, bottomRef, scrollToBottom };
}

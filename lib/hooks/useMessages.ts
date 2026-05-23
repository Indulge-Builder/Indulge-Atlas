"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { getConversationMessages } from "@/lib/actions/messages";
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
  loadError:      string | null;
  bottomRef:      React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
  appendMessage:  (message: Message) => void;
  refetch:        () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMessages(conversationId: string | null): UseMessagesReturn {
  const [rawMessages, setRawMessages] = useState<RawMessage[]>([]);
  const [senderMap,   setSenderMap]   = useState<SenderMap>({});
  const [leadMap,     setLeadMap]     = useState<LeadMap>({});
  const [loading,     setLoading]     = useState(false);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fetchedLeadIdsRef = useRef<Set<string>>(new Set());
  const supabase = useMemo(() => createClient(), []);

  const scrollToBottom = useCallback(() => {
    const el = bottomRef.current;
    if (!el) return;
    const container = el.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  const applyServerMessages = useCallback((items: Message[]) => {
    const senders: SenderMap = {};
    const leads: LeadMap = {};
    const raw: RawMessage[] = items.map((m) => {
      if (m.sender) senders[m.sender_id] = m.sender;
      if (m.lead && m.lead_id) leads[m.lead_id] = m.lead;
      const { sender: _s, lead: _l, ...rest } = m;
      return rest;
    });
    setSenderMap((prev) => ({ ...prev, ...senders }));
    setLeadMap((prev) => ({ ...prev, ...leads }));
    setRawMessages(raw);
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setLoadError(null);

    const { success, messages, error } = await getConversationMessages(conversationId);

    if (!success) {
      setLoadError(error ?? "Failed to load messages");
      setRawMessages([]);
      setLoading(false);
      return;
    }

    applyServerMessages(messages);
    setLoading(false);
  }, [conversationId, applyServerMessages]);

  const appendMessage = useCallback((message: Message) => {
    const { sender, lead, ...raw } = message;
    setRawMessages((prev) => {
      if (prev.some((m) => m.id === raw.id)) return prev;
      return [...prev, raw];
    });
    if (sender) {
      setSenderMap((prev) => ({ ...prev, [sender.id]: sender }));
    }
    if (lead && raw.lead_id) {
      setLeadMap((prev) => ({ ...prev, [raw.lead_id!]: lead }));
    }
  }, []);

  // ── Sender directory (realtime enrichment for inbound messages) ───────────
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
      setSenderMap((prev) => ({ ...prev, ...map }));
    }

    buildDirectory();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load history via server action (cookie auth, not browser JWT) ─────────
  useEffect(() => {
    if (!conversationId) {
      setRawMessages([]);
      setLeadMap({});
      setLoadError(null);
      fetchedLeadIdsRef.current.clear();
      return;
    }

    fetchedLeadIdsRef.current.clear();
    void fetchMessages();
  }, [conversationId, fetchMessages]);

  // ── Fetch lead previews for any lead_id referenced in messages ────────────
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
  }, [rawMessages, supabase]);

  // ── Real-time subscription (inbound + cross-tab) ──────────────────────────
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
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const messages: Message[] = rawMessages.map((m) => ({
    ...m,
    sender: senderMap[m.sender_id],
    lead:   m.lead_id ? (leadMap[m.lead_id] ?? null) : null,
  }));

  useEffect(() => {
    if (rawMessages.length > 0) scrollToBottom();
  }, [rawMessages, scrollToBottom]);

  return {
    messages,
    loading,
    loadError,
    bottomRef,
    scrollToBottom,
    appendMessage,
    refetch: fetchMessages,
  };
}

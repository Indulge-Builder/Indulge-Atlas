"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { ConversationList } from "./ConversationList";
import { ChatView } from "./ChatView";
import { getWaMessages } from "@/lib/actions/wa-business";
import { createClient } from "@/lib/supabase/client";
import type { BotMessage, BotSession } from "@/lib/types/database";

interface WaBusinessClientProps {
  sessions: BotSession[];
}

export function WaBusinessClient({ sessions: initialSessions }: WaBusinessClientProps) {
  const [sessions, setSessions] = useState<BotSession[]>(initialSessions);
  const [selectedSession, setSelectedSession] = useState<BotSession | null>(null);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [, startTransition] = useTransition();

  const handleSelectSession = useCallback((session: BotSession) => {
    setSelectedSession(session);
    startTransition(async () => {
      const msgs = await getWaMessages(session.id);
      setMessages(msgs);
    });
  }, []);

  const handleSessionStateChange = useCallback((sessionId: string, newState: BotSession["state"]) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, state: newState } : s)),
    );
    setSelectedSession((prev) =>
      prev?.id === sessionId ? { ...prev, state: newState } : prev,
    );
  }, []);

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("wa-business-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bot_messages" },
        (payload: { new: Record<string, unknown> }) => {
          const newMsg = payload.new as unknown as BotMessage;
          setSelectedSession((currentSession) => {
            if (currentSession && newMsg.session_id === currentSession.id) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
            }
            // Update last_message_at on the session in the list
            setSessions((prev) =>
              prev
                .map((s) =>
                  s.id === newMsg.session_id
                    ? { ...s, last_message_at: newMsg.created_at }
                    : s,
                )
                .sort(
                  (a, b) =>
                    new Date(b.last_message_at).getTime() -
                    new Date(a.last_message_at).getTime(),
                ),
            );
            return currentSession;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bot_sessions" },
        (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as unknown as BotSession;
          setSessions((prev) =>
            prev
              .map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
              .sort(
                (a, b) =>
                  new Date(b.last_message_at).getTime() -
                  new Date(a.last_message_at).getTime(),
              ),
          );
          setSelectedSession((prev) =>
            prev?.id === updated.id ? { ...prev, ...updated } : prev,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="h-full min-h-0 px-8 py-6">
      <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-surface-border bg-white shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]">
        <div className="flex h-full min-h-0">
          {/* Left: conversation list */}
          <aside className="w-80 shrink-0 border-r border-surface-border bg-surface-subtle/50 hidden sm:flex flex-col">
            <ConversationList
              sessions={sessions}
              selectedId={selectedSession?.id ?? null}
              onSelect={handleSelectSession}
            />
          </aside>

          {/* Mobile: conversation list on top when nothing selected */}
          {!selectedSession && (
            <div className="flex-1 flex flex-col sm:hidden">
              <ConversationList
                sessions={sessions}
                selectedId={null}
                onSelect={handleSelectSession}
              />
            </div>
          )}

          {/* Right: chat view */}
          <ChatView
            session={selectedSession}
            messages={messages}
            onSessionStateChange={handleSessionStateChange}
          />
        </div>
      </div>
    </div>
  );
}

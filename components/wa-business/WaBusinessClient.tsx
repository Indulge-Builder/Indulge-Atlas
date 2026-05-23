"use client";

import { useState, useTransition } from "react";
import { ConversationList } from "./ConversationList";
import { ChatView } from "./ChatView";
import { getWaMessages } from "@/lib/actions/wa-business";
import type { BotMessage, BotSession } from "@/lib/types/database";

interface WaBusinessClientProps {
  sessions: BotSession[];
}

export function WaBusinessClient({ sessions }: WaBusinessClientProps) {
  const [selectedSession, setSelectedSession] = useState<BotSession | null>(null);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [, startTransition] = useTransition();

  function handleSelectSession(session: BotSession) {
    setSelectedSession(session);
    startTransition(async () => {
      const msgs = await getWaMessages(session.id);
      setMessages(msgs);
    });
  }

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
          <ChatView session={selectedSession} messages={messages} />
        </div>
      </div>
    </div>
  );
}

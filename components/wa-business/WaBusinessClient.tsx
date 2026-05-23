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
    <div className="flex h-full">
      {/* Left: conversation list */}
      <div className="w-80 flex-shrink-0 border-r border-white/[0.07] hidden sm:flex flex-col">
        <ConversationList
          sessions={sessions}
          selectedId={selectedSession?.id ?? null}
          onSelect={handleSelectSession}
        />
      </div>

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
  );
}

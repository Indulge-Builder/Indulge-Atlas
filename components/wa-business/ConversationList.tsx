"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { BotSession, BotSessionState } from "@/lib/types/database";

interface ConversationListProps {
  sessions: BotSession[];
  selectedId: string | null;
  onSelect: (session: BotSession) => void;
}

const STATE_BADGE: Record<BotSessionState, { label: string; className: string }> = {
  greeting:         { label: "Greeting",   className: "bg-brand-gold/10 text-brand-gold" },
  browsing:         { label: "Browsing",   className: "bg-info/10 text-info" },
  viewing_products: { label: "Viewing",    className: "bg-warning/10 text-warning" },
  handoff_pending:  { label: "Pending",    className: "bg-warning/15 text-warning" },
  handed_off:       { label: "Handed off", className: "bg-success/10 text-success" },
};

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

function getLastMessagePreview(session: BotSession): string {
  const ctx = session.context_jsonb as Record<string, unknown>;
  const turns = ctx?.last_turns as Array<{ in: string; out: string }> | undefined;
  if (!turns || turns.length === 0) return "No messages yet";
  const last = turns[turns.length - 1];
  const preview = last?.in ?? last?.out ?? "";
  return preview.length > 40 ? `${preview.slice(0, 40)}…` : preview;
}

export function ConversationList({ sessions, selectedId, onSelect }: ConversationListProps) {
  const [query, setQuery] = useState("");

  const filtered = sessions.filter((s) =>
    s.phone.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-surface-border px-4 py-4 shrink-0">
        <p className="text-sm font-semibold text-foreground font-serif mb-3">Conversations</p>
        <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-white px-3 py-2 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
          <input
            type="text"
            placeholder="Search by phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-[13px] bg-transparent text-foreground placeholder-taupe outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-center text-taupe text-[13px] mt-8">No conversations found</p>
        )}
        {filtered.map((session) => {
          const badge = STATE_BADGE[session.state] ?? STATE_BADGE.greeting;
          const isActive = session.id === selectedId;
          return (
            <button
              key={session.id}
              onClick={() => onSelect(session)}
              className={cn(
                "w-full text-left px-3 py-3 rounded-xl transition-colors duration-150",
                isActive
                  ? "bg-brand-gold/8 border border-brand-gold/20"
                  : "hover:bg-surface-subtle border border-transparent",
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-foreground text-[13px] font-medium truncate">
                  {formatPhone(session.phone)}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-taupe-light text-[10px]">
                    {formatDistanceToNow(new Date(session.last_message_at), { addSuffix: false })}
                  </span>
                  <span className="text-taupe text-[10px] bg-surface-subtle rounded-full px-1.5 py-0.5">
                    {session.bot_turn_count}t
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-taupe text-[12px] truncate flex-1">
                  {getLastMessagePreview(session)}
                </span>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium", badge.className)}>
                  {badge.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

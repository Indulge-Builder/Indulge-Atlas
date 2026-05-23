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
  greeting:         { label: "Greeting",   className: "bg-white/10 text-white/50" },
  browsing:         { label: "Browsing",   className: "bg-blue-500/20 text-blue-300" },
  viewing_products: { label: "Viewing",    className: "bg-amber-500/20 text-amber-300" },
  handoff_pending:  { label: "Pending",    className: "bg-orange-500/20 text-orange-300" },
  handed_off:       { label: "Handed off", className: "bg-green-500/20 text-green-300" },
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
    <div className="flex flex-col h-full" style={{ background: "var(--color-background-secondary, #1A1814)" }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-white font-semibold text-[15px] tracking-tight">WA Business</span>
          <span className="w-2 h-2 rounded-full bg-[#25D366] shadow-[0_0_6px_#25D366]" />
        </div>
        <input
          type="text"
          placeholder="Search by phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-[13px] bg-white/[0.06] border border-white/[0.08] text-white placeholder-white/30 outline-none focus:border-white/20 transition-colors"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
        {filtered.length === 0 && (
          <p className="text-center text-white/30 text-[13px] mt-8">No conversations found</p>
        )}
        {filtered.map((session) => {
          const badge = STATE_BADGE[session.state] ?? STATE_BADGE.greeting;
          const isActive = session.id === selectedId;
          return (
            <button
              key={session.id}
              onClick={() => onSelect(session)}
              className={cn(
                "w-full text-left px-3 py-3 rounded-2xl transition-colors duration-150",
                isActive
                  ? "bg-white/[0.10] border border-white/[0.12]"
                  : "hover:bg-white/[0.05]",
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="text-white/90 text-[13px] font-medium truncate">
                  {formatPhone(session.phone)}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-white/30 text-[10px]">
                    {formatDistanceToNow(new Date(session.last_message_at), { addSuffix: false })}
                  </span>
                  <span className="text-white/40 text-[10px] bg-white/[0.08] rounded-full px-1.5 py-0.5">
                    {session.bot_turn_count}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/40 text-[12px] truncate flex-1">
                  {getLastMessagePreview(session)}
                </span>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium", badge.className)}>
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

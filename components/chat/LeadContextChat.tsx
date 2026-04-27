"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Send, Loader2, Users } from "lucide-react";
import { useMessages } from "@/lib/hooks/useMessages";
import {
  sendMessage,
  markConversationRead,
} from "@/lib/actions/messages";

// ── Utilities ────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ROLE_COLOR: Record<string, string> = {
  manager: "#D4AF37",
  admin: "#9B59B6",
  agent: "#4A7C59",
  finance: "#2C6FAC",
};

function MiniAvatar({ name, role }: { name: string; role: string }) {
  const color = ROLE_COLOR[role] ?? "#8A8A6E";
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
      style={{ backgroundColor: `${color}25`, color }}
    >
      {getInitials(name)}
    </div>
  );
}

// ── LeadContextChat ───────────────────────────────────────────────────────────

interface LeadContextChatProps {
  conversationId: string;
  currentUserId: string;
}

export function LeadContextChat({
  conversationId,
  currentUserId,
}: LeadContextChatProps) {
  const { messages, loading, bottomRef } = useMessages(conversationId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, [draft]);

  // Mark this thread as read on mount
  useEffect(() => {
    markConversationRead(conversationId);
  }, [conversationId]);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setDraft("");
    await sendMessage(conversationId, trimmed);
    setSending(false);
    textareaRef.current?.focus();
  }, [draft, sending, conversationId]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl overflow-hidden"
      style={{ background: "#121212" }}
    >
      {/* Gold accent strip */}
      <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-[#D4AF37]/40 to-transparent" />

      {/* Header */}
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="w-3.5 h-3.5 text-[#D4AF37]/60" strokeWidth={1.75} />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#D4AF37]/70">
            Internal Discussion
          </p>
          <span className="text-[9px] text-white/20 uppercase tracking-wider border border-white/10 rounded px-1.5 py-0.5">
            Private
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-white/20">
          <Users className="w-3 h-3" />
          <span className="text-[11px]">Team visible</span>
        </div>
      </div>

      {/* Message area */}
      <div className="px-4 py-4 min-h-[200px] max-h-[360px] overflow-y-auto scrollbar-none space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-2">
            <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
            <span className="text-[12px] text-white/25">Loading thread…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <MessageSquare className="w-7 h-7 text-white/10" />
            <p className="text-[12px] text-white/25 text-center leading-relaxed">
              No messages yet.
              <br />
              Start the internal discussion.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isMine = msg.sender_id === currentUserId;
              const senderName = msg.sender?.full_name ?? "Unknown";
              const senderRole = msg.sender?.role ?? "agent";

              return (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 items-end ${isMine ? "flex-row-reverse" : "flex-row"}`}
                >
                  {!isMine && <MiniAvatar name={senderName} role={senderRole} />}

                  <div className={`flex flex-col gap-0.5 max-w-[78%] ${isMine ? "items-end" : "items-start"}`}>
                    {!isMine && (
                      <p className="text-[10px] text-white/30 px-1">
                        {senderName}
                      </p>
                    )}
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                        isMine
                          ? "rounded-br-sm bg-[#D4AF37]/15 text-[#D4AF37]"
                          : "rounded-bl-sm bg-white/[0.06] text-white/85"
                      }`}
                    >
                      {msg.content}
                    </div>
                    <p className="text-[10px] text-white/15 px-1">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Compose */}
      <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
        <div className="flex items-end gap-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 focus-within:border-[#D4AF37]/20 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            placeholder="Tag a teammate, share an update…"
            className="flex-1 bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none scrollbar-none leading-relaxed disabled:opacity-50"
            style={{ maxHeight: 100 }}
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="w-7 h-7 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/30 text-[#D4AF37] flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed shrink-0"
            aria-label="Send"
          >
            {sending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-white/15 mt-1.5">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </motion.div>
  );
}

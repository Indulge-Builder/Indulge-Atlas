"use client";

import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { MessageSquare, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sendAgentMessage, takeOverSession } from "@/lib/actions/wa-business";
import type { BotMessage, BotSession, BotSessionState } from "@/lib/types/database";

interface ChatViewProps {
  session: BotSession | null;
  messages: BotMessage[];
  onSessionStateChange: (sessionId: string, newState: BotSessionState) => void;
}

const STATE_BADGE: Record<BotSessionState, { label: string; className: string }> = {
  greeting:         { label: "Greeting",   className: "bg-brand-gold/10 text-brand-gold-light" },
  browsing:         { label: "Browsing",   className: "bg-info/10 text-info" },
  viewing_products: { label: "Viewing",    className: "bg-warning/10 text-warning" },
  handoff_pending:  { label: "Pending",    className: "bg-warning/15 text-warning" },
  handed_off:       { label: "Handed off", className: "bg-success/10 text-success" },
};

const BOTTOM_THRESHOLD = 100;

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return phone;
}

function formatIST(iso: string): string {
  try {
    const zoned = toZonedTime(new Date(iso), "Asia/Kolkata");
    return format(zoned, "HH:mm");
  } catch {
    return "";
  }
}

export function ChatView({ session, messages, onSessionStateChange }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [draftText, setDraftText] = useState("");
  const [isSending, startSendTransition] = useTransition();
  const [isTakingOver, startTakeOverTransition] = useTransition();

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
  }, []);

  // Scroll to bottom when messages load (initial load)
  const prevSessionId = useRef<string | null>(null);
  useEffect(() => {
    if (session?.id !== prevSessionId.current) {
      prevSessionId.current = session?.id ?? null;
      // New session selected — always scroll to bottom
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 0);
    }
  }, [session?.id]);

  // Auto-scroll on new messages only when near bottom
  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      prevMsgCount.current = messages.length;
      if (isNearBottom()) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      prevMsgCount.current = messages.length;
    }
  }, [messages, isNearBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draftText]);

  function handleTakeOver() {
    if (!session) return;
    startTakeOverTransition(async () => {
      try {
        await takeOverSession(session.id);
        onSessionStateChange(session.id, "handed_off");
        toast.success("Agent mode activated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to take over");
      }
    });
  }

  function handleSend() {
    if (!session || !draftText.trim() || isSending) return;
    const text = draftText;
    startSendTransition(async () => {
      try {
        await sendAgentMessage(session.id, session.phone, text);
        setDraftText("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to send message");
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-surface">
        <div className="w-14 h-14 rounded-full bg-surface-subtle border border-surface-border flex items-center justify-center">
          <MessageSquare className="w-7 h-7 text-taupe" />
        </div>
        <p className="text-taupe text-[14px]">Select a conversation to view messages</p>
      </div>
    );
  }

  const badge = STATE_BADGE[session.state] ?? STATE_BADGE.greeting;
  const isHandedOff = session.state === "handed_off";
  const canSend = draftText.trim().length > 0 && !isSending;

  return (
    <div className="flex-1 flex flex-col bg-surface min-h-0">
      {/* Chat header */}
      <div className="shrink-0 px-6 py-4 border-b border-surface-border bg-white flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[15px] text-foreground font-serif">
            {formatPhone(session.phone)}
          </p>
          <p className="text-taupe text-[12px] mt-0.5">
            Started {format(new Date(session.created_at), "MMM d, yyyy")} · {session.bot_turn_count} turns
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isHandedOff ? (
            <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold bg-success/10 text-success">
              Agent Mode
            </span>
          ) : (
            <>
              <span className={cn("text-[11px] px-2.5 py-1 rounded-full font-medium", badge.className)}>
                {badge.label}
              </span>
              <button
                onClick={handleTakeOver}
                disabled={isTakingOver}
                className="text-[12px] px-3 py-1.5 rounded-lg font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-60"
              >
                {isTakingOver ? "Taking over…" : "🤝 Take Over"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-3"
      >
        {messages.length === 0 && (
          <p className="text-center text-taupe text-[13px] mt-8">No messages logged yet</p>
        )}
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isAgent = msg.role === "agent";
          const isAssistant = msg.role === "assistant";

          if (isUser) {
            return (
              <div key={msg.id} className="flex flex-col max-w-[72%] items-end ml-auto">
                <div className="px-4 py-2.5 rounded-lg text-[14px] leading-relaxed wrap-break-word bg-[#25D366]/15 text-foreground rounded-br-sm">
                  {msg.content}
                </div>
                <span className="text-taupe-light text-[10px] mt-1 px-1">{formatIST(msg.created_at)}</span>
              </div>
            );
          }

          if (isAgent) {
            return (
              <div key={msg.id} className="flex flex-col max-w-[72%] items-end ml-auto">
                <span className="text-[10px] text-indigo-400 font-medium mb-0.5 px-1">Agent</span>
                <div className="px-4 py-2.5 rounded-lg text-[14px] leading-relaxed wrap-break-word bg-indigo-500 text-white rounded-br-sm">
                  {msg.content}
                </div>
                <span className="text-taupe-light text-[10px] mt-1 px-1">{formatIST(msg.created_at)}</span>
              </div>
            );
          }

          if (isAssistant) {
            return (
              <div key={msg.id} className="flex flex-col max-w-[72%] items-start">
                <div className="px-4 py-2.5 rounded-lg text-[14px] leading-relaxed wrap-break-word bg-white text-foreground border border-surface-border rounded-bl-sm shadow-sm">
                  {msg.content}
                </div>
                <span className="text-taupe-light text-[10px] mt-1 px-1">{formatIST(msg.created_at)}</span>
              </div>
            );
          }

          return null;
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="shrink-0 border-t border-surface-border bg-white">
        {!isHandedOff && (
          <div className="px-4 py-2 border-b border-amber-100 bg-amber-50 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-700 leading-snug">
              Bot is active. Click <strong>Take Over</strong> before replying to prevent double responses.
            </p>
          </div>
        )}
        <div className="flex items-end gap-3 px-4 py-3">
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-surface-border bg-surface-subtle/50 px-3 py-2.5 text-[14px] text-foreground placeholder-taupe outline-none focus:border-brand-gold/40 focus:ring-1 focus:ring-brand-gold/20 overflow-y-auto transition"
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-brand-gold hover:bg-brand-gold-dark text-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Send (⌘↵)"
          >
            {isSending ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-center text-taupe-light text-[11px] pb-2">
          ⌘↵ to send
        </p>
      </div>
    </div>
  );
}

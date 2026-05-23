"use client";

import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BotMessage, BotSession, BotSessionState } from "@/lib/types/database";

interface ChatViewProps {
  session: BotSession | null;
  messages: BotMessage[];
}

const STATE_BADGE: Record<BotSessionState, { label: string; className: string }> = {
  greeting:         { label: "Greeting",   className: "bg-white/10 text-white/60" },
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

export function ChatView({ session, messages }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#F9F9F6]">
        <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center">
          <MessageSquare className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-gray-500 text-[14px]">Select a conversation to view messages</p>
      </div>
    );
  }

  const badge = STATE_BADGE[session.state] ?? STATE_BADGE.greeting;

  return (
    <div className="flex-1 flex flex-col bg-[#F9F9F6] min-h-0">
      {/* Chat header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-[#E5E4DF] bg-white flex items-center justify-between">
        <div>
          <p className="font-semibold text-[15px] text-gray-900">{formatPhone(session.phone)}</p>
          <p className="text-gray-400 text-[12px] mt-0.5">
            Started {format(new Date(session.created_at), "MMM d, yyyy")} · {session.bot_turn_count} turns
          </p>
        </div>
        <span className={cn("text-[11px] px-2.5 py-1 rounded-full font-medium", badge.className)}>
          {badge.label}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-[13px] mt-8">No messages logged yet</p>
        )}
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={cn("flex flex-col max-w-[72%]", isUser ? "items-end ml-auto" : "items-start")}
            >
              <div
                className={cn(
                  "px-4 py-2.5 rounded-lg text-[14px] leading-relaxed break-words",
                  isUser
                    ? "bg-[#25D366] text-white rounded-br-sm"
                    : "bg-white text-gray-800 border border-[#E5E4DF] rounded-bl-sm shadow-sm",
                )}
              >
                {msg.content}
              </div>
              <span className="text-gray-400 text-[10px] mt-1 px-1">
                {formatIST(msg.created_at)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Read-only notice */}
      <div className="flex-shrink-0 px-6 py-3 border-t border-[#E5E4DF] bg-white/80">
        <p className="text-center text-gray-400 text-[12px]">
          Read-only view. Reply via WhatsApp directly.
        </p>
      </div>
    </div>
  );
}

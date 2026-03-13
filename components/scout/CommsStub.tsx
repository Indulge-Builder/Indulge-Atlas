"use client";

import { motion } from "framer-motion";
import { CornerUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Mock data ─────────────────────────────────────────────────

interface MockMessage {
  id:          string;
  senderName:  string;
  initials:    string;
  avatarColor: string;
  message:     string;
  timeAgo:     string;
  unread:      boolean;
}

const MOCK_MESSAGES: MockMessage[] = [
  {
    id:          "m1",
    senderName:  "Meghna Mehta",
    initials:    "MM",
    avatarColor: "#B5A99A",
    message:     "Lead quality from the new Yacht campaign is incredible today.",
    timeAgo:     "2m",
    unread:      true,
  },
  {
    id:          "m2",
    senderName:  "Samson Karimi",
    initials:    "SK",
    avatarColor: "#D4AF37",
    message:     "Closed the Jaipur Palace deal — ₹38L. ROAS is looking excellent.",
    timeAgo:     "18m",
    unread:      true,
  },
  {
    id:          "m3",
    senderName:  "Amit Patel",
    initials:    "AP",
    avatarColor: "#8B5CF6",
    message:     "Monaco F1 lead has gone quiet for 3 days. Should we follow up?",
    timeAgo:     "1h",
    unread:      false,
  },
  {
    id:          "m4",
    senderName:  "Anshika Rao",
    initials:    "AR",
    avatarColor: "#4A7C59",
    message:     "Google Luxury segment converting at 22 % this week.",
    timeAgo:     "3h",
    unread:      false,
  },
];

// ── Individual message item ───────────────────────────────────

function MessageItem({ msg, index }: { msg: MockMessage; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.55,
        ease:     [0.16, 1, 0.3, 1],
        delay:    0.2 + index * 0.06,
      }}
      className="group flex items-start gap-3 px-5 py-3.5
                 hover:bg-[#F4F3F0] transition-colors duration-150
                 cursor-default"
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center
                   justify-center text-[11px] font-semibold"
        style={{
          backgroundColor: `${msg.avatarColor}20`,
          border:          `1px solid ${msg.avatarColor}35`,
        }}
      >
        <span style={{ color: msg.avatarColor }}>{msg.initials}</span>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <p
              className={cn(
                "text-[12px] leading-none truncate",
                msg.unread ? "text-[#1A1A1A] font-semibold" : "text-[#6B6B6B] font-medium"
              )}
            >
              {msg.senderName}
            </p>
            {msg.unread && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] flex-shrink-0" />
            )}
          </div>
          <p className="text-[10px] text-[#C0BDB5] flex-shrink-0">{msg.timeAgo}</p>
        </div>

        <p className="text-[11.5px] text-[#9E9E9E] leading-relaxed line-clamp-2">
          {msg.message}
        </p>
      </div>

      {/* Reply icon — visible only on group hover */}
      <div
        className="flex-shrink-0 opacity-0 group-hover:opacity-100
                   transition-opacity duration-200 mt-0.5"
      >
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="w-7 h-7 rounded-lg flex items-center justify-center
                     bg-[#EAEAE5] hover:bg-[#E0DDD8]
                     text-[#9E9E9E] hover:text-[#1A1A1A]
                     transition-colors duration-150"
          aria-label={`Reply to ${msg.senderName}`}
          title="Reply (coming soon)"
        >
          <CornerUpRight className="w-3 h-3" strokeWidth={2} />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Pulsating status dot ──────────────────────────────────────

function PulseDot() {
  return (
    <div className="relative flex items-center justify-center w-3 h-3">
      <motion.span
        animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute w-3 h-3 rounded-full bg-[#4A7C59]"
      />
      <span className="relative w-1.5 h-1.5 rounded-full bg-[#4A7C59]" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export function CommsStub() {
  const unreadCount = MOCK_MESSAGES.filter((m) => m.unread).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      className={cn(
        "rounded-2xl overflow-hidden",
        "bg-white border border-[#EAEAE5]",
        "shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]"
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4
                   border-b border-[#EAEAE5]"
      >
        <div className="flex items-center gap-2.5">
          <PulseDot />
          <p className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-[0.18em]">
            Internal Comms
          </p>
        </div>

        {unreadCount > 0 && (
          <span
            className="text-[9px] font-semibold bg-[#D4AF37]/15 text-[#D4AF37]
                       px-2 py-0.5 rounded-full"
          >
            {unreadCount} new
          </span>
        )}
      </div>

      {/* Message list */}
      <div className="divide-y divide-[#F0EDE8]">
        {MOCK_MESSAGES.map((msg, i) => (
          <MessageItem key={msg.id} msg={msg} index={i} />
        ))}
      </div>

      {/* Footer stub */}
      <div
        className="px-5 py-3.5 border-t border-[#EAEAE5]
                   flex items-center gap-2"
      >
        <div
          className="flex-1 h-8 rounded-xl bg-[#F4F3F0] border border-[#EAEAE5]
                     flex items-center px-3"
        >
          <p className="text-[11px] text-[#C0BDB5] italic">
            Messaging — coming soon
          </p>
        </div>
      </div>
    </motion.div>
  );
}

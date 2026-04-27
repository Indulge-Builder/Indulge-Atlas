"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  Clock,
  Command,
  Info,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  Shield,
  Sparkles,
  Star,
  User,
  UtensilsCrossed,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { InfoRow } from "@/components/ui/info-row";
import {
  advitaProfile,
  eliaQABank,
  mockClients,
  type ConciergeClient,
  type ClientProfile,
  type EliaMessage,
  type MemberTier,
} from "@/lib/concierge/mockData";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function matchEliaResponse(input: string): string | null {
  const lower = input.toLowerCase();
  for (const qa of eliaQABank) {
    if (qa.keywords.some((kw) => lower.includes(kw))) {
      return qa.response;
    }
  }
  return null;
}

function parseMarkdownBold(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-semibold text-[#D4AF37]">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier badge
// ─────────────────────────────────────────────────────────────────────────────

const tierConfig: Record<
  MemberTier,
  { label: string; bg: string; text: string; border: string }
> = {
  Founding: {
    label: "Founding Member",
    bg: "rgba(212,175,55,0.10)",
    text: "#B8973A",
    border: "rgba(212,175,55,0.22)",
  },
  Diamond: {
    label: "Diamond",
    bg: "rgba(44,120,195,0.07)",
    text: "#2C78C3",
    border: "rgba(44,120,195,0.18)",
  },
  Platinum: {
    label: "Platinum",
    bg: "rgba(100,100,100,0.07)",
    text: "#5A5A5A",
    border: "rgba(100,100,100,0.18)",
  },
  Gold: {
    label: "Gold",
    bg: "rgba(184,151,58,0.08)",
    text: "#9A7A28",
    border: "rgba(184,151,58,0.18)",
  },
};

function TierBadge({ tier, small }: { tier: MemberTier; small?: boolean }) {
  const cfg = tierConfig[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold tracking-wider uppercase",
        small ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]",
      )}
      style={{
        background: cfg.bg,
        color: cfg.text,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {small ? tier : cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Client List Card
// ─────────────────────────────────────────────────────────────────────────────

function ClientCard({
  client,
  isSelected,
  onClick,
}: {
  client: ConciergeClient;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 rounded-xl transition-all duration-200 group relative",
        isSelected
          ? "bg-[#F2F2EE] border border-[#D9D8D3]"
          : "border border-transparent hover:bg-[#F9F9F6] hover:border-[#E5E4DF]",
      )}
    >
      {isSelected && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-[#D4AF37]" />
      )}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold text-white/90 border border-white/20"
          style={{ background: client.avatarColor }}
        >
          {client.initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1A1A1A] truncate leading-tight">
            {client.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <TierBadge tier={client.tier} small />
            <span className="text-[10px] text-[#C8C0B5]">·</span>
            <span className="text-[10px] text-[#9A9A9A]">
              {client.lastActivity}
            </span>
          </div>
        </div>

        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 shrink-0 transition-all duration-200",
            isSelected
              ? "text-[#D4AF37] opacity-100"
              : "text-[#C8C0B5] opacity-0 group-hover:opacity-100",
          )}
        />
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Client Profile Pane
// ─────────────────────────────────────────────────────────────────────────────

function SentimentFlag({
  severity,
  label,
  detail,
}: {
  severity: "critical" | "warning" | "info";
  label: string;
  detail: string;
}) {
  const cfg = {
    critical: {
      bg: "rgba(220,38,38,0.05)",
      border: "rgba(220,38,38,0.14)",
      text: "#DC2626",
      icon: AlertTriangle,
    },
    warning: {
      bg: "rgba(180,83,9,0.05)",
      border: "rgba(180,83,9,0.14)",
      text: "#B45309",
      icon: Zap,
    },
    info: {
      bg: "rgba(67,56,202,0.05)",
      border: "rgba(67,56,202,0.14)",
      text: "#4338CA",
      icon: Info,
    },
  }[severity];

  const Icon = cfg.icon;

  return (
    <div
      className="flex gap-2.5 rounded-xl p-3"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <Icon
        className="w-3.5 h-3.5 shrink-0 mt-0.5"
        style={{ color: cfg.text }}
      />
      <div>
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: cfg.text }}
        >
          {label}
        </p>
        <p className="mt-0.5 text-[12px] text-[#6B6B6B] leading-relaxed">
          {detail}
        </p>
      </div>
    </div>
  );
}

function ProfileSectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#B5A99A]">
        {label}
      </p>
      <div className="flex-1 h-px bg-[#E5E4DF]" />
    </div>
  );
}

function ClientProfilePane({
  profile,
  onClose,
}: {
  profile: ClientProfile;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-[#E5E4DF]">
        <div className="flex items-center gap-3.5">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-semibold text-[#6B6B6B] border border-[#E5E4DF]"
            style={{ background: "#F2F2EE" }}
          >
            AB
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-[#1A1A1A]">
                {profile.name}
              </h2>
              <TierBadge tier={profile.tier} />
            </div>
            <p className="mt-0.5 text-[12px] text-[#9A9A9A]">
              {profile.tagline}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9A9A9A] hover:bg-[#F2F2EE] hover:text-[#6B6B6B] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Indexed stats strip */}
      <div className="grid grid-cols-2 divide-x divide-[#E5E4DF] border-b border-[#E5E4DF]">
        <div className="px-5 py-3 text-center">
          <p className="text-xl font-semibold text-[#D4AF37] tabular-nums">
            {profile.indexedInteractions}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#B5A99A]">
            Indexed Interactions
          </p>
        </div>
        <div className="px-5 py-3 text-center">
          <p className="text-xl font-semibold text-[#D4AF37] tabular-nums">
            {profile.indexedItineraries}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#B5A99A]">
            Itineraries Indexed
          </p>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 scroll-smooth">
        {/* Core bio */}
        <div>
          <ProfileSectionHeader label="Core Profile" />
          <div className="space-y-3">
            <InfoRow
              icon={User}
              label="Age · DOB"
              value={`${profile.age} years — Born ${profile.dob}`}
              iconBg="rgba(212,175,55,0.10)"
              iconColor="#D4AF37"
            />
            <InfoRow
              icon={MapPin}
              label="City · Nationality"
              value={`${profile.city} · ${profile.nationality}`}
            />
            <InfoRow
              icon={Star}
              label="Member Since"
              value={profile.memberSince}
              iconBg="rgba(212,175,55,0.10)"
              iconColor="#D4AF37"
            />
            <InfoRow
              icon={Phone}
              label="Phone"
              value={profile.phone}
            />
          </div>
        </div>

        {/* Sentiment flags */}
        <div>
          <ProfileSectionHeader label="Intelligence Flags" />
          <div className="space-y-2">
            {profile.sentimentFlags.map((flag, i) => (
              <SentimentFlag
                key={i}
                severity={flag.severity}
                label={flag.label}
                detail={flag.detail}
              />
            ))}
          </div>
        </div>

        {/* Communication style */}
        <div>
          <ProfileSectionHeader label="Communication Protocol" />
          <div
            className="rounded-xl p-4 space-y-2"
            style={{
              background: "#F9F9F6",
              border: "1px solid #E5E4DF",
            }}
          >
            {Object.entries(profile.communicationStyle).map(([key, val]) => (
              <div key={key} className="flex gap-2">
                <span className="mt-0.5 text-[#D4AF37] text-xs">›</span>
                <p className="text-[12.5px] text-[#6B6B6B] leading-snug">
                  {val}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Preferences */}
        <div>
          <ProfileSectionHeader label="Preferences" />
          <div className="space-y-3">
            {[
              {
                icon: UtensilsCrossed,
                label: "Dining",
                items: profile.preferences.dining,
              },
              {
                icon: Sparkles,
                label: "Wellness",
                items: profile.preferences.wellness,
              },
              {
                icon: MapPin,
                label: "Travel",
                items: profile.preferences.travel,
              },
            ].map(({ icon: Icon, label, items }) => (
              <div key={label}>
                <InfoRow
                  icon={Icon}
                  label={label}
                  value={
                    <ul className="mt-1 space-y-1">
                      {items.map((item, i) => (
                        <li
                          key={i}
                          className="text-[12.5px] text-[#6B6B6B] flex gap-1.5"
                        >
                          <span className="text-[#D0C8BE] mt-0.5">·</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  }
                />
              </div>
            ))}

            {/* Allergy — critical */}
            <div
              className="flex gap-2.5 rounded-xl p-3 mt-1"
              style={{
                background: "rgba(220,38,38,0.04)",
                border: "1px solid rgba(220,38,38,0.12)",
              }}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#DC2626]" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#DC2626]">
                  Critical Allergy
                </p>
                {profile.preferences.allergies.map((a, i) => (
                  <p key={i} className="mt-0.5 text-[12px] text-[#6B6B6B]">
                    {a}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Past highlights */}
        <div>
          <ProfileSectionHeader label="Past Engagements" />
          <div className="space-y-2">
            {profile.pastHighlights.map((h, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl p-3"
                style={{
                  background: "#F9F9F6",
                  border: "1px solid #E5E4DF",
                }}
              >
                <div
                  className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold tabular-nums"
                  style={{
                    background: "rgba(212,175,55,0.10)",
                    color: "#B8973A",
                  }}
                >
                  {h.year}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#1A1A1A]">
                    {h.event}
                  </p>
                  {h.rating && (
                    <p className="text-[11px] text-[#9A9A9A] mt-0.5">
                      Rating: {h.rating}
                      {h.note && (
                        <span className="text-[#B5A99A]"> · {h.note}</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Concierge notes */}
        <div>
          <ProfileSectionHeader label="Concierge Notes" />
          <div
            className="rounded-xl p-4"
            style={{
              background: "#F9F9F6",
              border: "1px solid #E5E4DF",
            }}
          >
            <p className="text-[12.5px] text-[#6B6B6B] leading-relaxed italic">
              &ldquo;{profile.conciergeNotes}&rdquo;
            </p>
          </div>
        </div>

        {/* Bottom spacer */}
        <div className="h-4" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Elia Chat Pane
// ─────────────────────────────────────────────────────────────────────────────

function EliaThinkingIndicator() {
  return (
    <div className="flex items-end gap-3 py-1">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: "rgba(212,175,55,0.10)",
          border: "1px solid rgba(212,175,55,0.20)",
        }}
      >
        <Brain className="w-3.5 h-3.5 text-[#D4AF37]" />
      </div>
      <div
        className="flex gap-1.5 rounded-2xl rounded-bl-sm px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-[#D4AF37]/60"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}

function EliaBubble({ message }: { message: EliaMessage }) {
  const isElia = message.role === "elia";
  const lines = message.content.split("\n\n");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn("flex items-end gap-3", isElia ? "" : "flex-row-reverse")}
    >
      {/* Avatar */}
      {isElia ? (
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl mb-0.5"
          style={{
            background: "rgba(212,175,55,0.10)",
            border: "1px solid rgba(212,175,55,0.20)",
          }}
        >
          <Brain className="w-3.5 h-3.5 text-[#D4AF37]" />
        </div>
      ) : (
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl mb-0.5 text-[10px] font-semibold text-white/60"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          YOU
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-1 max-w-[82%]",
          isElia ? "items-start" : "items-end",
        )}
      >
        {/* Bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
            isElia ? "rounded-bl-sm" : "rounded-br-sm",
          )}
          style={
            isElia
              ? {
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.80)",
                }
              : {
                  background: "rgba(212,175,55,0.10)",
                  border: "1px solid rgba(212,175,55,0.18)",
                  color: "rgba(255,255,255,0.85)",
                }
          }
        >
          {isElia ? (
            <div className="space-y-2">
              {lines.map((line, i) => (
                <p key={i}>{parseMarkdownBold(line)}</p>
              ))}
            </div>
          ) : (
            <p>{message.content}</p>
          )}
        </div>

        {/* Timestamp + elia label */}
        <div className="flex items-center gap-1.5 px-1">
          {isElia && (
            <>
              <Shield className="w-2.5 h-2.5 text-[#D4AF37]/50" />
              <span className="text-[10px] text-[#D4AF37]/50 font-medium tracking-wide">
                ELIA
              </span>
              <span className="text-[10px] text-white/20">·</span>
            </>
          )}
          <span className="text-[10px] text-white/25">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function EliaChatPane({
  activeClient,
}: {
  activeClient: ConciergeClient | null;
}) {
  const [messages, setMessages] = useState<EliaMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevClientIdRef = useRef<string | null>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // When a new client is selected, show Elia's greeting
  useEffect(() => {
    if (activeClient && activeClient.id !== prevClientIdRef.current) {
      prevClientIdRef.current = activeClient.id;
      setMessages([]);
      setIsThinking(true);
      const timer = setTimeout(() => {
        setIsThinking(false);
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "elia",
            content:
              activeClient.id === "advita"
                ? "Advita Bihani's profile loaded. 412 WhatsApp interactions and 14 itineraries indexed. How can I assist?"
                : `${activeClient.name}'s profile loaded. How can I assist?`,
            timestamp: new Date(),
          },
        ]);
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [activeClient]);

  // Auto-resize textarea as user types
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  const sendMessage = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;

    const userMsg: EliaMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    const matched = matchEliaResponse(trimmed);
    const thinkDelay = 900 + Math.random() * 800;

    setTimeout(() => {
      setIsThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "elia",
          content:
            matched ??
            "I don't have specific data on that for this client. Would you like me to flag this as a research item?",
          timestamp: new Date(),
        },
      ]);
    }, thinkDelay);
  }, [input, isThinking]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isEmpty = messages.length === 0 && !isThinking;

  return (
    <div className="flex h-full flex-col" style={{ background: "#0D0C0A" }}>
      {/* Chat header */}
      <div
        className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{
            background: "rgba(212,175,55,0.10)",
            border: "1px solid rgba(212,175,55,0.18)",
          }}
        >
          <Brain className="w-4 h-4 text-[#D4AF37]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white/90">Elia</p>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{
                background: "rgba(16,185,129,0.10)",
                color: "#10B981",
                border: "1px solid rgba(16,185,129,0.18)",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
              Online
            </span>
          </div>
          <p className="text-[11px] text-white/30">
            RAG-Native Intelligence Layer · v2.4
          </p>
        </div>

        {activeClient && (
          <div className="ml-auto text-right">
            <p className="text-[10px] text-white/30 uppercase tracking-wider">
              Active context
            </p>
            <p className="text-[11px] font-medium text-white/60">
              {activeClient.name}
            </p>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isEmpty && !activeClient && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex h-full flex-col items-center justify-center text-center px-6"
          >
            <div
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: "rgba(212,175,55,0.08)",
                border: "1px solid rgba(212,175,55,0.15)",
              }}
            >
              <Brain className="w-7 h-7 text-[#D4AF37]/60" />
            </div>
            <p className="text-[15px] font-medium text-white/60 leading-relaxed max-w-[280px]">
              Welcome to the Intelligence Layer. Select a client to begin
              orchestrating.
            </p>
            <p className="mt-3 text-[11px] text-white/25 uppercase tracking-wider">
              Powered by Elia · Indulge Global
            </p>
          </motion.div>
        )}

        {(messages.length > 0 || isThinking) && (
          <div className="space-y-5">
            {messages.map((msg) => (
              <EliaBubble key={msg.id} message={msg} />
            ))}
            {isThinking && <EliaThinkingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        className="px-4 py-4 border-t"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        {!activeClient && (
          <p className="mb-2 text-center text-[11px] text-white/20 uppercase tracking-wider">
            Select a client to enable orchestration
          </p>
        )}
        <div
          className={cn(
            "flex items-end gap-3 rounded-2xl px-4 py-3 transition-all duration-200",
            activeClient
              ? "border border-white/10 bg-white/[0.03] focus-within:border-[rgba(212,175,55,0.25)] focus-within:bg-white/[0.04]"
              : "border border-white/5 bg-white/[0.02] opacity-40 pointer-events-none",
          )}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Elia anything about this client…"
            disabled={!activeClient || isThinking}
            className="flex-1 resize-none bg-transparent text-[13px] text-white/80 placeholder-white/25 outline-none leading-relaxed max-h-32 overflow-y-auto"
            style={{ scrollbarWidth: "none" }}
          />
          <IndulgeButton
            variant="gold"
            size="icon-sm"
            onClick={sendMessage}
            disabled={!input.trim() || !activeClient || isThinking}
            className="shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </IndulgeButton>
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <Command className="w-2.5 h-2.5 text-white/15" />
          <p className="text-[10px] text-white/20">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main 3-Pane Layout
// ─────────────────────────────────────────────────────────────────────────────

export function ConciergeClient() {
  const [selectedClient, setSelectedClient] = useState<ConciergeClient | null>(
    null,
  );
  const [profileVisible, setProfileVisible] = useState(false);

  const handleSelectClient = (client: ConciergeClient) => {
    if (selectedClient?.id === client.id && profileVisible) {
      // Deselect
      setProfileVisible(false);
      setTimeout(() => setSelectedClient(null), 400);
    } else {
      setSelectedClient(client);
      setProfileVisible(true);
    }
  };

  const handleCloseProfile = () => {
    setProfileVisible(false);
    setTimeout(() => setSelectedClient(null), 400);
  };

  // Derive profile data — only Advita has full mock data for now
  const activeProfile: ClientProfile | null =
    selectedClient?.id === "advita" ? advitaProfile : null;

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ background: "#F9F9F6" }}
    >
      {/* ── Left Pane: Client List ─────────────────────────────────────────── */}
      <div
        className="flex w-[220px] shrink-0 flex-col border-r"
        style={{ borderColor: "#E5E4DF" }}
      >
        {/* Pane header */}
        <div
          className="px-4 py-4 border-b"
          style={{ borderColor: "#E5E4DF" }}
        >
          <div className="flex items-center gap-2 mb-0.5">
            <MessageSquare className="w-3.5 h-3.5 text-[#D4AF37]" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#B5A99A]">
              Clients
            </p>
          </div>
          <p className="text-[11px] text-[#B5A99A]">
            {mockClients.length} members indexed
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {mockClients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              isSelected={selectedClient?.id === client.id && profileVisible}
              onClick={() => handleSelectClient(client)}
            />
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 border-t"
          style={{ borderColor: "#EEEDE8" }}
        >
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-[#C8C0B5]" />
            <p className="text-[10px] text-[#B5A99A]">Last synced: just now</p>
          </div>
        </div>
      </div>

      {/* ── Center + Right Panes (flex container) ─────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center Pane: Profile */}
        <AnimatePresence>
          {profileVisible && (
            <motion.div
              key="profile-pane"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "42%", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="shrink-0 overflow-hidden border-r"
              style={{
                borderColor: "#E5E4DF",
                background: "#FFFFFF",
              }}
            >
              <div
                className="h-full w-[42vw] max-w-[520px]"
                style={{ minWidth: "320px" }}
              >
                {activeProfile ? (
                  <ClientProfilePane
                    profile={activeProfile}
                    onClose={handleCloseProfile}
                  />
                ) : (
                  /* Placeholder for clients without full mock data */
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                    <div
                      className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
                      style={{
                        background: "#F2F2EE",
                        border: "1px solid #E5E4DF",
                      }}
                    >
                      <User className="w-6 h-6 text-[#B5A99A]" />
                    </div>
                    <p className="text-sm font-medium text-[#6B6B6B]">
                      {selectedClient?.name}
                    </p>
                    <p className="mt-1.5 text-[12px] text-[#B5A99A] max-w-[200px]">
                      Full profile data will be available once Elia indexes this
                      client.
                    </p>
                    <button
                      type="button"
                      onClick={handleCloseProfile}
                      className="mt-5 text-[11px] text-[#B5A99A] hover:text-[#6B6B6B] transition-colors"
                    >
                      ← Back to list
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Pane: Elia Chat */}
        <motion.div
          className="flex flex-1 flex-col overflow-hidden"
          layout
          transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <EliaChatPane activeClient={selectedClient} />
        </motion.div>
      </div>
    </div>
  );
}

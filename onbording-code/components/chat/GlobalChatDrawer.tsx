"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;
import { MessageSquare, X, ChevronLeft, Plus, Send, Search, Paperclip, User, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMessages } from "@/lib/hooks/useMessages";
import {
  getMyDirectConversations,
  getOrCreateDirectConversation,
  getTeamMembers,
  markConversationRead,
  sendMessage,
  searchLeadsForAttachment,
  type DirectConversationRow,
} from "@/lib/actions/messages";
import { useChatDrawer } from "./ChatProvider";
import type { MessageLeadPreview, Profile } from "@/lib/types/database";
import { LEAD_STATUS_CONFIG } from "@/lib/types/database";
import { formatDistanceToNowStrict } from "date-fns";

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

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({
  name,
  role,
  size = "sm",
}: {
  name: string;
  role: string;
  size?: "sm" | "md";
}) {
  const color = ROLE_COLOR[role] ?? "#8A8A6E";
  const dim = size === "sm" ? "w-8 h-8 text-[11px]" : "w-10 h-10 text-[13px]";
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-semibold shrink-0`}
      style={{ backgroundColor: `${color}20`, color }}
    >
      {getInitials(name)}
    </div>
  );
}

// ── Conversation List ─────────────────────────────────────────────────────────

function ConversationList({
  conversations,
  onSelect,
  onNewChat,
  loading,
}: {
  conversations: DirectConversationRow[];
  onSelect: (row: DirectConversationRow) => void;
  onNewChat: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
        <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
          Messages
        </p>
        <button
          onClick={onNewChat}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-[#D4AF37]/15 text-white/50 hover:text-[#D4AF37] flex items-center justify-center transition-colors"
          aria-label="New conversation"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-white/5" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 bg-white/5 rounded w-1/2" />
                  <div className="h-2 bg-white/5 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <MessageSquare className="w-8 h-8 text-white/10" />
            <p className="text-[13px] text-white/30 text-center leading-relaxed px-6">
              No conversations yet.
              <br />
              Start one with a team member.
            </p>
            <button
              onClick={onNewChat}
              className="text-[12px] text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors underline underline-offset-2"
            >
              New message
            </button>
          </div>
        ) : (
          <ul className="py-1">
            {conversations.map((row) => (
              <li key={row.conversationId}>
                <button
                  onClick={() => onSelect(row)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors group"
                >
                  <Avatar name={row.otherUser.full_name} role={row.otherUser.role} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] text-white/85 font-medium truncate">
                        {row.otherUser.full_name}
                      </p>
                      {row.lastMessageAt && (
                        <span className="text-[10px] text-white/25 shrink-0">
                          {formatDistanceToNowStrict(new Date(row.lastMessageAt), {
                            addSuffix: false,
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-white/35 truncate mt-0.5">
                      {row.lastMessage ?? "No messages yet"}
                    </p>
                  </div>
                  {row.unreadCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-[#D4AF37] text-[#121212] text-[9px] font-bold flex items-center justify-center shrink-0">
                      {row.unreadCount > 9 ? "9+" : row.unreadCount}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── New Chat — team member picker ─────────────────────────────────────────────

function NewChatPicker({
  onBack,
  onSelect,
}: {
  onBack: () => void;
  onSelect: (member: Pick<Profile, "id" | "full_name" | "role">) => void;
}) {
  const [members, setMembers] = useState<Pick<Profile, "id" | "full_name" | "role">[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamMembers().then((data) => {
      setMembers(data);
      setLoading(false);
    });
  }, []);

  const filtered = query
    ? members.filter((m) =>
        m.full_name.toLowerCase().includes(query.toLowerCase())
      )
    : members;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/5">
        <button
          onClick={onBack}
          className="text-white/40 hover:text-white/80 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-[13px] font-medium text-white/70">New Message</p>
      </div>

      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team members…"
            className="w-full bg-white/5 border border-white/8 rounded-lg pl-9 pr-3 py-2 text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-[#D4AF37]/30 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="flex flex-col gap-2 px-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-white/5" />
                <div className="h-3 bg-white/5 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map((member) => (
              <li key={member.id}>
                <button
                  onClick={() => onSelect(member)}
                  className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.03] transition-colors"
                >
                  <Avatar name={member.full_name} role={member.role} size="md" />
                  <div className="text-left">
                    <p className="text-[13px] text-white/80 font-medium">
                      {member.full_name}
                    </p>
                    <p className="text-[11px] text-white/30 capitalize">{member.role}</p>
                  </div>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-4 py-8 text-center text-[13px] text-white/30">
                No team members found
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Lead card for the dark drawer theme ──────────────────────────────────────

function LeadCardDark({ lead, isMine }: { lead: MessageLeadPreview; isMine: boolean }) {
  const cfg = LEAD_STATUS_CONFIG[lead.status] ?? { color: "#9E9E9E" };
  return (
    <Link
      href={`/leads/${lead.id}`}
      className={`
        flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-1.5
        border transition-opacity hover:opacity-80
        ${isMine ? "bg-white/10 border-white/15" : "bg-white/[0.04] border-white/8"}
      `}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${cfg.color}25` }}
      >
        <User className="w-3 h-3" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-white/85 truncate leading-tight">
          {lead.full_name}
        </p>
        <p className="text-[10px] text-white/40 capitalize mt-0.5 truncate">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
            style={{ backgroundColor: cfg.color }}
          />
          {lead.status.replace(/_/g, " ")}
          {lead.city ? ` · ${lead.city}` : ""}
        </p>
      </div>
      <ExternalLink className="w-3 h-3 text-white/20 shrink-0" />
    </Link>
  );
}

// ── Chat Thread ───────────────────────────────────────────────────────────────

function ChatThread({
  conversationId,
  currentUserId,
  peerName,
  peerRole,
  onBack,
}: {
  conversationId: string;
  currentUserId:  string;
  peerName:       string;
  peerRole:       string;
  onBack:         () => void;
}) {
  const { messages, loading, bottomRef } = useMessages(conversationId);
  const [draft,          setDraft]          = useState("");
  const [sending,        setSending]        = useState(false);
  const [attachedLead,   setAttachedLead]   = useState<MessageLeadPreview | null>(null);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [leadQuery,      setLeadQuery]      = useState("");
  const [leadResults,    setLeadResults]    = useState<MessageLeadPreview[]>([]);
  const [leadSearching,  setLeadSearching]  = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  useEffect(() => {
    markConversationRead(conversationId);
  }, [conversationId]);

  // Debounced lead search
  useEffect(() => {
    if (!showLeadPicker) return;
    const timer = setTimeout(async () => {
      setLeadSearching(true);
      const results = await searchLeadsForAttachment(leadQuery);
      setLeadResults(results);
      setLeadSearching(false);
    }, 280);
    return () => clearTimeout(timer);
  }, [leadQuery, showLeadPicker]);

  useEffect(() => {
    if (showLeadPicker && leadResults.length === 0) {
      searchLeadsForAttachment("").then(setLeadResults);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLeadPicker]);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setDraft("");
    const leadId = attachedLead?.id ?? null;
    setAttachedLead(null);
    setShowLeadPicker(false);
    await sendMessage(conversationId, trimmed, leadId);
    setSending(false);
    textareaRef.current?.focus();
  }, [draft, sending, attachedLead, conversationId]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/5 shrink-0">
        <button onClick={onBack} className="text-white/40 hover:text-white/80 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <Avatar name={peerName} role={peerRole} size="md" />
        <div>
          <p className="text-[13px] font-medium text-white/85">{peerName}</p>
          <p className="text-[11px] text-white/30 capitalize">{peerRole}</p>
        </div>
      </div>

      {/* Message history */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex flex-col gap-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                <div className="h-8 rounded-2xl bg-white/5 w-40" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <p className="text-[13px] text-white/30 leading-relaxed">
              This is the start of your<br />
              conversation with <span className="text-white/50">{peerName}</span>.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isMine = msg.sender_id === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"} items-end gap-2`}
                >
                  {!isMine && msg.sender && (
                    <Avatar name={msg.sender.full_name} role={msg.sender.role} size="sm" />
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      isMine
                        ? "rounded-br-sm bg-[#D4AF37]/20 text-[#D4AF37]"
                        : "rounded-bl-sm bg-white/5 text-white/90"
                    }`}
                  >
                    {msg.lead && <LeadCardDark lead={msg.lead} isMine={isMine} />}
                    {msg.content}
                    <p className={`text-[10px] mt-1 ${isMine ? "text-[#D4AF37]/40 text-right" : "text-white/20"}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Compose area */}
      <div className="px-3 py-3 border-t border-white/5 shrink-0">

        {/* Lead picker */}
        <AnimatePresence>
          {showLeadPicker && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.3, ease: luxuryEasing }}
              className="mb-3 bg-[#1E1E1E] border border-white/8 rounded-2xl overflow-hidden"
            >
              <div className="px-3 pt-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                  <input
                    autoFocus
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Search leads…"
                    className="w-full bg-white/5 border border-white/8 rounded-lg pl-9 pr-3 py-2 text-[12px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-[#D4AF37]/30 transition-colors"
                  />
                </div>
              </div>
              <div className="max-h-44 overflow-y-auto pb-2">
                {leadSearching ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
                  </div>
                ) : leadResults.length === 0 ? (
                  <p className="text-[11px] text-white/25 text-center py-4 italic">No leads found</p>
                ) : (
                  leadResults.map((lead) => {
                    const cfg = LEAD_STATUS_CONFIG[lead.status];
                    return (
                      <button
                        key={lead.id}
                        onClick={() => { setAttachedLead(lead); setShowLeadPicker(false); }}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
                      >
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${cfg.color}25` }}>
                          <User className="w-3 h-3" style={{ color: cfg.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-white/80 font-medium truncate">{lead.full_name}</p>
                          <p className="text-[10px] text-white/35 capitalize">{lead.status.replace(/_/g, " ")}{lead.city ? ` · ${lead.city}` : ""}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attached lead chip */}
        <AnimatePresence>
          {attachedLead && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-white/30 uppercase tracking-wider">Lead</span>
                <div className="flex items-center gap-1.5 rounded-full pl-2 pr-1 py-0.5 border border-[#D4AF37]/20 bg-[#D4AF37]/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shrink-0" />
                  <span className="text-[11px] font-medium text-[#D4AF37]/90 max-w-[120px] truncate leading-none">{attachedLead.full_name}</span>
                  <button onClick={() => setAttachedLead(null)} className="w-4 h-4 flex items-center justify-center rounded-full text-[#D4AF37]/50 hover:text-[#D4AF37] ml-0.5 transition-colors">✕</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2 focus-within:border-[#D4AF37]/25 transition-colors duration-400">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            disabled={sending}
            className="flex-1 self-center bg-transparent text-[13px] text-white/80 placeholder:text-white/25 resize-none focus:outline-none scrollbar-none leading-relaxed disabled:opacity-50"
            style={{ maxHeight: 120 }}
          />
          <button
            type="button"
            onClick={() => { setShowLeadPicker((v) => !v); setLeadQuery(""); }}
            title="Attach a lead"
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
              attachedLead || showLeadPicker ? "bg-[#D4AF37]/20 text-[#D4AF37]" : "text-white/25 hover:text-[#D4AF37]/70 hover:bg-white/5"
            }`}
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="w-7 h-7 rounded-lg bg-[#D4AF37]/20 hover:bg-[#D4AF37]/35 text-[#D4AF37] flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-white/15 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line · 📎 attach lead
        </p>
      </div>
    </div>
  );
}

// ── GlobalChatDrawer (root export) ────────────────────────────────────────────

type DrawerView = "list" | "new-chat" | "thread";

interface ActiveThread {
  conversationId: string;
  peerName: string;
  peerRole: string;
}

interface GlobalChatDrawerProps {
  currentUserId: string;
  /** When provided, the drawer is controlled externally (from ChatProvider) */
  externalOpen?: boolean;
  onExternalClose?: () => void;
}

export function GlobalChatDrawer({
  currentUserId,
  externalOpen = false,
  onExternalClose,
}: GlobalChatDrawerProps) {
  const open = externalOpen;
  const prefersReducedMotion = useReducedMotion();
  const { pendingThread, clearPendingThread } = useChatDrawer();

  const setOpen = useCallback(
    (val: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof val === "function" ? val(open) : val;
      if (!next) onExternalClose?.();
    },
    [open, onExternalClose]
  );
  const [view, setView] = useState<DrawerView>("list");
  const [conversations, setConversations] = useState<DirectConversationRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeThread, setActiveThread] = useState<ActiveThread | null>(null);

  const loadConversations = useCallback(async () => {
    setListLoading(true);
    const data = await getMyDirectConversations();
    setConversations(data);
    setListLoading(false);
  }, []);

  // When a pending thread is set (e.g. from WhisperBox reply button),
  // navigate directly to that conversation once the drawer is open.
  useEffect(() => {
    if (open && pendingThread) {
      setActiveThread({
        conversationId: pendingThread.conversationId,
        peerName: pendingThread.peerName,
        peerRole: pendingThread.peerRole,
      });
      setView("thread");
      clearPendingThread();
    }
  }, [open, pendingThread, clearPendingThread]);

  // Reload conversations when drawer opens to list view
  useEffect(() => {
    if (open && view === "list") {
      loadConversations();
    }
  }, [open, view, loadConversations]);

  const handleSelectConversation = (row: DirectConversationRow) => {
    setActiveThread({
      conversationId: row.conversationId,
      peerName: row.otherUser.full_name,
      peerRole: row.otherUser.role,
    });
    setView("thread");
  };

  const handleSelectMember = async (
    member: Pick<Profile, "id" | "full_name" | "role">
  ) => {
    const { conversationId, error } = await getOrCreateDirectConversation(member.id);
    if (error || !conversationId) return;

    // Navigate directly — no list lookup needed.
    // We already have the member's name and role from the picker.
    setActiveThread({
      conversationId,
      peerName: member.full_name,
      peerRole: member.role,
    });
    setView("thread");
    // Refresh the conversation list in the background for next time
    loadConversations();
  };

  const handleBackToList = () => {
    setView("list");
    setActiveThread(null);
    loadConversations();
  };

  return (
    <>
      {/* Drawer overlay */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />

            {/* Slide-out panel */}
            <motion.div
              initial={{ x: prefersReducedMotion ? 0 : "100%", opacity: 0.5 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: prefersReducedMotion ? 0 : "100%", opacity: 0 }}
              transition={{ duration: 0.5, ease: luxuryEasing }}
              style={{ willChange: "transform, opacity" }}
              className="fixed right-0 top-0 h-screen w-96 z-50 bg-[#121212] border-l border-white/5 flex flex-col shadow-2xl"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-[#D4AF37]/70" strokeWidth={1.75} />
                  <span
                    className="text-[15px] font-semibold text-white/85"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    Command Center
                  </span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 flex items-center justify-center transition-colors"
                  aria-label="Close messages"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer body — view routing */}
              <div className="flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  {view === "list" && (
                    <motion.div
                      key="list"
                      initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: prefersReducedMotion ? 0 : -10 }}
                      transition={{ duration: 0.25, ease: luxuryEasing }}
                      className="h-full"
                    >
                      <ConversationList
                        conversations={conversations}
                        onSelect={handleSelectConversation}
                        onNewChat={() => setView("new-chat")}
                        loading={listLoading}
                      />
                    </motion.div>
                  )}

                  {view === "new-chat" && (
                    <motion.div
                      key="new-chat"
                      initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: prefersReducedMotion ? 0 : 10 }}
                      transition={{ duration: 0.25, ease: luxuryEasing }}
                      className="h-full"
                    >
                      <NewChatPicker
                        onBack={() => setView("list")}
                        onSelect={handleSelectMember}
                      />
                    </motion.div>
                  )}

                  {view === "thread" && activeThread && (
                    <motion.div
                      key="thread"
                      initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: prefersReducedMotion ? 0 : 10 }}
                      transition={{ duration: 0.25, ease: luxuryEasing }}
                      className="h-full"
                    >
                      <ChatThread
                        conversationId={activeThread.conversationId}
                        currentUserId={currentUserId}
                        peerName={activeThread.peerName}
                        peerRole={activeThread.peerRole}
                        onBack={handleBackToList}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Search,
  Send,
  Loader2,
  Paperclip,
  User,
} from "lucide-react";
import {
  getTeamMembers,
  markConversationRead,
  searchLeadsForAttachment,
  sendMessage,
} from "@/lib/actions/messages";
import { useMessages } from "@/lib/hooks/useMessages";
import type { MessageLeadPreview, Profile } from "@/lib/types/database";
import { LEAD_STATUS_CONFIG } from "@/lib/types/database";
import {
  Avatar,
  LeadCard,
  avatarGradient,
  getInitials,
} from "./whisperUi";

export type MemberInfo = Pick<Profile, "id" | "full_name" | "role">;

export interface ActiveThread {
  conversationId: string;
  peer: MemberInfo;
}

export function WhisperThreadView({
  thread,
  currentUserId,
  onBack,
}: {
  thread: ActiveThread;
  currentUserId: string;
  onBack: () => void;
}) {
  const { messages, loading, bottomRef } = useMessages(thread.conversationId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachedLead, setAttachedLead] = useState<MessageLeadPreview | null>(null);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<MessageLeadPreview[]>([]);
  const [leadSearching, setLeadSearching] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [draft]);

  useEffect(() => {
    markConversationRead(thread.conversationId);
  }, [thread.conversationId]);

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
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft("");
    const leadId = attachedLead?.id ?? null;
    setAttachedLead(null);
    setShowLeadPicker(false);
    await sendMessage(thread.conversationId, content, leadId);
    setSending(false);
    textareaRef.current?.focus();
  }, [draft, sending, attachedLead, thread.conversationId]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleLeadPicker = () => {
    setShowLeadPicker((v) => !v);
    setLeadQuery("");
  };

  const isNew = !loading && messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-black/[0.05] shrink-0">
        <button
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-lg
                     text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-black/[0.04] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <Avatar name={thread.peer.full_name} role={thread.peer.role} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#1A1A1A] truncate">
            {thread.peer.full_name}
          </p>
          <p className="text-[10px] text-[#B0ADA8] capitalize">{thread.peer.role}</p>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto px-5 py-4 space-y-3
                   [&::-webkit-scrollbar]:w-[1px]
                   [&::-webkit-scrollbar-thumb]:bg-black/[0.08]
                   [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="w-4 h-4 text-[#C0BDB5] animate-spin" />
          </div>
        ) : isNew ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-32 gap-3 text-center"
          >
            <Avatar name={thread.peer.full_name} role={thread.peer.role} size="lg" />
            <p className="text-[12px] text-[#9E9E9E] leading-relaxed">
              Start your conversation with{" "}
              <span className="font-semibold text-[#1A1A1A]">{thread.peer.full_name}</span>.
            </p>
          </motion.div>
        ) : (
          <>
            {messages.map((msg) => {
              const isMine = msg.sender_id === currentUserId;
              const sender = msg.sender;
              const initials = sender ? getInitials(sender.full_name) : "?";
              const role = sender?.role ?? "agent";

              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 items-end ${isMine ? "flex-row-reverse" : "flex-row"}`}
                >
                  {!isMine && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ background: avatarGradient(role) }}
                    >
                      {initials}
                    </div>
                  )}
                  <div className={`flex flex-col gap-0.5 max-w-[78%] ${isMine ? "items-end" : "items-start"}`}>
                    <div
                      className={`px-3.5 py-2 text-[12.5px] leading-relaxed rounded-2xl ${
                        isMine
                          ? "rounded-br-sm bg-[#7B5B3A] text-white"
                          : "rounded-bl-sm bg-black/[0.05] text-[#1A1A1A]"
                      }`}
                    >
                      {msg.lead && <LeadCard lead={msg.lead} isMine={isMine} />}
                      {msg.content}
                    </div>
                    <p
                      className={`text-[9px] text-[#C0BDB5] px-1 tabular-nums ${
                        isMine ? "text-right" : "text-left"
                      }`}
                    >
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

      <div className="border-t border-black/[0.05] px-4 pt-3 pb-4 shrink-0">
        <AnimatePresence>
          {showLeadPicker && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
              className="mb-3 bg-white border border-black/[0.08] rounded-2xl shadow-lg overflow-hidden"
            >
              <div className="px-3 pt-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#C0BDB5]" />
                  <input
                    autoFocus
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Search leads by name…"
                    className="
                      w-full bg-black/[0.03] border border-black/[0.06] rounded-xl
                      pl-9 pr-3 py-2 text-[12px] text-[#1A1A1A]
                      placeholder:text-[#C0BDB5] focus:outline-none
                      focus:border-[#7B5B3A]/40 transition-colors
                    "
                  />
                </div>
              </div>

              <div className="max-h-44 overflow-y-auto pb-2 [&::-webkit-scrollbar]:w-[1px]">
                {leadSearching ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 text-[#C0BDB5] animate-spin" />
                  </div>
                ) : leadResults.length === 0 ? (
                  <p className="text-[11px] text-[#C0BDB5] text-center py-4 italic">
                    No leads found
                  </p>
                ) : (
                  leadResults.map((lead) => {
                    const cfg = LEAD_STATUS_CONFIG[lead.status] ?? {
                      color: "#9E9E9E",
                    };
                    return (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => {
                          setAttachedLead(lead);
                          setShowLeadPicker(false);
                        }}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5
                                   hover:bg-black/[0.03] transition-colors text-left"
                      >
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${cfg.color}20` }}
                        >
                          <User className="w-3 h-3" style={{ color: cfg.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-[#1A1A1A] truncate">
                            {lead.full_name}
                          </p>
                          <p className="text-[10px] text-[#B0ADA8] capitalize">
                            {lead.status.replace(/_/g, " ")}
                            {lead.city ? ` · ${lead.city}` : ""}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-1.5 mb-2"
        >
          <span className="text-[9px] text-[#C0BDB5] uppercase tracking-wider font-medium">To</span>
          <div className="flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-0.5 border border-black/[0.07] bg-black/[0.03]">
            <Avatar name={thread.peer.full_name} role={thread.peer.role} size="sm" />
            <span className="text-[11px] font-medium text-[#1A1A1A] leading-none">
              {thread.peer.full_name}
            </span>
          </div>
        </motion.div>

        <AnimatePresence>
          {attachedLead && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden mb-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-[#C0BDB5] uppercase tracking-wider font-medium">Lead</span>
                <div className="flex items-center gap-1.5 rounded-full pl-2 pr-1 py-0.5
                                border border-[#7B5B3A]/25 bg-[#7B5B3A]/[0.06]">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: LEAD_STATUS_CONFIG[attachedLead.status]?.color }}
                  />
                  <span className="text-[11px] font-medium text-[#3D2B1F] max-w-[120px] truncate leading-none">
                    {attachedLead.full_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachedLead(null)}
                    className="w-4 h-4 flex items-center justify-center rounded-full
                               text-[#9E9E9E] hover:text-[#7B5B3A] hover:bg-[#7B5B3A]/10
                               transition-colors ml-0.5"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className="flex items-end gap-2 bg-black/[0.03] border border-black/[0.06]
                     rounded-xl px-3.5 py-2.5 focus-within:border-[#7B5B3A]/40
                     transition-colors"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            autoFocus
            placeholder={`Message ${thread.peer.full_name.split(" ")[0]}…`}
            className="
              flex-1 bg-transparent text-[12.5px] text-[#1A1A1A]
              placeholder:text-[#C0BDB5] placeholder:italic
              resize-none focus:outline-none
              leading-relaxed disabled:opacity-50 caret-[#7B5B3A]
              [&::-webkit-scrollbar]:hidden
            "
            style={{ maxHeight: 96 }}
          />

          <button
            type="button"
            onClick={toggleLeadPicker}
            title="Attach a lead"
            className={`
              w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0
              ${attachedLead || showLeadPicker
                ? "bg-[#7B5B3A]/15 text-[#7B5B3A]"
                : "text-[#C0BDB5] hover:text-[#7B5B3A] hover:bg-[#7B5B3A]/10"
              }
            `}
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="
              w-7 h-7 rounded-lg bg-[#7B5B3A] hover:bg-[#6B4C3B]
              text-white flex items-center justify-center
              transition-colors disabled:opacity-25 disabled:cursor-not-allowed shrink-0
            "
          >
            {sending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
          </button>
        </div>
        <p className="text-[9px] text-[#C8C4BE] mt-1.5 text-center">
          Enter to send · Shift+Enter for new line · 📎 to attach a lead
        </p>
      </div>
    </div>
  );
}

export function WhisperMemberPickerView({
  onSelect,
  onBack,
  opening,
}: {
  onSelect: (member: MemberInfo) => void;
  onBack: () => void;
  opening: boolean;
}) {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [query, setQuery] = useState("");
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    getTeamMembers().then((data) => {
      setMembers(data);
      setFetching(false);
    });
  }, []);

  const filtered = query
    ? members.filter(
        (m) =>
          m.full_name.toLowerCase().includes(query.toLowerCase()) ||
          m.role.toLowerCase().includes(query.toLowerCase()),
      )
    : members;

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-black/[0.05] shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-lg
                     text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-black/[0.04] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="text-[13px] font-semibold text-[#1A1A1A]">New Message</p>
          <p className="text-[10px] text-[#B0ADA8]">Choose a team member</p>
        </div>
      </div>

      <div className="px-5 py-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#C0BDB5]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="
              w-full bg-black/[0.03] border border-black/[0.06] rounded-xl
              pl-9 pr-3 py-2.5 text-[12.5px] text-[#1A1A1A]
              placeholder:text-[#C0BDB5] focus:outline-none
              focus:border-[#D4AF37]/40 transition-colors caret-[#D4AF37]
            "
          />
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto px-3 pb-3
                   [&::-webkit-scrollbar]:w-[1px]
                   [&::-webkit-scrollbar-thumb]:bg-black/[0.08]"
      >
        {fetching ? (
          <div className="space-y-1">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-black/[0.06] shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-2.5 bg-black/[0.05] rounded w-2/5" />
                  <div className="h-2 bg-black/[0.04] rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-[12px] text-[#C0BDB5] italic">No team members found</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((member, i) => (
              <motion.li
                key={member.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(member)}
                  disabled={opening}
                  className="
                    w-full flex items-center gap-3.5 px-3 py-3 rounded-xl
                    hover:bg-black/[0.03] active:bg-black/[0.06]
                    transition-colors text-left group
                    disabled:opacity-50
                  "
                >
                  <Avatar name={member.full_name} role={member.role} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#1A1A1A] truncate">
                      {member.full_name}
                    </p>
                    <p className="text-[10px] text-[#B0ADA8] capitalize mt-0.5">
                      {member.role}
                    </p>
                  </div>
                  <ChevronLeft
                    className="w-3.5 h-3.5 text-[#D0CCC6] rotate-180
                               opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {opening && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex flex-col
                       items-center justify-center gap-3 rounded-2xl z-10"
          >
            <Loader2 className="w-5 h-5 text-[#D4AF37] animate-spin" />
            <p className="text-[11px] text-[#9E9E9E]">Opening conversation…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

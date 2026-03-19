"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getMyDirectConversations,
  getOrCreateDirectConversation,
  type DirectConversationRow,
} from "@/lib/actions/messages";
import { Avatar, PulseDot, timeAgo } from "./whisperUi";
import type { ActiveThread, MemberInfo } from "./WhisperBoxHeavyPanels";

type WhisperView = "list" | "picker" | "thread";

const WhisperMemberPickerPanel = dynamic(
  () =>
    import("./WhisperBoxHeavyPanels").then((m) => m.WhisperMemberPickerView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl bg-black/[0.02]">
        <div className="h-8 w-8 animate-pulse rounded-full bg-stone-200/80" />
        <div className="h-3 w-32 animate-pulse rounded-md bg-stone-100/90" />
      </div>
    ),
  },
);

const WhisperThreadPanel = dynamic(
  () =>
    import("./WhisperBoxHeavyPanels").then((m) => m.WhisperThreadView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[220px] flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-stone-200/80" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-28 animate-pulse rounded-md bg-stone-100/90" />
            <div className="h-2 w-16 animate-pulse rounded bg-stone-100/70" />
          </div>
        </div>
        <div className="flex-1 space-y-3 rounded-xl border border-stone-100/80 bg-stone-50/50 p-4">
          <div className="h-10 animate-pulse rounded-lg bg-stone-100/80" />
          <div className="h-10 animate-pulse rounded-lg bg-stone-100/60" />
        </div>
      </div>
    ),
  },
);

function ConversationListView({
  conversations,
  loading,
  onSelect,
  onNew,
  unreadCount,
}: {
  conversations: DirectConversationRow[];
  loading:       boolean;
  onSelect:      (row: DirectConversationRow) => void;
  onNew:         () => void;
  unreadCount:   number;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.05] shrink-0">
        <div className="flex items-center gap-2.5">
          <PulseDot />
          <p className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-[0.22em]">
            Studio Comms
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="text-[9px] font-semibold text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            onClick={onNew}
            className="w-7 h-7 rounded-lg bg-black/[0.04] hover:bg-[#D4AF37]/10
                       text-[#C0BDB5] hover:text-[#D4AF37]
                       flex items-center justify-center transition-colors"
            title="New message"
          >
            <Plus className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto divide-y divide-black/[0.04]
                   [&::-webkit-scrollbar]:w-[1px]
                   [&::-webkit-scrollbar-thumb]:bg-black/[0.08]
                   [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {loading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-start gap-3.5 px-6 py-4 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-black/[0.05] shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <div className="h-2.5 bg-black/[0.05] rounded w-1/3" />
                  <div className="h-2 bg-black/[0.04] rounded w-3/4" />
                  <div className="h-2 bg-black/[0.03] rounded w-1/2" />
                </div>
              </div>
            ))}
          </>
        ) : conversations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-48 gap-3 px-8 text-center"
          >
            <MessageSquare className="w-9 h-9 text-[#E0DDD8]" strokeWidth={1.5} />
            <p className="text-[12px] text-[#C0BDB5] leading-relaxed italic">
              No conversations yet.
              <br />
              Start one with a teammate below.
            </p>
          </motion.div>
        ) : (
          <>
            {conversations.map((row, i) => (
              <motion.button
                key={row.conversationId}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                onClick={() => onSelect(row)}
                className="w-full flex items-start gap-3.5 px-6 py-4
                           hover:bg-black/[0.02] transition-colors text-left"
              >
                <div className="relative shrink-0">
                  <Avatar name={row.otherUser.full_name} role={row.otherUser.role} size="md" />
                  {row.unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#D4AF37] rounded-full border-2 border-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <p
                      className={`text-[12.5px] truncate ${
                        row.unreadCount > 0
                          ? "font-semibold text-[#1A1A1A]"
                          : "font-medium text-[#6B6B6B]"
                      }`}
                    >
                      {row.otherUser.full_name}
                    </p>
                    {row.lastMessageAt && (
                      <span className="text-[10px] text-[#C0BDB5] tabular-nums shrink-0">
                        {timeAgo(row.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-[12px] truncate leading-snug ${
                      row.unreadCount > 0 ? "text-[#6B6B6B]" : "text-[#B0ADA8]"
                    }`}
                  >
                    {row.lastMessage ?? (
                      <span className="italic text-[#C0BDB5]">No messages yet</span>
                    )}
                  </p>
                </div>
              </motion.button>
            ))}
          </>
        )}
      </div>

      <div className="border-t border-black/[0.05] px-5 py-3.5 shrink-0">
        <button
          type="button"
          onClick={onNew}
          className="
            w-full flex items-center gap-3
            bg-black/[0.03] border border-black/[0.06] rounded-xl
            px-4 py-2.5 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/[0.02]
            transition-colors group text-left
          "
        >
          <Plus className="w-3.5 h-3.5 text-[#C0BDB5] group-hover:text-[#D4AF37] transition-colors shrink-0" />
          <span className="text-[12px] text-[#C0BDB5] italic group-hover:text-[#9E9E9E] transition-colors">
            Send a message to the studio…
          </span>
        </button>
      </div>
    </div>
  );
}

export function WhisperBox({ currentUserId }: { currentUserId: string }) {
  const [view, setView] = useState<WhisperView>("list");
  const [conversations, setConversations] = useState<DirectConversationRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeThread, setActiveThread] = useState<ActiveThread | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const supabase = createClient();

  const loadConversations = useCallback(async () => {
    const data = await getMyDirectConversations();
    setConversations(data);
    setListLoading(false);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const channel = supabase
      .channel("whisperbox:list-refresh")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => { loadConversations(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSelectConversation = useCallback((row: DirectConversationRow) => {
    setOpenError(null);
    setActiveThread({
      conversationId: row.conversationId,
      peer: {
        id:        row.otherUser.id,
        full_name: row.otherUser.full_name,
        role:      row.otherUser.role,
      },
    });
    setView("thread");
  }, []);

  const handleSelectMember = useCallback(
    async (member: MemberInfo) => {
      setOpening(true);
      setOpenError(null);

      const { conversationId, error } = await getOrCreateDirectConversation(member.id);
      setOpening(false);

      if (error || !conversationId) {
        setOpenError(error ?? "Failed to open conversation. Please try again.");
        return;
      }

      setActiveThread({ conversationId, peer: member });
      setView("thread");
      loadConversations();
    },
    [loadConversations]
  );

  const handleBack = useCallback(() => {
    setView("list");
    setActiveThread(null);
    setOpenError(null);
    loadConversations();
  }, [loadConversations]);

  const unreadCount = conversations.reduce((s, c) => s + c.unreadCount, 0);

  const slide = {
    fromRight: { initial: { opacity: 0, x: 20 }, exit: { opacity: 0, x: 20 } },
    fromLeft:  { initial: { opacity: 0, x: -20 }, exit: { opacity: 0, x: -20 } },
    center:    { opacity: 1, x: 0 },
    trans:     { duration: 0.22, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  };

  const isDeep = view !== "list";
  const varIn    = isDeep  ? slide.fromRight.initial : slide.fromLeft.initial;
  const varOut   = isDeep  ? slide.fromRight.exit    : slide.fromLeft.exit;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <AnimatePresence>
        {openError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden shrink-0"
          >
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-600 leading-relaxed flex-1">
                {openError}
              </p>
              <button
                type="button"
                onClick={() => setOpenError(null)}
                className="text-[10px] text-red-400 hover:text-red-600 shrink-0"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex-1 min-h-0">
        <AnimatePresence mode="wait" initial={false}>

          {view === "list" && (
            <motion.div
              key="list"
              initial={varIn}
              animate={slide.center}
              exit={varOut}
              transition={slide.trans}
              className="absolute inset-0 flex flex-col"
            >
              <ConversationListView
                conversations={conversations}
                loading={listLoading}
                onSelect={handleSelectConversation}
                onNew={() => { setOpenError(null); setView("picker"); }}
                unreadCount={unreadCount}
              />
            </motion.div>
          )}

          {view === "picker" && (
            <motion.div
              key="picker"
              initial={slide.fromRight.initial}
              animate={slide.center}
              exit={slide.fromRight.exit}
              transition={slide.trans}
              className="absolute inset-0 flex flex-col"
            >
              <WhisperMemberPickerPanel
                onSelect={handleSelectMember}
                onBack={() => setView("list")}
                opening={opening}
              />
            </motion.div>
          )}

          {view === "thread" && activeThread && (
            <motion.div
              key={`thread-${activeThread.conversationId}`}
              initial={slide.fromRight.initial}
              animate={slide.center}
              exit={slide.fromRight.exit}
              transition={slide.trans}
              className="absolute inset-0 flex flex-col"
            >
              <WhisperThreadPanel
                thread={activeThread}
                currentUserId={currentUserId}
                onBack={handleBack}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

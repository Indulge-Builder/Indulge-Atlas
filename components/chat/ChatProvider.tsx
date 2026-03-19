"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import dynamic from "next/dynamic";
import {
  getTotalUnreadCount,
  getOrCreateDirectConversation,
} from "@/lib/actions/messages";

// ── Pending thread navigation ─────────────────────────────
// When openChatWithUser is called (e.g. from WhisperBox), we store
// the resolved thread here. GlobalChatDrawer reads it on mount/change
// and auto-navigates to that thread, then clears it.

export interface PendingThread {
  conversationId: string;
  peerName: string;
  peerRole: string;
}

interface ChatContextValue {
  openChat: () => void;
  closeChat: () => void;
  /** Deep-link: resolves or creates a DM with the given user then opens the drawer. */
  openChatWithUser: (userId: string, fullName: string, role: string) => Promise<void>;
  isOpen: boolean;
  unreadCount: number;
  /** Internal — consumed by GlobalChatDrawer to navigate on open */
  pendingThread: PendingThread | null;
  clearPendingThread: () => void;
  refreshUnread: () => void;
}

const ChatContext = createContext<ChatContextValue>({
  openChat: () => {},
  closeChat: () => {},
  openChatWithUser: async () => {},
  isOpen: false,
  unreadCount: 0,
  pendingThread: null,
  clearPendingThread: () => {},
  refreshUnread: () => {},
});

export function useChatDrawer() {
  return useContext(ChatContext);
}

const GlobalChatDrawerLazy = dynamic(
  () =>
    import("./GlobalChatDrawer").then((m) => m.GlobalChatDrawer),
  { ssr: false, loading: () => null },
);

export function ChatProvider({
  children,
  currentUserId,
}: {
  children: ReactNode;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingThread, setPendingThread] = useState<PendingThread | null>(null);
  const [drawerMounted, setDrawerMounted] = useState(false);

  const refreshUnread = useCallback(() => {
    getTotalUnreadCount().then(setUnreadCount);
  }, []);

  const openChat = useCallback(() => {
    setDrawerMounted(true);
    setOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setOpen(false);
    getTotalUnreadCount().then(setUnreadCount);
  }, []);

  const openChatWithUser = useCallback(
    async (userId: string, fullName: string, role: string) => {
      const { conversationId, error } = await getOrCreateDirectConversation(userId);
      if (error || !conversationId) return;
      setPendingThread({ conversationId, peerName: fullName, peerRole: role });
      setDrawerMounted(true);
      setOpen(true);
    },
    []
  );

  const clearPendingThread = useCallback(() => setPendingThread(null), []);

  // Initial unread count fetch
  useEffect(() => {
    getTotalUnreadCount().then(setUnreadCount);
  }, []);

  useEffect(() => {
    if (open) setDrawerMounted(true);
  }, [open]);

  useEffect(() => {
    if (pendingThread) setDrawerMounted(true);
  }, [pendingThread]);

  const contextValue = useMemo(
    () => ({
      openChat,
      closeChat,
      openChatWithUser,
      isOpen: open,
      unreadCount,
      pendingThread,
      clearPendingThread,
      refreshUnread,
    }),
    [
      openChat,
      closeChat,
      openChatWithUser,
      open,
      unreadCount,
      pendingThread,
      clearPendingThread,
      refreshUnread,
    ],
  );

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
      {drawerMounted && (
        <GlobalChatDrawerLazy
          currentUserId={currentUserId}
          externalOpen={open}
          onExternalClose={closeChat}
        />
      )}
    </ChatContext.Provider>
  );
}

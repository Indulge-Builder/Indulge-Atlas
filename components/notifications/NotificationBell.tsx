"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notifications";
import { useNotificationRealtime } from "@/lib/hooks/useNotificationRealtime";
import type { NotificationSummary } from "@/lib/types/database";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";

export interface NotificationBellProps {
  userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [ringing, setRinging] = useState(false);

  const reload = useCallback(async (opts?: { ring?: boolean }) => {
    const result = await getMyNotifications();
    if ("error" in result) {
      setSummary({ notifications: [], unreadCount: 0 });
    } else {
      setSummary(result);
    }
    setInitialLoad(false);
    if (opts?.ring) {
      setRinging(true);
      window.setTimeout(() => setRinging(false), 600);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useNotificationRealtime(userId, () => void reload({ ring: true }));

  const unreadCount = summary?.unreadCount ?? 0;

  async function handleMarkRead(id: string) {
    const res = await markNotificationRead(id);
    if ("error" in res) return;
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            notifications: prev.notifications.map((n) =>
              n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
            ),
            unreadCount: Math.max(0, prev.unreadCount - 1),
          }
        : prev,
    );
  }

  async function handleMarkAllRead() {
    const res = await markAllNotificationsRead();
    if ("error" in res) return;
    const now = new Date().toISOString();
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            notifications: prev.notifications.map((n) => ({
              ...n,
              read_at: n.read_at ?? now,
            })),
            unreadCount: 0,
          }
        : prev,
    );
  }

  const onClosePanel = useCallback(() => setOpen(false), []);

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded-lg p-2 text-white/50 transition-all hover:bg-white/8 hover:text-white/80"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <motion.div
          animate={{
            rotate: ringing ? [0, -15, 15, -10, 10, 0] : 0,
          }}
          transition={{ duration: 0.5 }}
        >
          <Bell className="h-5 w-5" />
        </motion.div>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <NotificationPanel
            key="notification-panel"
            boundaryRef={rootRef}
            notifications={summary?.notifications ?? []}
            unreadCount={summary?.unreadCount ?? 0}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
            onClose={onClosePanel}
            isLoading={initialLoad && summary === null}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

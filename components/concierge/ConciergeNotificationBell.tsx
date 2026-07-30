"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Ticket, CheckCircle2, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  getConciergeNotifications,
  markConciergeNotificationRead,
  markAllConciergeNotificationsRead,
} from "@/lib/actions/concierge-notifications";
import type {
  ConciergeTicketNotification,
  ConciergeTicketNotificationType,
} from "@/lib/types/database";

const TYPE_LABELS: Record<ConciergeTicketNotificationType, string> = {
  ticket_assigned: "Assigned",
  ticket_transferred: "Transferred",
  ticket_status_changed: "Status",
  ticket_note_added: "Note",
  invoice_due: "Invoice due",
};

/** Compact relative time: "just now", "5m", "3h", "2d", else a short date. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Bell for concierge_ticket_notifications. Distinct from the task-reminder bell:
 * uses the Ticket icon and deep-links each item to its ticket. Live-updates via
 * Supabase realtime (the table is in the realtime publication — migration 108).
 */
export function ConciergeNotificationBell({
  userId,
  dark = false,
}: {
  userId: string;
  dark?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ConciergeTicketNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const rows = await getConciergeNotifications(20);
    setItems(rows);
  }, []);

  // Initial load for the badge.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refetch when the panel opens.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [open, refresh]);

  // Realtime: refetch on a new notification for this user.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`concierge-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "concierge_ticket_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, supabase, refresh]);

  // Close on outside click.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  async function handleOpenTicket(n: ConciergeTicketNotification) {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)),
      );
      void markConciergeNotificationRead(n.id);
    }
    router.push(`/concierge/tickets/${n.ticket_id}`);
  }

  async function handleMarkAll() {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((x) => (x.read_at ? x : { ...x, read_at: now })));
    await markAllConciergeNotificationsRead();
  }

  return (
    <div className="relative" ref={panelRef}>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        className={cn(
          "relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-150",
          dark
            ? "text-white/40 hover:bg-white/8 hover:text-white/80"
            : "text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-black/[0.04]",
        )}
        aria-label="Ticket notifications"
        aria-expanded={open}
      >
        <Ticket className="w-4 h-4" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-[#D4AF37] text-[9px] font-bold text-[#1A1A1A] ring-2 ring-[#F9F9F6] tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-black/[0.06] bg-[#F9F9F6] shadow-xl overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-black/[0.05] flex items-center justify-between">
              <p className="text-[11px] font-semibold text-[#B0ADA8] uppercase tracking-[0.2em]">
                Ticket Notifications
              </p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="text-[11px] font-medium text-[#9E8A5A] hover:text-[#7A6A40] transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center">
                  <Clock className="w-6 h-6 mx-auto text-[#C8C4BE] animate-pulse" />
                  <p className="text-[12px] text-[#9E9E9E] mt-2">Loading…</p>
                </div>
              ) : items.length === 0 ? (
                <div className="p-6 text-center">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-[#C8C4BE]" />
                  <p className="text-[13px] text-[#9E9E9E] mt-2">No ticket notifications</p>
                  <p className="text-[11px] text-[#B0ADA8] mt-0.5">You&rsquo;re all caught up</p>
                </div>
              ) : (
                <ul className="divide-y divide-black/[0.04]">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleOpenTicket(n)}
                        className={cn(
                          "w-full text-left px-4 py-3 transition-colors hover:bg-black/[0.02]",
                          !n.read_at && "bg-[#D4AF37]/[0.06]",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {!n.read_at && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shrink-0" />
                          )}
                          <span className="text-[10px] font-semibold text-[#B0ADA8] uppercase tracking-wider">
                            {TYPE_LABELS[n.type] ?? "Ticket"}
                          </span>
                          <span className="ml-auto text-[11px] text-[#B0ADA8] tabular-nums">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        <p className="text-[13px] text-[#1A1A1A] font-medium leading-snug mt-1">
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-[11px] text-[#9E9E9E] mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

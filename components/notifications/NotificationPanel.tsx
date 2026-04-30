"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, RefreshCw, UserPlus, Users } from "lucide-react";
import { formatDistanceStrict } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { EmployeeDepartment, TaskNotification, TaskNotificationType } from "@/lib/types/database";
import { DEPARTMENT_CONFIG } from "@/lib/constants/departments";
import { getInitials } from "@/lib/utils";

const IST = "Asia/Kolkata";

function typeIcon(type: TaskNotificationType) {
  switch (type) {
    case "subtask_assigned":
      return <UserPlus className="w-3 h-3 text-emerald-400" aria-hidden />;
    case "subtask_updated":
      return <RefreshCw className="w-3 h-3 text-sky-400" aria-hidden />;
    case "group_task_added":
      return <Users className="w-3 h-3 text-indigo-400" aria-hidden />;
    default:
      return null;
  }
}

function navigateUrl(notification: TaskNotification): string {
  if (notification.type === "group_task_added") {
    return `/tasks/${notification.task_id}`;
  }
  if (notification.parent_task_id) {
    return `/tasks/${notification.parent_task_id}`;
  }
  if (notification.task_id) {
    return `/tasks/${notification.task_id}`;
  }
  return "/tasks";
}

export interface NotificationPanelProps {
  notifications: TaskNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
  isLoading?: boolean;
  /** Clicks outside this element (but inside document) close the panel */
  boundaryRef: React.RefObject<HTMLDivElement | null>;
}

export function NotificationPanel({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onClose,
  isLoading = false,
  boundaryRef,
}: NotificationPanelProps) {
  const router = useRouter();

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;

    const onMouseDown = (e: MouseEvent) => {
      if (!boundary.contains(e.target as Node)) onClose();
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [boundaryRef, onClose]);

  function handleRowClick(notification: TaskNotification) {
    onMarkRead(notification.id);
    router.push(navigateUrl(notification));
    onClose();
  }

  return (
    <motion.div
      role="dialog"
      aria-label="Notifications"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="absolute right-0 top-full z-50 mt-2 w-[380px] overflow-hidden rounded-xl border border-white/10 bg-[var(--surface-1)] shadow-2xl shadow-black/50"
    >
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <span className="text-sm font-semibold text-white">Notifications</span>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => onMarkAllRead()}
            className="text-xs text-white/40 transition-colors hover:text-white/70"
          >
            Mark all read
          </button>
        ) : (
          <span className="text-xs text-white/30">All caught up</span>
        )}
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {isLoading ? (
          <div className="py-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="mx-3 my-2 h-14 animate-pulse rounded bg-white/5" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <Bell className="h-8 w-8 text-white/15" aria-hidden />
            <p className="mt-2 text-sm text-white/30">No notifications</p>
          </div>
        ) : (
          notifications.map((n) => {
            const dept = n.actor?.department;
            const accent =
              dept && dept in DEPARTMENT_CONFIG
                ? DEPARTMENT_CONFIG[dept as EmployeeDepartment].accentColor
                : "#6366f1";
            const initials = getInitials(n.actor?.full_name?.trim() || "?");

            return (
              <button
                key={n.id}
                type="button"
                onClick={() => handleRowClick(n)}
                className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] ${
                  !n.read_at ? "bg-white/[0.02]" : ""
                }`}
              >
                {!n.read_at && (
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400"
                    aria-hidden
                  />
                )}
                {n.read_at && <span className="mt-1.5 w-2 shrink-0" aria-hidden />}

                <div className="relative shrink-0">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{
                      backgroundColor: `${accent}25`,
                      color: accent,
                    }}
                  >
                    {initials}
                  </div>
                  <div
                    className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-1)]"
                    aria-hidden
                  >
                    {typeIcon(n.type)}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-white/80">{n.title}</p>
                  {n.body ? (
                    <p className="mt-0.5 truncate text-xs text-white/45">{n.body}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-white/30">
                    {formatDistanceStrict(
                      toZonedTime(new Date(n.created_at), IST),
                      toZonedTime(new Date(), IST),
                      { addSuffix: true },
                    )}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-white/8 px-4 py-2.5 text-center text-xs text-white/25">
        Notifications are cleared after 30 days
      </div>
    </motion.div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getMyOverdueTaskCount } from "@/lib/actions/tasks";
import {
  TASK_ALERT_REFRESH_EVENT,
  type TaskAlertRefreshDetail,
} from "@/lib/task-alert-refresh";
import { ChevronRight } from "lucide-react";

const POLL_MS = 5 * 60 * 1000;

interface TaskAlertProviderProps {
  children: React.ReactNode;
}

// ── Realtime: adjust count from payload only (no count query) ─────────────

type TaskPayloadRow = {
  status?: string;
  atlas_status?: string;
  due_date?: string;
  assigned_to_users?: string[];
};

function isTaskIncomplete(row: TaskPayloadRow): boolean {
  const atlas = row.atlas_status;
  if (atlas)
    return atlas !== "done" && atlas !== "cancelled";
  return row.status === "pending";
}

function overdueContribution(
  row: TaskPayloadRow | null | undefined,
  userId: string,
  nowMs: number,
): 0 | 1 {
  if (!row || !isTaskIncomplete(row)) return 0;
  const assignees = row.assigned_to_users;
  if (!Array.isArray(assignees) || !assignees.includes(userId)) return 0;
  if (typeof row.due_date !== "string") return 0;
  return new Date(row.due_date).getTime() < nowMs ? 1 : 0;
}

function rowHasOverdueFields(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  const r = row as TaskPayloadRow;
  return (
    typeof r.status === "string" &&
    typeof r.due_date === "string" &&
    Array.isArray(r.assigned_to_users)
  );
}

function parseRefreshDetail(e: Event): TaskAlertRefreshDetail {
  if (!(e instanceof CustomEvent)) return { action: "fetch" };
  const d = e.detail as TaskAlertRefreshDetail | undefined;
  if (d?.action === "decrement" || d?.action === "increment" || d?.action === "fetch") return d;
  return { action: "fetch" };
}

/**
 * Adjusts count from websocket payload only — never queries Supabase.
 * Incomplete `old`/`new` rows (e.g. default replica identity) are skipped; 5m poll + CustomEvents reconcile.
 */
function applyTaskPayloadToOverdueCount(
  payload: {
    eventType: string;
    new: Record<string, unknown> | null;
    old: Record<string, unknown> | null;
  },
  userId: string,
  setCount: React.Dispatch<React.SetStateAction<number>>,
): void {
  const nowMs = Date.now();
  const ev = payload.eventType.toUpperCase();
  const recNew = payload.new;
  const recOld = payload.old;

  if (ev === "INSERT") {
    if (!rowHasOverdueFields(recNew)) return;
    const c = overdueContribution(recNew as TaskPayloadRow, userId, nowMs);
    if (c) setCount((p) => p + 1);
    return;
  }

  if (ev === "DELETE") {
    if (!rowHasOverdueFields(recOld)) return;
    const c = overdueContribution(recOld as TaskPayloadRow, userId, nowMs);
    if (c) setCount((p) => Math.max(0, p - 1));
    return;
  }

  if (ev === "UPDATE") {
    if (!recOld || !rowHasOverdueFields(recOld)) return;
    const oldFull = recOld as TaskPayloadRow;
    const after = (recNew ? { ...recOld, ...recNew } : recOld) as TaskPayloadRow;
    const beforeC = overdueContribution(oldFull, userId, nowMs);
    const afterC = overdueContribution(after, userId, nowMs);
    const delta = afterC - beforeC;
    if (delta !== 0) setCount((p) => Math.max(0, p + delta));
  }
}

export function TaskAlertProvider({ children }: TaskAlertProviderProps) {
  const [count, setCount] = useState(0);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(
    null,
  );

  const refresh = useCallback(() => {
    getMyOverdueTaskCount()
      .then((n) => setCount(typeof n === "number" ? n : 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const onExplicitRefresh = (e: Event) => {
      const { action } = parseRefreshDetail(e);
      if (action === "decrement") setCount((p) => Math.max(0, p - 1));
      else if (action === "increment") setCount((p) => p + 1);
      else refresh();
    };
    window.addEventListener(TASK_ALERT_REFRESH_EVENT, onExplicitRefresh);
    return () => window.removeEventListener(TASK_ALERT_REFRESH_EVENT, onExplicitRefresh);
  }, [refresh]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void supabase.auth.getUser().then((authRes: { data: { user: { id: string } | null } }) => {
      const user = authRes.data.user;
      if (cancelled || !user) return;
      const userId = user.id;

      const channel = supabase
        .channel(`overdue-task-alert:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
          },
          (payload: {
            eventType: string;
            new: Record<string, unknown> | null;
            old: Record<string, unknown> | null;
          }) => {
            applyTaskPayloadToOverdueCount(payload, userId, setCount);
          },
        )
        .subscribe();

      channelRef.current = channel;
    });

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [refresh]);

  return (
    <>
      {count > 0 && (
        <div
          className="sticky top-0 z-50 shrink-0 border-b border-rose-100 bg-rose-50 px-6 py-2.5 text-rose-800"
          role="status"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 text-sm">
            <span className="font-medium tracking-tight">
              You have {count} overdue follow-up{count === 1 ? "" : "s"}.
            </span>
            <Link
              href="/#daily-roster"
              className="inline-flex items-center gap-0.5 font-semibold text-rose-900 underline-offset-4 hover:underline"
            >
              Review Now
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      )}
      {children}
    </>
  );
}

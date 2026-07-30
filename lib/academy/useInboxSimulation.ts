"use client";

/**
 * The clock behind the live inbox.
 *
 * Ticks on a jittered interval, asks `nextInboxEvent` what should happen, and
 * applies it. All scheduling policy lives in `lib/academy/inbox.ts` (pure and
 * tested); this hook only owns timers, React state and the one server call.
 *
 * Pauses when the tab is hidden — a burst of "new messages" that all landed
 * while the trainee was in another window is noise, not immersion.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_TUNING,
  nextInboxEvent,
  nextTickDelay,
  type InboxClientState,
  type InboxEvent,
} from "@/lib/academy/inbox";
import { sendClientReminder } from "@/lib/actions/academy";
import type { AcademyClientRow } from "@/lib/academy/types";

export interface InboxSignals {
  /** Per-client live state, keyed by seedId. */
  state: Map<string, InboxClientState>;
  /** seedId that just received something — drives the row flash. */
  flashSeedId: string | null;
  totalUnread: number;
  markRead: (seedId: string) => void;
  /** Called when a conversation changes, so the inbox reflects it. */
  noteActivity: (seedId: string, patch: Partial<InboxClientState>) => void;
}

export function useInboxSimulation({
  clients,
  activeSeedId,
  enabled = true,
  onReminderDelivered,
}: {
  clients: AcademyClientRow[];
  activeSeedId: string | null;
  enabled?: boolean;
  /** Fires when a reminder lands in the conversation currently on screen. */
  onReminderDelivered?: (seedId: string, body: string) => void;
}): InboxSignals {
  const [state, setState] = useState<Map<string, InboxClientState>>(new Map());
  const [flashSeedId, setFlashSeedId] = useState<string | null>(null);

  const lastEventAtRef = useRef<number | null>(null);
  const arrivalsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * The tick loop reads these through refs rather than closing over them.
   *
   * They used to sit in the scheduling effect's dependency array, which meant
   * every state change restarted the countdown: opening a client calls
   * markRead, that replaces the state Map, the effect tears down and schedules
   * a *fresh* 2–5 minute timer. `apply` was worse — it depends on the caller's
   * `onReminderDelivered`, which the shell passes as an inline arrow, so it
   * changed identity on every parent render. Under active triage the timer was
   * reset faster than it could ever elapse and the inbox stayed silent.
   *
   * Mirrored in effects, not during render: a render can be discarded or
   * replayed under concurrent React, and a ref written on a thrown-away render
   * would leave the loop pointing at state that never committed. The timer runs
   * on a multi-minute delay, so settling one paint later costs nothing.
   */
  const activeRef = useRef(activeSeedId);
  const stateRef = useRef(state);

  useEffect(() => {
    activeRef.current = activeSeedId;
  }, [activeSeedId]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Seed live state from the server rows, preserving anything the simulation
  // has already accumulated for a client.
  useEffect(() => {
    setState((prev) => {
      const next = new Map(prev);
      for (const c of clients) {
        const existing = next.get(c.seedId);
        next.set(c.seedId, {
          seedId: c.seedId,
          status: c.status,
          lastActivityAt:
            existing?.lastActivityAt ??
            (c.lastActivity ? Date.parse(c.lastActivity) : null),
          unread: existing?.unread ?? 0,
          // A started conversation whose last word was the client's is waiting
          // on the intern. The list row cannot see turns, so approximate with
          // status and let `noteActivity` correct it once a thread is opened.
          awaitingReply: existing?.awaitingReply ?? c.status === "in_progress",
          reminderCount: existing?.reminderCount ?? 0,
          surfaced: existing?.surfaced ?? c.status !== "not_started",
        });
      }
      return next;
    });
  }, [clients]);

  const noteActivity = useCallback((seedId: string, patch: Partial<InboxClientState>) => {
    setState((prev) => {
      const cur = prev.get(seedId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(seedId, { ...cur, ...patch });
      return next;
    });
  }, []);

  const markRead = useCallback((seedId: string) => {
    setState((prev) => {
      const cur = prev.get(seedId);
      if (!cur || cur.unread === 0) return prev;
      const next = new Map(prev);
      next.set(seedId, { ...cur, unread: 0 });
      return next;
    });
  }, []);

  const apply = useCallback(
    async (event: InboxEvent) => {
      const now = Date.now();
      lastEventAtRef.current = now;

      if (event.kind === "arrival") {
        arrivalsRef.current += 1;
        setState((prev) => {
          const cur = prev.get(event.seedId);
          if (!cur) return prev;
          const next = new Map(prev);
          next.set(event.seedId, {
            ...cur,
            surfaced: true,
            unread: cur.unread + 1,
            lastActivityAt: now,
          });
          return next;
        });
        setFlashSeedId(event.seedId);
        return;
      }

      // A reminder is a real turn — persist it before showing anything, so the
      // inbox never claims a message the transcript does not contain.
      const row = clients.find((c) => c.seedId === event.seedId);
      if (!row?.sessionId || !event.text) return;

      const res = await sendClientReminder(row.sessionId, event.text);
      if (!res.success) {
        // Refused (already answered, closed, cap reached) — record the attempt
        // so the scheduler moves on instead of retrying the same client.
        noteActivity(event.seedId, { awaitingReply: false });
        return;
      }

      setState((prev) => {
        const cur = prev.get(event.seedId);
        if (!cur) return prev;
        const next = new Map(prev);
        const isOpen = activeRef.current === event.seedId;
        next.set(event.seedId, {
          ...cur,
          reminderCount: cur.reminderCount + 1,
          lastActivityAt: now,
          // Reading it as it lands means it is not unread.
          unread: isOpen ? cur.unread : cur.unread + 1,
        });
        return next;
      });
      setFlashSeedId(event.seedId);

      if (activeRef.current === event.seedId && res.data) {
        onReminderDelivered?.(event.seedId, res.data.body);
      }
    },
    [clients, noteActivity, onReminderDelivered],
  );

  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  /*
   * The tick loop. Deps are deliberately only `enabled` and `clients.length` —
   * both stable across ordinary interaction — so the countdown runs to
   * completion instead of being restarted by unrelated re-renders. Everything
   * that changes per-render is read from a ref at fire time, which also means
   * the callback always sees current state rather than a stale closure.
   */
  useEffect(() => {
    if (!enabled || clients.length === 0) return;

    let cancelled = false;

    const schedule = () => {
      timerRef.current = setTimeout(() => {
        if (cancelled) return;

        // Don't stack up events behind a hidden tab.
        if (typeof document !== "undefined" && document.hidden) {
          schedule();
          return;
        }

        const event = nextInboxEvent({
          clients: [...stateRef.current.values()],
          now: Date.now(),
          lastEventAt: lastEventAtRef.current,
          activeSeedId: activeRef.current,
          arrivalsSoFar: arrivalsRef.current,
          tuning: DEFAULT_TUNING,
        });

        if (event) void applyRef.current(event);
        schedule();
      }, nextTickDelay());
    };

    schedule();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, clients.length]);

  // Clear the flash after the animation has played.
  useEffect(() => {
    if (!flashSeedId) return;
    const t = setTimeout(() => setFlashSeedId(null), 1_800);
    return () => clearTimeout(t);
  }, [flashSeedId]);

  const totalUnread = [...state.values()].reduce((sum, c) => sum + c.unread, 0);

  return { state, flashSeedId, totalUnread, markRead, noteActivity };
}

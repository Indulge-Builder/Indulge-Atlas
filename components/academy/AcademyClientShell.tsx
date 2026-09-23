"use client";

/**
 * AcademyClientShell — the two-panel academy.
 *
 * Left: every client, one request each. Right: that client's conversation,
 * opened inline the moment the row is clicked. There is no intermediate card
 * and no second click — selecting a person opens their chat, exactly as a
 * messaging app does.
 *
 * The thread is fetched on selection rather than shipped up front: 176
 * conversations is far too much payload for content an intern opens one at a
 * time. No session row is written until they actually reply.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ClientList } from "@/components/academy/ClientList";
import { ClientConversation } from "@/components/academy/ClientConversation";
import { getAcademyClients, getAcademyClientThread } from "@/lib/actions/academy";
import { useInboxSimulation } from "@/lib/academy/useInboxSimulation";
import { sortInbox } from "@/lib/academy/inbox";
import {
  buildTrainingDays,
  daySections,
  unlockedSeedIds,
} from "@/lib/academy/trainingDays";
import type {
  AcademyClientList,
  AcademyClientThread,
} from "@/lib/academy/types";

export function AcademyClientShell({
  initial,
  training = false,
}: {
  initial: AcademyClientList;
  /**
   * Training mode: the roster is narrowed to the four-day curriculum and the
   * sidebar groups it by day. Everything else — the frame, the conversation
   * panel, the Freshdesk flow — is the Clients experience untouched, because it
   * is literally the same components.
   */
  training?: boolean;
}): JSX.Element {
  const [list, setList] = useState(initial);
  useEffect(() => setList(initial), [initial]);

  /**
   * Derived from the same rows the list renders, so the day counts and the
   * roster can never disagree. Null outside training mode.
   */
  const trainingView = useMemo(
    () =>
      training
        ? buildTrainingDays(
            list.clients.map((c) => ({
              seedId: c.seedId,
              taskNumber: c.taskNumber,
              name: c.name,
              requestTitle: c.requestTitle,
              status: c.status,
              sessionId: c.sessionId,
            })),
          )
        : null,
    [training, list.clients],
  );

  const openable = useMemo(
    () => (trainingView ? unlockedSeedIds(trainingView) : null),
    [trainingView],
  );

  /** In training mode the roster is the 40 taught tasks, not all 176. */
  const rosterClients = useMemo(() => {
    if (!trainingView) return list.clients;
    const inCurriculum = new Set(
      trainingView.days.flatMap((d) => d.tasks.map((t) => t.seedId)),
    );
    return list.clients.filter((c) => inCurriculum.has(c.seedId));
  }, [trainingView, list.clients]);

  // Open on the first client with unfinished business — where the intern
  // actually is, rather than the top of an alphabet.
  // In training mode only unlocked tasks are candidates — landing a trainee on
  // a locked Day 3 request would open a conversation they may not start.
  const openableClients = openable
    ? rosterClients.filter((c) => openable.has(c.seedId))
    : rosterClients;

  const firstOpen =
    openableClients.find((c) => c.status === "in_progress")?.seedId ??
    openableClients.find((c) => c.status === "not_started")?.seedId ??
    openableClients[0]?.seedId ??
    null;

  const [activeSeedId, setActiveSeedId] = useState<string | null>(firstOpen);
  const [thread, setThread] = useState<AcademyClientThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [mobileShowsChat, setMobileShowsChat] = useState(false);

  const load = useCallback(async (seedId: string) => {
    setLoading(true);
    try {
      const res = await getAcademyClientThread(seedId);
      if (!res.success || !res.data) {
        toast.error(res.success ? "Could not open that conversation." : res.error);
        setThread(null);
        return;
      }
      setThread(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Re-read the whole list from the server.
   *
   * `load` refreshes only the open thread, so the roster and the "N of 176
   * handled" overview stay on whatever they were rendered with. After a ticket
   * is accepted those are precisely the numbers that changed, so an optimistic
   * row patch alone leaves the counter stale until a manual reload.
   */
  const refreshList = useCallback(async () => {
    const res = await getAcademyClients();
    if (res.success && res.data) setList(res.data);
  }, []);

  useEffect(() => {
    if (!activeSeedId) {
      setThread(null);
      return;
    }
    void load(activeSeedId);
  }, [activeSeedId, load]);

  // The live inbox: requests surface and unanswered clients chase while the
  // trainee works elsewhere. Reminders are persisted turns, so if one lands in
  // the conversation on screen we reload it rather than faking the bubble.
  const inbox = useInboxSimulation({
    clients: list.clients,
    activeSeedId,
    onReminderDelivered: (seedId) => {
      if (seedId === activeSeedId) void load(seedId);
    },
  });

  const handleSelect = useCallback(
    (seedId: string) => {
      // Belt to the server's braces: a locked task is not selectable here, and
      // the server refuses it independently.
      if (openable && !openable.has(seedId)) return;
      setActiveSeedId(seedId);
      setMobileShowsChat(true);
      inbox.markRead(seedId);
    },
    [inbox, openable],
  );

  // Opening a conversation clears its badge.
  useEffect(() => {
    if (activeSeedId) inbox.markRead(activeSeedId);
  }, [activeSeedId, inbox]);

  /** Reflect status changes in the list without a full page reload. */
  const patchClient = useCallback(
    (seedId: string, patch: Partial<AcademyClientList["clients"][number]>) => {
      setList((prev) => ({
        ...prev,
        clients: prev.clients.map((c) => (c.seedId === seedId ? { ...c, ...patch } : c)),
      }));
    },
    [],
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-xl border border-chat-divider bg-chat-panel shadow-card">
      <ClientList
        clients={
          trainingView ? rosterClients : sortInbox(list.clients, inbox.state)
        }
        inboxState={inbox.state}
        flashSeedId={inbox.flashSeedId}
        totalUnread={inbox.totalUnread}
        overview={list.overview}
        activeSeedId={activeSeedId}
        onSelect={handleSelect}
        dayGroups={trainingView ? daySections(trainingView) : undefined}
        headline={
          trainingView
            ? {
                title: "Training",
                subtitle: `${trainingView.progress.completed} of ${trainingView.progress.total} completed · ${trainingView.progress.percent}% · Day ${trainingView.currentDay}`,
              }
            : undefined
        }
        className={cn(
          "w-full shrink-0 border-r border-chat-divider md:w-[340px] lg:w-[380px]",
          mobileShowsChat ? "hidden md:flex" : "flex",
        )}
      />

      <div className={cn("min-w-0 flex-1", mobileShowsChat ? "flex" : "hidden md:flex")}>
        {loading && !thread ? (
          <div className="flex h-full w-full items-center justify-center bg-chat-canvas">
            <Loader2 className="size-5 animate-spin text-chat-ink-muted" aria-hidden />
            <span className="sr-only">Opening conversation</span>
          </div>
        ) : thread ? (
          <ClientConversation
            key={thread.seedId}
            thread={thread}
            onBack={() => setMobileShowsChat(false)}
            onSessionStarted={(sessionId) =>
              patchClient(thread.seedId, { status: "in_progress", sessionId })
            }
            onClosed={() => {
              // Closing the conversation does NOT complete the request — the
              // ticket write-up still has to be accepted. `load` then replaces
              // this optimistic patch with the server's real status.
              patchClient(thread.seedId, { status: "awaiting_ticket" });
              void load(thread.seedId);
            }}
            onTicketReviewed={(passed) => {
              // An accepted ticket is the finish line — this is the only moment
              // a request becomes completed. A rejection ("sent back for
              // revision") leaves it outstanding, exactly as before.
              patchClient(thread.seedId, {
                status: passed ? "completed" : "awaiting_ticket",
              });
              void load(thread.seedId);
              // The overview counter and every other row are server-derived,
              // so re-read rather than trying to recompute them here.
              void refreshList();
            }}
            className="w-full"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-chat-canvas px-6 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-chat-bubble-in shadow-sm">
              <MessageSquare className="size-6 text-chat-ink-muted" aria-hidden />
            </div>
            <p className="font-serif text-[16px] text-chat-ink">Choose a client</p>
            <p className="max-w-xs text-[13px] text-chat-ink-muted">
              Each client has one request waiting. Open one and reply as their concierge.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

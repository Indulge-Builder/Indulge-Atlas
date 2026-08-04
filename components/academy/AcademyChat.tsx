"use client";

/**
 * AcademyChat — the live training surface.
 *
 * Owns the whole conversation loop:
 *   optimistic intern bubble → POST /api/academy/chat → stream the persona's
 *   reply into a live-growing client bubble → commit it to the local transcript.
 *
 * The wire is **plain text**, not SSE and not JSON: deltas are read straight off
 * `res.body.getReader()`. Two response headers change the UI's mode —
 * `X-Academy-Degraded` (the persona model was unavailable, a canned line was
 * served) and `X-Academy-Turn-Cap` (that was the intern's final allowed turn).
 *
 * Closing the session is a one-way door: `endAcademySession` locks the
 * transcript and runs the evaluator, then `router.refresh()` lets the RSC swap
 * this component out for `AcademyReport`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type JSX,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AcademyBubble, TypingIndicator } from "@/components/academy/AcademyBubble";
import {
  AcademyComposer,
  type ComposerComposition,
  type PendingAttachment,
} from "@/components/academy/AcademyComposer";
import {
  endAcademySession,
  startAcademySession,
  uploadAcademyAttachment,
} from "@/lib/actions/academy";
import { typingDelayFor } from "@/lib/academy/mentor";
import { chunkDelay, splitClientMessage } from "@/lib/academy/messageSplit";
import { cn } from "@/lib/utils";
import { formatIST } from "@/lib/utils/time";
import type {
  AcademyDifficulty,
  AcademyScenarioCard,
  TrainingAttachment,
  TrainingTurn,
} from "@/lib/types/database";

const countFormatter = new Intl.NumberFormat("en-IN");

const DIFFICULTY_PILL: Record<AcademyDifficulty, string> = {
  easy: "bg-success-light text-success ring-success/25",
  medium: "bg-warning-light text-warning ring-warning/25",
  hard: "bg-danger-light text-danger ring-danger/25",
};

/** Stable-enough local ids for optimistic / just-streamed turns. */
function localId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeDate(timestamp: string | null | undefined): string | null {
  if (!timestamp?.trim()) return null;
  try {
    return formatIST(timestamp, "d MMM yyyy");
  } catch {
    return null;
  }
}

// ── Small presentational pieces ───────────────────────────────────────────────

function Pill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-black/55 ring-1 ring-surface-border",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: "muted" | "warning";
  icon: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t px-4 py-2.5 text-[12px] sm:px-5",
        tone === "warning"
          ? "border-warning/25 bg-warning-light text-warning"
          : "border-surface-border bg-surface-subtle text-black/60",
      )}
      role="status"
    >
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="leading-snug">{children}</span>
    </div>
  );
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export function AcademyChat({
  sessionId,
  seedId,
  display,
  initialTurns,
  turnCap,
  readOnly = false,
  observingName = null,
  onSessionStarted,
  onClosed,
  chrome = true,
}: {
  /**
   * Null when the intern has opened a client but not replied yet. The session is
   * created on their first message, so browsing the list never writes rows.
   */
  sessionId: string | null;
  /** Required when `sessionId` is null — identifies which client to start. */
  seedId?: string;
  display: AcademyScenarioCard;
  initialTurns: TrainingTurn[];
  turnCap: number;
  /** Trainer viewing someone else's transcript — no composer, no writes. */
  readOnly?: boolean;
  /**
   * Whose session this is, when a trainer is observing someone else's. Absent
   * when the transcript is read-only merely because it is finished.
   */
  observingName?: string | null;
  onSessionStarted?: (sessionId: string) => void;
  onClosed?: () => void;
  /**
   * False when embedded inside a panel that already provides the header and
   * frame — avoids stacking a second header above the conversation.
   */
  chrome?: boolean;
}): JSX.Element {
  const router = useRouter();

  // Tracks the live id once a lazily-created session exists.
  const [liveSessionId, setLiveSessionId] = useState<string | null>(sessionId);
  useEffect(() => setLiveSessionId(sessionId), [sessionId]);

  const [turns, setTurns] = useState<TrainingTurn[]>(initialTurns);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [pendingTurnId, setPendingTurnId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [turnCapHit, setTurnCapHit] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isClosing, startClosing] = useTransition();

  /**
   * How many turns have "arrived". A freshly opened conversation delivers its
   * messages one at a time behind a typing indicator rather than dumping the
   * whole transcript, so opening a client feels like receiving a message.
   * A conversation with history is shown in full — nobody wants to sit through
   * a replay of work they already did.
   */
  const [deliveredCount, setDeliveredCount] = useState(
    initialTurns.length > 1 ? initialTurns.length : 0,
  );
  const [clientTyping, setClientTyping] = useState(false);

  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** False once the intern scrolls up to re-read — we stop yanking them down. */
  const stickToBottomRef = useRef(true);

  /**
   * Adopt a server refresh — but never let it SHRINK the transcript.
   *
   * This used to replace local state outright. `previewTurns` upstream is a new
   * array identity on most shell renders, and the shell re-renders on every
   * inbox tick (every 2-5 minutes), so the whole conversation — adopted
   * opening, every intern turn, every reply — was replaced by the single
   * preview bubble while the trainee was working. The rows were never lost
   * (training_turns is append-only) but the screen was.
   *
   * Append-only is exactly why this guard is sound: a server transcript can
   * never legitimately be shorter than what we already hold, so a shorter
   * payload is stale by definition and is ignored.
   */
  useEffect(() => {
    if (inFlightRef.current) return;
    setTurns((prev) => (initialTurns.length >= prev.length ? initialTurns : prev));
  }, [initialTurns]);

  // Abandon any in-flight stream when the surface unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  /**
   * The opening request, expanded into the two-to-four bubbles a person would
   * actually have sent.
   *
   * Display only — the transcript keeps one row, so the evaluator, the ticket
   * reviewer and the persona all still read exactly what they read before.
   *
   * Scoped BY POSITION — the first turn only — not by whether the intern has
   * replied yet.
   *
   * The earlier version branched on `turns.some(t => t.role === "intern")`,
   * which meant the rendered array changed shape the instant the trainee sent
   * anything: it collapsed from N chunks back to one turn, no React key
   * survived, and every bubble unmounted and re-animated at exactly the moment
   * they pressed Send. Keying off position keeps the shape stable for the whole
   * conversation, so the opening is split once and stays split.
   */
  const deliveryTurns = useMemo(
    () =>
      turns.flatMap((turn, index) => {
        if (index !== 0 || turn.role !== "client") return [turn];
        const chunks = splitClientMessage(turn.body);
        if (chunks.length <= 1) return [turn];

        return chunks.map((body, i) => ({
          ...turn,
          // Derived ids keep React keys stable without touching the real row.
          id: `${turn.id}#${i}`,
          body,
          // Media belongs with the closing bubble, not repeated on each.
          attachments: i === chunks.length - 1 ? turn.attachments : [],
        }));
      }),
    [turns],
  );

  /** Only the turns that have "arrived" are rendered. */
  const visibleTurns = useMemo(
    () => deliveryTurns.slice(0, Math.max(deliveredCount, 0)),
    [deliveryTurns, deliveredCount],
  );

  // Stage the arrival of undelivered turns: show the typing indicator for a
  // length-appropriate beat, then let the message land. Runs one message at a
  // time so a burst arrives in sequence rather than all at once.
  useEffect(() => {
    if (deliveredCount >= deliveryTurns.length) {
      setClientTyping(false);
      return;
    }
    const next = deliveryTurns[deliveredCount];
    if (!next) return;

    // The intern's own messages never need a typing beat — they wrote them.
    if (next.role === "intern") {
      setDeliveredCount((n) => n + 1);
      return;
    }

    /*
     * A continuation of a split request waits far longer than a normal beat —
     * the client is thinking of the next thing to add, not typing one message.
     * The composer stays open throughout, so the trainee can answer the first
     * line without waiting for the rest.
     */
    const isContinuation = next.id.includes("#") && !next.id.endsWith("#0");
    const wait = isContinuation
      ? chunkDelay()
      : typingDelayFor(next.body, { min: 700, max: 2200 });

    setClientTyping(true);
    const timer = setTimeout(() => {
      setClientTyping(false);
      setDeliveredCount((n) => n + 1);
    }, wait);

    return () => clearTimeout(timer);
  }, [deliveryTurns, deliveredCount]);

  // Keep the delivery pointer sane when the transcript is replaced wholesale
  // (session start, server refresh) rather than appended to.
  useEffect(() => {
    setDeliveredCount((n) => Math.min(n, deliveryTurns.length));
  }, [deliveryTurns.length]);

  const internTurnCount = useMemo(
    () => turns.filter((turn) => turn.role === "intern").length,
    [turns],
  );
  const remainingTurns = Math.max(0, turnCap - internTurnCount);
  const capReached = turnCapHit || remainingTurns === 0;
  const composerDisabled = sessionClosed || capReached;

  /**
   * Index of the newest client turn — everything before it has been "read".
   * Indexed over the delivered array, since that is what the map below renders.
   */
  const lastClientIndex = useMemo(() => {
    for (let i = deliveryTurns.length - 1; i >= 0; i -= 1) {
      if (deliveryTurns[i].role === "client") return i;
    }
    return -1;
  }, [deliveryTurns]);

  const threadDate = safeDate(turns[0]?.created_at);

  const handleThreadScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // Pin to the newest message whenever the thread grows or a token lands.
  // Token-by-token growth scrolls instantly — queued smooth animations fight
  // each other and make the thread stutter.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: streaming !== null ? "auto" : "smooth",
    });
  }, [turns.length, streaming, sending]);

  const handleSend = useCallback(
    async (
      text: string,
      attachment: PendingAttachment | null,
      composition?: ComposerComposition,
    ) => {
      if (inFlightRef.current || readOnly || sessionClosed || capReached) return;
      inFlightRef.current = true;
      // Sending is an explicit intent to follow the conversation again.
      stickToBottomRef.current = true;

      // First reply to this client — create the session now rather than when the
      // row was merely opened, so browsing leaves nothing behind.
      let activeSessionId = liveSessionId;
      if (!activeSessionId) {
        if (!seedId) {
          toast.error("This conversation cannot be started.");
          inFlightRef.current = false;
          return;
        }
        const started = await startAcademySession(seedId);
        if (!started.success || !started.data) {
          toast.error(started.success ? "Could not start this conversation." : started.error);
          inFlightRef.current = false;
          return;
        }
        activeSessionId = started.data.sessionId;
        setLiveSessionId(activeSessionId);
        onSessionStarted?.(activeSessionId);
        // Adopt the server's opening line so the previewed bubble and the
        // persisted transcript never disagree.
        setTurns([
          {
            id: `opening-${activeSessionId}`,
            session_id: activeSessionId,
            role: "client",
            body: started.data.openingMessage,
            seq: 1,
            created_at: new Date().toISOString(),
            attachments: [],
          },
        ]);
      }

      // Upload first — a turn must never be recorded referencing media that
      // failed to store. The local object URL powers the optimistic bubble so
      // the intern sees their photo immediately.
      let uploaded: TrainingAttachment | null = null;
      if (attachment) {
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append("sessionId", activeSessionId);
          fd.append("file", attachment.file);
          const res = await uploadAcademyAttachment(fd);
          if (!res.success || !res.data) {
            toast.error(res.success ? "Upload failed." : res.error);
            URL.revokeObjectURL(attachment.previewUrl);
            inFlightRef.current = false;
            setUploading(false);
            return;
          }
          uploaded = { ...res.data, signedUrl: attachment.previewUrl };
        } catch {
          toast.error("Could not upload that file.");
          URL.revokeObjectURL(attachment.previewUrl);
          inFlightRef.current = false;
          setUploading(false);
          return;
        }
        setUploading(false);
      }

      const optimistic: TrainingTurn = {
        id: localId("local-intern"),
        session_id: activeSessionId,
        role: "intern",
        body: text || (uploaded?.kind === "video" ? "[shared a video]" : uploaded ? "[shared a photo]" : ""),
        seq: (turns.at(-1)?.seq ?? 0) + 1,
        created_at: new Date().toISOString(),
        attachments: uploaded ? [uploaded] : [],
      };

      setTurns((prev) => [...prev, optimistic]);
      setPendingTurnId(optimistic.id);
      setSending(true);
      setStreaming(null);

      const controller = new AbortController();
      abortRef.current = controller;

      /** Drop the optimistic bubble — the server never recorded this turn. */
      const rollback = () => {
        setTurns((prev) => prev.filter((turn) => turn.id !== optimistic.id));
      };

      try {
        const res = await fetch("/api/academy/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSessionId,
            message: text,
            // Strip signedUrl — the server re-derives access; never trust a URL
            // supplied by the browser.
            attachments: uploaded
              ? [{
                  path: uploaded.path,
                  kind: uploaded.kind,
                  mime: uploaded.mime,
                  name: uploaded.name,
                  size: uploaded.size,
                }]
              : [],
            // What the editor observed while this reply was written. Optional —
            // the server treats its absence as "not reported", not as zero.
            composition: composition ?? null,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const payload = (await res
            .json()
            .catch(() => null)) as { error?: string } | null;
          const message = payload?.error ?? "Could not reach the client.";
          rollback();
          if (res.status === 409) {
            setSessionClosed(true);
            toast.warning(message, {
              description: "Close the conversation to see your review.",
            });
          } else {
            toast.error(message, {
              description: "Your message was not sent — please try again.",
            });
          }
          return;
        }

        if (res.headers.get("X-Academy-Turn-Cap") === "1") setTurnCapHit(true);
        if (res.headers.get("X-Academy-Degraded") === "1") {
          setDegraded(true);
          toast.warning("The simulated client is running in fallback mode.", {
            id: "academy-degraded",
            description: "Your turns are still recorded and will be scored.",
          });
        }

        if (!res.body) {
          rollback();
          toast.error("The client's reply could not be read.");
          return;
        }

        // text/plain deltas — append as they arrive, no framing to parse.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          accumulated += chunk;
          setStreaming(accumulated);
        }
        accumulated += decoder.decode();

        const body = accumulated.trim();
        if (body) {
          setTurns((prev) => [
            ...prev,
            {
              id: localId("local-client"),
              session_id: activeSessionId,
              role: "client",
              body,
              seq: (prev.at(-1)?.seq ?? optimistic.seq) + 1,
              created_at: new Date().toISOString(),
            },
          ]);
          /*
           * Deliver it in the SAME batch it is appended in.
           *
           * Without this, the `finally` below unmounts the streaming bubble in
           * the same commit — while the delivery pointer still trails the array
           * by one, so the new turn is not in `visibleTurns` either, and the
           * typing indicator is off. That commit renders nothing where the
           * reply was, and it paints. The staging effect then re-showed the
           * identical text 0.7-2.2s later behind a typing indicator: the
           * "appears, disappears, reappears" on every single reply.
           *
           * The text was streamed live, so it has already been read — staging
           * it again was never right.
           */
          setDeliveredCount((n) => n + 1);
        } else {
          toast.warning("The client went quiet — no reply came back.");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // Navigated away or closed the session mid-stream — nothing to report.
          return;
        }
        rollback();
        toast.error("Network error", {
          description: "Your message was not sent — please try again.",
        });
      } finally {
        abortRef.current = null;
        inFlightRef.current = false;
        setPendingTurnId(null);
        setStreaming(null);
        setSending(false);
      }
    },
    [capReached, readOnly, sessionClosed, liveSessionId, seedId, onSessionStarted, turns],
  );

  const handleConfirmClose = useCallback(() => {
    setConfirmOpen(false);
    startClosing(async () => {
      /*
       * The try/catch is load-bearing, not defensive habit. The scoring overlay
       * is driven by this transition's pending state and has NO dismiss handler
       * — it is meant to block while the evaluator runs. If this callback threw
       * (a network failure, a rejected server action), the transition would
       * never settle and that overlay would cover the conversation permanently,
       * with no click target and no Escape route out of it.
       */
      try {
        const res = await endAcademySession(liveSessionId ?? "");
        if (!res.success) {
          toast.error(res.error);
          return;
        }
        setSessionClosed(true);
        if (res.data?.reviewError) {
          toast.warning("Session closed, but scoring failed.", {
            description: res.data.reviewError,
          });
        } else {
          toast.success("Conversation closed — write up the ticket to finish.");
        }
        /*
         * Load-bearing: the parent owns `thread` in client state (fetched via a
         * server action), so `router.refresh()` alone does NOT update it.
         * Without this call the status stays `in_progress`, and the header's
         * Freshdesk icon — the only way to reach the ticket form — never
         * appears.
         */
        onClosed?.();
        router.refresh();
      } catch (err) {
        console.error("[AcademyChat] closing the session failed:", err);
        toast.error("Could not close the conversation", {
          description: "Nothing was lost — try again in a moment.",
        });
      }
    });
  }, [router, liveSessionId, onClosed]);

  // Escape dismisses the confirmation without ending the drill.
  useEffect(() => {
    if (!confirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen]);

  const monogram = (display.archetype || display.title || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden",
        // Embedded in a client conversation the surrounding panel already owns
        // the frame, so drop the card chrome and let the thread sit flush.
        chrome
          ? "rounded-xl border border-surface-border bg-surface shadow-card"
          : "bg-chat-canvas",
      )}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      {chrome ? (
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-surface-border bg-surface px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-gold/12 font-serif text-base font-semibold text-brand-gold ring-1 ring-brand-gold/25"
            aria-hidden="true"
          >
            {monogram}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-serif text-[17px] font-semibold tracking-tight text-chat-ink">
              {display.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Pill>{display.archetype}</Pill>
              <Pill>{display.vertical}</Pill>
              <Pill className={cn("bg-transparent", DIFFICULTY_PILL[display.difficulty])}>
                {display.difficulty}
              </Pill>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-serif text-[15px] font-semibold tabular-nums text-chat-ink">
            {countFormatter.format(internTurnCount)}
            <span className="text-chat-ink-muted">
              {" / "}
              {countFormatter.format(turnCap)}
            </span>
          </p>
          <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.1em] text-chat-ink-muted">
            Turns used
          </p>
        </div>
      </header>
      ) : null}

      {/* ── Thread ───────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleThreadScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth bg-chat-canvas px-3 py-5 sm:px-5"
      >
        {/* `justify-start` keeps a short thread pinned to the top with normal
            padding instead of stretching to fill the panel. */}
        <div className="mx-auto flex w-full max-w-3xl flex-col justify-start gap-2.5">
          {threadDate && (
            <div className="mb-1 flex justify-center">
              <span className="rounded-full bg-surface/80 px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-chat-ink-muted ring-1 ring-surface-border">
                {threadDate}
              </span>
            </div>
          )}

          {turns.length === 0 && !sending && (
            <div className="mx-auto mt-10 max-w-sm rounded-lg border border-dashed border-surface-border bg-surface/70 px-5 py-6 text-center">
              <Sparkles
                className="mx-auto size-5 text-brand-gold"
                aria-hidden="true"
              />
              <p className="mt-2.5 font-serif text-[15px] font-semibold text-chat-ink">
                No messages yet
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-black/55">
                This drill has not been opened by the client. Reply below to
                start the conversation.
              </p>
            </div>
          )}

          {visibleTurns.map((turn, index) => (
            <motion.div
              key={turn.id}
              // Messages land rather than blink into place. Once a bubble has
              // arrived it stays put — animating on every render would make the
              // thread twitch as tokens stream in.
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
            <AcademyBubble
              side={turn.role}
              body={turn.body}
              timestamp={turn.created_at}
              pending={turn.id === pendingTurnId}
              attachments={turn.attachments ?? []}
              read={
                turn.role === "intern" &&
                (streaming !== null || index < lastClientIndex)
              }
            />
            </motion.div>
          ))}

          {streaming !== null && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <AcademyBubble side="client" body={streaming} />
            </motion.div>
          )}

          {/* "Client is typing…" — shown while waiting for the reply to begin,
              and during the deliberate beat before a staged message arrives. */}
          {/* Belt and braces for the blank-frame class of bug: if anything is
              still undelivered, something must be on screen saying so. A commit
              can then never contain neither a bubble nor an indicator. */}
          {(clientTyping ||
            (sending && streaming === null) ||
            deliveredCount < deliveryTurns.length) && <TypingIndicator />}
        </div>

        {/* Scoring overlay — the transcript stays visible but goes quiet. */}
        <AnimatePresence>
          {isClosing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-chat-canvas/85 backdrop-blur-[2px]"
            >
              <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
                <Loader2
                  className="size-6 animate-spin text-brand-gold"
                  aria-hidden="true"
                />
                <p className="font-serif text-[16px] font-semibold text-chat-ink">
                  Scoring your conversation…
                </p>
                <p className="text-[13px] leading-relaxed text-black/55">
                  The evaluator is reading the full transcript against the
                  rubric. This takes a few seconds.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Status strips ────────────────────────────────────────────────── */}
      {degraded && !readOnly && !sessionClosed && (
        <Notice
          tone="warning"
          icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}
        >
          The simulated client is in fallback mode — replies may be generic.
          Your turns are still recorded and scored.
        </Notice>
      )}

      {capReached && !sessionClosed && !readOnly && (
        <Notice
          tone="warning"
          icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}
        >
          You have used all {countFormatter.format(turnCap)} turns. Close the
          conversation to receive your review.
        </Notice>
      )}

      {/* ── Dock ─────────────────────────────────────────────────────────── */}
      {readOnly ? (
        <Notice
          tone="muted"
          icon={<Lock className="size-3.5" aria-hidden="true" />}
        >
          {/* `readOnly` is set for two different reasons — someone else's
              session, or your own finished one. Saying "another trainee's
              session" to an intern re-reading their own work is simply wrong,
              so the reason has to be carried, not assumed. */}
          {observingName ? (
            <>
              Read-only transcript — you are reviewing {observingName}&apos;s
              session. Messages cannot be edited or sent.
            </>
          ) : (
            <>
              Read-only transcript — this conversation is closed. Messages
              cannot be edited or sent.
            </>
          )}
        </Notice>
      ) : sessionClosed ? (
        <Notice
          tone="muted"
          icon={<Lock className="size-3.5" aria-hidden="true" />}
        >
          This conversation is closed and locked. Your review will appear here
          once scoring finishes.
        </Notice>
      ) : (
        <AcademyComposer
          disabled={composerDisabled}
          pending={sending}
          remainingTurns={remainingTurns}
          onSend={handleSend}
          uploading={uploading}
          onClose={() => setConfirmOpen(true)}
          closing={isClosing}
        />
      )}

      {/* ── Close confirmation ───────────────────────────────────────────── */}
      {/*
        * Deliberately NOT wrapped in AnimatePresence.
        *
        * AnimatePresence owns the lifetime of its children: it keeps an exiting
        * child mounted until the exit animation finishes. If that animation is
        * ever interrupted — a parent remount, a fast unmount — the backdrop is
        * left on screen while `confirmOpen` is already false. At that point the
        * UI is trapped: this element's onClick calls setConfirmOpen(false),
        * which is a no-op for an unchanged value, so React never re-renders and
        * the overlay never leaves. The Escape handler early-returns on
        * `!confirmOpen` too. The only way out is a page refresh.
        *
        * Presence is therefore driven straight off `confirmOpen`, so the
        * backdrop cannot outlive the state. The entrance animation on the card
        * below is kept — an entrance cannot trap anything. Losing the 150ms
        * fade-out is a trade worth making for a blocking overlay.
        */}
      {confirmOpen && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="academy-close-title"
              className="w-full max-w-sm rounded-xl border border-surface-border bg-surface p-5 shadow-elevated"
              onClick={(event) => event.stopPropagation()}
            >
              <h3
                id="academy-close-title"
                className="font-serif text-[17px] font-semibold text-chat-ink"
              >
                Close this conversation?
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-black/60">
                The transcript is locked and sent to the evaluator immediately.
                You cannot reopen this drill or add another message.
              </p>

              {sending && (
                <p className="mt-3 flex items-center gap-2 rounded-md bg-surface-subtle px-3 py-2 text-[12px] text-black/60">
                  <Loader2
                    className="size-3.5 shrink-0 animate-spin text-brand-gold"
                    aria-hidden="true"
                  />
                  Waiting for the client&apos;s reply to finish…
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="h-9 cursor-pointer rounded-md border border-surface-border px-4 text-sm font-medium text-chat-ink transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2"
                >
                  Keep going
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClose}
                  disabled={sending}
                  className={cn(
                    "h-9 rounded-md px-4 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2",
                    sending
                      ? "cursor-not-allowed bg-surface-subtle text-chat-ink-muted ring-1 ring-surface-border"
                      : "cursor-pointer bg-brand-gold text-surface hover:bg-brand-gold-dark",
                  )}
                >
                  End &amp; score
                </button>
              </div>
            </motion.div>
          </div>
        )}
    </div>
  );
}

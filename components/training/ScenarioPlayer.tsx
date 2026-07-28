"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { WhatsAppFrame, Bubble } from "@/components/training/WhatsAppFrame";
import { ReportCard } from "@/components/training/ReportCard";
import { ReplayClock, DEFAULT_REPLAY_SPEED, formatOffset } from "@/training/replay/clock";
import { scoreAttempt } from "@/training/scoring/score";
import { isTransitionAllowed } from "@/lib/concierge/ticketStateMachine";
import {
  CONCIERGE_STATUS_LABELS,
  CONCIERGE_TICKET_STATUSES,
  type ConciergeTicketStatus,
} from "@/lib/types/database";
import type { AttemptReport, InternAction, Scenario } from "@/training/types";

type Phase = "intro" | "playing" | "finished";
type Attachment =
  | { kind: "image"; url: string; caption?: string }
  | { kind: "file"; name: string; caption?: string };
type FeedItem = { side: "member" | "agent" | "system"; text: string; atMs: number; attachment?: Attachment };

/** What the API needs: images as base64 (bytes never persisted), files by name. */
type AttachmentPayload =
  | { kind: "image"; mediaType: string; dataBase64: string; caption?: string }
  | { kind: "file"; name: string; caption?: string };

/** A file the intern picked and is composing a share for. */
type Pending =
  | { kind: "image"; url: string; mediaType: string; dataBase64: string; name: string }
  | { kind: "file"; name: string };

const REPLIES = [
  { id: "ack", label: "Acknowledge + ask details", text: "Hi! Thanks for reaching out — I'd be glad to help. Let me confirm a couple of details." },
  { id: "onit", label: "Confirm we're on it", text: "Absolutely — I'm on this right away and will revert shortly." },
  { id: "quote", label: "Share options / quote", text: "I've lined up a couple of options for you — sharing the details now." },
];

/** Client-side fallback member lines when the AI simulator is unreachable. */
const FALLBACK_MEMBER: Record<string, string> = {
  ack: "Sure — happy to share whatever you need. What else can I confirm?",
  onit: "Great, thank you. Do you have a rough ETA?",
  quote: "Perfect — could you share the details and pricing?",
  share: "Got it — thanks for sharing. Let me take a look.",
};

/** Downscale an image to ≤1024px and return base64 (JPEG) for vision + a data
 * URL for the thumbnail. Bytes never touch a server disk. */
async function processImage(file: File): Promise<Pending | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) return null;
    return { kind: "image", url: dataUrl, mediaType: "image/jpeg", dataBase64: base64, name: file.name };
  } catch {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

/** A shared-attachment bubble (agent side). */
function AttachmentBubble({ item }: { item: FeedItem }) {
  const a = item.attachment;
  if (!a) return null;
  return (
    <div className="my-1 flex justify-end">
      <div className="max-w-[80%] overflow-hidden rounded-lg rounded-tr-sm bg-[#DCF8C6] p-1 shadow-sm">
        {a.kind === "image" && a.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.url} alt={a.caption ?? "shared image"} className="max-h-52 w-full rounded-md object-cover" />
        ) : (
          <div className="flex items-center gap-2 px-2 py-2 text-[13px] text-black/75">
            <span className="text-lg" aria-hidden>📄</span>
            <span className="truncate">{a.kind === "file" ? a.name : "attachment"}</span>
          </div>
        )}
        {a.caption ? <div className="px-2 py-1 text-[13px] text-black">{a.caption}</div> : null}
        <div className="px-2 pb-0.5 text-right text-[10px] text-black/45">{formatOffset(item.atMs)}</div>
      </div>
    </div>
  );
}

/** Compose bar shown while the intern is attaching a photo/file to share. */
function ComposeBar({
  pending,
  note,
  onNote,
  onSend,
  onCancel,
  awaiting,
}: {
  pending: Pending;
  note: string;
  onNote: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  awaiting: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-lg bg-white p-2 ring-1 ring-black/10">
        {pending.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pending.url} alt="" className="h-14 w-14 rounded object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded bg-black/[0.05] text-2xl" aria-hidden>📄</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-black/70">
            {pending.kind === "image" ? "Photo" : pending.name}
          </div>
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Add a note…"
            maxLength={280}
            className="mt-1 w-full rounded border border-black/10 px-2 py-1 text-[13px] text-black outline-none focus:border-[#075E54]"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-black/15 bg-white py-2 text-[13px] font-semibold text-black/70">
          Cancel
        </button>
        <button onClick={onSend} disabled={awaiting} className="flex-1 rounded-lg bg-[#075E54] py-2 text-[13px] font-semibold text-white disabled:opacity-50">
          Share
        </button>
      </div>
    </div>
  );
}

/** Three-dot "member is typing" bubble. */
function TypingBubble() {
  return (
    <div className="my-1 flex justify-start">
      <div className="rounded-lg rounded-tl-sm bg-white px-3 py-2.5 shadow-sm">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/30 [animation-delay:-0.2s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/30 [animation-delay:-0.1s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/30" />
        </div>
      </div>
    </div>
  );
}

/** Fold the intern's actions through the state machine to the current status. */
function deriveStatus(actions: InternAction[]): ConciergeTicketStatus {
  let s: ConciergeTicketStatus = "open";
  for (const a of actions) {
    const to = a.kind === "resolve" ? "resolved" : a.kind === "transition" ? a.to : null;
    if (to && isTransitionAllowed(s, to)) s = to;
  }
  return s;
}

export function ScenarioPlayer({ scenario }: { scenario: Scenario }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [actions, setActions] = useState<InternAction[]>([]);
  const [nowOffset, setNowOffset] = useState(0);
  const [report, setReport] = useState<AttemptReport | null>(null);
  const [memberTyping, setMemberTyping] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null); // attachment being composed
  const [note, setNote] = useState("");

  const clockRef = useRef<ReplayClock | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false); // synchronous double-submit guard
  const runRef = useRef(0); // bumped on start/retry/finish; stale replies self-cancel
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const now = useCallback(() => clockRef.current?.offsetAt(Date.now()) ?? 0, []);
  const currentStatus = useMemo(() => deriveStatus(actions), [actions]);
  const hasReplied = actions.some((a) => a.kind === "reply");
  const hasEscalated = actions.some((a) => a.kind === "escalate");

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      stopTimer();
      abortRef.current?.abort();
    },
    [stopTimer],
  );

  // keep the chat scrolled to the newest bubble
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [feed.length, phase, memberTyping]);

  const start = useCallback(() => {
    runRef.current += 1;
    inFlightRef.current = false;
    clockRef.current = new ReplayClock(Date.now(), DEFAULT_REPLAY_SPEED);
    setPhase("playing");
    setFeed([{ side: "member", text: scenario.openingMessage, atMs: 0 }]);
    setNowOffset(0);
    setMemberTyping(false);
    setAwaiting(false);
    setPending(null);
    setNote("");
    timerRef.current = setInterval(() => setNowOffset(now()), 250);
  }, [now, scenario.openingMessage]);

  const record = useCallback(
    (action: InternAction, bubble: FeedItem) => {
      setActions((prev) => [...prev, action]);
      setFeed((prev) => [...prev, bubble]);
    },
    [],
  );

  // Ask the AI member for their next line, then append it as a member bubble.
  // Always resolves to *something* (falls back to a canned line) so the drill
  // never stalls on a failed/slow/unconfigured API.
  const fetchMemberReply = useCallback(
    async (params: {
      cannedId: string;
      agentMessage: string;
      history: { role: "member" | "agent"; text: string }[];
      attachment?: AttachmentPayload;
    }) => {
      const myRun = runRef.current;
      setAwaiting(true);
      setMemberTyping(true);
      let text = FALLBACK_MEMBER[params.cannedId] ?? "Noted, thank you — I'll wait for your update.";
      const controller = new AbortController();
      abortRef.current = controller;
      const to = setTimeout(() => controller.abort(), 20_000); // vision can be slower; still bounded
      try {
        const res = await fetch("/api/training/member-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioId: scenario.id,
            agentMessage: params.agentMessage,
            cannedId: params.cannedId,
            history: params.history,
            turnNumber: params.history.filter((h) => h.role === "agent").length + 1,
            elapsedLabel: formatOffset(now()),
            attachment: params.attachment,
          }),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { reply?: string };
          if (typeof data.reply === "string" && data.reply.trim()) text = data.reply.trim();
        }
      } catch {
        /* timeout/abort/network — keep the fallback line */
      } finally {
        clearTimeout(to);
        abortRef.current = null;
        inFlightRef.current = false;
        setMemberTyping(false);
        setAwaiting(false);
        // Skip the append if the drill was finished/retried while we were waiting.
        if (runRef.current === myRun) {
          setFeed((prev) => [...prev, { side: "member", text, atMs: now() }]);
        }
      }
    },
    [now, scenario.id],
  );

  const historyFromFeed = useCallback(
    () =>
      feed
        .filter((f) => f.side !== "system")
        .map((f) => ({ role: f.side as "member" | "agent", text: f.text })),
    [feed],
  );

  const sendReply = useCallback(
    (r: (typeof REPLIES)[number]) => {
      if (inFlightRef.current) return; // one member reply in flight at a time (sync guard)
      inFlightRef.current = true;
      const atMs = now();
      const history = historyFromFeed();
      record({ kind: "reply", atMs, cannedId: r.id }, { side: "agent", text: r.text, atMs });
      void fetchMemberReply({ cannedId: r.id, agentMessage: r.text, history });
    },
    [historyFromFeed, now, record, fetchMemberReply],
  );

  // ── upload / share ───────────────────────────────────────────────────────────
  const openFilePicker = useCallback(() => {
    if (awaiting || pending) return;
    fileInputRef.current?.click();
  }, [awaiting, pending]);

  const onFilePicked = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setNote("");
    if (file.type.startsWith("image/")) {
      const img = await processImage(file);
      setPending(img ?? { kind: "file", name: file.name });
    } else {
      setPending({ kind: "file", name: file.name });
    }
  }, []);

  const cancelPending = useCallback(() => {
    setPending(null);
    setNote("");
  }, []);

  const sendShare = useCallback(() => {
    if (!pending || inFlightRef.current) return;
    inFlightRef.current = true;
    const atMs = now();
    const caption = note.trim();
    const history = historyFromFeed();
    const displayText = caption || (pending.kind === "image" ? "📷 Photo" : `📄 ${pending.name}`);
    const bubbleAttachment: Attachment =
      pending.kind === "image"
        ? { kind: "image", url: pending.url, caption: caption || undefined }
        : { kind: "file", name: pending.name, caption: caption || undefined };
    const payload: AttachmentPayload =
      pending.kind === "image"
        ? { kind: "image", mediaType: pending.mediaType, dataBase64: pending.dataBase64, caption: caption || undefined }
        : { kind: "file", name: pending.name, caption: caption || undefined };
    record(
      { kind: "reply", atMs, cannedId: "share" },
      { side: "agent", text: displayText, atMs, attachment: bubbleAttachment },
    );
    setPending(null);
    setNote("");
    void fetchMemberReply({
      cannedId: "share",
      agentMessage: caption || (pending.kind === "image" ? "(shared a photo)" : `(shared a file: ${pending.name})`),
      history,
      attachment: payload,
    });
  }, [pending, note, historyFromFeed, now, record, fetchMemberReply]);

  const transition = useCallback(
    (to: ConciergeTicketStatus) => {
      const atMs = now();
      const legal = isTransitionAllowed(currentStatus, to);
      const action: InternAction =
        to === "resolved" ? { kind: "resolve", atMs } : { kind: "transition", atMs, to };
      const bubble: FeedItem = legal
        ? { side: "system", text: `Ticket moved to ${CONCIERGE_STATUS_LABELS[to]}`, atMs }
        : {
            side: "system",
            text: `⚠ ${CONCIERGE_STATUS_LABELS[currentStatus]} → ${CONCIERGE_STATUS_LABELS[to]} isn't a valid move — this counts as a wrong turn.`,
            atMs,
          };
      record(action, bubble);
    },
    [currentStatus, now, record],
  );

  const escalate = useCallback(() => {
    const atMs = now();
    record({ kind: "escalate", atMs }, { side: "system", text: "Escalated to a senior Genie", atMs });
  }, [now, record]);

  const finish = useCallback(() => {
    stopTimer();
    runRef.current += 1; // supersede any in-flight member reply
    abortRef.current?.abort();
    inFlightRef.current = false;
    clockRef.current?.pause(Date.now());
    const r = scoreAttempt(scenario, {
      scenarioId: scenario.id,
      actions,
      submittedAt: new Date().toISOString(),
    });
    setReport(r);
    setPhase("finished");
  }, [actions, scenario, stopTimer]);

  const retry = useCallback(() => {
    stopTimer();
    runRef.current += 1; // cancel any in-flight member reply
    abortRef.current?.abort();
    inFlightRef.current = false;
    clockRef.current = null;
    setActions([]);
    setFeed([]);
    setReport(null);
    setNowOffset(0);
    setMemberTyping(false);
    setAwaiting(false);
    setPending(null);
    setNote("");
    setPhase("intro");
  }, [stopTimer]);

  // ── header right: live clock + SLA state ─────────────────────────────────────
  const slaTargetMs = scenario.slaFirstResponseMinutes * 60_000;
  const slaLeft = slaTargetMs - nowOffset;
  const slaBreached = !hasReplied && slaLeft < 0;
  const headerRight =
    phase === "playing" ? (
      <div className="leading-tight">
        <div className="tabular-nums">⏱ {formatOffset(nowOffset)}</div>
        {!hasReplied ? (
          <div className={slaBreached ? "text-red-200" : "text-white/80"}>
            {slaBreached ? "1st-reply SLA breached" : `SLA in ${formatOffset(Math.max(0, slaLeft))}`}
          </div>
        ) : (
          <div className="text-white/80">{CONCIERGE_STATUS_LABELS[currentStatus]}</div>
        )}
      </div>
    ) : null;

  const otherStatuses = CONCIERGE_TICKET_STATUSES.filter((s) => s !== currentStatus);

  return (
    <div className="h-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.doc,.docx,.txt"
        hidden
        onChange={onFilePicked}
      />
      <WhatsAppFrame
        title="the member"
        subtitle={[scenario.category ?? "Uncategorised", scenario.priority.toUpperCase()].join(" · ")}
        right={headerRight}
        footer={
          phase === "playing" ? (
            pending ? (
              <ComposeBar
                pending={pending}
                note={note}
                onNote={setNote}
                onSend={sendShare}
                onCancel={cancelPending}
                awaiting={awaiting}
              />
            ) : (
              <Footer
                hasReplied={hasReplied}
                hasEscalated={hasEscalated}
                awaiting={awaiting}
                onReply={sendReply}
                onAttach={openFilePicker}
                otherStatuses={otherStatuses}
                onTransition={transition}
                onEscalate={escalate}
                onFinish={finish}
              />
            )
          ) : phase === "finished" ? (
            <div className="flex gap-2">
              <button onClick={retry} className="flex-1 rounded-lg bg-[#075E54] py-2 text-sm font-semibold text-white">
                Try again
              </button>
              <Link
                href="/train"
                className="flex-1 rounded-lg border border-black/15 bg-white py-2 text-center text-sm font-semibold text-black/70"
              >
                All scenarios
              </Link>
            </div>
          ) : (
            <button onClick={start} className="w-full rounded-lg bg-[#075E54] py-2.5 text-sm font-semibold text-white">
              Start working this ticket
            </button>
          )
        }
      >
        <div ref={bodyRef} className="flex h-full flex-col">
          {phase === "intro" ? (
            <IntroCard scenario={scenario} />
          ) : (
            <>
              {feed.map((f, i) => (
                <Fragment key={i}>
                  {f.attachment ? (
                    <AttachmentBubble item={f} />
                  ) : (
                    <Bubble side={f.side} meta={f.side !== "system" ? formatOffset(f.atMs) : undefined}>
                      {f.text}
                    </Bubble>
                  )}
                  {/* structured request card sits right under the opening message */}
                  {i === 0 && scenario.requestFields.length > 0 ? (
                    <RequestFieldsCard scenario={scenario} />
                  ) : null}
                </Fragment>
              ))}
              {memberTyping ? <TypingBubble /> : null}
              {phase === "finished" && report ? (
                <div className="mt-3">
                  <ReportCard report={report} scenario={scenario} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </WhatsAppFrame>
    </div>
  );
}

function IntroCard({ scenario }: { scenario: Scenario }) {
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-xl bg-white p-4 text-black shadow-sm">
      <div className="text-[15px] font-semibold">{scenario.title}</div>
      <p className="text-[13px] text-black/60">
        A completed member request, replayed as a drill. The clock starts when you begin; work it the way a
        Genie would — respond, move the ticket through the right stages, escalate only if it needs it. You'll be
        scored against what the real Genie actually did.
      </p>
      <RequestFieldsCard scenario={scenario} bare />
    </div>
  );
}

function RequestFieldsCard({ scenario, bare }: { scenario: Scenario; bare?: boolean }) {
  const inner = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      {scenario.requestFields.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-black/45">{f.label}</dt>
          <dd className="text-black/80">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
  if (bare) return inner;
  return (
    <div className="my-1 flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-black/10 bg-white px-3 py-2 shadow-sm">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-black/40">Request details</div>
        {inner}
      </div>
    </div>
  );
}

function Footer({
  hasReplied,
  hasEscalated,
  awaiting,
  onReply,
  onAttach,
  otherStatuses,
  onTransition,
  onEscalate,
  onFinish,
}: {
  hasReplied: boolean;
  hasEscalated: boolean;
  awaiting: boolean;
  onReply: (r: (typeof REPLIES)[number]) => void;
  onAttach: () => void;
  otherStatuses: ConciergeTicketStatus[];
  onTransition: (to: ConciergeTicketStatus) => void;
  onEscalate: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">
          {awaiting ? "The member is replying…" : hasReplied ? "Reply again" : "Send a first reply"}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {REPLIES.map((r) => (
            <button
              key={r.id}
              onClick={() => onReply(r)}
              disabled={awaiting}
              className="rounded-full bg-[#DCF8C6] px-3 py-1 text-[12px] text-black/80 ring-1 ring-black/5 hover:bg-[#c9f0ad] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={onAttach}
            disabled={awaiting}
            title="Share a photo or file with the member"
            className="rounded-full bg-white px-3 py-1 text-[12px] text-black/70 ring-1 ring-black/10 hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            📎 Share
          </button>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">Move ticket to</div>
        <div className="flex flex-wrap gap-1.5">
          {otherStatuses.map((s) => (
            <button
              key={s}
              onClick={() => onTransition(s)}
              className="rounded-full bg-white px-3 py-1 text-[12px] text-black/70 ring-1 ring-black/10 hover:bg-black/[0.04]"
            >
              {CONCIERGE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onEscalate}
          disabled={hasEscalated}
          className="flex-1 rounded-lg bg-amber-500 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {hasEscalated ? "Escalated" : "Escalate"}
        </button>
        <button
          onClick={onFinish}
          className="flex-1 rounded-lg bg-[#075E54] py-2 text-[13px] font-semibold text-white"
        >
          Finish & see report
        </button>
      </div>
    </div>
  );
}

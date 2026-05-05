"use client";

import type { ChettoGroup, ChettoMessage } from "@/lib/actions/chetto";
import { JOKER_PHONE_NUMBERS } from "@/lib/constants/chetto-jokers";
import { formatIST, isSameCalendarDayIST } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { parseISO } from "date-fns";
import { Loader2, MessageCircle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function stripEmojiAndConciergeTitle(raw: string | null): string {
  if (!raw) return "Member";
  const noEmoji = raw
    .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE00-\uFE0F\u200D]/gu, "")
    .replace(/\uFE0F/g, "")
    .trim();
  return (
    noEmoji
      .replace(/\s*(?:Pre\s+)?Concierge\s*$/i, "")
      .trim() || "Member"
  );
}

function normalizePhoneDigits(phone: string | null): string {
  return phone?.replace(/\D/g, "") ?? "";
}

function parseMessageDate(ts: string | null): Date | null {
  if (!ts) return null;
  const n = Number(ts);
  if (!Number.isNaN(n)) {
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  try {
    return parseISO(ts);
  } catch {
    return null;
  }
}

function messageTimeLabel(d: Date): string {
  const now = new Date();
  if (isSameCalendarDayIST(d, now)) return formatIST(d, "h:mm a");
  const y1 = formatIST(d, "yyyy");
  const y2 = formatIST(now, "yyyy");
  if (y1 === y2) return formatIST(d, "EEE h:mm a");
  return formatIST(d, "d MMM yyyy");
}

function dateSeparatorLabel(d: Date): string {
  const now = new Date();
  if (isSameCalendarDayIST(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameCalendarDayIST(d, yesterday)) return "Yesterday";
  const y1 = formatIST(d, "yyyy");
  const y2 = formatIST(now, "yyyy");
  if (y1 === y2) return formatIST(d, "EEEE");
  return formatIST(d, "d MMM yyyy");
}

function senderColor(phone: string | null): string {
  const p = normalizePhoneDigits(phone);
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (h + p.charCodeAt(i) * (i + 1)) % 100000;
  const palette = ["#E91E63", "#9C27B0", "#3F51B5", "#009688", "#FF5722"];
  return palette[Math.abs(h) % 5];
}

function sortMessages(list: ChettoMessage[]): ChettoMessage[] {
  return [...list].sort((a, b) => {
    const da = parseMessageDate(a.timestamp)?.getTime() ?? 0;
    const db = parseMessageDate(b.timestamp)?.getTime() ?? 0;
    return da - db;
  });
}

function mergeMessages(prev: ChettoMessage[], older: ChettoMessage[]): ChettoMessage[] {
  const seen = new Set<string>();
  const out: ChettoMessage[] = [];
  for (const m of [...older, ...prev]) {
    const k =
      m.id ??
      `${m.timestamp ?? ""}-${normalizePhoneDigits(m.phone_no)}-${m.text ?? ""}-${m.from_me}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return sortMessages(out);
}

type ChettoTabProps = {
  clientPhone: string;
  queendom: string;
  isActive: boolean;
};

export function ChettoTab({ clientPhone, queendom, isActive }: ChettoTabProps) {
  const [group, setGroup] = useState<ChettoGroup | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChettoMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  /** Chetto timeline API returned 404 / “No groups found” — distinct from an empty but valid timeline. */
  const [timelineNotAvailable, setTimelineNotAvailable] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightText, setInsightText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);

  const phoneOk = clientPhone.trim().length > 0;

  useEffect(() => {
    if (!isActive || !phoneOk) {
      setGroup(undefined);
      setMessages([]);
      setNextCursor(null);
      setTimelineNotAvailable(false);
      return;
    }

    let cancelled = false;

    async function load() {
      didInitialScroll.current = false;
      setGroup(undefined);
      setMessages([]);
      setNextCursor(null);
      setTimelineNotAvailable(false);
      setInsightText(null);

      const fg = new URLSearchParams({
        clientPhone: clientPhone.trim(),
        queendom: queendom.trim() || "Unassigned",
      });

      const ctrl = new AbortController();
      const timeoutMs = 120_000;
      const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);

      try {
        const fr = await fetch(`/api/chetto/find-group?${fg.toString()}`, {
          signal: ctrl.signal,
        });
        if (cancelled) return;
        if (!fr.ok) {
          setGroup(null);
          return;
        }
        let fj: { group: ChettoGroup | null };
        try {
          fj = (await fr.json()) as { group: ChettoGroup | null };
        } catch {
          setGroup(null);
          return;
        }
        if (cancelled) return;
        const g = fj.group ?? null;
        setGroup(g);
        if (!g?.group_id) return;

        setTimelineLoading(true);
        try {
          const tr = await fetch(
            `/api/chetto/timeline?groupId=${encodeURIComponent(g.group_id)}&limit=50`,
          );
          if (cancelled) return;
          if (!tr.ok) {
            setMessages([]);
            setNextCursor(null);
            setTimelineNotAvailable(false);
            return;
          }
          let tj: {
            messages?: ChettoMessage[];
            nextCursor?: string | null;
            timelineNotAvailable?: boolean;
          };
          try {
            tj = (await tr.json()) as {
              messages?: ChettoMessage[];
              nextCursor?: string | null;
              timelineNotAvailable?: boolean;
            };
          } catch {
            setMessages([]);
            setNextCursor(null);
            setTimelineNotAvailable(false);
            return;
          }
          if (cancelled) return;
          setTimelineNotAvailable(Boolean(tj.timelineNotAvailable));
          setMessages(sortMessages(tj.messages ?? []));
          setNextCursor(
            typeof tj.nextCursor === "string" && tj.nextCursor.length > 0 ? tj.nextCursor : null,
          );
        } finally {
          if (!cancelled) setTimelineLoading(false);
        }
      } catch {
        if (!cancelled) setGroup(null);
      } finally {
        window.clearTimeout(timer);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isActive, clientPhone, queendom, phoneOk]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || timelineLoading || messages.length === 0 || didInitialScroll.current) return;
    el.scrollTop = el.scrollHeight;
    didInitialScroll.current = true;
  }, [group?.group_id, messages.length, timelineLoading]);

  const datedRows = useMemo(() => {
    type Row =
      | { kind: "sep"; label: string }
      | { kind: "msg"; m: ChettoMessage; idx: number };
    const rows: Row[] = [];
    let lastDay = "";
    messages.forEach((m, idx) => {
      const d = parseMessageDate(m.timestamp);
      const dayKey = d ? formatIST(d, "yyyy-MM-dd") : "";
      if (d && dayKey && dayKey !== lastDay) {
        lastDay = dayKey;
        rows.push({ kind: "sep", label: dateSeparatorLabel(d) });
      }
      rows.push({ kind: "msg", m, idx });
    });
    return rows;
  }, [messages]);

  async function handleLoadMore() {
    if (!group?.group_id || !nextCursor || loadMoreLoading) return;
    setLoadMoreLoading(true);
    try {
      const tr = await fetch(
        `/api/chetto/timeline?groupId=${encodeURIComponent(group.group_id)}&limit=50&offsetId=${encodeURIComponent(nextCursor)}`,
      );
      const tj = (await tr.json()) as {
        messages?: ChettoMessage[];
        nextCursor?: string | null;
      };
      const older = tj.messages ?? [];
      setMessages((prev) => mergeMessages(prev, older));
      setNextCursor(
        typeof tj.nextCursor === "string" && tj.nextCursor.length > 0 ? tj.nextCursor : null,
      );
    } finally {
      setLoadMoreLoading(false);
    }
  }

  async function askInsight(question: string) {
    if (!group?.group_id) return;
    setInsightLoading(true);
    setInsightText(null);
    try {
      const res = await fetch("/api/chetto/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.group_id, question }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (data.text) setInsightText(data.text);
      else setInsightText(data.error ?? "No response");
    } finally {
      setInsightLoading(false);
    }
  }

  if (!phoneOk) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden px-4 py-8 text-center sm:px-6 sm:py-12">
        <MessageCircle className="h-8 w-8 text-stone-300" aria-hidden />
        <p className="text-sm text-stone-500">Add a phone number on this client to load WhatsApp history.</p>
      </div>
    );
  }

  if (group === undefined) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4">
        <div className="flex flex-col items-center gap-2 pb-2 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden />
          <p className="text-xs text-stone-600">
            Loading WhatsApp group from Chetto…
          </p>
          <p className="max-w-sm text-[11px] leading-snug text-stone-400">
            First lookup scans your queendom until your number matches a group (usually a few
            seconds). If this hangs, check <span className="font-mono">CHETTO_API_KEY</span> on the
            server.
          </p>
        </div>
        {[40, 65, 30, 55, 70, 45].map((w, i) => (
          <div
            key={i}
            className={cn(
              "h-10 animate-pulse rounded-lg bg-stone-200",
              i % 2 === 0 ? "mr-auto" : "ml-auto",
            )}
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    );
  }

  if (group === null) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden px-4 py-10 text-center sm:px-6 sm:py-12">
        <MessageCircle className="h-8 w-8 text-stone-300" aria-hidden />
        <p className="text-sm font-medium text-stone-600">No WhatsApp group found</p>
        <p className="text-xs text-stone-400">
          Chetto did not index a concierge group for this number in {queendom || "Unassigned"}.
        </p>
      </div>
    );
  }

  const title = stripEmojiAndConciergeTitle(group.group_name);
  const updated =
    group.updated_at_utc != null
      ? new Date(group.updated_at_utc < 1e12 ? group.updated_at_utc * 1000 : group.updated_at_utc)
      : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Section 1 — header */}
      <div
        className="flex flex-col gap-3 border-b border-[#dcfce7] px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
        style={{
          background: "linear-gradient(to bottom, #f0fdf4, #ffffff)",
        }}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"
            aria-hidden
          >
            <MessageCircle className="h-5 w-5" style={{ color: "#25D366" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="wrap-break-word text-sm font-semibold leading-snug text-stone-800">{title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-stone-400">
              WhatsApp Concierge Group
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-x-3 gap-y-1 sm:flex-col sm:items-end">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs",
              group.valid === true
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-stone-200 bg-stone-50 text-stone-500",
            )}
          >
            {group.valid === true ? "Active" : "Inactive"}
          </span>
          {updated && (
            <span className="wrap-break-word text-right text-[10px] leading-snug text-stone-400">
              Last activity{" "}
              {formatDistanceToNow(updated, {
                addSuffix: true,
              })}
            </span>
          )}
        </div>
      </div>

      {/* Section 2 — timeline */}
      <div
        ref={scrollRef}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3"
        style={{ backgroundColor: "#E5DDD5" }}
      >
        {timelineLoading ? (
          <div className="flex flex-col gap-2 py-2">
            {[40, 65, 30, 55, 70, 45].map((w, i) => (
              <div
                key={i}
                className={cn(
                  "h-10 animate-pulse rounded-lg bg-stone-200/90",
                  i % 2 === 0 ? "mr-auto" : "ml-auto",
                )}
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        ) : (
          <>
            {nextCursor ? (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  onClick={() => void handleLoadMore()}
                  disabled={loadMoreLoading}
                  className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-700 disabled:opacity-50"
                >
                  {loadMoreLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : null}
                  Load older messages
                </button>
              </div>
            ) : null}

            {messages.length === 0 ? (
              <div className="flex max-h-full min-h-48 w-full flex-col items-center justify-center gap-3 overflow-y-auto px-4 py-10 text-center">
                <MessageCircle className="h-8 w-8 shrink-0 text-stone-300" aria-hidden />
                {timelineNotAvailable ? (
                  <>
                    <p className="w-full wrap-break-word text-sm font-medium text-stone-600">
                      Chat timeline isn&apos;t available via Chetto&apos;s API yet
                    </p>
                    <p className="w-full max-w-lg wrap-break-word text-xs leading-relaxed text-stone-400">
                      The group exists (same id as on app.chetto.ai), but{" "}
                      <span className="font-mono text-[11px]">GET .../timeline</span> returns 404 /
                      &quot;No groups found&quot; — so there&apos;s nothing for Atlas to render. That
                      usually means message indexing for this group isn&apos;t wired to the Joule API;
                      it&apos;s not an Atlas bug.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="w-full wrap-break-word text-sm text-stone-500">
                      No messages returned for this group yet
                    </p>
                    <p className="w-full max-w-lg wrap-break-word text-xs leading-relaxed text-stone-400">
                      If WhatsApp history exists, Chetto may still be indexing — try again later.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {datedRows.map((row, i) => {
                  if (row.kind === "sep") {
                    return (
                      <div key={`sep-${row.label}-${i}`} className="flex justify-center py-2">
                        <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] text-stone-500 backdrop-blur-sm">
                          {row.label}
                        </span>
                      </div>
                    );
                  }
                  const { m } = row;
                  const d = parseMessageDate(m.timestamp);
                  const prev = messages[row.idx - 1];
                  const prevPhone = normalizePhoneDigits(prev?.phone_no);
                  const curPhone = normalizePhoneDigits(m.phone_no);
                  const showSenderLabel =
                    !m.from_me &&
                    (!prev || prev.from_me !== false || prevPhone !== curPhone);

                  const isJoker =
                    m.from_me &&
                    curPhone &&
                    JOKER_PHONE_NUMBERS.has(curPhone);

                  return (
                    <div
                      key={`${m.id ?? row.idx}-${row.idx}`}
                      className={cn("flex", m.from_me ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "min-w-0 max-w-[75%] rounded-[12px] px-3 py-2 shadow-sm",
                          m.from_me
                            ? "rounded-br-[4px] bg-[#DCF8C6]"
                            : "rounded-bl-[4px] bg-white",
                        )}
                        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
                      >
                        {isJoker ? (
                          <p className="mb-0.5 text-[10px] font-medium" style={{ color: "#25D366" }}>
                            Joker ✨
                          </p>
                        ) : null}
                        {!m.from_me && showSenderLabel && curPhone.length >= 4 ? (
                          <p
                            className="mb-0.5 text-[10px] font-medium"
                            style={{ color: senderColor(m.phone_no) }}
                          >
                            ····{curPhone.slice(-4)}
                          </p>
                        ) : null}
                        <p className="wrap-break-word text-[13.5px] leading-relaxed text-[#111827]">
                          {m.text?.trim() ? (
                            m.text
                          ) : (
                            <span className="italic text-stone-400">[Media]</span>
                          )}
                        </p>
                        {d ? (
                          <p className="mt-1 text-right text-[10px] text-[#6B7280]">
                            {messageTimeLabel(d)} ✓
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Section 3 — insights */}
      <div className="min-w-0 shrink-0 border-t border-[#dcfce7] bg-white px-4 pb-4 pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "#00B4D8" }} aria-hidden />
          <span className="min-w-0 wrap-break-word text-xs font-medium uppercase tracking-wider text-stone-600">
            Chetto Intelligence
          </span>
        </div>
        <div className="mt-3 flex min-w-0 gap-2 overflow-x-auto overflow-y-visible py-0.5 pl-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            "Recent requests?",
            "Any unresolved items?",
            "Key decisions made?",
            "Any complaints?",
          ].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void askInsight(q)}
              disabled={insightLoading}
              className="shrink-0 cursor-pointer whitespace-nowrap rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-500 transition-colors hover:border-[#00B4D8] hover:text-[#00B4D8] disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        {insightLoading ? (
          <p className="mt-2 animate-pulse text-xs italic text-stone-400">Chetto is thinking...</p>
        ) : null}
        {insightText && !insightLoading ? (
          <div className="mt-2 max-h-16 overflow-y-auto rounded-lg bg-stone-50 p-2.5 text-xs leading-relaxed text-stone-700">
            {insightText}
          </div>
        ) : null}
      </div>
    </div>
  );
}

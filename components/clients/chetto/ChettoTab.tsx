"use client";

import type { ChettoGroup, ChettoMessage } from "@/lib/actions/chetto";
import { JOKER_PHONE_NUMBERS } from "@/lib/constants/chetto-jokers";
import { formatIST, isSameCalendarDayIST } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import { parseISO } from "date-fns";
import { Loader2, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  /** When set, skips phone scan and loads this Joule group directly. */
  chettoGroupId: string | null;
};

export function ChettoTab({
  clientPhone,
  queendom,
  isActive,
  chettoGroupId,
}: ChettoTabProps) {
  const [group, setGroup] = useState<ChettoGroup | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChettoMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  /** Chetto timeline API returned 404 / “No groups found” — distinct from an empty but valid timeline. */
  const [timelineNotAvailable, setTimelineNotAvailable] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  /** After prepending older messages, restore viewport so content under finger stays put. */
  const pendingScrollRestoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const loadMoreLoadingRef = useRef(false);

  const mappedId = chettoGroupId?.trim() ?? "";
  const phoneOk = clientPhone.trim().length > 0 || Boolean(mappedId);

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

      const mappedId = chettoGroupId?.trim() ?? "";

      const ctrl = new AbortController();
      const timeoutMs = 120_000;
      const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);

      try {
        let g: ChettoGroup | null = null;

        if (mappedId) {
          const gr = await fetch(
            `/api/chetto/group?groupId=${encodeURIComponent(mappedId)}`,
            { signal: ctrl.signal },
          );
          if (cancelled) return;
          if (!gr.ok) {
            setGroup(null);
            return;
          }
          try {
            const gj = (await gr.json()) as { group: ChettoGroup | null };
            g = gj.group ?? null;
          } catch {
            setGroup(null);
            return;
          }
        } else {
          const fg = new URLSearchParams({
            clientPhone: clientPhone.trim(),
            queendom: queendom.trim() || "Unassigned",
          });
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
          g = fj.group ?? null;
        }

        if (cancelled) return;

        if (mappedId && !g) {
          g = {
            group_id: mappedId,
            group_name: null,
            valid: null,
            created_at_utc: null,
            updated_at_utc: null,
            created_at: null,
            access_members: [],
          };
        }

        setGroup(g);

        const timelineGroupId = (g?.group_id ?? "").trim();
        if (!timelineGroupId) return;

        setTimelineLoading(true);
        try {
          const tr = await fetch(
            `/api/chetto/timeline?groupId=${encodeURIComponent(timelineGroupId)}&limit=50`,
          );
          const raw = await tr.text();
          let tj: {
            messages?: ChettoMessage[];
            nextCursor?: string | null;
            timelineNotAvailable?: boolean;
          } = {};
          try {
            if (raw) tj = JSON.parse(raw) as typeof tj;
          } catch {
            /* non-JSON body */
          }
          if (cancelled) return;
          if (!tr.ok) {
            setMessages([]);
            setNextCursor(null);
            setTimelineNotAvailable(
              tr.status === 404 || Boolean(tj.timelineNotAvailable),
            );
            return;
          }
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
  }, [isActive, clientPhone, queendom, phoneOk, chettoGroupId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || timelineLoading || messages.length === 0 || didInitialScroll.current) return;
    el.scrollTop = el.scrollHeight;
    didInitialScroll.current = true;
  }, [group?.group_id, messages.length, timelineLoading]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const pending = pendingScrollRestoreRef.current;
    if (!el || !pending) return;
    pendingScrollRestoreRef.current = null;
    const delta = el.scrollHeight - pending.scrollHeight;
    el.scrollTop = pending.scrollTop + delta;
  }, [messages]);

  useEffect(() => {
    loadMoreLoadingRef.current = loadMoreLoading;
  }, [loadMoreLoading]);

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

  const handleLoadMore = useCallback(async () => {
    const gid = (mappedId || group?.group_id)?.trim();
    if (!gid || !nextCursor || loadMoreLoadingRef.current) return;
    loadMoreLoadingRef.current = true;
    setLoadMoreLoading(true);
    const el = scrollRef.current;
    if (el) {
      pendingScrollRestoreRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
    }
    try {
      const tr = await fetch(
        `/api/chetto/timeline?groupId=${encodeURIComponent(gid)}&limit=50&offsetId=${encodeURIComponent(nextCursor)}`,
      );
      const raw = await tr.text();
      let tj: { messages?: ChettoMessage[]; nextCursor?: string | null } = {};
      try {
        if (raw) tj = JSON.parse(raw) as typeof tj;
      } catch {
        /* ignore */
      }
      if (!tr.ok) {
        pendingScrollRestoreRef.current = null;
        return;
      }
      const older = tj.messages ?? [];
      setMessages((prev) => mergeMessages(prev, older));
      setNextCursor(
        typeof tj.nextCursor === "string" && tj.nextCursor.length > 0 ? tj.nextCursor : null,
      );
    } catch {
      pendingScrollRestoreRef.current = null;
    } finally {
      setLoadMoreLoading(false);
      loadMoreLoadingRef.current = false;
    }
  }, [mappedId, group?.group_id, nextCursor]);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel || !nextCursor || timelineLoading) return;

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e?.isIntersecting) return;
        if (loadMoreLoadingRef.current) return;
        void handleLoadMore();
      },
      { root, rootMargin: "100px 0px 0px 0px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [nextCursor, timelineLoading, handleLoadMore]);

  if (!phoneOk) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden px-4 py-8 text-center sm:px-6 sm:py-12">
        <MessageCircle className="h-8 w-8 text-stone-300" aria-hidden />
        <p className="text-sm text-stone-500">
          Add a phone number on this client, or link a Chetto group id on the mapping page.
        </p>
      </div>
    );
  }

  if (group === undefined) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4">
        <div className="flex flex-col items-center gap-2 pb-2 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden />
          <p className="text-xs text-stone-600">
            Loading Chetto group…
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
    const mapped = Boolean(chettoGroupId?.trim());
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden px-4 py-10 text-center sm:px-6 sm:py-12">
        <MessageCircle className="h-8 w-8 text-stone-300" aria-hidden />
        <p className="text-sm font-medium text-stone-600">
          {mapped ? "Linked Chetto group not found" : "No Chetto group found"}
        </p>
        <p className="text-xs text-stone-400">
          {mapped ? (
            <>
              Check the saved group id on{" "}
              <span className="font-mono text-[11px]">/clients/chetto-mapping</span> or in
              Chetto — the API returned no metadata for this id.
            </>
          ) : (
            <>
              Chetto did not match a concierge group for this number in {queendom || "Unassigned"}.
              Set an explicit group id on the mapping page for a reliable link.
            </>
          )}
        </p>
      </div>
    );
  }

  const title = stripEmojiAndConciergeTitle(group.group_name);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Section 1 — header */}
      <div
        className="flex shrink-0 flex-col gap-3 border-b border-[#dcfce7] px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
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
            {mappedId ? (
              <p className="mt-0.5 wrap-break-word font-mono text-[10px] text-stone-500">
                Linked · {mappedId}
              </p>
            ) : null}
            <p className="mt-0.5 text-[11px] leading-snug text-stone-400">
              WhatsApp group (Chetto)
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
        </div>
      </div>

      {/* Section 2 — timeline (single scroll surface; height bounded by parent card) */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-3 [scrollbar-width:thin] [scrollbar-color:rgb(120_113_108/0.35)_transparent]"
          style={{ backgroundColor: "#E5DDD5" }}
        >
        {timelineLoading ? (
          <div className="flex min-h-[min(320px,50dvh)] flex-col gap-2 py-2">
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
              <div className="flex flex-col items-center gap-1 pb-1">
                <div
                  ref={topSentinelRef}
                  className="pointer-events-none h-1 w-full shrink-0"
                  aria-hidden
                />
                {loadMoreLoading ? (
                  <div
                    className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[11px] text-stone-500 shadow-sm backdrop-blur-sm"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-stone-500" aria-hidden />
                    Loading older…
                  </div>
                ) : null}
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
                      If chat history exists, confirm <span className="font-mono">CHETTO_ORG_ID</span>{" "}
                      matches your workspace. Chetto may still be indexing — try again later.
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
      </div>

    </div>
  );
}

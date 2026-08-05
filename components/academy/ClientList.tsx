"use client";

/**
 * ClientList — the left panel.
 *
 * One row per client, and each client has exactly one request. The row reads
 * like a chat list entry: who it is, and their request as the preview line.
 * Selecting a row opens their conversation on the right — there is no second
 * click, and nothing to expand.
 */

import { useMemo, useState, type JSX } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Lock, Search, GraduationCap, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIST } from "@/lib/utils/time";
import { ProgressBreakdown } from "@/components/academy/ProgressBreakdown";
import { TIER_CLASS, TIER_LABEL, type AcademyTier } from "@/lib/academy/curriculum";
import type { AcademyClientOverview, AcademyClientRow } from "@/lib/academy/types";
import type { DaySection } from "@/lib/academy/trainingDays";

const nf = new Intl.NumberFormat("en-IN");

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatIST(iso, "d MMM");
  } catch {
    return "";
  }
}

function ClientRow({
  client,
  isActive,
  unread,
  flash,
  onSelect,
}: {
  client: AcademyClientRow;
  isActive: boolean;
  unread: number;
  flash: boolean;
  onSelect: (seedId: string) => void;
}): JSX.Element {
  const done = client.status === "completed";
  const live = client.status === "in_progress";
  // Conversation finished, ticket still owed — the row must not read as done.
  const awaitingTicket = client.status === "awaiting_ticket";
  const scoringFailed = client.status === "scoring_failed";
  const tier = client.difficulty as AcademyTier;

  return (
    <motion.button
      type="button"
      layout
      // `layout` animates the row sliding to the top when the inbox reorders,
      // which is what makes a new message feel like it arrived rather than the
      // list simply being different.
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      onClick={() => onSelect(client.seedId)}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 border-b border-chat-divider px-3 py-3 text-left transition-colors",
        "cursor-pointer hover:bg-chat-panel-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-chat-accent-dark",
        isActive && "bg-chat-panel-active",
        flash && "bg-chat-accent/10",
      )}
    >
      {/* Real member avatar when the record has one, initials otherwise. */}
      {!done && client.member?.avatarUrl ? (
        <img
          src={client.member.avatarUrl}
          alt=""
          className="size-11 shrink-0 rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
            done
              ? "bg-chat-accent-dark text-chat-header-ink"
              : "bg-chat-canvas text-chat-ink-muted",
          )}
        >
          {done ? (
            <Check className="size-5" strokeWidth={2.5} aria-hidden />
          ) : (
            client.member?.initials ?? initials(client.name)
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-medium text-chat-ink">{client.name}</span>
          <span
            className={cn(
              "shrink-0 text-[11px]",
              unread > 0 ? "font-semibold text-chat-accent-dark" : "text-chat-ink-muted",
            )}
          >
            {unread > 0 ? "now" : shortDate(client.lastActivity)}
          </span>
        </div>

        {/* The request itself is the preview line — the way a chat list shows
            the last message rather than a description of the thread. */}
        <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-chat-ink-muted">
          {live ? (
            <MessageCircle className="size-3 shrink-0 text-chat-accent-dark" aria-hidden />
          ) : null}
          {client.requestTitle}
        </p>

        <div className="mt-1.5 flex items-center gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ring-1",
              TIER_CLASS[tier] ?? TIER_CLASS.medium,
            )}
          >
            {TIER_LABEL[tier] ?? client.difficulty}
          </span>
          <span
            className={cn(
              "truncate text-[11px]",
              awaitingTicket || scoringFailed
                ? "font-medium text-warning"
                : "text-chat-ink-muted",
            )}
          >
            {done
              ? `Completed · ${client.overall?.toFixed(1) ?? "—"}/5`
              : awaitingTicket
                ? "Ticket update required"
                : scoringFailed
                  ? "Scoring failed — retry"
                  : live
                    ? "In progress"
                    : client.vertical}
          </span>
        </div>
      </div>

      {/* Unread count — the badge WhatsApp puts at the end of the row. */}
      {unread > 0 ? (
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
          className="grid size-5 shrink-0 place-items-center rounded-full bg-chat-accent text-[10.5px] font-bold tabular-nums text-chat-header-ink"
          aria-label={`${unread} unread ${unread === 1 ? "message" : "messages"}`}
        >
          {unread > 9 ? "9+" : unread}
        </motion.span>
      ) : null}
    </motion.button>
  );
}

export function ClientList({
  clients,
  inboxState,
  flashSeedId,
  totalUnread,
  overview,
  activeSeedId,
  onSelect,
  className,
  dayGroups,
  headline,
}: {
  clients: AcademyClientRow[];
  /** Live per-client inbox state (unread, activity) keyed by seedId. */
  inboxState?: Map<string, { unread: number }>;
  /** Row that just received something — briefly highlighted. */
  flashSeedId?: string | null;
  totalUnread?: number;
  overview: AcademyClientOverview;
  activeSeedId: string | null;
  onSelect: (seedId: string) => void;
  className?: string;
  /**
   * Training mode. When present the roster is grouped into days instead of
   * rendered flat, and locked days show a notice in place of their rows.
   * Everything else — the panel, search, filters, row design — is unchanged,
   * because this is the same sidebar serving different content.
   */
  dayGroups?: DaySection[];
  /** Overrides the panel title and subtitle (Clients vs Training). */
  headline?: { title: string; subtitle: string };
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "completed">("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (filter === "open" && c.status === "completed") return false;
      if (filter === "completed" && c.status !== "completed") return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.requestTitle.toLowerCase().includes(q) ||
        c.vertical.toLowerCase().includes(q) ||
        c.difficulty.toLowerCase().includes(q)
      );
    });
  }, [clients, query, filter]);

  /** Day sections look their rows up by id, so they inherit search + filters. */
  const visibleById = useMemo(
    () => new Map(visible.map((c) => [c.seedId, c])),
    [visible],
  );

  return (
    /*
     * The whole panel is one scroll region — the identity header and the
     * progress ring scroll away with the list rather than staying pinned, so a
     * 176-row roster gets the full panel height. `flex`/`hidden md:flex` comes
     * from `className` (the mobile pane switch), hence `flex-col` but no `flex`
     * here.
     */
    <aside
      className={cn(
        "h-full min-h-0 flex-col overflow-y-auto bg-chat-panel",
        className,
      )}
    >
      <header className="shrink-0 space-y-2 border-b border-chat-divider px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-full bg-chat-header text-chat-header-ink">
            <GraduationCap className="size-[18px]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-[17px] leading-tight text-chat-ink">
                {headline?.title ?? "Indulge Training"}
              </h1>
              {totalUnread && totalUnread > 0 ? (
                <motion.span
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="rounded-full bg-chat-accent px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-chat-header-ink"
                >
                  {totalUnread} new
                </motion.span>
              ) : null}
            </div>
            <p className="truncate text-[11.5px] text-chat-ink-muted">
              {headline
                ? headline.subtitle
                : `${nf.format(overview.completed)} of ${nf.format(overview.total)} clients handled${
                    overview.inProgress > 0 ? ` · ${overview.inProgress} open` : ""
                  }`}
            </p>
          </div>
        </div>

        {/* The headline number is performance-weighted, so it has to be
            inspectable — clicking opens the full metric breakdown. */}
        <ProgressBreakdown overview={overview} />
      </header>

      {/* Sticks to the top edge once the header scrolls past it — filtering a
          176-row roster must not require scrolling back up. */}
      <div className="sticky top-0 z-10 shrink-0 space-y-2 border-b border-chat-divider bg-chat-panel px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-lg bg-chat-panel-active px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-chat-ink-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients or requests"
            aria-label="Search clients"
            className="w-full border-0 bg-transparent text-[13px] text-chat-ink outline-none placeholder:text-chat-ink-muted"
          />
        </div>
        <div className="flex gap-1.5">
          {(["all", "open", "completed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                filter === f
                  ? "bg-chat-accent-dark text-chat-header-ink"
                  : "bg-chat-panel-active text-chat-ink-muted hover:bg-chat-divider",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div>
        {dayGroups ? (
          dayGroups.map((day) => {
            // Search and the filter chips still apply, so a day can legitimately
            // show fewer rows than it holds.
            const rows = day.seedIds
              .map((id) => visibleById.get(id))
              .filter((c): c is AcademyClientRow => c !== undefined);

            return (
              <section key={day.dayNumber}>
                <header className="flex items-center justify-between gap-2 border-b border-chat-divider bg-chat-panel-active px-4 py-2">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-chat-ink">
                    {day.isLocked ? (
                      <Lock className="size-3 text-chat-locked" aria-hidden />
                    ) : day.isComplete ? (
                      <Check className="size-3.5 text-chat-accent-dark" aria-hidden />
                    ) : null}
                    Day {day.dayNumber}
                  </span>
                  {!day.isLocked && (
                    <span className="text-[11px] tabular-nums text-chat-ink-muted">
                      {day.completedCount}/{day.taskCount}
                    </span>
                  )}
                </header>

                {day.isLocked ? (
                  <p className="px-4 py-3 text-[11.5px] leading-relaxed text-chat-ink-muted">
                    Complete Day {day.unlockedBy} to unlock
                  </p>
                ) : rows.length === 0 ? (
                  <p className="px-4 py-3 text-[11.5px] text-chat-ink-muted">
                    Nothing here matches that search.
                  </p>
                ) : (
                  rows.map((c) => (
                    <ClientRow
                      key={c.seedId}
                      client={c}
                      isActive={c.seedId === activeSeedId}
                      unread={inboxState?.get(c.seedId)?.unread ?? 0}
                      flash={flashSeedId === c.seedId}
                      onSelect={onSelect}
                    />
                  ))
                )}
              </section>
            );
          })
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-chat-ink-muted">
            No clients match that search.
          </p>
        ) : (
          visible.map((c) => (
            <ClientRow
              key={c.seedId}
              client={c}
              isActive={c.seedId === activeSeedId}
              unread={inboxState?.get(c.seedId)?.unread ?? 0}
              flash={flashSeedId === c.seedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}

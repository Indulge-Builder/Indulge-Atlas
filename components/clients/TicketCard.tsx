"use client";

import { formatDistanceToNow, parseISO } from "date-fns";
import type { FreshdeskTicket } from "@/lib/freshdesk/types";
import { mapPriority, mapStatus } from "@/lib/freshdesk/types";
import { formatIST } from "@/lib/utils/time";
import { cn } from "@/lib/utils";

function statusBadgeClass(s: ReturnType<typeof mapStatus>): string {
  switch (s) {
    case "open":
      return "bg-emerald-100 text-emerald-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "resolved":
      return "bg-stone-100 text-stone-600";
    case "closed":
      return "bg-stone-100 text-stone-500";
    case "waiting":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-stone-100 text-stone-600";
  }
}

function priorityDotClass(p: ReturnType<typeof mapPriority>): string {
  switch (p) {
    case "urgent":
      return "bg-red-500";
    case "high":
      return "bg-orange-400";
    case "medium":
      return "bg-amber-400";
    case "low":
      return "bg-stone-300";
    default:
      return "bg-stone-300";
  }
}

function truncateText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatCfDate(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === "") return null;
  const raw = String(value).trim();
  try {
    const d = parseISO(raw.includes("T") ? raw : `${raw}T12:00:00`);
    if (Number.isNaN(d.getTime())) return raw;
    return formatIST(d, "d MMM yyyy");
  } catch {
    return raw;
  }
}

interface TicketCardProps {
  ticket: FreshdeskTicket;
}

export function TicketCard({ ticket }: TicketCardProps) {
  const st = mapStatus(ticket.status);
  const pr = mapPriority(ticket.priority);
  const cf = ticket.custom_fields ?? {};
  const cfRequest = cf.cf_request ?? null;
  const cfEvents = cf.cf_events ?? null;
  const from = cf.cf_from_location ?? null;
  const to = cf.cf_to_location ?? null;
  const pax = cf.cf_pax ?? null;
  const budget = cf.cf_budget ?? null;
  const cfDate = formatCfDate(cf.cf_date ?? null);

  const hasCustomLine =
    (cfRequest && cfRequest.trim()) ||
    (cfEvents && cfEvents.trim()) ||
    (from && from.trim()) ||
    (to && to.trim()) ||
    (pax && pax.trim()) ||
    (budget && budget.trim()) ||
    cfDate;

  const fallbackDescription =
    ticket.description_text?.trim() ||
    (typeof ticket.description === "string"
      ? ticket.description.replace(/<[^>]+>/g, " ").trim()
      : "");
  const secondaryLine = hasCustomLine
    ? [
        cfRequest && cfRequest.trim() ? cfRequest.trim() : null,
        cfEvents && cfEvents.trim() ? cfEvents.trim() : null,
      ]
        .filter(Boolean)
        .join(" · ") || null
    : fallbackDescription
      ? truncateText(fallbackDescription, 100)
      : null;

  const travelParts: string[] = [];
  if (from?.trim() && to?.trim()) {
    travelParts.push(`Travel: ${from.trim()} → ${to.trim()}`);
  } else if (from?.trim()) {
    travelParts.push(`From: ${from.trim()}`);
  } else if (to?.trim()) {
    travelParts.push(`To: ${to.trim()}`);
  }
  if (pax?.trim()) travelParts.push(`Pax: ${pax.trim()}`);

  const metaParts: string[] = [];
  if (budget?.trim()) metaParts.push(`Budget: ${budget.trim()}`);
  if (cfDate) metaParts.push(`Date: ${cfDate}`);

  let relative = "—";
  try {
    const created = parseISO(ticket.created_at);
    if (!Number.isNaN(created.getTime())) {
      relative = formatDistanceToNow(created, { addSuffix: true });
    }
  } catch {
    relative = "—";
  }

  const showWhatsApp =
    ticket.source === 9 ||
    Boolean(
      cf.cf_periskope_message_id &&
        String(cf.cf_periskope_message_id).trim() !== "",
    );

  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E5E4DF] bg-white p-4 shadow-sm",
        "transition-shadow hover:shadow-md",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-stone-500">
          #{ticket.id}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            statusBadgeClass(st),
          )}
        >
          {st}
        </span>
        {showWhatsApp ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200/80">
            WhatsApp
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex gap-2">
        <span
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            priorityDotClass(pr),
          )}
          title={pr}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-stone-900">
            {ticket.subject}
          </p>
          {secondaryLine ? (
            <p className="mt-1 text-xs text-stone-600 line-clamp-2">
              {secondaryLine}
            </p>
          ) : null}
        </div>
      </div>

      {travelParts.length ? (
        <p className="mt-2 text-xs text-stone-600">{travelParts.join("  ·  ")}</p>
      ) : null}
      {metaParts.length ? (
        <p className="mt-1 text-xs text-stone-600">{metaParts.join("  ·  ")}</p>
      ) : null}

      <p className="mt-2 text-right text-[11px] text-stone-400">{relative}</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Lock,
  MessageSquare,
  Reply,
  StickyNote,
} from "lucide-react";
import type {
  FreshdeskAttachment,
  FreshdeskConversation,
  FreshdeskTicket,
} from "@/lib/freshdesk/types";
import {
  mapConversationSource,
  mapPriority,
  mapStatus,
} from "@/lib/freshdesk/types";
import { getTicketConversationsAction } from "@/lib/actions/freshdesk";
import { formatIST } from "@/lib/utils/time";
import { cn } from "@/lib/utils";

// ─── helpers ───────────────────────────────────────────────────────────────

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

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function proxyUrl(original: string): string {
  return `/api/freshdesk/attachment?url=${encodeURIComponent(original)}`;
}

function isImageType(contentType: string, name: string): boolean {
  if (contentType.startsWith("image/")) return true;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "heic"].includes(ext);
}

function relativeTime(iso: string): string {
  try {
    const d = parseISO(iso);
    if (!Number.isNaN(d.getTime()))
      return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    // fall through
  }
  return "—";
}

function absoluteTime(iso: string): string {
  try {
    const d = parseISO(iso);
    if (!Number.isNaN(d.getTime())) return format(d, "d MMM yyyy, HH:mm");
  } catch {
    // fall through
  }
  return iso;
}

// ─── ImageAttachment ────────────────────────────────────────────────────────

function ImageAttachment({ att }: { att: FreshdeskAttachment }) {
  // Stage: "thumb" → try thumbnail first; "full" → try full image; "error" → show icon
  const [stage, setStage] = useState<"thumb" | "full" | "error">(
    att.thumb_url ? "thumb" : "full",
  );

  const src =
    stage === "thumb"
      ? proxyUrl(att.thumb_url!)
      : proxyUrl(att.attachment_url);

  function handleError() {
    if (stage === "thumb") {
      setStage("full");
    } else {
      setStage("error");
    }
  }

  return (
    <a
      href={proxyUrl(att.attachment_url)}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-lg border border-[#E5E4DF] bg-stone-100 shadow-sm transition-shadow hover:shadow-md"
      title={att.name}
    >
      {stage === "error" ? (
        <span className="flex h-24 w-24 items-center justify-center">
          <ImageIcon className="h-6 w-6 text-stone-400" />
        </span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={att.name}
          className="h-24 w-24 object-cover transition-opacity group-hover:opacity-90"
          loading="lazy"
          onError={handleError}
        />
      )}
      <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/40 p-1">
        <ExternalLink className="h-2.5 w-2.5 text-white" />
      </span>
    </a>
  );
}

// ─── ConversationEntry ──────────────────────────────────────────────────────

function ConversationEntry({
  conv,
  isFirst,
}: {
  conv: FreshdeskConversation;
  isFirst: boolean;
}) {
  const isNote = conv.private;
  const source = mapConversationSource(conv.source);
  const bodyText = conv.body_text?.trim() || stripHtml(conv.body);

  return (
    <div
      className={cn(
        "relative pl-8",
        !isFirst && "border-t border-[#E5E4DF]",
      )}
    >
      {/* icon */}
      <div
        className={cn(
          "absolute left-0 top-3 flex h-6 w-6 items-center justify-center rounded-full ring-1",
          isNote
            ? "bg-amber-50 ring-amber-200 text-amber-600"
            : conv.incoming
              ? "bg-stone-100 ring-stone-200 text-stone-500"
              : "bg-brand-gold/10 ring-brand-gold/30 text-brand-gold",
        )}
        title={isNote ? "Private note" : conv.incoming ? "Reply from client" : "Reply from agent"}
      >
        {isNote ? (
          <StickyNote className="h-3 w-3" />
        ) : conv.incoming ? (
          <MessageSquare className="h-3 w-3" />
        ) : (
          <Reply className="h-3 w-3" />
        )}
      </div>

      <div className="py-3">
        {/* header row */}
        <div className="flex flex-wrap items-center gap-2">
          {isNote ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
              <Lock className="h-2.5 w-2.5" />
              Private Note
            </span>
          ) : (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                conv.incoming
                  ? "bg-stone-100 text-stone-600"
                  : "bg-brand-gold/10 text-brand-gold",
              )}
            >
              {conv.incoming ? "Client" : "Agent"}
            </span>
          )}
          {source === "whatsapp" && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200/80">
              WhatsApp
            </span>
          )}
          {conv.from_email ? (
            <span className="truncate text-[11px] text-stone-500">
              {conv.from_email}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-[11px] text-stone-400" title={absoluteTime(conv.created_at)}>
            {relativeTime(conv.created_at)}
          </span>
        </div>

        {/* body */}
        {bodyText ? (
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-stone-700">
            {bodyText}
          </p>
        ) : null}

        {/* attachments */}
        {conv.attachments.length > 0 ? (
          <div className="mt-3 space-y-2">
            {/* inline images */}
            {conv.attachments.filter((a) => isImageType(a.content_type, a.name)).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {conv.attachments
                  .filter((a) => isImageType(a.content_type, a.name))
                  .map((att) => (
                    <ImageAttachment key={att.id} att={att} />
                  ))}
              </div>
            ) : null}

            {/* non-image file attachments */}
            {conv.attachments.filter((a) => !isImageType(a.content_type, a.name)).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {conv.attachments
                  .filter((a) => !isImageType(a.content_type, a.name))
                  .map((att) => (
                    <a
                      key={att.id}
                      href={proxyUrl(att.attachment_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E4DF] bg-white px-2.5 py-1.5 text-[11px] text-stone-700 shadow-sm transition-colors hover:bg-stone-50"
                      download={att.name}
                    >
                      <FileText className="h-3 w-3 shrink-0 text-stone-400" />
                      <span className="max-w-[180px] truncate">{att.name}</span>
                      <span className="shrink-0 text-stone-400">
                        ({formatBytes(att.size)})
                      </span>
                    </a>
                  ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── TicketCard ─────────────────────────────────────────────────────────────

interface TicketCardProps {
  ticket: FreshdeskTicket;
  clientId: string;
}

export function TicketCard({ ticket, clientId }: TicketCardProps) {
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
  const cfNote = cf.cf_note ?? null;
  const cfProductDetails = cf.cf_product_details ?? null;
  const cfLocation = cf.cf_location ?? null;
  const cfGiftSpecs = cf.cf_gift_specifications ?? null;

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

  // Extra custom fields to show in expanded view
  const extraFields = [
    cfNote ? { label: "Note", value: cfNote } : null,
    cfProductDetails ? { label: "Product details", value: cfProductDetails } : null,
    cfLocation ? { label: "Location", value: cfLocation } : null,
    cfGiftSpecs ? { label: "Gift specs", value: cfGiftSpecs } : null,
    cf.cf_poc ? { label: "POC", value: cf.cf_poc } : null,
    cf.cf_time ? { label: "Time", value: cf.cf_time } : null,
    cf.cf_duration ? { label: "Duration", value: cf.cf_duration } : null,
    cf.cf_luggage ? { label: "Luggage", value: cf.cf_luggage } : null,
    cf.cf_airport ? { label: "Airport", value: cf.cf_airport } : null,
    cf.cf_early_check_in
      ? { label: "Early check-in", value: cf.cf_early_check_in }
      : null,
    cf.cf_assistance_required
      ? { label: "Assistance", value: cf.cf_assistance_required }
      : null,
    cf.cf_ticket_type ? { label: "Ticket type", value: cf.cf_ticket_type } : null,
    cf.cf_queendom ? { label: "Queendom", value: cf.cf_queendom } : null,
    cf.cf_client_name ? { label: "Client name (FD)", value: cf.cf_client_name } : null,
    cf.cf_periskope_assignee
      ? { label: "Periskope assignee", value: cf.cf_periskope_assignee }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const statsRows = ticket.stats
    ? [
        ticket.stats.first_responded_at
          ? {
              label: "First response",
              value: `${relativeTime(ticket.stats.first_responded_at)} (${absoluteTime(ticket.stats.first_responded_at)})`,
            }
          : null,
        ticket.stats.agent_responded_at
          ? {
              label: "Last agent reply",
              value: `${relativeTime(ticket.stats.agent_responded_at)} (${absoluteTime(ticket.stats.agent_responded_at)})`,
            }
          : null,
        ticket.stats.requester_responded_at
          ? {
              label: "Last client reply",
              value: `${relativeTime(ticket.stats.requester_responded_at)} (${absoluteTime(ticket.stats.requester_responded_at)})`,
            }
          : null,
        ticket.stats.resolved_at
          ? {
              label: "Resolved",
              value: `${relativeTime(ticket.stats.resolved_at)} (${absoluteTime(ticket.stats.resolved_at)})`,
            }
          : null,
        ticket.stats.closed_at
          ? {
              label: "Closed",
              value: `${relativeTime(ticket.stats.closed_at)} (${absoluteTime(ticket.stats.closed_at)})`,
            }
          : null,
      ].filter(Boolean) as { label: string; value: string }[]
    : [];

  // ── expand state ──
  const [expanded, setExpanded] = useState(false);
  const [convState, setConvState] = useState<{
    loaded: boolean;
    loading: boolean;
    data: FreshdeskConversation[] | null;
    error: string | null;
  }>({ loaded: false, loading: false, data: null, error: null });

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && !convState.loaded) {
      setConvState((s) => ({ ...s, loading: true, error: null }));
      const res = await getTicketConversationsAction(clientId, ticket.id);
      if (res.success) {
        setConvState({ loaded: true, loading: false, data: res.data ?? [], error: null });
      } else {
        setConvState({ loaded: true, loading: false, data: null, error: res.error ?? "Failed to load" });
      }
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E5E4DF] bg-white shadow-sm",
        "transition-shadow hover:shadow-md",
      )}
    >
      {/* ── collapsed header ── */}
      <button
        type="button"
        onClick={() => void handleExpand()}
        className="w-full cursor-pointer rounded-2xl px-4 pt-4 pb-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/40"
        aria-expanded={expanded}
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
          {ticket.type ? (
            <span className="rounded-full bg-[#F4F1EA] px-2 py-0.5 text-[10px] text-stone-600">
              {ticket.type}
            </span>
          ) : null}
          {showWhatsApp ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200/80">
              WhatsApp
            </span>
          ) : null}
          {ticket.is_escalated ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-200/80">
              Escalated
            </span>
          ) : null}
          {ticket.tags.length > 0
            ? ticket.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500"
                >
                  {tag}
                </span>
              ))
            : null}
        </div>

        <div className="mt-2 flex gap-2">
          <span
            className={cn(
              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
              priorityDotClass(pr),
            )}
            title={`${pr} priority`}
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
          <span className="ml-2 shrink-0 self-start text-stone-400">
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </div>

        {travelParts.length ? (
          <p className="mt-2 text-xs text-stone-600">
            {travelParts.join("  ·  ")}
          </p>
        ) : null}
        {metaParts.length ? (
          <p className="mt-1 text-xs text-stone-600">
            {metaParts.join("  ·  ")}
          </p>
        ) : null}

        <p className="mt-2 text-right text-[11px] text-stone-400">{relative}</p>
      </button>

      {/* ── expanded detail ── */}
      {expanded ? (
        <div className="border-t border-[#E5E4DF]">
          {/* Description */}
          {(ticket.description_text?.trim() ||
            ticket.description?.trim()) && (
            <div className="px-4 pt-4 pb-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                Description
              </p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-stone-700">
                {ticket.description_text?.trim() ||
                  stripHtml(ticket.description ?? "")}
              </p>
            </div>
          )}

          {/* Extra custom fields */}
          {extraFields.length > 0 ? (
            <div className="border-t border-[#E5E4DF] px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                Details
              </p>
              <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {extraFields.map((f) => (
                  <div key={f.label} className="flex flex-col">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-stone-400">
                      {f.label}
                    </span>
                    <span className="text-xs text-stone-700">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* SLA / stats */}
          {statsRows.length > 0 ? (
            <div className="border-t border-[#E5E4DF] px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                Timeline
              </p>
              <div className="space-y-1">
                {statsRows.map((r) => (
                  <div key={r.label} className="flex items-baseline gap-2">
                    <span className="w-[110px] shrink-0 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                      {r.label}
                    </span>
                    <span className="text-xs text-stone-600">{r.value}</span>
                  </div>
                ))}
              </div>
              {ticket.due_by ? (
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="w-[110px] shrink-0 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                    Due by
                  </span>
                  <span className="text-xs text-stone-600">
                    {absoluteTime(ticket.due_by)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Conversations / Notes */}
          <div className="border-t border-[#E5E4DF] px-4 py-3">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
              Conversations &amp; Notes
            </p>

            {convState.loading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : convState.error ? (
              <p className="text-xs text-red-600">{convState.error}</p>
            ) : convState.data && convState.data.length > 0 ? (
              <div className="space-y-0">
                {convState.data.map((conv, i) => (
                  <ConversationEntry
                    key={conv.id}
                    conv={conv}
                    isFirst={i === 0}
                  />
                ))}
              </div>
            ) : convState.loaded ? (
              <p className="text-xs text-stone-400">
                No conversations or notes yet.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

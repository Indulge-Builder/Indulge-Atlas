"use client";

import { useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Download, Loader2, Sparkles, Ticket } from "lucide-react";
import { getClientFreshdeskTickets, getTicketConversationsAction, reloadFreshdeskForClient } from "@/lib/actions/freshdesk";
import type { ClientFreshdeskTicketsData, FreshdeskContact, FreshdeskConversation, FreshdeskTicket } from "@/lib/freshdesk/types";
import { mapConversationSource, mapPriority, mapStatus } from "@/lib/freshdesk/types";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketCard } from "@/components/clients/TicketCard";
import { TicketSummaryModal } from "@/components/clients/TicketSummaryModal";
import { cn } from "@/lib/utils";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "yyyy-MM-dd HH:mm");
  } catch {
    return iso;
  }
}

function buildContactSection(contact: FreshdeskContact): string[] {
  const lines: string[] = [
    "================================================================",
    "CLIENT PROFILE",
    "================================================================",
    `Name:     ${contact.name || "—"}`,
    `Email:    ${contact.email || "—"}`,
    `Phone:    ${contact.phone || "—"}`,
    `Mobile:   ${contact.mobile || "—"}`,
    `Active:   ${contact.active ? "Yes" : "No"}`,
    `Created:  ${fmtDate(contact.created_at)}`,
    "",
    "— Personal —",
  ];
  const cf = contact.custom_fields;
  const personal: [string, string | null][] = [
    ["Birthday", cf.birthday],
    ["Anniversary", cf.anniversary],
    ["Marital Status", cf.marital_status],
    ["Blood Group", cf.blood_group],
    ["Category", cf.category],
  ];
  const prefs: [string, string | null][] = [
    ["Diet", cf.diet],
    ["Veg / Non-veg", cf.veg_non_veg],
    ["Allergies", cf.allergies],
    ["Drink", cf.drink],
    ["Food", cf.food],
    ["Restaurant", cf.restaurant],
    ["Cuisine", cf.cuisine],
    ["Flight Seat", cf.flight_seat],
    ["Stays", cf.stays],
    ["Sport", cf.sport],
    ["Favourite Brand", cf.favourite_brand],
    ["Watch", cf.watch],
    ["Car", cf.car],
    ["Country", cf.country],
  ];
  const work: [string, string | null][] = [
    ["Company / Designation", cf.company_and_designation],
    ["Instagram", cf.instagram],
    ["LinkedIn", cf.linkedin],
    ["Need Assistance With", cf.need_assistance_with],
  ];
  for (const [label, val] of personal) {
    lines.push(`  ${label}: ${val || "—"}`);
  }
  lines.push("", "— Preferences —");
  for (const [label, val] of prefs) {
    lines.push(`  ${label}: ${val || "—"}`);
  }
  lines.push("", "— Work & Social —");
  for (const [label, val] of work) {
    lines.push(`  ${label}: ${val || "—"}`);
  }
  // any remaining unknown custom fields
  const known = new Set([
    "category","birthday","marital_status","anniversary","sport",
    "favourite_brand","watch","stays","flight_seat","veg_non_veg",
    "allergies","diet","drink","food","restaurant","cuisine","country",
    "car","blood_group","need_assistance_with","company_and_designation",
    "instagram","linkedin","periskope_chat_id",
  ]);
  const extras = Object.entries(cf).filter(([k, v]) => !known.has(k) && v);
  if (extras.length) {
    lines.push("", "— Other Fields —");
    for (const [k, v] of extras) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  return lines;
}

function buildConversationLine(c: FreshdeskConversation): string {
  const ts = fmtDate(c.created_at);
  const dir = c.incoming ? "CLIENT → Agent" : "AGENT  → Client";
  const type = c.private ? "NOTE (internal)" : mapConversationSource(c.source).toUpperCase();
  const body = c.body_text?.replace(/\s+/g, " ").trim() || c.body?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "[no text]";
  const attachments = c.attachments.length
    ? ` [${c.attachments.length} attachment${c.attachments.length > 1 ? "s" : ""}: ${c.attachments.map((a) => a.name).join(", ")}]`
    : "";
  return `  [${ts}] ${c.private ? "NOTE (internal)" : dir} (${type}): ${body}${attachments}`;
}

function buildTicketSection(
  ticket: FreshdeskTicket,
  conversations: FreshdeskConversation[],
  index: number,
): string[] {
  const cf = ticket.custom_fields;
  const lines: string[] = [
    "",
    "────────────────────────────────────────────────────────────────",
    `TICKET #${ticket.id} [${index + 1}] — ${ticket.subject}`,
    "────────────────────────────────────────────────────────────────",
    `Status:   ${mapStatus(ticket.status).toUpperCase()} | Priority: ${mapPriority(ticket.priority).toUpperCase()} | Type: ${ticket.type || "—"}`,
    `Created:  ${fmtDate(ticket.created_at)}`,
    `Updated:  ${fmtDate(ticket.updated_at)}`,
  ];
  if (ticket.stats?.resolved_at) lines.push(`Resolved: ${fmtDate(ticket.stats.resolved_at)}`);
  if (ticket.stats?.closed_at) lines.push(`Closed:   ${fmtDate(ticket.stats.closed_at)}`);
  if (ticket.is_escalated) lines.push("⚠ ESCALATED");
  if (ticket.tags.length) lines.push(`Tags:     ${ticket.tags.join(", ")}`);

  lines.push("", "— Request Details —");
  const fields: [string, string | null | undefined][] = [
    ["Request", cf.cf_request],
    ["Event / Service", cf.cf_events],
    ["From", cf.cf_from_location],
    ["To", cf.cf_to_location],
    ["Date", cf.cf_date],
    ["Time", cf.cf_time],
    ["Duration", cf.cf_duration],
    ["Budget", cf.cf_budget],
    ["Pax", cf.cf_pax],
    ["Location", cf.cf_location],
    ["Airport", cf.cf_airport],
    ["Luggage", cf.cf_luggage],
    ["Early Check-in", cf.cf_early_check_in],
    ["Assistance Required", cf.cf_assistance_required],
    ["Gift Specifications", cf.cf_gift_specifications],
    ["Product Details", cf.cf_product_details],
    ["POC", cf.cf_poc],
    ["Client Name (cf)", cf.cf_client_name],
    ["Queendom", cf.cf_queendom],
    ["Ticket Type", cf.cf_ticket_type],
    ["Note", cf.cf_note],
  ];
  for (const [label, val] of fields) {
    if (val) lines.push(`  ${label}: ${val}`);
  }

  if (ticket.description_text?.trim()) {
    lines.push("", "— Description —");
    lines.push(
      ticket.description_text.replace(/\s+/g, " ").trim().slice(0, 2000),
    );
  }

  if (conversations.length) {
    lines.push("", `— Conversation Thread (${conversations.length} messages) —`);
    for (const c of conversations) {
      lines.push(buildConversationLine(c));
    }
  } else {
    lines.push("", "  [No conversation thread]");
  }

  return lines;
}

async function fetchAllConversations(
  clientId: string,
  tickets: FreshdeskTicket[],
  onProgress: (done: number) => void,
): Promise<Map<number, FreshdeskConversation[]>> {
  const result = new Map<number, FreshdeskConversation[]>();
  const batchSize = 10;
  let done = 0;
  for (let i = 0; i < tickets.length; i += batchSize) {
    const batch = tickets.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map((t) => getTicketConversationsAction(clientId, t.id)),
    );
    for (let j = 0; j < batch.length; j++) {
      const ticket = batch[j]!;
      const res = settled[j]!;
      if (res.status === "fulfilled" && res.value.success && res.value.data) {
        result.set(ticket.id, res.value.data);
      } else {
        result.set(ticket.id, []);
      }
      done++;
      onProgress(done);
    }
  }
  return result;
}

interface FreshdeskTabProps {
  clientId: string;
  clientPhone: string | null;
  clientName: string;
  isActive: boolean;
}

function StatPill({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: string;
  dotClass?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-[120px] flex-1 items-center gap-2 rounded-full border border-[#E5E4DF] bg-white px-3 py-2 shadow-sm",
      )}
    >
      {dotClass ? (
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)}
          aria-hidden
        />
      ) : null}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-stone-800">{value}</p>
      </div>
    </div>
  );
}

export function FreshdeskTab({
  clientId,
  clientPhone,
  clientName,
  isActive,
}: FreshdeskTabProps) {
  const hasLoadedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<ClientFreshdeskTicketsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    hasLoadedRef.current = false;
    setData(null);
    setError(null);
    setIsLoading(false);
  }, [clientId]);

  useEffect(() => {
    if (!isActive || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      const res = await getClientFreshdeskTickets(clientId);
      if (cancelled) {
        hasLoadedRef.current = false;
        return;
      }
      setIsLoading(false);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error ?? "Could not load service history");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isActive, clientId]);

  useEffect(() => {
    setVisibleCount(20);
  }, [clientId, data]);

  async function handleExport() {
    if (!data?.found || exporting) return;
    setExporting(true);
    setExportProgress({ done: 0, total: data.tickets.length });
    try {
      const conversationsMap = await fetchAllConversations(
        clientId,
        data.tickets,
        (done) => setExportProgress({ done, total: data.tickets.length }),
      );

      const lines: string[] = [
        `Freshdesk Export — ${clientName}`,
        `Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`,
        `Tickets: ${data.tickets.length}`,
        "",
        ...buildContactSection(data.contact),
        "",
        "================================================================",
        `SERVICE HISTORY — ${data.tickets.length} ticket${data.tickets.length !== 1 ? "s" : ""}`,
        "================================================================",
      ];

      data.tickets.forEach((ticket, i) => {
        const convos = conversationsMap.get(ticket.id) ?? [];
        lines.push(...buildTicketSection(ticket, convos, i));
      });

      const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = clientName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      a.download = `${safeName}_freshdesk_export.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }

  if (isLoading) {
    return (
      <div className="mt-2 space-y-4">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton
              key={i}
              className="h-14 flex-1 min-w-[100px] rounded-full"
            />
          ))}
        </div>
        <Skeleton className="h-10 w-48 rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-200/90 bg-amber-50/60 p-6 text-center">
        <Ticket className="mx-auto h-10 w-10 text-amber-700/80" aria-hidden />
        <p className="mt-3 text-sm font-medium text-stone-800">
          Couldn&apos;t load Freshdesk data
        </p>
        <p className="mt-1 text-xs text-stone-600">{error}</p>
        <IndulgeButton
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => {
            hasLoadedRef.current = true;
            setError(null);
            setData(null);
            setIsLoading(true);
            void (async () => {
              const res = await reloadFreshdeskForClient(clientId);
              setIsLoading(false);
              if (res.success && res.data) setData(res.data);
              else setError(res.error ?? "Could not load service history");
            })();
          }}
        >
          Try again
        </IndulgeButton>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  if (!data.found) {
    return (
      <div className="mt-8 flex flex-col items-center justify-center px-4 py-12 text-center">
        <div className="rounded-full bg-stone-100 p-4">
          <Ticket className="h-10 w-10 text-stone-400" aria-hidden />
        </div>
        <p className="mt-4 text-sm font-medium text-stone-800">
          No service history found in Freshdesk
        </p>
        <p className="mt-2 max-w-md text-xs text-stone-500">
          Tickets appear here once this client&apos;s phone number is matched
          {clientPhone ? (
            <>
              {" "}
              (<span className="font-mono">{clientPhone}</span>)
            </>
          ) : null}
          .
        </p>
      </div>
    );
  }

  const { tickets, stats } = data;
  const lastLabel =
    stats.last_ticket_date &&
    (() => {
      try {
        const d = parseISO(stats.last_ticket_date);
        if (!Number.isNaN(d.getTime())) {
          return formatDistanceToNow(d, { addSuffix: true });
        }
      } catch {
        /* fall through */
      }
      return "—";
    })();

  const shown = tickets.slice(0, visibleCount);
  const hasMore = tickets.length > 20 && visibleCount < tickets.length;

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap gap-2">
        <StatPill label="Total tickets" value={String(stats.total)} />
        <StatPill
          label="Open"
          value={String(stats.open)}
          dotClass="bg-emerald-500"
        />
        <StatPill
          label="Resolved"
          value={String(stats.resolved)}
          dotClass="bg-stone-400"
        />
        <StatPill label="Last service" value={lastLabel ?? "—"} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <IndulgeButton
          type="button"
          variant="gold"
          leftIcon={<Sparkles className="h-4 w-4" />}
          onClick={() => setSummaryOpen(true)}
          disabled={!tickets.length}
        >
          Generate AI Summary
        </IndulgeButton>

        <IndulgeButton
          type="button"
          variant="outline"
          leftIcon={
            exporting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />
          }
          onClick={() => void handleExport()}
          disabled={!tickets.length || exporting}
        >
          {exporting && exportProgress
            ? `Exporting… ${exportProgress.done}/${exportProgress.total}`
            : "Export Full History"}
        </IndulgeButton>
      </div>

      <div className="space-y-3">
        {shown.map((t) => (
          <TicketCard key={t.id} ticket={t} clientId={clientId} />
        ))}
      </div>

      {hasMore ? (
        <div className="flex justify-center pt-2">
          <IndulgeButton
            type="button"
            variant="outline"
            onClick={() => setVisibleCount(tickets.length)}
          >
            Show more
          </IndulgeButton>
        </div>
      ) : null}

      <TicketSummaryModal
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        clientId={clientId}
        clientName={clientName}
        tickets={tickets}
      />
    </div>
  );
}

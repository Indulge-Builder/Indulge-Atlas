"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Sparkles, Ticket } from "lucide-react";
import { getClientFreshdeskTickets } from "@/lib/actions/freshdesk";
import type { ClientFreshdeskTicketsData } from "@/lib/freshdesk/types";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketCard } from "@/components/clients/TicketCard";
import { TicketSummaryModal } from "@/components/clients/TicketSummaryModal";
import { cn } from "@/lib/utils";

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

  if (isLoading) {
    return (
      <div className="mt-2 space-y-4">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 flex-1 min-w-[100px] rounded-full" />
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
            hasLoadedRef.current = false;
            setError(null);
            setData(null);
            setIsLoading(true);
            void (async () => {
              const res = await getClientFreshdeskTickets(clientId);
              setIsLoading(false);
              hasLoadedRef.current = true;
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

      <IndulgeButton
        type="button"
        variant="gold"
        leftIcon={<Sparkles className="h-4 w-4" />}
        onClick={() => setSummaryOpen(true)}
        disabled={!tickets.length}
      >
        Generate AI Summary
      </IndulgeButton>

      <div className="space-y-3">
        {shown.map((t) => (
          <TicketCard key={t.id} ticket={t} />
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

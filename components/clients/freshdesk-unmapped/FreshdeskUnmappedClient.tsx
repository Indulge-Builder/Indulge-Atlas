"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Phone, RefreshCw, Ticket, User } from "lucide-react";
import { getFreshdeskUnmappedClients, type FreshdeskClientCheckRow } from "@/lib/actions/freshdesk";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Input } from "@/components/ui/input";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/useDebounce";

const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  const isActive = status === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
        isActive
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-stone-100 text-stone-600 ring-stone-200",
      )}
    >
      {label}
    </span>
  );
}

function ClientRow({ client }: { client: FreshdeskClientCheckRow }) {
  const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ");
  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
        "flex items-center gap-4 rounded-2xl border border-[#E5E4DF] px-5 py-4",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100">
        <User className="h-5 w-5 text-stone-400" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/clients/${client.id}`}
            className="truncate text-sm font-semibold text-stone-900 hover:underline"
          >
            {fullName || "—"}
          </Link>
          <StatusBadge status={client.client_status} />
          {client.membership_type && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
              {client.membership_type}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-500">
          {client.phone_number && (
            <span className="flex items-center gap-1 font-mono">
              <Phone className="h-3 w-3" aria-hidden />
              {client.phone_number}
            </span>
          )}
          {client.queendom && (
            <span className="text-stone-400">{client.queendom}</span>
          )}
        </div>
      </div>

      <Link href={`/clients/${client.id}?tab=service-history`}>
        <IndulgeButton type="button" variant="outline" className="shrink-0 text-xs">
          View profile
        </IndulgeButton>
      </Link>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="flex min-w-[140px] flex-1 flex-col rounded-2xl border border-[#E5E4DF] bg-white px-5 py-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-900">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-stone-400">{sub}</p>}
    </div>
  );
}

interface FreshdeskUnmappedClientProps {
  initialClients: FreshdeskClientCheckRow[];
  initialChecked: number;
  initialTotal: number;
  initialHasMore: boolean;
}

export function FreshdeskUnmappedClient({
  initialClients,
  initialChecked,
  initialTotal,
  initialHasMore,
}: FreshdeskUnmappedClientProps) {
  const [clients, setClients] = useState<FreshdeskClientCheckRow[]>(initialClients);
  const [checkedCount, setCheckedCount] = useState(initialChecked);
  const [totalWithPhone, setTotalWithPhone] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [isPending, startTransition] = useTransition();
  const [isSearchReset, setIsSearchReset] = useState(false);
  const prevSearch = useRef(debouncedSearch);

  const load = useCallback(
    (pageNum: number, q: string, replace: boolean) => {
      startTransition(async () => {
        const res = await getFreshdeskUnmappedClients({
          page: pageNum,
          pageSize: PAGE_SIZE,
          search: q || undefined,
        });
        if (!res.success) return;
        setClients((prev) => (replace ? res.clients : [...prev, ...res.clients]));
        setCheckedCount((prev) => (replace ? res.checkedCount : prev + res.checkedCount));
        setTotalWithPhone(res.totalWithPhone);
        setHasMore(res.hasMore);
        setPage(pageNum);
      });
    },
    [],
  );

  // Reset on search change
  useEffect(() => {
    if (prevSearch.current === debouncedSearch) return;
    prevSearch.current = debouncedSearch;
    setIsSearchReset(true);
    setClients([]);
    setCheckedCount(0);
    setHasMore(false);
    load(1, debouncedSearch, true);
  }, [debouncedSearch, load]);

  useEffect(() => {
    if (isSearchReset) setIsSearchReset(false);
  }, [isSearchReset]);

  function handleLoadMore() {
    load(page + 1, debouncedSearch, false);
  }

  function handleRefresh() {
    setClients([]);
    setCheckedCount(0);
    setHasMore(false);
    load(1, debouncedSearch, true);
  }

  const unmappedCount = clients.length;
  const pct = totalWithPhone > 0 ? Math.round((checkedCount / totalWithPhone) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-8 py-6">
      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <StatTile
          label="No Freshdesk match"
          value={unmappedCount}
          sub={`from ${checkedCount} checked`}
        />
        <StatTile
          label="Clients with phone"
          value={totalWithPhone}
          sub="eligible to check"
        />
        <StatTile
          label="Checked so far"
          value={`${pct}%`}
          sub={`${checkedCount} / ${totalWithPhone}`}
        />
      </div>

      {/* Search + refresh */}
      <div className="flex gap-3">
        <Input
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <IndulgeButton
          type="button"
          variant="outline"
          leftIcon={
            isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />
          }
          onClick={handleRefresh}
          disabled={isPending}
        >
          Refresh
        </IndulgeButton>
      </div>

      {/* Info note */}
      <p className="text-xs text-stone-500">
        Showing clients whose phone number returns no contact in Freshdesk (by phone, mobile, or
        name lookup). Each batch of {PAGE_SIZE} is checked live against Freshdesk — load more pages
        to widen the scan.
      </p>

      {/* Results */}
      {isPending && clients.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
        </div>
      ) : clients.length === 0 && checkedCount > 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-emerald-50 p-4">
            <Ticket className="h-10 w-10 text-emerald-400" aria-hidden />
          </div>
          <p className="mt-4 text-sm font-medium text-stone-800">
            All checked clients are mapped in Freshdesk
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {checkedCount} clients checked — no missing contacts found in this batch.
          </p>
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-stone-100 p-4">
            <Ticket className="h-10 w-10 text-stone-400" aria-hidden />
          </div>
          <p className="mt-4 text-sm font-medium text-stone-800">No clients to display</p>
          <p className="mt-1 text-xs text-stone-500">
            Adjust the search or click Refresh to start scanning.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <ClientRow key={c.id} client={c} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <IndulgeButton
            type="button"
            variant="outline"
            leftIcon={
              isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
            }
            onClick={handleLoadMore}
            disabled={isPending}
          >
            {isPending ? "Checking next batch…" : `Check next ${PAGE_SIZE} clients`}
          </IndulgeButton>
        </div>
      )}

      {!hasMore && checkedCount > 0 && (
        <p className="text-center text-xs text-stone-400">
          All {totalWithPhone} clients with phone numbers have been checked.
        </p>
      )}
    </div>
  );
}

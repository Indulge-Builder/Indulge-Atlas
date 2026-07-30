"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ClientCard } from "@/components/clients/ClientCard";
import {
  ClientFilters,
  type ClientViewMode,
  type QueendomFilter,
  type StatusFilter,
  type UnmappedFilter,
} from "@/components/clients/ClientFilters";
import { ClientListRow } from "@/components/clients/ClientListRow";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Skeleton } from "@/components/ui/skeleton";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getClients,
  updateClientChettoGroupId,
  updateClientPhone,
  type ClientDirectoryStats,
  type ClientWithProfile,
} from "@/lib/actions/clients";
import { useDebounce } from "@/lib/hooks/useDebounce";
import Link from "next/link";
import { toast } from "sonner";

const PAGE_SIZE = 24;

type ClientListQueendom =
  | "Ananyshree Queendom"
  | "Anishqa Queendom"
  | "Unassigned";

interface ClientsIndexProps {
  initialClients: ClientWithProfile[];
  initialTotal: number;
  stats: ClientDirectoryStats;
  /** Manager / admin — link to bulk Chetto group id mapping. */
  showChettoMappingLink?: boolean;
  /** Pending rows in client_chetto_unmapped_queue (migration 105). */
  chettoQueuePending?: number;
}

function ClientsListSkeleton() {
  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
        "divide-y divide-[#E5E4DF]/80 overflow-hidden",
      )}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full bg-stone-100" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-[45%] bg-stone-100" />
            <Skeleton className="h-3 w-[65%] bg-stone-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ClientsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
            "overflow-hidden p-4",
          )}
        >
          <div className="flex gap-3">
            <Skeleton className="h-14 w-14 shrink-0 rounded-full bg-stone-100" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-[70%] bg-stone-100" />
              <Skeleton className="h-3 w-[45%] bg-stone-100" />
              <Skeleton className="h-3 w-[80%] bg-stone-100" />
            </div>
          </div>
          <Skeleton className="mt-4 h-px w-full bg-stone-100" />
          <Skeleton className="mt-4 h-3 w-full bg-stone-100" />
        </div>
      ))}
    </div>
  );
}

export default function ClientsIndex({
  initialClients,
  initialTotal,
  stats,
  showChettoMappingLink = false,
  chettoQueuePending = 0,
}: ClientsIndexProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [queendomFilter, setQueendomFilter] = useState<QueendomFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [membershipFilter, setMembershipFilter] = useState<string>("all");
  const [unmappedFilter, setUnmappedFilter] = useState<UnmappedFilter>("none");
  const [viewMode, setViewMode] = useState<ClientViewMode>("cards");

  const [clients, setClients] = useState<ClientWithProfile[]>(initialClients);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);

  const [isPending, startTransition] = useTransition();
  const skipFirstFilterEffect = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("atlas-clients-view");
      // Hydrate list/cards preference after mount (localStorage unavailable during SSR).
      if (raw === "list" || raw === "cards") {
        queueMicrotask(() => setViewMode(raw));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("atlas-clients-view", viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const buildFilters = useCallback(() => {
    return {
      queendom:
        queendomFilter === "all"
          ? undefined
          : (queendomFilter as ClientListQueendom),
      client_status:
        statusFilter === "all"
          ? undefined
          : (statusFilter as "active" | "expired"),
      membership_type:
        membershipFilter === "all" ? undefined : membershipFilter,
      search: debouncedSearch.trim() === "" ? undefined : debouncedSearch,
      sort: "profile_data" as const,
      pageSize: PAGE_SIZE,
      unmapped: unmappedFilter === "none" ? undefined : unmappedFilter,
    };
  }, [queendomFilter, statusFilter, membershipFilter, debouncedSearch, unmappedFilter]);

  useEffect(() => {
    if (!skipFirstFilterEffect.current) {
      skipFirstFilterEffect.current = true;
      return;
    }

    startTransition(() => {
      void (async () => {
        const res = await getClients({
          ...buildFilters(),
          page: 1,
        });
        setClients(res.clients);
        setTotal(res.total);
        setPage(res.page);
      })();
    });
  }, [buildFilters]);

  function handleLoadMore() {
    const nextPage = page + 1;
    startTransition(() => {
      void (async () => {
        const res = await getClients({
          ...buildFilters(),
          page: nextPage,
        });
        setClients((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          const merged = [...prev];
          for (const c of res.clients) {
            if (!seen.has(c.id)) {
              seen.add(c.id);
              merged.push(c);
            }
          }
          return merged;
        });
        setTotal(res.total);
        setPage(res.page);
      })();
    });
  }

  const hasMore = clients.length < total;

  async function handleUnmappedSave(clientId: string, value: string) {
    if (unmappedFilter === "chetto") {
      const res = await updateClientChettoGroupId(clientId, value.trim() || null);
      if (!res.success) {
        toast.error(res.error ?? "Failed to save Chetto group id");
        return;
      }
      toast.success("Chetto group id saved");
    } else if (unmappedFilter === "freshdesk") {
      const res = await updateClientPhone(clientId, value.trim());
      if (!res.success) {
        toast.error(res.error ?? "Failed to save phone number");
        return;
      }
      toast.success("Phone number saved");
    }
    // Refresh the list so the saved client disappears from the unmapped view
    startTransition(() => {
      void (async () => {
        const res = await getClients({ ...buildFilters(), page: 1 });
        setClients(res.clients);
        setTotal(res.total);
        setPage(res.page);
      })();
    });
  }

  return (
    <div className="min-h-0 flex-1 px-8 py-6">
      <header className="mb-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-[family-name:var(--font-playfair)] text-3xl font-semibold tracking-tight text-stone-900">
            Clients
          </h1>
          {showChettoMappingLink ? (
            <div className="flex flex-wrap items-center gap-4">
              {chettoQueuePending > 0 ? (
                <Link
                  href="/clients/chetto-unmapped"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden />
                  Chetto backlog ({chettoQueuePending})
                </Link>
              ) : null}
              <Link
                href="/clients/unmapped"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                Unmapped profiles
              </Link>
              <Link
                href="/clients/chetto-mapping"
                className="text-sm font-medium text-[#9A7B2E] underline-offset-2 hover:underline"
              >
                Chetto group mapping
              </Link>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div
            className={cn(
              surfaceCardVariants({ tone: "luxury", elevation: "xs" }),
              "px-4 py-3",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              Active
            </p>
            <p className="mt-1 font-[family-name:var(--font-playfair)] text-2xl text-stone-900">
              {stats.activeCount.toLocaleString()}
            </p>
          </div>
          <div
            className={cn(
              surfaceCardVariants({ tone: "luxury", elevation: "xs" }),
              "px-4 py-3",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              Expired
            </p>
            <p className="mt-1 font-[family-name:var(--font-playfair)] text-2xl text-stone-900">
              {stats.expiredCount.toLocaleString()}
            </p>
          </div>
          <div
            className={cn(
              surfaceCardVariants({ tone: "luxury", elevation: "xs" }),
              "px-4 py-3",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              Total members
            </p>
            <p className="mt-1 font-[family-name:var(--font-playfair)] text-2xl text-stone-900">
              {stats.totalMembers.toLocaleString()}
            </p>
          </div>
          <div
            className={cn(
              surfaceCardVariants({ tone: "luxury", elevation: "xs" }),
              "px-4 py-3",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              New this month
            </p>
            <p className="mt-1 font-[family-name:var(--font-playfair)] text-2xl text-stone-900">
              {stats.newThisMonthCount.toLocaleString()}
            </p>
          </div>
        </div>

        <div
          className={cn(
            surfaceCardVariants({ tone: "stone", elevation: "sm" }),
            "p-5",
          )}
        >
          <ClientFilters
            search={search}
            onSearchChange={setSearch}
            queendom={queendomFilter}
            onQueendomChange={setQueendomFilter}
            status={statusFilter}
            onStatusChange={setStatusFilter}
            membership={membershipFilter}
            onMembershipChange={setMembershipFilter}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            unmapped={unmappedFilter}
            onUnmappedChange={setUnmappedFilter}
          />
        </div>
      </header>

      {isPending && clients.length === 0 ? (
        viewMode === "list" ? (
          <ClientsListSkeleton />
        ) : (
          <ClientsGridSkeleton />
        )
      ) : (
        <>
          {viewMode === "list" ? (
            <div
              className={cn(
                surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
                "overflow-hidden",
              )}
            >
              {clients.map((c) => (
                <ClientListRow
                  key={c.id}
                  client={c}
                  unmappedMode={unmappedFilter}
                  onSave={handleUnmappedSave}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {clients.map((c) => (
                <ClientCard
                  key={c.id}
                  client={c}
                  unmappedMode={unmappedFilter}
                  onSave={handleUnmappedSave}
                />
              ))}
            </div>
          )}

          {clients.length === 0 && !isPending && (
            <div
              className={cn(
                surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
                "flex flex-col items-center justify-center py-16 text-center",
              )}
            >
              <p className="font-[family-name:var(--font-playfair)] text-xl text-stone-800">
                No clients match your filters
              </p>
              <p className="mt-2 max-w-md text-sm text-stone-500">
                Try widening search, switching queendom, or clearing membership
                filters.
              </p>
            </div>
          )}

          {isPending && clients.length > 0 && (
            <div className="pointer-events-none mt-4 opacity-60">
              {viewMode === "list" ? (
                <ClientsListSkeleton />
              ) : (
                <ClientsGridSkeleton />
              )}
            </div>
          )}

          {hasMore && clients.length > 0 && (
            <div className="mt-10 flex justify-center">
              <IndulgeButton
                variant="outline"
                loading={isPending}
                onClick={handleLoadMore}
              >
                Load more
              </IndulgeButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ClientCard } from "@/components/clients/ClientCard";
import {
  ClientFilters,
  type ClientViewMode,
  type QueendomFilter,
  type StatusFilter,
} from "@/components/clients/ClientFilters";
import { ClientListRow } from "@/components/clients/ClientListRow";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Skeleton } from "@/components/ui/skeleton";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getClients,
  type ClientDirectoryStats,
  type ClientWithProfile,
} from "@/lib/actions/clients";
import { useDebounce } from "@/lib/hooks/useDebounce";

const PAGE_SIZE = 24;

type ClientListQueendom =
  | "Ananyshree Queendom"
  | "Anishqa Queendom"
  | "Unassigned";

interface ClientsIndexProps {
  initialClients: ClientWithProfile[];
  initialTotal: number;
  stats: ClientDirectoryStats;
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
}: ClientsIndexProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [queendomFilter, setQueendomFilter] = useState<QueendomFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [membershipFilter, setMembershipFilter] = useState<string>("all");
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
    };
  }, [queendomFilter, statusFilter, membershipFilter, debouncedSearch]);

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

  return (
    <div className="min-h-0 flex-1 px-8 py-6">
      <header className="mb-8 space-y-6">
        <div>
          <h1 className="font-[family-name:var(--font-playfair)] text-3xl font-semibold tracking-tight text-stone-900">
            Clients
          </h1>
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
                <ClientListRow key={c.id} client={c} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {clients.map((c) => (
                <ClientCard key={c.id} client={c} />
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

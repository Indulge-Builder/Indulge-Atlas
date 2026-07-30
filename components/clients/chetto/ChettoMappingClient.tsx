"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  acceptChettoSuggestion,
  generateChettoSuggestionForClient,
  generateChettoSuggestionsBatch,
  rejectChettoSuggestion,
} from "@/lib/actions/chetto-mapping";
import type {
  ChettoGroupCatalogEntry,
  ChettoQueendomOrg,
} from "@/lib/actions/chetto";
import {
  getClientsChettoMappingPage,
  updateClientChettoGroupId,
  type ChettoMappingRow,
} from "@/lib/actions/clients";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Input } from "@/components/ui/input";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_PAGE_SIZE = 50;
const QUEUE_PAGE_SIZE = 100;

const METHOD_LABEL: Record<string, string> = {
  phone: "Phone",
  name: "Name",
  name_fuzzy: "Fuzzy name",
  timeline: "Timeline",
  insights: "Insights",
  search: "Search",
};

function stripConciergeSuffix(name: string): string {
  return name.replace(/\s*(?:Pre\s+)?Concierge\s*$/i, "").trim();
}

function groupDisplayName(
  groupId: string,
  nameByGroupId: Record<string, string>,
): string | null {
  const raw = nameByGroupId[groupId];
  if (!raw?.trim()) return null;
  return stripConciergeSuffix(raw);
}

type ChettoMappingClientProps = {
  initialClients: ChettoMappingRow[];
  initialTotal: number;
  groupCatalog: ChettoGroupCatalogEntry[];
  queendomOrgs: ChettoQueendomOrg[];
  nameByGroupId: Record<string, string>;
  /** Pre-check "Only without group id" on load. */
  initialOnlyUnmapped?: boolean;
  /** Restrict list to migration-105 backlog queue. */
  queueOnly?: boolean;
  /** Export snapshot ids — fallback when queue table is not deployed. */
  backlogClientIds?: string[];
  pageTitle?: string;
};

export function ChettoMappingClient({
  initialClients,
  initialTotal,
  groupCatalog,
  queendomOrgs,
  nameByGroupId,
  initialOnlyUnmapped = false,
  queueOnly = false,
  backlogClientIds,
  pageTitle,
}: ChettoMappingClientProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [onlyUnmapped, setOnlyUnmapped] = useState(initialOnlyUnmapped || queueOnly);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(initialClients);
  const [total, setTotal] = useState(initialTotal);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialClients.map((c) => [c.id, c.chetto_group_id ?? ""]),
    ),
  );
  const [isPending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const skipFirst = useRef(false);

  const catalogByQueendom = useMemo(() => {
    const m = new Map<string, ChettoGroupCatalogEntry[]>();
    for (const g of groupCatalog) {
      const key = g.queendom ?? "";
      const list = m.get(key) ?? [];
      list.push(g);
      m.set(key, list);
    }
    return m;
  }, [groupCatalog]);

  const resolveGroupIdInput = useCallback(
    (input: string, queendom: string | null): string => {
      const trimmed = input.trim();
      if (!trimmed) return "";
      if (/^120363\d+/.test(trimmed)) return trimmed;
      const pool =
        (queendom ? catalogByQueendom.get(queendom) : undefined) ?? groupCatalog;
      const lower = trimmed.toLowerCase();
      const exact = pool.find(
        (g) =>
          stripConciergeSuffix(g.group_name ?? "").toLowerCase() === lower ||
          g.group_name?.toLowerCase() === lower,
      );
      if (exact) return exact.group_id;
      const partial = pool.find((g) =>
        g.group_name?.toLowerCase().includes(lower),
      );
      return partial?.group_id ?? trimmed;
    },
    [catalogByQueendom, groupCatalog],
  );

  const pageSize = queueOnly ? QUEUE_PAGE_SIZE : DEFAULT_PAGE_SIZE;

  const reload = useCallback(
    (nextPage: number) => {
      startTransition(() => {
        void (async () => {
          const res = await getClientsChettoMappingPage({
            page: nextPage,
            pageSize,
            search: debouncedSearch.trim() || undefined,
            onlyUnmapped: queueOnly ? true : onlyUnmapped || undefined,
            queueOnly: queueOnly || undefined,
            clientIds: queueOnly ? backlogClientIds : undefined,
          });
          if (!res.success) {
            toast.error(res.error ?? "Failed to load");
            return;
          }
          setRows(res.clients);
          setTotal(res.total);
          setPage(res.page);
          setDrafts((prev) => {
            const next = { ...prev };
            for (const c of res.clients) {
              next[c.id] = c.chetto_group_id ?? "";
            }
            return next;
          });
        })();
      });
    },
    [debouncedSearch, onlyUnmapped, pageSize, queueOnly, backlogClientIds],
  );

  useEffect(() => {
    if (!skipFirst.current) {
      skipFirst.current = true;
      return;
    }
    setPage(1);
    reload(1);
  }, [debouncedSearch, onlyUnmapped, reload]);

  async function handleSave(clientId: string) {
    const row = rows.find((r) => r.id === clientId);
    const raw = drafts[clientId]?.trim() ?? "";
    const resolved = resolveGroupIdInput(raw, row?.queendom ?? null);
    setSavingId(clientId);
    try {
      const res = await updateClientChettoGroupId(
        clientId,
        resolved === "" ? null : resolved,
      );
      if (!res.success) {
        toast.error(res.error ?? "Save failed");
        return;
      }
      toast.success("Chetto group id saved");
      reload(page);
    } finally {
      setSavingId(null);
    }
  }

  async function handleSuggest(clientId: string) {
    setSuggestingId(clientId);
    try {
      const res = await generateChettoSuggestionForClient(clientId);
      if (!res.success) {
        toast.error(res.error ?? "Suggestion failed");
        return;
      }
      if (res.noMatch) {
        toast.message("No Tier-2 match found", {
          description: "Try manual lookup or fix phone / queendom.",
        });
        return;
      }
      toast.success("Suggestion ready — review and accept");
      reload(page);
    } finally {
      setSuggestingId(null);
    }
  }

  async function handleBatchSuggest() {
    setBatchRunning(true);
    try {
      const res = await generateChettoSuggestionsBatch({
        limit: 10,
        onlyUnmapped: onlyUnmapped || true,
      });
      if (!res.success) {
        toast.error(res.error ?? "Batch failed");
        return;
      }
      toast.success(
        `Processed ${res.processed}: ${res.matched} matched, ${res.noMatch} no match`,
      );
      reload(page);
    } finally {
      setBatchRunning(false);
    }
  }

  async function handleAccept(suggestionId: string, clientId: string) {
    setResolvingId(suggestionId);
    try {
      const res = await acceptChettoSuggestion(suggestionId);
      if (!res.success) {
        toast.error(res.error ?? "Accept failed");
        return;
      }
      toast.success("Mapping accepted");
      setDrafts((d) => ({
        ...d,
        [clientId]: rows.find((r) => r.id === clientId)?.pending_suggestion?.chetto_group_id ?? d[clientId] ?? "",
      }));
      reload(page);
    } finally {
      setResolvingId(null);
    }
  }

  async function handleReject(suggestionId: string) {
    setResolvingId(suggestionId);
    try {
      const res = await rejectChettoSuggestion(suggestionId);
      if (!res.success) {
        toast.error(res.error ?? "Reject failed");
        return;
      }
      toast.message("Suggestion dismissed");
      reload(page);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 px-8 py-6">
      {queueOnly ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">
            {pageTitle ?? "Chetto mapping backlog"} — {total} client{total === 1 ? "" : "s"} still need a group id
          </p>
          <p className="mt-1 text-xs text-amber-800/90">
            Seeded from the export snapshot. Assign each group id below; mapped clients leave this queue automatically.
          </p>
        </div>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl space-y-2">
          <p className="text-sm text-stone-600">
            Paste each client&apos;s Chetto / Joule <span className="font-mono">group_id</span>,
            or use Tier-2 suggestions (message search, timeline scan, org insights)
            and accept after review.
          </p>
          <p className="text-xs text-stone-400">
            Tier-1 auto-fill:{" "}
            <span className="font-mono text-[11px]">npx tsx scripts/map-chetto-groups.ts</span>
            {" · "}
            Tier-2 suggestions:{" "}
            <span className="font-mono text-[11px]">npx tsx scripts/resolve-chetto-suggestions.ts</span>
          </p>
          {queendomOrgs.length > 0 ? (
            <div className="rounded-lg border border-[#E5E4DF] bg-white/80 px-3 py-2 text-[11px] text-stone-600">
              <p className="mb-1 font-medium text-stone-700">Queendom ↔ Chetto sub-org</p>
              <ul className="space-y-0.5">
                {queendomOrgs.map((o) => (
                  <li key={o.org_id}>
                    <span className="font-medium">{o.queendom}</span>
                    {" → "}
                    <span>{o.org_name}</span>
                    <span className="font-mono text-stone-400">
                      {" "}
                      · {o.org_id.slice(0, 8)}… · {o.group_count} groups
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <IndulgeButton
            type="button"
            variant="outline"
            size="sm"
            loading={batchRunning}
            leftIcon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => void handleBatchSuggest()}
          >
            Suggest next 10 unmapped
          </IndulgeButton>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={onlyUnmapped}
              disabled={queueOnly}
              onChange={(e) => setOnlyUnmapped(e.target.checked)}
              className="rounded border-stone-300 disabled:opacity-50"
            />
            Only without group id
          </label>
        </div>
      </div>

      <div className="max-w-md">
        <label className="text-xs font-medium text-stone-500" htmlFor="chetto-map-search">
          Search
        </label>
        <Input
          id="chetto-map-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, phone, or group id…"
          className="mt-1 border-[#E5E4DF] bg-white"
        />
      </div>

      <div
        className={cn(
          surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
          "min-w-0 overflow-x-auto",
        )}
      >
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-[#E5E4DF] bg-stone-50/80 text-xs uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Queendom</th>
              <th className="min-w-[200px] px-4 py-3 font-medium">Suggested</th>
              <th className="min-w-[220px] px-4 py-3 font-medium">Chetto group</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E4DF]/80">
            {isPending && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-stone-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-hidden />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                  No clients match.
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
                const sug = c.pending_suggestion;
                const hasMapping = Boolean(c.chetto_group_id?.trim());
                return (
                  <tr key={c.id} className="bg-white/90">
                    <td className="px-4 py-3">
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-medium text-stone-800 underline-offset-2 hover:underline"
                      >
                        {name || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-stone-600">{c.phone_number}</td>
                    <td className="px-4 py-3 text-stone-600">{c.queendom ?? "—"}</td>
                    <td className="px-4 py-2 align-top">
                      {sug ? (
                        <div className="space-y-1.5">
                          {groupDisplayName(sug.chetto_group_id, nameByGroupId) ? (
                            <p className="text-xs font-medium text-stone-800">
                              {groupDisplayName(sug.chetto_group_id, nameByGroupId)}
                            </p>
                          ) : null}
                          <p className="font-mono text-[10px] text-stone-500">
                            {sug.chetto_group_id}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            {sug.confidence}% · {METHOD_LABEL[sug.method] ?? sug.method}
                          </p>
                          {sug.evidence ? (
                            <p className="line-clamp-2 text-[11px] text-stone-400" title={sug.evidence}>
                              {sug.evidence}
                            </p>
                          ) : null}
                          {!hasMapping ? (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <IndulgeButton
                                type="button"
                                variant="gold"
                                size="sm"
                                loading={resolvingId === sug.id}
                                onClick={() => void handleAccept(sug.id, c.id)}
                              >
                                Accept
                              </IndulgeButton>
                              <IndulgeButton
                                type="button"
                                variant="outline"
                                size="sm"
                                loading={resolvingId === sug.id}
                                onClick={() => void handleReject(sug.id)}
                              >
                                Reject
                              </IndulgeButton>
                            </div>
                          ) : null}
                        </div>
                      ) : !hasMapping ? (
                        <IndulgeButton
                          type="button"
                          variant="outline"
                          size="sm"
                          loading={suggestingId === c.id}
                          leftIcon={<Sparkles className="h-3 w-3" aria-hidden />}
                          onClick={() => void handleSuggest(c.id)}
                        >
                          Find
                        </IndulgeButton>
                      ) : (
                        <span className="text-xs text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="space-y-1">
                        <Input
                          value={drafts[c.id] ?? ""}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [c.id]: e.target.value }))
                          }
                          list={`chetto-groups-${c.id}`}
                          placeholder="Group name or 120363…"
                          className="font-mono text-xs border-[#E5E4DF] bg-white"
                          spellCheck={false}
                        />
                        <datalist id={`chetto-groups-${c.id}`}>
                          {(catalogByQueendom.get(c.queendom ?? "") ?? groupCatalog)
                            .slice(0, 200)
                            .map((g) => (
                              <option
                                key={g.group_id}
                                value={g.group_id}
                                label={
                                  g.group_name
                                    ? stripConciergeSuffix(g.group_name)
                                    : g.group_id
                                }
                              />
                            ))}
                        </datalist>
                        {groupDisplayName(
                          resolveGroupIdInput(drafts[c.id] ?? "", c.queendom),
                          nameByGroupId,
                        ) ? (
                          <p className="text-[11px] font-medium text-stone-600">
                            {groupDisplayName(
                              resolveGroupIdInput(drafts[c.id] ?? "", c.queendom),
                              nameByGroupId,
                            )}
                          </p>
                        ) : hasMapping && c.chetto_group_id ? (
                          <p className="text-[11px] text-stone-400">
                            {groupDisplayName(c.chetto_group_id, nameByGroupId) ??
                              "Name not in catalog"}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <IndulgeButton
                          type="button"
                          variant="gold"
                          size="sm"
                          loading={savingId === c.id}
                          onClick={() => void handleSave(c.id)}
                        >
                          Save
                        </IndulgeButton>
                        <Link
                          href={`/clients/${c.id}`}
                          className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
                        >
                          Profile <ExternalLink className="h-3 w-3" aria-hidden />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500">
        <span>
          Page {page} of {Math.max(1, Math.ceil(total / pageSize))} · {total} clients
        </span>
        <div className="flex gap-2">
          <IndulgeButton
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || page <= 1}
            onClick={() => {
              const prev = page - 1;
              setPage(prev);
              reload(prev);
            }}
          >
            Previous
          </IndulgeButton>
          <IndulgeButton
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || page * pageSize >= total}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              reload(next);
            }}
          >
            Next
          </IndulgeButton>
        </div>
      </div>
    </div>
  );
}

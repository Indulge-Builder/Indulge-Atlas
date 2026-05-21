"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 50;

type ChettoMappingClientProps = {
  initialClients: ChettoMappingRow[];
  initialTotal: number;
};

export function ChettoMappingClient({
  initialClients,
  initialTotal,
}: ChettoMappingClientProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
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
  const skipFirst = useRef(false);

  const reload = useCallback(
    (nextPage: number) => {
      startTransition(() => {
        void (async () => {
          const res = await getClientsChettoMappingPage({
            page: nextPage,
            pageSize: PAGE_SIZE,
            search: debouncedSearch.trim() || undefined,
            onlyUnmapped: onlyUnmapped || undefined,
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
    [debouncedSearch, onlyUnmapped],
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
    const raw = drafts[clientId]?.trim() ?? "";
    setSavingId(clientId);
    try {
      const res = await updateClientChettoGroupId(clientId, raw === "" ? null : raw);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 px-8 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl space-y-2">
          <p className="text-sm text-stone-600">
            Paste each client&apos;s Chetto / Joule <span className="font-mono">group_id</span>.
            The client dossier Chetto tab uses this first — no scanning every group per load.
          </p>
          <p className="text-xs text-stone-400">
            Auto-fill once:{" "}
            <span className="font-mono text-[11px]">npx tsx scripts/map-chetto-groups.ts</span>{" "}
            (service role + Chetto keys).
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={onlyUnmapped}
            onChange={(e) => setOnlyUnmapped(e.target.checked)}
            className="rounded border-stone-300"
          />
          Only without group id
        </label>
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
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[#E5E4DF] bg-stone-50/80 text-xs uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Queendom</th>
              <th className="min-w-[220px] px-4 py-3 font-medium">Chetto group id</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E4DF]/80">
            {isPending && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-stone-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-hidden />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-stone-500">
                  No clients match.
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
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
                    <td className="px-4 py-2">
                      <Input
                        value={drafts[c.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [c.id]: e.target.value }))
                        }
                        placeholder="e.g. 120363…"
                        className="font-mono text-xs border-[#E5E4DF] bg-white"
                        spellCheck={false}
                      />
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
          Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))} · {total} clients
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
            disabled={isPending || page * PAGE_SIZE >= total}
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

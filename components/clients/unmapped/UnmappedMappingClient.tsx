"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  getClientsUnmappedPage,
  updateClientChettoGroupId,
  updateClientPhone,
  type UnmappedRow,
} from "@/lib/actions/clients";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Input } from "@/components/ui/input";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/useDebounce";
import {
  Check,
  ExternalLink,
  Loader2,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 50;

type FilterMode = "all" | "chetto" | "freshdesk";

interface UnmappedMappingClientProps {
  initialClients: UnmappedRow[];
  initialTotal: number;
  initialCounts: { phone: number; chetto: number };
}

function MissingBadge({ kind }: { kind: "phone" | "chetto" }) {
  if (kind === "phone") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
        <Phone className="h-2.5 w-2.5" aria-hidden />
        No phone
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
      <MessageCircle className="h-2.5 w-2.5" aria-hidden />
      No Chetto
    </span>
  );
}

interface EditCellProps {
  clientId: string;
  field: "phone" | "chetto";
  currentValue: string | null;
  onSaved: () => void;
}

function EditCell({ clientId, field, currentValue, onSaved }: EditCellProps) {
  const [draft, setDraft] = useState(currentValue ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const placeholder =
    field === "phone" ? "+91 98… or +1 650…" : "e.g. 120363…";
  const isDirty = draft !== (currentValue ?? "");

  async function handleSave() {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      const res =
        field === "phone"
          ? await updateClientPhone(clientId, draft.trim())
          : await updateClientChettoGroupId(clientId, draft.trim() || null);

      if (!res.success) {
        toast.error(res.error ?? "Save failed");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void handleSave();
    if (e.key === "Escape") {
      setDraft(currentValue ?? "");
      inputRef.current?.blur();
    }
  }

  return (
    <div className="flex min-w-[200px] items-center gap-1.5">
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          "h-7 font-mono text-xs",
          field === "phone"
            ? "border-rose-200 focus-visible:ring-rose-300/40"
            : "border-amber-200 focus-visible:ring-amber-300/40",
          saved && "border-emerald-300",
        )}
      />
      {isDirty && (
        <>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
            title="Save (Enter)"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Check className="h-3 w-3" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => setDraft(currentValue ?? "")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 transition-colors hover:bg-stone-50"
            title="Discard"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </>
      )}
      {saved && !isDirty && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-emerald-600">
          <Check className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
    </div>
  );
}

export function UnmappedMappingClient({
  initialClients,
  initialTotal,
  initialCounts,
}: UnmappedMappingClientProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(initialClients);
  const [total, setTotal] = useState(initialTotal);
  const [counts, setCounts] = useState(initialCounts);
  const [isPending, startTransition] = useTransition();
  const skipFirst = useRef(false);

  const reload = useCallback(
    (nextPage: number) => {
      startTransition(() => {
        void (async () => {
          const res = await getClientsUnmappedPage({
            page: nextPage,
            pageSize: PAGE_SIZE,
            search: debouncedSearch.trim() || undefined,
            filter: filterMode,
          });
          if (!res.success) {
            toast.error(res.error ?? "Failed to load");
            return;
          }
          setRows(res.clients);
          setTotal(res.total);
          setPage(res.page);
          setCounts(res.counts);
        })();
      });
    },
    [debouncedSearch, filterMode],
  );

  useEffect(() => {
    if (!skipFirst.current) {
      skipFirst.current = true;
      return;
    }
    setPage(1);
    reload(1);
  }, [debouncedSearch, filterMode, reload]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const FILTER_TABS: { id: FilterMode; label: string; count: number; color: string; activeClass: string }[] = [
    {
      id: "all",
      label: "All unmapped",
      count: counts.phone + counts.chetto,
      color: "text-stone-600",
      activeClass: "bg-stone-800 text-white border-stone-800",
    },
    {
      id: "freshdesk",
      label: "No phone (Freshdesk)",
      count: counts.phone,
      color: "text-rose-700",
      activeClass: "bg-rose-600 text-white border-rose-600",
    },
    {
      id: "chetto",
      label: "No Chetto group",
      count: counts.chetto,
      color: "text-amber-700",
      activeClass: "bg-amber-600 text-white border-amber-600",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 px-8 py-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "xs" }), "px-4 py-3")}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            Total unmapped
          </p>
          <p className="mt-1 font-[family-name:var(--font-playfair)] text-2xl text-stone-900">
            {total.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">showing on this filter</p>
        </div>
        <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "xs" }), "px-4 py-3")}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-500">
            No phone
          </p>
          <p className="mt-1 font-[family-name:var(--font-playfair)] text-2xl text-stone-900">
            {counts.phone.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">Freshdesk won&apos;t match</p>
        </div>
        <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "xs" }), "px-4 py-3")}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
            No Chetto group
          </p>
          <p className="mt-1 font-[family-name:var(--font-playfair)] text-2xl text-stone-900">
            {counts.chetto.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">WhatsApp tab won&apos;t load</p>
        </div>
      </div>

      {/* Filter + search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                filterMode === tab.id
                  ? tab.activeClass
                  : `border-[#E5E4DF] bg-white ${tab.color} hover:border-stone-300`,
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  filterMode === tab.id
                    ? "bg-white/20 text-inherit"
                    : "bg-stone-100 text-stone-600",
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="w-full max-w-xs">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="h-9 border-[#E5E4DF] bg-white text-sm"
          />
        </div>
      </div>

      {/* Hint */}
      <p className="text-[12px] text-stone-500">
        Edit fields inline — press{" "}
        <kbd className="rounded border border-stone-200 bg-stone-50 px-1 py-0.5 font-mono text-[10px]">
          Enter
        </kbd>{" "}
        to save or click the{" "}
        <Check className="mb-0.5 inline h-3 w-3 text-emerald-600" aria-hidden />
        {" "}button. Changes save immediately.
      </p>

      {/* Table */}
      <div
        className={cn(
          surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
          "min-w-0 overflow-x-auto",
        )}
      >
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-[#E5E4DF] bg-stone-50/80 text-xs uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Queendom</th>
              <th className="px-4 py-3 font-medium">Missing</th>
              <th className="min-w-[220px] px-4 py-3 font-medium">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-rose-500" aria-hidden />
                  Phone number
                </span>
              </th>
              <th className="min-w-[220px] px-4 py-3 font-medium">
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="h-3 w-3 text-amber-500" aria-hidden />
                  Chetto group id
                </span>
              </th>
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
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="font-[family-name:var(--font-playfair)] text-lg text-stone-700">
                    All clear
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    No unmapped clients on this filter.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const name = [c.first_name, c.last_name]
                  .filter(Boolean)
                  .join(" ")
                  .trim();
                const active = c.client_status === "active";
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      "transition-colors",
                      isPending ? "opacity-60" : "bg-white/90 hover:bg-[#FAFAF7]",
                    )}
                  >
                    {/* Name + status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            active ? "bg-emerald-400" : "bg-stone-300",
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <Link
                            href={`/clients/${c.id}`}
                            className="font-medium text-stone-800 underline-offset-2 hover:underline"
                          >
                            {name || "—"}
                          </Link>
                          {c.membership_type && (
                            <p className="text-[11px] text-stone-400">{c.membership_type}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Queendom */}
                    <td className="px-4 py-3 text-xs text-stone-500">
                      {c.queendom ?? "—"}
                    </td>

                    {/* Missing badges */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {c.missing.map((m) => (
                          <MissingBadge key={m} kind={m} />
                        ))}
                      </div>
                    </td>

                    {/* Phone edit */}
                    <td className="px-4 py-2">
                      <EditCell
                        clientId={c.id}
                        field="phone"
                        currentValue={c.phone_number}
                        onSaved={() => reload(page)}
                      />
                    </td>

                    {/* Chetto group id edit */}
                    <td className="px-4 py-2">
                      <EditCell
                        clientId={c.id}
                        field="chetto"
                        currentValue={c.chetto_group_id}
                        onSaved={() => reload(page)}
                      />
                    </td>

                    {/* Profile link */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/clients/${c.id}`}
                        className="inline-flex items-center gap-1 text-xs text-stone-400 transition-colors hover:text-stone-700"
                        title="Open full profile"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        Profile
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500">
        <span>
          Page {page} of {totalPages} · {total} clients
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
            disabled={isPending || page >= totalPages}
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

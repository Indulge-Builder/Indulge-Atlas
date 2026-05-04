"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search } from "lucide-react";
import { globalOmniSearch } from "@/lib/actions/search";
import type { GlobalOmniSearchResult } from "@/lib/actions/search";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useCommandPalette } from "@/components/providers/command-palette-context";
import { cn } from "@/lib/utils";

const EMPTY: GlobalOmniSearchResult = { leads: [], tasks: [], team: [] };

type FlatItem = {
  key: string;
  title: string;
  subtitle: string | null;
  href: string;
};

function flattenResults(r: GlobalOmniSearchResult): FlatItem[] {
  const out: FlatItem[] = [];
  for (const row of r.leads) {
    out.push({
      key: `lead-${row.id}`,
      title: row.title,
      subtitle: row.subtitle,
      href: row.href,
    });
  }
  for (const row of r.tasks) {
    out.push({
      key: `task-${row.id}`,
      title: row.title,
      subtitle: row.subtitle,
      href: row.href,
    });
  }
  for (const row of r.team) {
    out.push({
      key: `team-${row.id}`,
      title: row.title,
      subtitle: row.subtitle,
      href: row.href,
    });
  }
  return out;
}

export function CommandPalette() {
  const { open, setOpen, closePalette } = useCommandPalette();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const [results, setResults] = useState<GlobalOmniSearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const flat = useMemo(() => flattenResults(results), [results]);

  useEffect(() => {
    if (!open) return;
    setHighlight(-1);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const q = debounced.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    void globalOmniSearch(q).then((data) => {
      if (!cancelled) {
        setResults(data);
        setLoading(false);
        setHighlight(-1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const navigateTo = useCallback(
    (href: string) => {
      closePalette();
      setQuery("");
      setResults(EMPTY);
      router.push(href);
    },
    [closePalette, router],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        if (flat.length === 0) return;
        e.preventDefault();
        setHighlight((h) => (h < 0 ? 0 : Math.min(h + 1, flat.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        if (flat.length === 0) return;
        e.preventDefault();
        setHighlight((h) => (h <= 0 ? -1 : h - 1));
        return;
      }
      if (e.key === "Enter" && highlight >= 0 && flat[highlight]) {
        e.preventDefault();
        navigateTo(flat[highlight].href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, highlight, navigateTo]);

  const showEmpty =
    debounced.trim().length >= 2 && !loading && flat.length === 0;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setResults(EMPTY);
      setHighlight(-1);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[100] backdrop-blur-sm bg-stone-900/20",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-[12vh] z-[100] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2",
            "rounded-xl bg-white shadow-2xl shadow-stone-200/90 outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "duration-200",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">
            Search workspace
          </DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-4">
            <Search
              className="h-5 w-5 shrink-0 text-stone-300"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search leads, tasks, team…"
              className={cn(
                "min-w-0 flex-1 bg-transparent text-xl text-stone-800",
                "placeholder:text-stone-300 outline-none border-0",
                "focus:ring-0 focus-visible:ring-0",
              )}
              autoComplete="off"
              spellCheck={false}
            />
            {loading && (
              <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                Searching…
              </span>
            )}
          </div>

          <div className="max-h-[min(55vh,420px)] overflow-y-auto px-2 py-3">
            {query.trim().length > 0 && query.trim().length < 2 && (
              <p className="px-3 py-6 text-center text-sm text-stone-400">
                Type at least two characters to search.
              </p>
            )}

            {showEmpty && (
              <p className="px-3 py-8 text-center text-sm text-stone-500">
                No results found for &ldquo;{debounced.trim()}&rdquo;.
              </p>
            )}

            {results.leads.length > 0 && (
              <ResultSection
                label="Leads"
                items={results.leads.map((row) => ({
                  key: `lead-${row.id}`,
                  title: row.title,
                  subtitle: row.subtitle,
                  href: row.href,
                }))}
                flat={flat}
                highlight={highlight}
                setHighlight={setHighlight}
                onPick={navigateTo}
              />
            )}
            {results.tasks.length > 0 && (
              <ResultSection
                label="Tasks"
                items={results.tasks.map((row) => ({
                  key: `task-${row.id}`,
                  title: row.title,
                  subtitle: row.subtitle,
                  href: row.href,
                }))}
                flat={flat}
                highlight={highlight}
                setHighlight={setHighlight}
                onPick={navigateTo}
              />
            )}
            {results.team.length > 0 && (
              <ResultSection
                label="Team"
                items={results.team.map((row) => ({
                  key: `team-${row.id}`,
                  title: row.title,
                  subtitle: row.subtitle,
                  href: row.href,
                }))}
                flat={flat}
                highlight={highlight}
                setHighlight={setHighlight}
                onPick={navigateTo}
              />
            )}
          </div>

          <p className="border-t border-stone-100 px-5 py-2.5 text-[11px] text-stone-400">
            <span className="font-medium text-stone-500">↑↓</span> to move ·{" "}
            <span className="font-medium text-stone-500">Enter</span> to open ·{" "}
            <span className="font-medium text-stone-500">Esc</span> to close
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ResultSection({
  label,
  items,
  flat,
  highlight,
  setHighlight,
  onPick,
}: {
  label: string;
  items: FlatItem[];
  flat: FlatItem[];
  highlight: number;
  setHighlight: (i: number) => void;
  onPick: (href: string) => void;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
        {label}
      </p>
      <ul className="space-y-0.5" role="listbox">
        {items.map((item) => {
          const idx = flat.findIndex((f) => f.key === item.key);
          const active = idx === highlight;
          return (
            <li key={item.key}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={cn(
                  "flex w-full flex-col items-start rounded-lg px-3 py-2.5 text-left transition-colors",
                  active
                    ? "bg-stone-100 text-stone-900"
                    : "text-stone-800 hover:bg-stone-50",
                )}
                onMouseEnter={() => {
                  if (idx >= 0) setHighlight(idx);
                }}
                onClick={() => onPick(item.href)}
              >
                <span className="text-[15px] font-medium leading-snug">
                  {item.title}
                </span>
                {item.subtitle && (
                  <span className="mt-0.5 text-xs text-stone-500 line-clamp-1">
                    {item.subtitle}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

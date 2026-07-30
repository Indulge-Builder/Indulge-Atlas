"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { getClientOptions } from "@/lib/actions/concierge-options";
import type {
  ClientRequesterSearchProps,
  ClientOption,
} from "@/components/concierge/tickets/panelTypes";

/**
 * Freshdesk-style "Requester" typeahead. Owns local query + dropdown state;
 * the selected client is owned by the parent via `value` / `onSelect`. Data is
 * 100% from the RLS-scoped `getClientOptions` server action — no hardcoded list.
 * The parent renders the label + error text (via IndulgeField); this component
 * only reflects the error visually on the input.
 */
export function ClientRequesterSearch({
  value,
  onSelect,
  initial,
  error,
}: ClientRequesterSearchProps) {
  const [query, setQuery] = useState<string>(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ClientOption[]>(initial);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const listId = useId();
  const debouncedQuery = useDebounce(query, 300);

  // Keep the input text in sync with the parent-owned selection. Depending on the
  // primitive id/name (not the object ref) means typing while a value is selected
  // is never clobbered — only an actual selection change resyncs the text.
  const selectedName = value?.name ?? "";
  const selectedId = value?.id ?? null;
  useEffect(() => {
    setQuery(selectedName);
  }, [selectedName, selectedId]);

  // Fetch results for the debounced query while the dropdown is open. Empty query
  // → show the `initial` list. Race-guarded: the cleanup marks a run stale so only
  // the latest query's response is applied.
  useEffect(() => {
    if (!open) return;
    const q = debouncedQuery.trim();
    if (!q) {
      setResults(initial);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getClientOptions(q)
      .then((res) => {
        if (!active) return;
        setResults(res);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setResults([]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, debouncedQuery, initial]);

  // Reset the keyboard highlight whenever the visible list changes.
  useEffect(() => {
    setHighlight(0);
  }, [results]);

  // Close on outside pointer interaction.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function handleSelect(client: ClientOption) {
    onSelect(client);
    setQuery(client.name);
    setOpen(false);
  }

  function handleClear() {
    onSelect(null);
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setHighlight((h) => Math.min(h + 1, results.length - 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
        return;
      case "Enter": {
        if (!open) return;
        const chosen = results[highlight];
        if (chosen) {
          event.preventDefault();
          handleSelect(chosen);
        }
        return;
      }
      case "Escape":
        setOpen(false);
        return;
      default:
        return;
    }
  }

  const showEmpty = !loading && results.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          error={!!error}
          placeholder="Search client by name…"
          className={cn("pl-8", value ? "pr-8" : "pr-3")}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results[highlight]
              ? `${listId}-opt-${highlight}`
              : undefined
          }
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear selected client"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className={cn(
            surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
            "absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg py-1",
          )}
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-neutral-500">Searching…</div>
          ) : showEmpty ? (
            <div className="px-3 py-2 text-sm text-neutral-500">
              {debouncedQuery.trim() ? "No clients found" : "No clients"}
            </div>
          ) : (
            results.map((client, index) => {
              const active = index === highlight;
              return (
                <button
                  key={client.id}
                  id={`${listId}-opt-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(client)}
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2 text-left transition-colors",
                    active ? "bg-brand-gold/10" : "hover:bg-neutral-100",
                  )}
                >
                  <span className="text-sm font-medium text-neutral-900">
                    {client.name}
                  </span>
                  {client.phone ? (
                    <span className="text-xs text-neutral-500">
                      {client.phone}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

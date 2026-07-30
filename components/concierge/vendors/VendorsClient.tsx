"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search, MapPin, User } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { getVendors } from "@/lib/actions/concierge-vendors";
import type { Vendor } from "@/lib/types/database";

const ALL = "all";

function trustTone(score: number | null): string {
  if (score == null) return "bg-neutral-100 text-neutral-400";
  if (score >= 75) return "bg-emerald-50 text-emerald-700";
  if (score >= 50) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export function VendorsClient({ initialVendors }: { initialVendors: Vendor[] }) {
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState(ALL);
  const [isPending, startTransition] = useTransition();

  const debouncedSearch = useDebounce(search, 300);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    startTransition(async () => {
      setVendors(await getVendors(debouncedSearch.trim() || undefined));
    });
  }, [debouncedSearch]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendors) if (v.location) set.add(v.location);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [vendors]);

  const filtered = location === ALL ? vendors : vendors.filter((v) => v.location === location);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Vendors</h1>
        <p className="text-sm text-neutral-500">
          {filtered.length} {filtered.length === 1 ? "vendor" : "vendors"} · shared across all Queendoms
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors"
            aria-label="Search vendors by name"
            className="w-64 pl-8"
          />
        </div>
        {locations.length > 0 && (
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger aria-label="Filter by location" className="h-9 w-auto min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div
          className={cn(
            surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
            "flex flex-col items-center justify-center gap-1 px-6 py-16 text-center",
          )}
        >
          <p className="text-sm font-medium text-neutral-900">No vendors</p>
          <p className="text-sm text-neutral-500">Nothing matches the current filters.</p>
        </div>
      ) : (
        <ul className={cn("grid gap-2 sm:grid-cols-2", isPending && "opacity-60")}>
          {filtered.map((v) => (
            <li key={v.id}>
              <Link
                href={`/concierge/vendors/${v.id}`}
                className={cn(
                  surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
                  "flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:border-brand-gold/50",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{v.name}</p>
                  {v.company && <p className="truncate text-xs text-neutral-500">{v.company}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                    {v.poc && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {v.poc}
                      </span>
                    )}
                    {v.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {v.location}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    trustTone(v.trust_score),
                  )}
                  title="Trust score"
                >
                  {v.trust_score == null ? "—" : `${v.trust_score}%`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { surfaceCardVariants } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { setBotCatalogItemActive } from "@/lib/actions/bot-catalog";
import { BOT_CATALOG_CATEGORY_LABELS } from "@/lib/constants/bot-catalog";
import type { BotCatalogCategory, BotCatalogItem } from "@/lib/types/database";
import { toast } from "sonner";

const CATEGORIES: (BotCatalogCategory | "all")[] = [
  "all",
  "events",
  "sports",
  "travel",
  "watches",
  "art",
  "fashion",
];

interface BotCatalogClientProps {
  items: BotCatalogItem[];
}

export function BotCatalogClient({ items }: BotCatalogClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<BotCatalogCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const active = items.filter((i) => i.is_active).length;
    const byCategory = items.reduce(
      (acc, i) => {
        acc[i.category] = (acc[i.category] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    return { total: items.length, active, byCategory };
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      const haystack = [
        item.name,
        item.description,
        item.price_range ?? "",
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, category, query]);

  async function onToggle(id: string, next: boolean) {
    setPendingId(id);
    const res = await setBotCatalogItemActive(id, next);
    setPendingId(null);
    if (!res.success) {
      toast.error(res.error ?? "Could not update item");
      return;
    }
    toast.success(next ? "Item active for bot" : "Item hidden from bot");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total items" value={String(stats.total)} />
        <Stat label="Active for bot" value={String(stats.active)} />
        <Stat
          label="Categories"
          value={String(Object.keys(stats.byCategory).length)}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                category === cat
                  ? "bg-brand-gold text-surface"
                  : "bg-[#F4F3EE] text-[#5C5A54] hover:bg-[#ECEAE4]",
              )}
            >
              {cat === "all"
                ? `All (${items.length})`
                : `${BOT_CATALOG_CATEGORY_LABELS[cat]} (${stats.byCategory[cat] ?? 0})`}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9A94]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, tags…"
            className="h-10 rounded-xl border-[#E5E4DF] bg-white pl-9"
          />
        </div>
      </div>

      <p className="text-xs text-[#9A9A94]">
        Showing {filtered.length} of {items.length} · Only active items are sent to the Gupshup WhatsApp bot
      </p>

      {filtered.length === 0 ? (
        <div
          className={cn(
            surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
            "p-12 text-center",
          )}
        >
          <p
            className="text-sm text-[#6B6B6B]"
            style={{ fontFamily: "var(--font-playfair), serif" }}
          >
            No catalog items match
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <li
              key={item.id}
              className={cn(
                surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
                "flex flex-col p-4",
                !item.is_active && "opacity-60",
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-gold">
                    {BOT_CATALOG_CATEGORY_LABELS[item.category]}
                  </span>
                  <h3 className="mt-1 font-medium text-[#1A1A1A] leading-snug">
                    {item.name}
                  </h3>
                </div>
                <Switch
                  checked={item.is_active}
                  disabled={isPending && pendingId === item.id}
                  onCheckedChange={(next) => onToggle(item.id, next)}
                  aria-label={`${item.is_active ? "Deactivate" : "Activate"} ${item.name}`}
                />
              </div>

              <p className="text-sm text-[#6B6B6B] line-clamp-4 flex-1">
                {item.description}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#F4F3EE] px-2 py-0.5 text-[11px] text-[#5C5A54]">
                  {item.price_range ?? "Upon request"}
                </span>
                {item.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-[#E5E4DF] px-2 py-0.5 text-[10px] text-[#9A9A94]"
                  >
                    {tag}
                  </span>
                ))}
                {item.tags.length > 4 && (
                  <span className="text-[10px] text-[#9A9A94]">
                    +{item.tags.length - 4}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "subtle", elevation: "xs" }),
        "px-4 py-3",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9A9A94]">
        {label}
      </p>
      <p
        className="mt-1 text-2xl text-[#1A1A1A] tabular-nums"
        style={{ fontFamily: "var(--font-playfair), serif" }}
      >
        {value}
      </p>
    </div>
  );
}

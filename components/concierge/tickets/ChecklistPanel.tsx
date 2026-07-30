"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks } from "lucide-react";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toggleChecklistItem } from "@/lib/actions/concierge-tickets";
import type { ChecklistPanelProps } from "@/components/concierge/tickets/panelTypes";
import type { ConciergeTicketChecklistItem } from "@/lib/types/database";

export function ChecklistPanel({ items, canEdit }: ChecklistPanelProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localItems, setLocalItems] =
    useState<ConciergeTicketChecklistItem[]>(items);

  // Re-sync local state whenever the server-provided items change.
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  if (localItems.length === 0) return null;

  const total = localItems.length;
  const checked = localItems.filter((item) => item.is_checked).length;

  function handleToggle(item: ConciergeTicketChecklistItem, next: boolean) {
    // Optimistic update.
    setLocalItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, is_checked: next } : it,
      ),
    );

    startTransition(async () => {
      const res = await toggleChecklistItem({ itemId: item.id, checked: next });
      if (res.success) {
        router.refresh();
      } else {
        // Revert on failure.
        setLocalItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, is_checked: !next } : it,
          ),
        );
        toast.error(res.error ?? "Something went wrong");
      }
    });
  }

  return (
    <section
      className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-5")}
    >
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-neutral-500" />
          <h3 className="text-sm font-semibold text-neutral-900">Checklist</h3>
        </div>
        <span className="text-xs font-medium tabular-nums text-neutral-500">
          {checked}/{total}
        </span>
      </header>

      <ul className="space-y-2">
        {localItems.map((item) => (
          <li key={item.id}>
            <label
              className={cn(
                "flex items-start gap-2.5 text-sm",
                canEdit ? "cursor-pointer" : "cursor-default",
              )}
            >
              <input
                type="checkbox"
                checked={item.is_checked}
                disabled={!canEdit}
                onChange={(e) => handleToggle(item, e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 accent-brand-gold disabled:cursor-not-allowed"
              />
              <span
                className={cn(
                  "leading-snug",
                  item.is_checked
                    ? "text-neutral-400 line-through"
                    : "text-neutral-700",
                )}
              >
                {item.label}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

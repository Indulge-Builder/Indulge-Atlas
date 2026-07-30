"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONCIERGE_GROUPS,
  CONCIERGE_GROUP_LABELS,
  type ConciergeGroup,
} from "@/lib/types/database";

/** Freshdesk-style Queendom ticket-scope multi-select (Anishqa / Ananyshree). */
export function QueendomScopePicker({
  value,
  onChange,
  error,
}: {
  value: ConciergeGroup[];
  onChange: (next: ConciergeGroup[]) => void;
  error?: string;
}) {
  function toggle(g: ConciergeGroup) {
    const has = value.includes(g);
    onChange(has ? value.filter((x) => x !== g) : [...value, g]);
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold text-[#1A1A1A]">Ticket Scope</p>
        <p className="mt-0.5 text-[11px] text-[#8A8A6E]">
          Assign ticket scope — agent can handle tickets in the selected Queendom(s).
        </p>
      </div>
      <div className="space-y-1.5">
        {CONCIERGE_GROUPS.map((g) => {
          const selected = value.includes(g);
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggle(g)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                selected
                  ? "border-brand-gold/40 bg-brand-gold/6"
                  : "border-[#E5E4DF] bg-white hover:border-[#D0C8BE]",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  selected
                    ? "border-brand-gold bg-brand-gold text-white"
                    : "border-neutral-300",
                )}
              >
                {selected ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="font-medium text-[#1A1A1A]">{CONCIERGE_GROUP_LABELS[g]}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-[11px] text-[#C0392B]">{error}</p> : null}
    </div>
  );
}

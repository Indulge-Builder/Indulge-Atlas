"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Period options ────────────────────────────────────────────

export const PERIOD_OPTIONS = [
  { value: "this_month", label: "This Month"   },
  { value: "last_month", label: "Last Month"   },
  { value: "ytd",        label: "Year to Date" },
] as const;

export type PeriodValue = (typeof PERIOD_OPTIONS)[number]["value"];

// ── Component ─────────────────────────────────────────────────
// `initialPeriod` is read server-side from `searchParams` and
// passed in as a prop — avoids the Suspense requirement of
// useSearchParams while still being URL-driven for future
// server-action filtering.

interface MonthSelectorProps {
  initialPeriod: PeriodValue;
}

export function MonthSelector({ initialPeriod }: MonthSelectorProps) {
  const router = useRouter();

  return (
    <Select
      defaultValue={initialPeriod}
      onValueChange={(v) =>
        router.push(`?period=${v}`, { scroll: false })
      }
    >
      <SelectTrigger
        className={cn(
          "h-8 rounded-xl min-w-[148px]",
          "border border-[#E0DDD8] bg-[#F4F3F0]",
          "text-[12px] font-medium text-[#6B6B6B]",
          "hover:bg-[#EAEAE5] hover:text-[#1A1A1A] hover:border-[#D0CEC9]",
          "focus:ring-0 focus:ring-offset-0",
          "transition-colors duration-150",
          // No harsh focus ring — warm earth tone
          "data-[state=open]:border-[#7A6652] data-[state=open]:text-[#1A1A1A]"
        )}
      >
        <SelectValue />
      </SelectTrigger>

      <SelectContent
        className="rounded-xl border-[#E0DDD8] bg-[#F9F9F6] shadow-xl min-w-[160px]"
      >
        {PERIOD_OPTIONS.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className={cn(
              "text-[13px] text-[#1A1A1A] cursor-pointer rounded-lg",
              "focus:bg-[#EAEAE5] focus:text-[#1A1A1A]"
            )}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

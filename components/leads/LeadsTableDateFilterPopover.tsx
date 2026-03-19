"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { format, isValid, parseISO } from "date-fns";
import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { leadsFilterTriggerVariants } from "@/components/leads/ui/filter-trigger";

const LuxuryDatePicker = dynamic(
  () =>
    import("@/components/ui/LuxuryDatePicker").then((m) => m.LuxuryDatePicker),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="h-9 w-full rounded-lg bg-stone-100/80" />
    ),
  },
);

interface LeadsTableDateFilterPopoverProps {
  currentDateFilter: string | null;
  onDateFilter: (value: string | null) => void;
  /** When true, applies `activeTriggerClassName` to the trigger (matches other filter chips). */
  isActive: boolean;
  activeTriggerClassName: string;
}

export function LeadsTableDateFilterPopover({
  currentDateFilter,
  onDateFilter,
  isActive,
  activeTriggerClassName,
}: LeadsTableDateFilterPopoverProps) {
  const [heavyLoaded, setHeavyLoaded] = useState(false);

  const customDate =
    currentDateFilter &&
    currentDateFilter !== "today" &&
    currentDateFilter !== "yesterday"
      ? (() => {
          const parsed = parseISO(currentDateFilter);
          return isValid(parsed) ? parsed : undefined;
        })()
      : undefined;

  const dateFilterLabel =
    currentDateFilter === "today"
      ? "Date: Today"
      : currentDateFilter === "yesterday"
        ? "Date: Yesterday"
        : customDate
          ? `Date: ${format(customDate, "MMM d, yyyy")}`
          : "Date Filter";

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setHeavyLoaded(true);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            leadsFilterTriggerVariants({ control: "popover" }),
            isActive && activeTriggerClassName,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-stone-400" />
            <span className="truncate">{dateFilterLabel}</span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-stone-400"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-3.5">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#B5A99A]">
            Date Filter
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={currentDateFilter === "today" ? "muted" : "outline"}
              className="justify-start border-[#E5E4DF] bg-white hover:bg-[#F8F8F5]"
              onClick={() => onDateFilter("today")}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant={
                currentDateFilter === "yesterday" ? "muted" : "outline"
              }
              className="justify-start border-[#E5E4DF] bg-white hover:bg-[#F8F8F5]"
              onClick={() => onDateFilter("yesterday")}
            >
              Yesterday
            </Button>
          </div>
          {heavyLoaded && (
            <div className="pt-1">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#B5A99A]">
                Custom Date
              </p>
              <LuxuryDatePicker
                value={customDate}
                hideTime
                placeholder="Select custom date"
                onChange={(date) => {
                  if (!date) {
                    onDateFilter(null);
                    return;
                  }
                  onDateFilter(format(date, "yyyy-MM-dd"));
                }}
                className="h-9 border-[#E5E4DF] bg-white hover:border-[#D6D4CD]"
              />
            </div>
          )}
          {currentDateFilter && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full justify-center text-[#8F8576] hover:bg-[#F8F8F5]"
              onClick={() => onDateFilter(null)}
            >
              Clear date filter
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

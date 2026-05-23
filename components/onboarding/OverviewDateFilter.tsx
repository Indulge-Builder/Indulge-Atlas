"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, CalendarDays, X } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subWeeks, addDays } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";

const TZ = "Asia/Kolkata";

export type DatePreset =
  | "this_month"
  | "prev_month"
  | "this_week"
  | "prev_week"
  | "today"
  | "tomorrow"
  | "this_year"
  | "custom";

export type DateRangeBounds = {
  startIso: string;
  endIso: string;
  label: string;
  preset: DatePreset;
};

function istBounds(start: Date, end: Date): { startIso: string; endIso: string } {
  return {
    startIso: fromZonedTime(
      `${formatInTimeZone(start, TZ, "yyyy-MM-dd")}T00:00:00.000`,
      TZ,
    ).toISOString(),
    endIso: fromZonedTime(
      `${formatInTimeZone(end, TZ, "yyyy-MM-dd")}T23:59:59.999`,
      TZ,
    ).toISOString(),
  };
}

function presetBounds(preset: DatePreset, customRange?: DateRange): DateRangeBounds {
  const now = new Date();

  switch (preset) {
    case "today": {
      const { startIso, endIso } = istBounds(now, now);
      return { startIso, endIso, label: "Today", preset };
    }
    case "tomorrow": {
      const tom = addDays(now, 1);
      const { startIso, endIso } = istBounds(tom, tom);
      return { startIso, endIso, label: "Tomorrow", preset };
    }
    case "this_week": {
      const { startIso, endIso } = istBounds(startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 }));
      return { startIso, endIso, label: "This Week", preset };
    }
    case "prev_week": {
      const lastWeekDay = subWeeks(now, 1);
      const { startIso, endIso } = istBounds(startOfWeek(lastWeekDay, { weekStartsOn: 1 }), endOfWeek(lastWeekDay, { weekStartsOn: 1 }));
      return { startIso, endIso, label: "Previous Week", preset };
    }
    case "this_month": {
      const { startIso, endIso } = istBounds(startOfMonth(now), endOfMonth(now));
      return { startIso, endIso, label: formatInTimeZone(now, TZ, "MMMM yyyy"), preset };
    }
    case "prev_month": {
      const prev = subMonths(now, 1);
      const { startIso, endIso } = istBounds(startOfMonth(prev), endOfMonth(prev));
      return { startIso, endIso, label: formatInTimeZone(prev, TZ, "MMMM yyyy"), preset };
    }
    case "this_year": {
      const { startIso, endIso } = istBounds(startOfYear(now), endOfYear(now));
      return { startIso, endIso, label: formatInTimeZone(now, TZ, "yyyy"), preset };
    }
    case "custom": {
      if (!customRange?.from) return presetBounds("this_month");
      const to = customRange.to ?? customRange.from;
      const { startIso, endIso } = istBounds(customRange.from, to);
      const label =
        customRange.to && customRange.to.getTime() !== customRange.from.getTime()
          ? `${format(customRange.from, "d MMM")} – ${format(to, "d MMM yyyy")}`
          : format(customRange.from, "d MMM yyyy");
      return { startIso, endIso, label, preset };
    }
  }
}

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "this_week", label: "This Week" },
  { id: "prev_week", label: "Previous Week" },
  { id: "this_month", label: "This Month" },
  { id: "prev_month", label: "Previous Month" },
  { id: "this_year", label: "This Year" },
  { id: "custom", label: "Custom Range" },
];

interface OverviewDateFilterProps {
  value: DateRangeBounds;
  onChange: (range: DateRangeBounds) => void;
}

export function OverviewDateFilter({ value, onChange }: OverviewDateFilterProps) {
  const [open, setOpen] = useState(false);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [pickingCustom, setPickingCustom] = useState(false);

  function selectPreset(preset: DatePreset) {
    if (preset === "custom") {
      setPickingCustom(true);
      return;
    }
    setPickingCustom(false);
    setCustomRange(undefined);
    onChange(presetBounds(preset));
    setOpen(false);
  }

  function applyCustom() {
    if (!customRange?.from) return;
    onChange(presetBounds("custom", customRange));
    setOpen(false);
    setPickingCustom(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setPickingCustom(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border border-[#E5E4DF] bg-white px-3.5 py-2",
            "text-sm font-medium text-stone-700 shadow-[0_1px_3px_0_rgb(0_0_0/0.05)]",
            "hover:border-brand-gold/40 hover:bg-stone-50 transition-colors",
            open && "border-brand-gold/50 ring-2 ring-brand-gold/15",
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 text-stone-400 shrink-0" strokeWidth={1.75} />
          <span className="max-w-[160px] truncate">{value.label}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-stone-400 transition-transform shrink-0", open && "rotate-180")}
            strokeWidth={2}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={6} className="w-auto p-0 overflow-hidden">
        {!pickingCustom ? (
          <ul className="py-1.5">
            {PRESETS.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => selectPreset(p.id)}
                  className={cn(
                    "w-full px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-50 transition-colors",
                    value.preset === p.id && "font-semibold text-stone-900 bg-stone-50/70",
                  )}
                >
                  {p.label}
                  {value.preset === p.id && p.id !== "custom" && (
                    <span className="ml-2 text-xs text-stone-400 font-normal">({value.label})</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E5E4DF] px-4 py-2.5">
              <span className="text-sm font-semibold text-stone-800">Select range</span>
              <button
                type="button"
                onClick={() => setPickingCustom(false)}
                className="rounded-full p-1 hover:bg-stone-100 transition-colors"
              >
                <X className="h-3.5 w-3.5 text-stone-500" />
              </button>
            </div>
            <Calendar
              mode="range"
              selected={customRange}
              onSelect={setCustomRange}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
              className="p-3"
            />
            <div className="flex items-center justify-between border-t border-[#E5E4DF] px-4 py-3">
              <span className="text-xs text-stone-500">
                {customRange?.from
                  ? customRange.to
                    ? `${format(customRange.from, "d MMM")} – ${format(customRange.to, "d MMM yyyy")}`
                    : format(customRange.from, "d MMM yyyy")
                  : "Pick a start date"}
              </span>
              <button
                type="button"
                disabled={!customRange?.from}
                onClick={applyCustom}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  customRange?.from
                    ? "bg-brand-gold text-surface hover:bg-brand-gold-dark"
                    : "bg-stone-100 text-stone-400 cursor-not-allowed",
                )}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { presetBounds };

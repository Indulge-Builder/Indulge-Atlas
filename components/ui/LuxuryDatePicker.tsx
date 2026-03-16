"use client";

import * as React from "react";
import { forwardRef, useState, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const HOURS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const PERIODS: Array<"AM" | "PM"> = ["AM", "PM"];

function toH12(h24: number): { hour: string; period: "AM" | "PM" } {
  const period: "AM" | "PM" = h24 < 12 ? "AM" : "PM";
  const h = h24 % 12;
  return { hour: String(h === 0 ? 12 : h), period };
}

function toH24(hour: string, period: "AM" | "PM"): number {
  let h = parseInt(hour, 10);
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h;
}

export interface LuxuryDatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: (date: Date) => boolean;
  className?: string;
}

function LuxuryDatePickerInner(
  {
    value,
    onChange,
    placeholder = "Select date & time",
    disabled,
    className,
  }: LuxuryDatePickerProps,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const [open, setOpen] = useState(false);

  const fromValue = (v?: Date) => {
    if (!v) return { day: undefined, hour: "9", minute: "00", period: "AM" as const };
    const { hour, period } = toH12(v.getHours());
    const minute = String(v.getMinutes()).padStart(2, "0");
    return { day: new Date(v), hour, minute, period };
  };

  const init = fromValue(value);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(init.day);
  const [hour, setHour] = useState(init.hour);
  const [minute, setMinute] = useState(init.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(init.period);

  useEffect(() => {
    const { day, hour: h, minute: m, period: p } = fromValue(value);
    setSelectedDay(day);
    setHour(h);
    setMinute(m);
    setPeriod(p);
  }, [value]);

  function compose(day: Date | undefined, h: string, m: string, p: "AM" | "PM") {
    if (!day) return;
    const result = new Date(day);
    result.setHours(toH24(h, p), parseInt(m, 10), 0, 0);
    onChange(result);
  }

  function handleDaySelect(day: Date | undefined) {
    setSelectedDay(day);
    if (day) compose(day, hour, minute, period);
    else onChange(undefined);
  }

  function handleHour(h: string) {
    setHour(h);
    if (selectedDay) compose(selectedDay, h, minute, period);
  }
  function handleMinute(m: string) {
    setMinute(m);
    if (selectedDay) compose(selectedDay, hour, m, period);
  }
  function handlePeriod(p: "AM" | "PM") {
    setPeriod(p);
    if (selectedDay) compose(selectedDay, hour, minute, p);
  }

  const displayLabel = value ? format(value, "MMM d, yyyy · h:mm a") : placeholder;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          ref={ref}
          type="button"
          className={cn(
            "flex items-center gap-2.5 w-full h-10 px-3 rounded-xl border",
            "border-[#E0EAD8] bg-[#F5FAF3] text-sm text-left transition-colors",
            "hover:border-[#8AAA82]/70 focus:outline-none focus:ring-1 focus:ring-[#6B8F5A]/30",
            value ? "text-[#1A1A1A]" : "text-[#6B6B6B]",
            className,
          )}
        >
          <CalendarDays className="w-4 h-4 shrink-0 text-[#4A4A4A]" />
          <span className="flex-1 truncate">{displayLabel}</span>
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={{ top: 24, right: 16, bottom: 24, left: 16 }}
          sticky="always"
          avoidCollisions={true}
          className="z-[200] outline-none p-0 min-w-[280px] max-w-[min(320px,calc(100vw-32px))]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div
            className="rounded-xl border border-[#C0D4B8] bg-[#EEF6EA] shadow-lg overflow-y-auto overflow-x-hidden max-h-[min(420px,75vh)]"
            style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.12)" }}
          >
            {/* Calendar */}
            <div className="p-4">
              <DayPicker
                mode="single"
                selected={selectedDay}
                onSelect={handleDaySelect}
                disabled={disabled}
                showOutsideDays
                fixedWeeks
                classNames={{
                  months: "flex flex-col",
                  month: "flex flex-col gap-3",
                  month_caption: "flex items-center justify-between px-1",
                  caption_label: "text-[13px] font-semibold text-[#1A1A1A]",
                  nav: "flex gap-1",
                  button_previous:
                    "h-8 w-8 rounded-lg flex items-center justify-center text-[#1A1A1A] hover:bg-[#DFF0DA] transition-colors",
                  button_next:
                    "h-8 w-8 rounded-lg flex items-center justify-center text-[#1A1A1A] hover:bg-[#DFF0DA] transition-colors",
                  month_grid: "w-full border-collapse",
                  weekdays: "flex",
                  weekday: "w-9 text-[11px] font-medium text-[#4A4A4A] text-center",
                  week: "flex",
                  day: "h-9 w-9 p-0 text-[13px] rounded-full cursor-pointer transition-colors text-[#1A1A1A]",
                  day_button: "h-9 w-9 flex items-center justify-center rounded-full w-full",
                  selected: "!bg-[#6B8F5A] !text-white font-semibold",
                  today: "font-semibold ring-1 ring-[#6B8F5A] ring-offset-1",
                  outside: "opacity-40",
                  disabled: "opacity-30 cursor-not-allowed",
                  hidden: "invisible",
                }}
                modifiersStyles={{
                  selected: { backgroundColor: "#6B8F5A", color: "#fff" },
                  today: { border: "1px solid #6B8F5A", color: "#6B8F5A" },
                }}
                components={{
                  Chevron: ({ orientation }) =>
                    orientation === "left" ? (
                      <ChevronLeft className="h-4 w-4" strokeWidth={2} />
                    ) : (
                      <ChevronRight className="h-4 w-4" strokeWidth={2} />
                    ),
                }}
              />
            </div>

            {/* Divider */}
            <div className="h-px bg-[#C8DCC0] mx-4" />

            {/* Time picker */}
            <div className="p-4">
              <p className="text-[10px] font-semibold text-[#4A4A4A] uppercase tracking-wider mb-2 text-center">
                Time
              </p>
              <div className="flex items-center justify-center gap-2">
                <select
                  value={hour}
                  onChange={(e) => handleHour(e.target.value)}
                  className="h-9 w-14 rounded-lg border border-[#C0D4B8] bg-white px-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#6B8F5A]/50"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="text-[#4A4A4A] font-medium">:</span>
                <select
                  value={minute}
                  onChange={(e) => handleMinute(e.target.value)}
                  className="h-9 w-14 rounded-lg border border-[#C0D4B8] bg-white px-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#6B8F5A]/50"
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={period}
                  onChange={(e) => handlePeriod(e.target.value as "AM" | "PM")}
                  className="h-9 w-14 rounded-lg border border-[#C0D4B8] bg-white px-2 text-[13px] text-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#6B8F5A]/50"
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Confirm */}
            <div className="px-4 pb-4 pt-0 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg text-[12px] font-medium text-[#1A1A1A] bg-white border border-[#C0D4B8] hover:bg-[#DFF0DA] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export const LuxuryDatePicker = forwardRef(LuxuryDatePickerInner);
LuxuryDatePicker.displayName = "LuxuryDatePicker";

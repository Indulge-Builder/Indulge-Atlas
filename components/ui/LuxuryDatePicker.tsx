"use client";

import * as React from "react";
import { forwardRef, useState, useEffect, useRef } from "react";
import { DayPicker } from "react-day-picker";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ─── Palette tokens ────────────────────────────────────────────────────────────
const P = {
  bg:          "#EEF6EA",
  border:      "#C0D4B8",
  borderDark:  "#A8C49E",
  textDeep:    "#2A4028",
  textMid:     "#4A6A44",
  textMuted:   "#8AAA82",
  textFaint:   "#A8C4A0",
  hover:       "#DFF0DA",
  selectedBg:  "#6B8F5A",
  todayBorder: "#6B8F5A",
  divider:     "#C8DCC0",
  confirmText: "#5A7A52",
  timeGhost:   "#9AB896",
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────
const HOURS   = ["1","2","3","4","5","6","7","8","9","10","11","12"];
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const PERIODS: Array<"AM" | "PM"> = ["AM", "PM"];
const ITEM_H  = 30; // px — row height

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Scroll Time Column ───────────────────────────────────────────────────────
interface TimeColumnProps<T extends string> {
  items: T[];
  selected: T;
  onSelect: (v: T) => void;
  width?: string;
}

function TimeColumn<T extends string>({
  items, selected, onSelect, width = "w-12",
}: TimeColumnProps<T>) {
  const scrollRef  = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync scroll when selected changes externally
  useEffect(() => {
    const idx = items.indexOf(selected);
    if (scrollRef.current && idx >= 0) {
      scrollRef.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
    }
  }, [selected, items]);

  // Non-passive wheel → drive value on hover without clicking first
  useEffect(() => {
    const el     = wrapperRef.current;
    const scroll = scrollRef.current;
    if (!el || !scroll) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      scroll.scrollTop += e.deltaY > 0 ? ITEM_H : -ITEM_H;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(scroll.scrollTop / ITEM_H)));
      onSelect(items[idx]);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [items, onSelect]);

  return (
    <div ref={wrapperRef} className={cn("relative shrink-0", width)}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{ height: ITEM_H, background: `linear-gradient(to bottom, ${P.bg} 20%, transparent)` }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{ height: ITEM_H, background: `linear-gradient(to top, ${P.bg} 20%, transparent)` }}
      />
      <div
        className="pointer-events-none absolute inset-x-0.5 z-10 rounded-lg"
        style={{ top: ITEM_H, height: ITEM_H, border: `1px solid ${P.borderDark}`, background: `${P.hover}99` }}
      />
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ height: ITEM_H * 3, scrollbarWidth: "none" }}
      >
        <div style={{ height: ITEM_H }} />
        {items.map((item) => (
          <div
            key={item}
            onClick={() => onSelect(item)}
            className={cn(
              "flex items-center justify-center cursor-pointer select-none",
              "text-[13px] transition-colors duration-100",
              selected === item ? "font-semibold" : "hover:text-[#3A6035]",
            )}
            style={{ height: ITEM_H, color: selected === item ? P.textDeep : P.timeGhost }}
          >
            {item}
          </div>
        ))}
        <div style={{ height: ITEM_H }} />
      </div>
    </div>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────
export interface LuxuryDatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: (date: Date) => boolean;
  className?: string;
}

function LuxuryDatePickerInner(
  { value, onChange, placeholder = "Select date & time", disabled, className }: LuxuryDatePickerProps,
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
  const [hour,   setHour]   = useState(init.hour);
  const [minute, setMinute] = useState(init.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(init.period);

  useEffect(() => {
    const { day, hour: h, minute: m, period: p } = fromValue(value);
    setSelectedDay(day); setHour(h); setMinute(m); setPeriod(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function handleHour  (h: string)      { setHour(h);   if (selectedDay) compose(selectedDay, h,    minute, period); }
  function handleMinute(m: string)      { setMinute(m); if (selectedDay) compose(selectedDay, hour, m,      period); }
  function handlePeriod(p: "AM" | "PM") { setPeriod(p); if (selectedDay) compose(selectedDay, hour, minute, p);     }

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
            value ? "text-[#2A4028]" : "text-[#A4C09A]",
            className,
          )}
        >
          <CalendarDays className="w-4 h-4 shrink-0" style={{ color: P.textMuted }} />
          <span className="flex-1 truncate">{displayLabel}</span>
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-[200] outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{    opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{
              backgroundColor: P.bg,
              border: `1px solid ${P.border}`,
              borderRadius: "18px",
              overflow: "hidden",
              boxShadow: "0 16px 48px rgba(60,100,50,0.14), 0 2px 8px rgba(60,100,50,0.08)",
            }}
          >
            {/* ── Calendar ───────────────────────────────── */}
            <div className="p-3 pb-1">
              <DayPicker
                mode="single"
                selected={selectedDay}
                onSelect={handleDaySelect}
                disabled={disabled}
                showOutsideDays
                fixedWeeks
                classNames={{
                  months:          "flex flex-col",
                  month:           "space-y-2",
                  month_caption:   "flex items-center justify-between relative h-9",
                  caption_label:   "absolute left-1/2 -translate-x-1/2 text-[13px] font-semibold tracking-wide pointer-events-none",
                  nav:             "contents",
                  button_previous: "h-7 w-7 rounded-lg flex items-center justify-center transition-all duration-150 opacity-60 hover:opacity-100",
                  button_next:     "h-7 w-7 rounded-lg flex items-center justify-center transition-all duration-150 opacity-60 hover:opacity-100",
                  month_grid:      "w-full border-collapse",
                  weekdays:        "flex mb-0.5",
                  weekday:         "text-[11px] font-medium w-9 flex items-center justify-center",
                  week:            "flex w-full mt-1",
                  day:             "h-9 w-9 p-0 relative flex items-center justify-center text-[13px] rounded-full cursor-pointer transition-colors",
                  day_button:      "h-9 w-9 flex items-center justify-center rounded-full",
                  selected:        "!rounded-full font-semibold !text-white",
                  today:           "font-semibold",
                  outside:         "opacity-30",
                  disabled:        "opacity-25 cursor-not-allowed",
                  hidden:          "invisible",
                }}
                styles={{
                  caption_label:   { color: P.textDeep },
                  button_previous: { color: P.textDeep, background: "transparent" },
                  button_next:     { color: P.textDeep, background: "transparent" },
                  weekday:         { color: P.textMuted },
                  day:             { color: P.textMid },
                  selected:        { backgroundColor: P.selectedBg } as React.CSSProperties,
                  today:           { borderColor: P.todayBorder, color: P.selectedBg } as React.CSSProperties,
                }}
                modifiersStyles={{
                  selected: { backgroundColor: P.selectedBg, color: "#fff" },
                  today:    { border: `1px solid ${P.todayBorder}`, color: P.selectedBg },
                }}
                components={{
                  Chevron: ({ orientation }) =>
                    orientation === "left"
                      ? <ChevronLeft  className="h-4 w-4" strokeWidth={2} />
                      : <ChevronRight className="h-4 w-4" strokeWidth={2} />,
                }}
              />
            </div>

            {/* ── Divider ─────────────────────────────────── */}
            <div className="mx-3 my-1" style={{ height: 1, backgroundColor: P.divider }} />

            {/* ── Time Picker ─────────────────────────────── */}
            <div className="px-4 pt-1 pb-1">
              <p
                className="text-[9px] font-semibold uppercase tracking-[0.22em] text-center mb-0.5"
                style={{ color: P.textMuted }}
              >
                Time
              </p>
              <div className="flex items-center justify-center gap-0">
                <TimeColumn items={HOURS}   selected={hour}   onSelect={handleHour}   width="w-10" />
                <span
                  className="text-base font-light leading-none pb-px mx-0.5"
                  style={{ color: P.borderDark }}
                  aria-hidden
                >:</span>
                <TimeColumn items={MINUTES} selected={minute} onSelect={handleMinute} width="w-12" />
                <div className="w-2" />
                <TimeColumn items={PERIODS} selected={period} onSelect={handlePeriod} width="w-10" />
              </div>
            </div>

            {/* ── Confirm ─────────────────────────────────── */}
            <div className="px-4 pb-3 pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
                style={{ color: P.confirmText, border: `1px solid ${P.borderDark}60` }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${P.hover}90`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export const LuxuryDatePicker = forwardRef(LuxuryDatePickerInner);
LuxuryDatePicker.displayName = "LuxuryDatePicker";

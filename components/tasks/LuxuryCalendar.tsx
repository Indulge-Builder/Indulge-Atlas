"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  format,
  addMonths,
  subMonths,
  isSameMonth,
} from "date-fns";
import { cn } from "@/lib/utils";

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface LuxuryCalendarProps {
  selectedDate: Date;
  /** Dates that have personal (My Tasks) entries — shown as gold circles */
  taskDates: Date[];
  /** Dates that have Group Tasks (subtasks) — shown as indigo squares */
  atlasTaskDates?: Date[];
  onSelectDate: (date: Date) => void;
}

export function LuxuryCalendar({
  selectedDate,
  taskDates,
  atlasTaskDates = [],
  onSelectDate,
}: LuxuryCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [direction, setDirection] = useState(1);

  function goToPrev() {
    setDirection(-1);
    setViewMonth((m) => subMonths(m, 1));
  }

  function goToNext() {
    setDirection(1);
    setViewMonth((m) => addMonths(m, 1));
  }

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth)),
    end: endOfWeek(endOfMonth(viewMonth)),
  });

  function hasPersonal(date: Date) {
    return taskDates.some((td) => isSameDay(td, date));
  }

  function hasAtlas(date: Date) {
    return atlasTaskDates.some((td) => isSameDay(td, date));
  }

  return (
    <div className="bg-white rounded-2xl border border-[#EAEAEA] p-5 select-none">
      {/* Month / Year header */}
      <div className="flex items-center justify-between mb-6">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.97 }}
          onClick={goToPrev}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9E9E9E] hover:bg-[#F4F4F0] hover:text-[#1A1A1A] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </motion.button>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={format(viewMonth, "yyyy-MM")}
            initial={{ opacity: 0, y: direction * -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: direction * 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="text-center"
          >
            <p
              className="text-[#1A1A1A] font-semibold text-sm leading-none"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {format(viewMonth, "MMMM")}
            </p>
            <p className="text-[#9E9E9E] text-[10px] mt-1">
              {format(viewMonth, "yyyy")}
            </p>
          </motion.div>
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.97 }}
          onClick={goToNext}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9E9E9E] hover:bg-[#F4F4F0] hover:text-[#1A1A1A] transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </motion.button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1.5">
        {WEEK_DAYS.map((d) => (
          <p
            key={d}
            className="text-center text-[9px] font-semibold text-[#C0C0B8] uppercase tracking-widest py-1"
          >
            {d}
          </p>
        ))}
      </div>

      {/* Day grid — slides when month changes */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={format(viewMonth, "yyyy-MM")}
          initial={{ opacity: 0, x: direction * 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="grid grid-cols-7 gap-y-0.5"
        >
          {days.map((day, i) => {
            const inMonth  = isSameMonth(day, viewMonth);
            const isSelected = isSameDay(day, selectedDate);
            const isCurrent  = isToday(day);
            const personal   = hasPersonal(day);
            const atlas      = hasAtlas(day);
            // When selected, still show indicators but dimmed
            const showPersonal = personal && inMonth;
            const showAtlas    = atlas && inMonth;

            return (
              <div key={i} className="flex flex-col items-center py-0.5">
                <motion.button
                  whileHover={inMonth ? { scale: 1.08 } : {}}
                  whileTap={inMonth ? { scale: 0.94 } : {}}
                  onClick={() => inMonth && onSelectDate(day)}
                  disabled={!inMonth}
                  className={cn(
                    "relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150",
                    !inMonth && "cursor-default opacity-20",
                    isSelected && "bg-[#1A1A1A] shadow-[0_2px_8px_rgba(0,0,0,0.18)]",
                    !isSelected && isCurrent && "ring-1 ring-[#D4AF37] ring-offset-1",
                    !isSelected && inMonth && "hover:bg-[#F4F4F0]",
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-medium leading-none",
                      isSelected && "text-white",
                      !isSelected && isCurrent && "text-[#D4AF37] font-semibold",
                      !isSelected && !isCurrent && inMonth && "text-[#3A3A3A]",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </motion.button>

                {/* Indicator row — max two dots side-by-side */}
                <div className="h-2 flex items-center justify-center gap-0.5 mt-0.5">
                  {showPersonal && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      className={cn(
                        "w-1 h-1 rounded-full",
                        isSelected ? "bg-[#D4AF37]/60" : "bg-[#D4AF37]",
                      )}
                    />
                  )}
                  {showAtlas && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.04 }}
                      className={cn(
                        "w-1 h-1 rounded-sm",
                        isSelected ? "bg-[#6366F1]/50" : "bg-[#6366F1]",
                      )}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Legend + Today shortcut */}
      <div className="mt-4 pt-4 border-t border-[#F4F4F0] space-y-3">
        {/* Legend */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shrink-0" />
            <span className="text-[9px] font-medium text-[#B5A99A] uppercase tracking-widest">
              My Tasks
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-sm bg-[#6366F1] shrink-0" />
            <span className="text-[9px] font-medium text-[#B5A99A] uppercase tracking-widest">
              Group Tasks
            </span>
          </div>
        </div>

        {/* Today shortcut */}
        <button
          onClick={() => {
            const today = new Date();
            setViewMonth(startOfMonth(today));
            onSelectDate(today);
          }}
          className="w-full text-center text-[11px] font-medium text-[#9E9E9E] hover:text-[#D4AF37] transition-colors tracking-wide"
        >
          Jump to today
        </button>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-semibold text-[#1A1A1A]",
        nav: "space-x-1 flex items-center",
        button_previous:
          "absolute left-1 h-7 w-7 rounded-full border border-[#E5E4DF] hover:bg-[#F2F2EE] flex items-center justify-center transition-colors",
        button_next:
          "absolute right-1 h-7 w-7 rounded-full border border-[#E5E4DF] hover:bg-[#F2F2EE] flex items-center justify-center transition-colors",
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-[#B5A99A] rounded-md w-9 font-normal text-[0.8rem] flex items-center justify-center",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative rounded-full hover:bg-[#F2F2EE] transition-colors flex items-center justify-center text-[#1A1A1A]",
        day_button:
          "h-9 w-9 flex items-center justify-center rounded-full font-normal transition-colors",
        selected:
          "bg-[#D4AF37] text-[#0A0A0A] hover:bg-[#C9A530] hover:text-[#0A0A0A] font-semibold rounded-full",
        today: "border border-[#D4AF37] text-[#A88B25] font-semibold",
        outside: "text-[#D0C8BE] opacity-50",
        disabled: "text-[#D0C8BE] opacity-50 cursor-not-allowed",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };

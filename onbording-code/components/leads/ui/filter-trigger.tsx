import { cva } from "class-variance-authority";

/** Shared “filter chip” look for Leads table Select triggers and the date popover button. */
export const leadsFilterTriggerVariants = cva(
  "h-9 cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-0 text-sm font-medium text-stone-600 transition-all hover:bg-stone-50 hover:text-stone-900 focus:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-300",
  {
    variants: {
      control: {
        select:
          "min-h-9 shrink-0 flex-nowrap overflow-hidden shadow-none data-[placeholder]:text-stone-500 [&>span]:line-clamp-none [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:items-center [&>span]:gap-1.5 [&>span]:overflow-hidden [&_svg:last-of-type]:h-4 [&_svg:last-of-type]:w-4 [&_svg:last-of-type]:shrink-0 [&_svg:last-of-type]:text-stone-400",
        popover:
          "inline-flex min-w-38 shrink-0 text-left",
      },
    },
    defaultVariants: {
      control: "select",
    },
  },
);

/** Applied when a filter is active (matches previous `filterTriggerActive` string). */
export const leadsFilterTriggerActiveClass =
  "border-stone-300 bg-stone-100 text-stone-900";

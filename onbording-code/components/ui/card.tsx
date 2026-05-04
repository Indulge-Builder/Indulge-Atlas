import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * surfaceCardVariants — CVA token map for every "panel" surface in the CRM.
 *
 * Tones:
 *   luxury  → white fill, stone border          (default — most cards)
 *   subtle  → white fill, lighter border        (nested / inner cards)
 *   glass   → frosted white, backdrop-blur      (overlay surfaces)
 *   stone   → warm off-white (#F9F9F6), stone border (page-level canvas panels)
 *   dark    → deep charcoal (#1A1814), white/10 border (luxury dark surfaces)
 *
 * Elevation:
 *   none → no shadow
 *   xs   → 0.03 opacity shadow (inner panels)
 *   sm   → 0.04 opacity shadow (default floating cards)
 *   md   → elevated modals / focus panels
 *
 * Overflow:
 *   hidden  → clips children (default — safe for status accent strips)
 *   visible → allows tooltips / dropdowns to overflow
 */
export const surfaceCardVariants = cva("rounded-2xl", {
  variants: {
    tone: {
      luxury: "border border-[#E5E4DF] bg-white",
      subtle: "border border-[#EAEAEA] bg-white",
      glass:  "border border-white/80 bg-white/60 backdrop-blur-xl",
      stone:  "border border-[#E5E4DF] bg-[#F9F9F6]",
      dark:   "border border-white/10 bg-[#1A1814]",
    },
    elevation: {
      none: "",
      xs:   "shadow-[0_1px_4px_0_rgb(0_0_0/0.03)]",
      sm:   "shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]",
      md:   "shadow-[0_4px_20px_-4px_rgb(0_0_0/0.10)]",
    },
    overflow: {
      hidden:  "overflow-hidden",
      visible: "",
    },
  },
  defaultVariants: {
    tone:     "luxury",
    elevation: "sm",
    overflow:  "hidden",
  },
});

// ── Standard shadcn-style Card components ────────────────────────────────────

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-[#E5E4DF] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.06)]",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1 p-5 pb-0", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-base font-semibold leading-none tracking-tight text-[#1A1A1A]",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-[#6B6B6B]", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center px-5 pb-5", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};

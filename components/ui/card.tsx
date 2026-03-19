import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Luxury “paper” surfaces used across dashboard tables and panels (pixel tokens preserved). */
export const surfaceCardVariants = cva("rounded-2xl", {
  variants: {
    tone: {
      luxury: "border border-[#E5E4DF] bg-white",
      subtle: "border border-[#EAEAEA] bg-white",
      glass:
        "border border-white/80 bg-white/60 backdrop-blur-xl",
    },
    elevation: {
      none: "",
      sm: "shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]",
      xs: "shadow-[0_1px_4px_0_rgb(0_0_0/0.03)]",
    },
    overflow: {
      hidden: "overflow-hidden",
      visible: "",
    },
  },
  defaultVariants: {
    tone: "luxury",
    elevation: "sm",
    overflow: "hidden",
  },
});

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-[#E5E4DF] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.06)]",
      className
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
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-base font-semibold leading-none tracking-tight text-[#1A1A1A]",
      className
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

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };

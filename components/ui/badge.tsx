import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[#0A0A0A] text-white",
        gold: "bg-[#D4AF37]/20 text-[#A88B25] border border-[#D4AF37]/30",
        outline: "border border-[#E5E4DF] text-[#6B6B6B]",
        new: "bg-[#E8F0FA] text-[#2C6FAC]",
        attempted: "bg-[#FEF3D0] text-[#C5830A]",
        in_discussion: "bg-[#F0EBFF] text-[#6B4FBB]",
        won: "bg-[#EBF4EF] text-[#4A7C59]",
        lost: "bg-[#FAEAE8] text-[#C0392B]",
        nurturing: "bg-[#F4F4EE] text-[#8A8A6E]",
        junk: "bg-[#F5F5F5] text-[#9E9E9E]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

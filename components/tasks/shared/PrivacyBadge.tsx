"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PrivacyBadgeProps {
  showLabel?: boolean;
  isManagerView?: boolean;
  className?: string;
}

export function PrivacyBadge({
  showLabel = false,
  isManagerView = false,
  className,
}: PrivacyBadgeProps) {
  const copy = isManagerView
    ? "This employee's private task — visible to you as their manager"
    : "Only visible to you and your manager";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-white/35 hover:text-white/55 transition-colors cursor-default select-none",
              className,
            )}
          >
            <Lock className="w-2.5 h-2.5 shrink-0" aria-hidden />
            {showLabel && (
              <span className="text-[10px] font-medium tracking-tight">Private</span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent
          sideOffset={6}
          className={cn(
            "max-w-[240px] border border-white/10 bg-[var(--surface-2)] px-3 py-2 text-xs text-white/75 shadow-lg backdrop-blur-sm",
          )}
        >
          <TooltipPrimitive.Arrow className="fill-[var(--surface-2)]" width={11} height={5} />
          {copy}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

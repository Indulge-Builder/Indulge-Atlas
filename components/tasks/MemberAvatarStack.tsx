"use client";

import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Member {
  id: string;
  full_name: string;
  role?: string;
  job_title?: string | null;
}

interface MemberAvatarStackProps {
  members: Member[];
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const SIZE_MAP = {
  xs: "h-5 w-5 text-[10px] -ml-1.5",
  sm: "h-6 w-6 text-[11px] -ml-2",
  md: "h-7 w-7 text-xs -ml-2",
};

const COLORS = [
  "bg-indigo-500",
  "bg-[#D4AF37]",
  "bg-teal-500",
  "bg-purple-500",
  "bg-rose-400",
  "bg-sky-500",
];

export function MemberAvatarStack({
  members,
  max = 4,
  size = "sm",
  className,
}: MemberAvatarStackProps) {
  const visible = members.slice(0, max);
  const overflow = members.length - max;
  const sizeClass = SIZE_MAP[size];

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn("flex items-center", className)}
        role="list"
        aria-label={`${members.length} member${members.length !== 1 ? "s" : ""}`}
      >
        {visible.map((m, i) => (
          <Tooltip key={m.id}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "relative flex items-center justify-center rounded-full ring-2 ring-white font-semibold text-white cursor-default",
                  sizeClass,
                  COLORS[i % COLORS.length],
                  i === 0 ? "ml-0" : "",
                )}
                role="listitem"
                aria-label={m.full_name}
              >
                {getInitials(m.full_name)}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p className="font-medium">{m.full_name}</p>
              {m.job_title && (
                <p className="text-zinc-400">{m.job_title}</p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
        {overflow > 0 && (
          <div
            className={cn(
              "flex items-center justify-center rounded-full ring-2 ring-white bg-zinc-200 text-zinc-600 font-semibold",
              sizeClass,
            )}
            aria-label={`+${overflow} more members`}
          >
            +{overflow}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

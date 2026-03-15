"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export interface AssigneeProfile {
  id: string;
  full_name: string;
  role?: string;
}

interface AvatarStackProps {
  assignees: AssigneeProfile[];
  maxVisible?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-6 w-6 text-[10px] -ml-2 first:ml-0",
  md: "h-8 w-8 text-xs -ml-2.5 first:ml-0",
  lg: "h-10 w-10 text-sm -ml-3 first:ml-0",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AvatarStack({
  assignees,
  maxVisible = 3,
  size = "md",
  className,
}: AvatarStackProps) {
  if (!assignees?.length) return null;

  const visible = assignees.slice(0, maxVisible);
  const overflow = assignees.length - maxVisible;

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((a, i) => (
        <Avatar
          key={a.id}
          className={cn(
            "ring-2 ring-white shrink-0",
            sizeClasses[size],
            i > 0 && "ring-2 ring-white",
          )}
          title={a.full_name}
        >
          <AvatarFallback className="bg-stone-100 text-stone-600 font-medium">
            {getInitials(a.full_name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            "shrink-0 rounded-full bg-stone-200 text-stone-600 font-semibold flex items-center justify-center ring-2 ring-white -ml-2.5",
            size === "sm" && "h-6 w-6 min-w-6 text-[10px]",
            size === "md" && "h-8 w-8 min-w-8 text-xs",
            size === "lg" && "h-10 w-10 min-w-10 text-sm",
          )}
          title={`+${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

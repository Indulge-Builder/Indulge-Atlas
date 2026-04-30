"use client";

import { cn } from "@/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-gradient-to-r from-[#ECEAE4] via-[#F4F3EF] to-[#ECEAE4] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

export function DepartmentModalSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex gap-4 items-start">
        <Shimmer className="h-14 w-14 rounded-xl shrink-0" />
        <div className="flex-1 space-y-3">
          <Shimmer className="h-8 w-2/3 max-w-md" />
          <Shimmer className="h-10 w-full max-w-xl" />
        </div>
      </div>
      <Shimmer className="h-10 w-full max-w-md" />
      <div className="space-y-3 pt-2">
        <Shimmer className="h-16 w-full rounded-xl" />
        <Shimmer className="h-16 w-full rounded-xl" />
        <Shimmer className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}

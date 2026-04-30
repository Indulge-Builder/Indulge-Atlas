"use client";

import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";

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

export function TaskIntelligenceSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(surfaceCardVariants({ tone: "luxury", elevation: "md", overflow: "hidden" }))}
        >
          <Shimmer className="h-1 w-full rounded-none" />
          <div className="p-5 space-y-4">
            <div className="flex justify-between gap-3">
              <Shimmer className="h-8 w-8 rounded-lg" />
              <Shimmer className="h-6 w-24 rounded-full" />
            </div>
            <Shimmer className="h-6 w-3/5" />
            <div className="grid grid-cols-4 gap-2 pt-2">
              <Shimmer className="h-12 w-full" />
              <Shimmer className="h-12 w-full" />
              <Shimmer className="h-12 w-full" />
              <Shimmer className="h-12 w-full" />
            </div>
            <Shimmer className="h-4 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

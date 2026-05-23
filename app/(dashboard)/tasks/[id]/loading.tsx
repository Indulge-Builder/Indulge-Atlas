import { Skeleton } from "@/components/ui/skeleton";

export default function MasterTaskLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F9F9F6]">
      <div className="atlas-masthead-texture w-full px-6 pt-6 pb-0 max-w-7xl mx-auto">
        {/* Back link placeholder */}
        <Skeleton className="mb-5 h-4 w-28" />

        {/* Title row */}
        <div className="mb-6 flex items-start gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
        </div>

        {/* Stats/meta row */}
        <Skeleton className="mb-6 h-[52px] w-full rounded-2xl" />

        {/* Tab bar */}
        <div className="flex gap-6 border-b border-[#E5E4DF] pb-0">
          <Skeleton className="h-9 w-28 rounded-none" />
          <Skeleton className="h-9 w-24 rounded-none" />
        </div>
      </div>

      {/* Board columns */}
      <div className="flex gap-4 overflow-x-auto px-6 pt-6 max-w-7xl mx-auto w-full pb-8">
        {Array.from({ length: 3 }).map((_, col) => (
          <div
            key={col}
            className="w-72 shrink-0 rounded-xl border border-[#E5E4DF] bg-[#FAFAF8] p-3 space-y-2.5"
          >
            <Skeleton className="h-5 w-32 mb-3" />
            {Array.from({ length: 3 }).map((_, row) => (
              <Skeleton key={row} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

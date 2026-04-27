import { Skeleton } from "@/components/ui/skeleton";

export default function MasterTaskLoading() {
  return (
    <div className="min-h-screen bg-[#F9F9F6] px-6 py-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-24" />
        <span className="text-zinc-300">/</span>
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="w-72 shrink-0 rounded-xl border border-zinc-100 bg-zinc-50 p-3 space-y-2">
            <Skeleton className="h-5 w-32 mb-3" />
            {Array.from({ length: 3 }).map((_, row) => (
              <Skeleton key={row} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

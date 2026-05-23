import { Skeleton } from "@/components/ui/skeleton";

export default function ClientDetailLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Back bar */}
      <div className="shrink-0 border-b border-[#E5E4DF] bg-[#F9F9F6] px-8 py-4">
        <Skeleton className="h-5 w-32 rounded" />
      </div>

      {/* Header */}
      <div className="border-b border-[#E5E4DF] bg-gradient-to-b from-[#F5F3EE] via-[#FAFAF8] to-[#F9F9F6] px-8 pb-8 pt-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex gap-4">
            <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
            <div className="flex flex-col gap-2 pt-1">
              <Skeleton className="h-7 w-48 rounded" />
              <Skeleton className="h-4 w-32 rounded" />
              <div className="mt-1 flex gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-4 w-56 rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-[#E5E4DF]/80 bg-[#F9F9F6] px-8 pt-4">
        <div className="flex gap-4 pb-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>
      </div>

      {/* Tab content area */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-8 pt-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 flex-1 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

import { TaskIntelligenceSkeleton } from "@/components/task-intelligence/TaskIntelligenceSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function TaskInsightsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-6 pt-6 pb-14">
        <header className="mb-6">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </header>
        <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="flex gap-0 border-b border-[#E5E4DF]">
          <Skeleton className="h-12 w-40 rounded-none" />
          <Skeleton className="h-12 w-36 rounded-none" />
        </div>
        <TaskIntelligenceSkeleton />
      </div>
    </div>
  );
}

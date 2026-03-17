import { Skeleton } from "@/components/ui/skeleton";

export default function CampaignDossierLoading() {
  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <div className="h-16 border-b border-[#E5E4DF] bg-white/80" />
      <div className="px-8 py-6 space-y-8">
        {/* Header skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <div className="flex gap-3">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>

        {/* Tab pills skeleton */}
        <div className="inline-flex gap-1 p-1 rounded-full bg-white/60 border border-[#E5E4DF]">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>

        {/* Table skeleton (dossier leads style) */}
        <div className="space-y-4">
          <div className="flex gap-3">
            <Skeleton className="h-9 flex-1 max-w-xs" />
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-9 w-44" />
          </div>
          <div className="bg-white rounded-2xl border border-[#E5E4DF] overflow-hidden">
            <div className="px-6 py-3.5 border-b border-[#EEEDE9] bg-[#FAFAF8] flex gap-10">
              {["Lead", "Status", "Date Created", "Agent"].map((col) => (
                <Skeleton key={col} className="h-2.5 w-20" />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-6 px-6 py-4 border-b border-[#F4F3EF] last:border-0"
              >
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-36" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3.5 w-20 ml-auto" />
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-4 w-4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

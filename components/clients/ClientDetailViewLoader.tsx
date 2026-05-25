"use client";

import nextDynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClientDetail } from "@/lib/actions/clients";

const ClientDetailView = nextDynamic(
  () =>
    import("@/components/clients/ClientDetailView").then((m) => ({
      default: m.ClientDetailView,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 flex-col gap-4 p-8">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    ),
  },
);

export function ClientDetailViewLoader({
  initialDetail,
}: {
  initialDetail: ClientDetail;
}) {
  return <ClientDetailView initialDetail={initialDetail} />;
}

"use client";

import dynamic from "next/dynamic";

function ChartSkeleton() {
  return (
    <div className="flex h-[260px] w-full items-center justify-center rounded-xl bg-stone-100/80">
      <div className="h-32 w-full max-w-md animate-pulse rounded-lg bg-stone-200/60" />
    </div>
  );
}

const ShopRevenueAreaChart = dynamic(
  () => import("./ShopRevenueAreaChart"),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);

export function ShopRevenueChartGate({
  data,
}: {
  data: Array<{ date: string; revenue: number }>;
}) {
  return <ShopRevenueAreaChart data={data} />;
}

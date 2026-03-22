import type { ShopPulseData } from "@/lib/actions/dashboards";

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function shopMetricDeltas(data: ShopPulseData) {
  return {
    gmv: deltaPercent(data.gmvThisMonth, data.gmvLastMonth),
    orders: deltaPercent(data.ordersThisMonth, data.ordersLastMonth),
    aov: deltaPercent(data.aovThisMonth, data.aovLastMonth),
    conversion: deltaPercent(data.conversionThisMonth, data.conversionLastMonth),
  };
}

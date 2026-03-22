import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { BriefingDeltaPill } from "@/components/scout/BriefingDeltaPill";
import type { BriefingTrendMetric } from "@/lib/briefing/executiveBriefing";
import type { ShopPulseData } from "@/lib/actions/dashboards";
import { shopMetricDeltas } from "@/lib/dashboards/shopPulseUtils";
import { ShopRevenueChartGate } from "@/components/shop/ShopRevenueChartGate";
import type { LucideIcon } from "lucide-react";
import { IndianRupee, Package, Percent, ShoppingBag } from "lucide-react";

function formatInr(value: number) {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

function metricFromDelta(
  value: number,
  delta: number | null,
): BriefingTrendMetric {
  return { value, deltaPercent: delta };
}

function MetricCard({
  label,
  value,
  icon: Icon,
  metric,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  metric: BriefingTrendMetric;
}) {
  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
        "p-6",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-stone-900">
            {value}
          </p>
          <BriefingDeltaPill metric={metric} />
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100">
          <Icon className="h-5 w-5 text-stone-600" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

export function ShopDashboardTab({ data }: { data: ShopPulseData }) {
  const d = shopMetricDeltas(data);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="GMV (this month)"
          value={formatInr(data.gmvThisMonth)}
          icon={IndianRupee}
          metric={metricFromDelta(data.gmvThisMonth, d.gmv)}
        />
        <MetricCard
          label="Orders"
          value={String(data.ordersThisMonth)}
          icon={ShoppingBag}
          metric={metricFromDelta(data.ordersThisMonth, d.orders)}
        />
        <MetricCard
          label="AOV"
          value={formatInr(data.aovThisMonth)}
          icon={Package}
          metric={metricFromDelta(data.aovThisMonth, d.aov)}
        />
        <MetricCard
          label="Conversion rate"
          value={`${(data.conversionThisMonth * 100).toFixed(1)}%`}
          icon={Percent}
          metric={metricFromDelta(data.conversionThisMonth, d.conversion)}
        />
      </div>

      <div
        className={cn(
          surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
          "p-6",
        )}
      >
        <h3
          className="text-sm font-semibold text-stone-900"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          Revenue trend
        </h3>
        <p className="mt-1 text-xs text-stone-500">
          Shop domain — last 30 days (closed deals)
        </p>
        <div className="mt-6">
          <ShopRevenueChartGate data={data.revenueLast30Days} />
        </div>
      </div>

      <div
        className={cn(
          surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
          "p-6",
        )}
      >
        <h3
          className="text-sm font-semibold text-stone-900"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          Top movers
        </h3>
        <p className="mt-1 text-xs text-stone-500">
          By revenue — this month
        </p>
        {data.topItems.length === 0 ? (
          <p className="mt-8 text-center text-sm text-stone-500">
            No closed shop revenue this month yet.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-stone-100">
            {data.topItems.map((row, i) => (
              <li
                key={row.name}
                className="flex items-center justify-between gap-4 py-4 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="text-xs text-stone-500">#{i + 1}</p>
                  <p className="truncate font-medium text-stone-900">
                    {row.name}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm tabular-nums">
                  <p className="text-stone-600">{row.units} units</p>
                  <p className="font-medium text-stone-900">
                    {formatInr(row.revenue)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ShopDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[#E5E4DF] bg-white p-6 shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]"
          >
            <div className="h-3 w-28 rounded bg-stone-200" />
            <div className="mt-6 h-8 w-16 rounded bg-stone-200" />
          </div>
        ))}
      </div>
      <div className="flex h-[260px] w-full items-center justify-center rounded-xl bg-stone-100/80">
        <div className="h-32 w-full max-w-md animate-pulse rounded-lg bg-stone-200/60" />
      </div>
    </div>
  );
}

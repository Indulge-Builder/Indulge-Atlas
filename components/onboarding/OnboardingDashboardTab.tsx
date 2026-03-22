import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import type { OnboardingPulseData } from "@/lib/actions/dashboards";

const ONBOARDING_TEAM_LEDGER: Array<{
  name: string;
  conversions: number;
  totalAmount: number;
}> = [
  { name: "Amit", conversions: 13, totalAmount: 3_345_000 },
  { name: "Samson", conversions: 32, totalAmount: 9_614_238 },
  { name: "Kaniisha", conversions: 26, totalAmount: 7_215_000 },
  { name: "Meghana", conversions: 2, totalAmount: 800_000 },
  { name: "Karan", conversions: 5, totalAmount: 1_200_000 },
  { name: "Neha", conversions: 5, totalAmount: 1_800_000 },
];

const formatInr = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
        "p-6",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-stone-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-stone-900">
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-xs text-stone-500">{sub}</p>
      ) : null}
    </div>
  );
}

export function OnboardingDashboardTab({ data }: { data: OnboardingPulseData }) {
  const totalPipeline = data.pipelineStages.reduce((s, x) => s + x.count, 0);
  const top = data.topPerformer;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active onboardings"
          value={String(data.activeOnboardings)}
        />
        <MetricCard
          label="Completed this month"
          value={String(data.completedThisMonth)}
        />
        <MetricCard
          label="Avg. time to onboard (this month)"
          value={
            data.avgDaysToOnboard !== null
              ? `${data.avgDaysToOnboard} days`
              : "—"
          }
        />
        <MetricCard
          label="Top performer this month"
          value={top ? top.name : "—"}
          sub={
            top
              ? `${top.count} completed this month`
              : "No completions yet"
          }
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
          Pipeline
        </h3>
        <p className="mt-1 text-xs text-stone-500">
          Lead volume by pipeline stage — New, Attempted, In discussion, Won, Trash
        </p>
        {totalPipeline === 0 ? (
          <p className="mt-8 text-center text-sm text-stone-500">
            No active pipeline stages to display.
          </p>
        ) : (
          <>
            <div className="mt-6 flex h-3 w-full overflow-hidden rounded-full bg-stone-100">
              {data.pipelineStages.map((s) => {
                const pct = (s.count / totalPipeline) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={s.key}
                    className={cn(s.colorClass, "h-full min-w-[2px] transition-all")}
                    style={{ width: `${pct}%` }}
                    title={`${s.label}: ${s.count}`}
                  />
                );
              })}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {data.pipelineStages.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn("h-2.5 w-2.5 rounded-full", s.colorClass)}
                  />
                  <span className="text-stone-600">{s.label}</span>
                  <span className="tabular-nums text-stone-900">{s.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div
        className={cn(
          surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
          "overflow-hidden p-6",
        )}
      >
        <h3
          className="text-sm font-semibold text-stone-900"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          Team performance &amp; revenue
        </h3>
        <p className="mt-1 text-xs text-stone-500">
          Conversion count and closed value (sample data)
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Agent name
                </th>
                <th className="pb-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Conversions
                </th>
                <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Total amount
                </th>
              </tr>
            </thead>
            <tbody>
              {ONBOARDING_TEAM_LEDGER.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-stone-100 transition-colors last:border-0 hover:bg-stone-50"
                >
                  <td className="py-3.5 pr-4 text-left font-medium text-stone-900">
                    {row.name}
                  </td>
                  <td className="py-3.5 text-center tabular-nums text-stone-800">
                    {row.conversions}
                  </td>
                  <td className="py-3.5 text-right tabular-nums text-stone-900">
                    {formatInr(row.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function OnboardingDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[#E5E4DF] bg-white p-6 shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]"
          >
            <div className="h-3 w-24 rounded bg-stone-200" />
            <div className="mt-6 h-8 w-16 rounded bg-stone-200" />
          </div>
        ))}
      </div>
      <div className="h-48 rounded-2xl border border-[#E5E4DF] bg-white p-6 shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]">
        <div className="h-4 w-32 rounded bg-stone-200" />
        <div className="mt-8 h-3 w-full rounded-full bg-stone-100" />
      </div>
    </div>
  );
}

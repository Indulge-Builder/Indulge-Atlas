import type { LucideIcon } from "lucide-react";
import { FileText, Heart, Radio, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import type { MarketingPulseData } from "@/lib/actions/dashboards";

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
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
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100">
          <Icon className="h-5 w-5 text-stone-600" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

const ENGAGEMENT_SEGMENTS: Array<{
  key: keyof MarketingPulseData["engagement"];
  label: string;
  colorClass: string;
}> = [
  { key: "likes", label: "Likes", colorClass: "bg-rose-400/90" },
  { key: "shares", label: "Shares", colorClass: "bg-[#D4AF37]/85" },
  { key: "comments", label: "Comments", colorClass: "bg-stone-500/85" },
];

export function MarketingDashboardTab({ data }: { data: MarketingPulseData }) {
  const { engagement } = data;
  const engagementTotal =
    engagement.likes + engagement.shares + engagement.comments;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total posts (this month)"
          value={formatCount(data.totalPostsThisMonth)}
          icon={FileText}
        />
        <MetricCard
          label="Total reach"
          value={formatCount(data.totalReach)}
          icon={Radio}
        />
        <MetricCard
          label="Total likes"
          value={formatCount(data.totalLikes)}
          icon={Heart}
        />
        <MetricCard
          label="Total shares"
          value={formatCount(data.totalShares)}
          icon={Share2}
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
          Engagement mix
        </h3>
        <p className="mt-1 text-xs text-stone-500">
          Ratio of likes, shares, and comments — content virality signal
        </p>
        {engagementTotal === 0 ? (
          <p className="mt-8 text-center text-sm text-stone-500">
            No engagement data this month.
          </p>
        ) : (
          <>
            <div className="mt-6 flex h-4 w-full overflow-hidden rounded-full bg-stone-100">
              {ENGAGEMENT_SEGMENTS.map((seg) => {
                const n = engagement[seg.key];
                const pct = (n / engagementTotal) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={seg.key}
                    className={cn(seg.colorClass, "h-full min-w-[3px]")}
                    style={{ width: `${pct}%` }}
                    title={`${seg.label}: ${formatCount(n)}`}
                  />
                );
              })}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {ENGAGEMENT_SEGMENTS.map((seg) => {
                const n = engagement[seg.key];
                const pct = engagementTotal > 0 ? (n / engagementTotal) * 100 : 0;
                return (
                  <li key={seg.key} className="flex items-center gap-2 text-sm">
                    <span
                      className={cn("h-2.5 w-2.5 rounded-full", seg.colorClass)}
                    />
                    <span className="text-stone-600">{seg.label}</span>
                    <span className="tabular-nums text-stone-900">
                      {formatCount(n)}
                      <span className="text-stone-400">
                        {" "}
                        ({pct.toFixed(0)}%)
                      </span>
                    </span>
                  </li>
                );
              })}
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
          Top performing posts
        </h3>
        <p className="mt-1 text-xs text-stone-500">This month</p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Post name / topic
                </th>
                <th className="pb-3 text-center text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Reach
                </th>
                <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Total interactions
                </th>
              </tr>
            </thead>
            <tbody>
              {data.topPosts.map((row) => (
                <tr
                  key={row.topic}
                  className="border-b border-stone-100 transition-colors last:border-0 hover:bg-stone-50"
                >
                  <td className="py-3.5 pr-4 font-medium text-stone-900">
                    {row.topic}
                  </td>
                  <td className="py-3.5 text-center tabular-nums text-stone-800">
                    {formatCount(row.reach)}
                  </td>
                  <td className="py-3.5 text-right tabular-nums font-medium text-stone-900">
                    {formatCount(row.interactions)}
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

export function MarketingDashboardSkeleton() {
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
      <div className="rounded-2xl border border-[#E5E4DF] bg-white p-6 shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]">
        <div className="h-4 w-40 rounded bg-stone-200" />
        <div className="mt-8 h-4 w-full rounded-full bg-stone-100" />
      </div>
      <div className="rounded-2xl border border-[#E5E4DF] bg-white p-6 shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]">
        <div className="h-4 w-48 rounded bg-stone-200" />
        <div className="mt-6 space-y-3">
          <div className="h-10 w-full rounded bg-stone-100" />
          <div className="h-10 w-full rounded bg-stone-100" />
        </div>
      </div>
    </div>
  );
}

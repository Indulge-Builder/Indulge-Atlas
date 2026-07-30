"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { getConciergeSlaReport } from "@/lib/actions/concierge-reports";
import {
  CONCIERGE_GROUP_LABELS,
  type ConciergeGroup,
  type ConciergeSlaReport,
  type SlaBucket,
  type SlaBreakdownRow,
} from "@/lib/types/database";

const COLOR_MET = "#059669";
const COLOR_BREACHED = "#DC2626";
const COLOR_PENDING = "#A3A3A3";

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function rangeToDates(preset: string): { from: string; to: string } {
  const to = new Date();
  const days = preset === "7" ? 7 : preset === "90" ? 90 : 30;
  return { from: new Date(to.getTime() - days * 86_400_000).toISOString(), to: to.toISOString() };
}

function formatMinutes(min: number | null): string {
  if (min == null) return "—";
  if (min % 1440 === 0) return `${min / 1440}d`;
  if (min % 60 === 0) return `${min / 60}h`;
  return `${min}m`;
}

function pctClass(pct: number, total: number): string {
  if (total === 0) return "text-neutral-400";
  if (pct >= 90) return "text-emerald-600";
  if (pct >= 75) return "text-amber-600";
  return "text-red-600";
}

function StatCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", valueClass ?? "text-neutral-900")}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-neutral-500">{sub}</p> : null}
    </div>
  );
}

function BucketBar({ bucket }: { bucket: SlaBucket }) {
  const determined = bucket.met + bucket.breached;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2 w-24 overflow-hidden rounded-full bg-neutral-100">
        {bucket.met > 0 && <div style={{ width: `${(bucket.met / bucket.total) * 100}%`, background: COLOR_MET }} />}
        {bucket.breached > 0 && <div style={{ width: `${(bucket.breached / bucket.total) * 100}%`, background: COLOR_BREACHED }} />}
        {bucket.pending > 0 && <div style={{ width: `${(bucket.pending / bucket.total) * 100}%`, background: COLOR_PENDING }} />}
      </div>
      <span className={cn("text-xs tabular-nums", pctClass(bucket.pctMet, determined))}>
        {determined ? `${bucket.pctMet}%` : "—"}
      </span>
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: SlaBreakdownRow[] }) {
  const shown = rows.filter((r) => r.resolution.total > 0 || r.firstResponse.total > 0);
  return (
    <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
      <h3 className="mb-3 text-sm font-semibold text-neutral-800">{title}</h3>
      {shown.length === 0 ? (
        <p className="text-sm text-neutral-400">No tickets in range.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-400">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Tickets</th>
              <th className="pb-2 font-medium">First response</th>
              <th className="pb-2 font-medium">Resolution</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-t border-neutral-100">
                <td className="py-2 text-neutral-700">{r.label}</td>
                <td className="py-2 tabular-nums text-neutral-500">{r.resolution.total}</td>
                <td className="py-2"><BucketBar bucket={r.firstResponse} /></td>
                <td className="py-2"><BucketBar bucket={r.resolution} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function SlaReportClient({
  initialReport,
  error: initialError,
  isAdmin,
}: {
  initialReport: ConciergeSlaReport | null;
  error: string | null;
  isAdmin: boolean;
}) {
  const [report, setReport] = useState<ConciergeSlaReport | null>(initialReport);
  const [error, setError] = useState<string | null>(initialError);
  const [rangePreset, setRangePreset] = useState("30");
  const [group, setGroup] = useState<ConciergeGroup | "all">("all");
  const [isPending, startTransition] = useTransition();

  function reload(nextRange: string, nextGroup: ConciergeGroup | "all") {
    const { from, to } = rangeToDates(nextRange);
    startTransition(async () => {
      const res = await getConciergeSlaReport({
        from,
        to,
        ...(isAdmin && nextGroup !== "all" ? { group: nextGroup } : {}),
      });
      if (res.success) {
        setReport(res.data ?? null);
        setError(null);
      } else {
        setError(res.error ?? "Could not load the report.");
      }
    });
  }

  const chartData = report
    ? [
        { name: "First response", ...report.firstResponse },
        { name: "Resolution", ...report.resolution },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 py-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/concierge/tickets"
            className="mb-1 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Tickets
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">SLA Reports</h1>
          <p className="mt-1 text-sm text-neutral-500">
            First-response &amp; resolution compliance for tickets created in range.
            {report?.scopedToQueendom
              ? ` Scoped to ${CONCIERGE_GROUP_LABELS[report.scopedToQueendom]}.`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={rangePreset}
            onValueChange={(v) => {
              setRangePreset(v);
              reload(v, group);
            }}
          >
            <SelectTrigger aria-label="Date range" className="h-9 w-auto min-w-[9rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin ? (
            <Select
              value={group}
              onValueChange={(v) => {
                const g = v as ConciergeGroup | "all";
                setGroup(g);
                reload(rangePreset, g);
              }}
            >
              <SelectTrigger aria-label="Queendom" className="h-9 w-auto min-w-[10rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All queendoms</SelectItem>
                {(Object.keys(CONCIERGE_GROUP_LABELS) as ConciergeGroup[]).map((g) => (
                  <SelectItem key={g} value={g}>{CONCIERGE_GROUP_LABELS[g]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4 text-sm text-red-600")}>
          {error}
        </div>
      ) : !report ? (
        <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-8 text-center text-sm text-neutral-400")}>
          No data.
        </div>
      ) : (
        <div className={cn("space-y-5", isPending && "opacity-60")}>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="First response"
              value={report.firstResponse.met + report.firstResponse.breached ? `${report.firstResponse.pctMet}%` : "—"}
              sub={`${report.firstResponse.met} met · ${report.firstResponse.breached} breached`}
              valueClass={pctClass(report.firstResponse.pctMet, report.firstResponse.met + report.firstResponse.breached)}
            />
            <StatCard
              label="Resolution"
              value={report.resolution.met + report.resolution.breached ? `${report.resolution.pctMet}%` : "—"}
              sub={`${report.resolution.met} met · ${report.resolution.breached} breached`}
              valueClass={pctClass(report.resolution.pctMet, report.resolution.met + report.resolution.breached)}
            />
            <StatCard label="Overdue now" value={String(report.totals.overdue)} valueClass={report.totals.overdue > 0 ? "text-red-600" : "text-neutral-900"} />
            <StatCard
              label="Created"
              value={String(report.totals.created)}
              sub={`${report.totals.resolved} resolved · ${report.totals.open} open`}
            />
          </div>

          {/* Compliance chart */}
          <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-800">Compliance breakdown</h3>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_MET }} /> Met</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_BREACHED }} /> Breached</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_PENDING }} /> Pending</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 12, fill: "#525252" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#F5F5F4" }} />
                <Bar dataKey="met" stackId="a" fill={COLOR_MET} radius={[4, 0, 0, 4]} />
                <Bar dataKey="breached" stackId="a" fill={COLOR_BREACHED} />
                <Bar dataKey="pending" stackId="a" fill={COLOR_PENDING} radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => <Cell key={i} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By priority */}
          <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
            <h3 className="mb-3 text-sm font-semibold text-neutral-800">By priority</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-400">
                  <th className="pb-2 font-medium">Priority</th>
                  <th className="pb-2 font-medium">Response target</th>
                  <th className="pb-2 font-medium">Resolution target</th>
                  <th className="pb-2 font-medium">Tickets</th>
                  <th className="pb-2 font-medium">First response</th>
                  <th className="pb-2 font-medium">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {report.byPriority.map((r) => (
                  <tr key={r.key} className="border-t border-neutral-100">
                    <td className="py-2 text-neutral-700">{r.label}</td>
                    <td className="py-2 tabular-nums text-neutral-500">{formatMinutes(r.responseTargetMinutes)}</td>
                    <td className="py-2 tabular-nums text-neutral-500">{formatMinutes(r.resolutionTargetMinutes)}</td>
                    <td className="py-2 tabular-nums text-neutral-500">{r.resolution.total}</td>
                    <td className="py-2"><BucketBar bucket={r.firstResponse} /></td>
                    <td className="py-2"><BucketBar bucket={r.resolution} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <BreakdownTable title="By queendom" rows={report.byQueendom} />
            <BreakdownTable title="By agent" rows={report.byAssignee} />
          </div>
          <BreakdownTable title="By category" rows={report.byCategory} />
        </div>
      )}
    </div>
  );
}

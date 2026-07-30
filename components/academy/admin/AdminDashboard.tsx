"use client";

/**
 * Academy admin dashboard — KPI strip, leaderboard, and the trainee table.
 *
 * Every figure is derived from recorded academy activity (see
 * `lib/academy/analytics.ts`). Where the academy has no data source — profile
 * photos, employee IDs, batches, presence, streaks — nothing is rendered rather
 * than a placeholder, so a trainer never reads a fabricated number as fact.
 */

import { useEffect, useMemo, useState, type JSX } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Award,
  CheckCircle2,
  Clock,
  Download,
  Search,
  Ticket,
  Timer,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/academy/ProgressRing";
import { LiveRefresh } from "@/components/academy/admin/LiveRefresh";
import { leaderboardCsv, type TraineeAnalytics } from "@/lib/academy/analytics";
import { compareToAverage, formatDuration } from "@/lib/academy/timing";
import type { AcademyKpis } from "@/lib/academy/analytics";

const nf = new Intl.NumberFormat("en-IN");

/**
 * Relative time against a mount-time clock, not `Date.now()` at render.
 *
 * This component is server-rendered and then hydrated, so reading the clock
 * during render makes the server and the client disagree ("3h ago" vs "3h ago"
 * computed milliseconds apart, and worse across a minute boundary) — a genuine
 * hydration mismatch. `now` is null on the server pass and filled in on mount.
 */
function relative(iso: string | null, now: number | null): string {
  if (!iso) return "never";
  if (now === null) return "—";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "never";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

// ── KPI cards ────────────────────────────────────────────────────────────────

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  sub?: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-4">
      <div className="flex items-center gap-2 text-black/45">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
          {label}
        </span>
      </div>
      <p className="mt-2 font-serif text-[26px] leading-none text-black/85">{value}</p>
      {sub ? <p className="mt-1.5 text-[11.5px] text-black/45">{sub}</p> : null}
    </div>
  );
}

function TrendPill({ trend }: { trend: number | null }): JSX.Element | null {
  if (trend === null || trend === 0) return null;
  const up = trend > 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold",
        up ? "bg-success-light text-success" : "bg-danger-light text-danger",
      )}
      title="Mean of the last 3 scored requests vs everything before"
    >
      {up ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
      {Math.abs(trend)}
    </span>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

const MEDALS = ["🥇", "🥈", "🥉"];

function Leaderboard({ rows }: { rows: TraineeAnalytics[] }): JSX.Element {
  const top = rows.slice(0, 10);
  if (top.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-surface-border px-4 py-8 text-center text-[13px] text-black/45">
        No scored requests yet — the leaderboard fills as trainees complete tickets.
      </p>
    );
  }

  return (
    <ol className="space-y-1.5">
      {top.map((r) => (
        <li key={r.internId}>
          <Link
            href={`/academy/admin/${r.internId}`}
            className="flex items-center gap-3 rounded-xl border border-surface-border bg-white px-3.5 py-2.5 transition-colors hover:border-brand-gold/40"
          >
            <span className="w-7 shrink-0 text-center text-[15px] tabular-nums">
              {r.rank <= 3 ? MEDALS[r.rank - 1] : (
                <span className="text-[13px] font-semibold text-black/45">#{r.rank}</span>
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-medium text-black/85">{r.name}</span>
                <TrendPill trend={r.trend} />
              </span>
              <span className="mt-0.5 block text-[11.5px] text-black/45">
                {nf.format(r.requestsCompleted)} handled
                {r.aiScore !== null ? ` · AI ${r.aiScore}/5` : ""}
              </span>
            </span>

            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ring-1",
                r.tier.className,
              )}
            >
              {r.tier.label}
            </span>

            <span className="w-14 shrink-0 text-right font-serif text-[17px] tabular-nums text-black/85">
              {r.qualityPercent}%
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

// ── Trainee table ────────────────────────────────────────────────────────────

type SortKey =
  | "rank" | "name" | "quality" | "progress" | "completed" | "active"
  | "response" | "resolution";
type FilterKey = "all" | "active" | "completed" | "at_risk" | "awaiting";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active (7d)" },
  { key: "awaiting", label: "Ticket owed" },
  { key: "at_risk", label: "Needs support" },
  { key: "completed", label: "Finished" },
];

/**
 * A duration with its standing against the academy baseline. Faster than
 * average is green regardless of the absolute number — the comparison is what
 * tells a trainer whether to act.
 */
function TimingCell({
  value,
  average,
}: {
  value: number | null;
  average: number | null;
}): JSX.Element {
  const cmp = compareToAverage(value, average);
  return (
    <div>
      <span className="text-[12.5px] tabular-nums text-black/70">
        {formatDuration(value)}
      </span>
      {cmp ? (
        <span
          className={cn(
            "ml-1.5 text-[10.5px] font-semibold tabular-nums",
            cmp.faster ? "text-success" : "text-warning",
          )}
          title={`${formatDuration(cmp.deltaMinutes)} ${cmp.faster ? "faster" : "slower"} than the academy average`}
        >
          {cmp.faster ? "−" : "+"}
          {formatDuration(cmp.deltaMinutes)}
        </span>
      ) : null}
    </div>
  );
}

function TraineeTable({
  rows,
  kpis,
}: {
  rows: TraineeAnalytics[];
  kpis: AcademyKpis;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("rank");
  const [filter, setFilter] = useState<FilterKey>("all");

  // Read the clock once, after mount — see `relative` above.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const weekAgo = (now ?? 0) - 7 * 86_400_000;

    const filtered = rows.filter((r) => {
      if (filter === "active" && (!r.lastActiveAt || Date.parse(r.lastActiveAt) < weekAgo))
        return false;
      if (filter === "awaiting" && r.awaitingTicket === 0) return false;
      if (filter === "at_risk" && r.tier.key !== "at_risk" && r.tier.key !== "developing")
        return false;
      if (filter === "completed" && r.requestsCompleted < r.totalRequests) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.jobTitle ?? "").toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "name": return a.name.localeCompare(b.name);
        case "quality": return b.qualityPercent - a.qualityPercent;
        case "progress": return b.progressPercent - a.progressPercent;
        case "completed": return b.requestsCompleted - a.requestsCompleted;
        // Timing sorts ascend — fastest first — and park unmeasured trainees at
        // the end rather than letting a null read as instantaneous.
        case "response":
          return (
            (a.timing.avgResponseMinutes ?? Infinity) -
            (b.timing.avgResponseMinutes ?? Infinity)
          );
        case "resolution":
          return (
            (a.timing.avgResolutionMinutes ?? Infinity) -
            (b.timing.avgResolutionMinutes ?? Infinity)
          );
        case "active":
          return (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? "");
        default: return a.rank - b.rank;
      }
    });
    return sorted;
    // `now` is load-bearing: it arrives after mount, and without it here the
    // "Active (7d)" filter keeps comparing against a negative boundary and
    // reports every trainee as active.
  }, [rows, query, sort, filter, now]);

  function exportCsv() {
    const blob = new Blob([leaderboardCsv(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `academy-cohort-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-surface-border bg-white px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-black/35" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or job title"
            aria-label="Search trainees"
            className="w-full border-0 bg-transparent text-[13px] text-black/80 outline-none placeholder:text-black/35"
          />
        </div>

        <label className="sr-only" htmlFor="cohort-sort">Sort by</label>
        <select
          id="cohort-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-surface-border bg-white px-2.5 py-1.5 text-[12.5px] text-black/70 outline-none"
        >
          <option value="rank">Rank</option>
          <option value="quality">Quality</option>
          <option value="progress">Progress</option>
          <option value="completed">Requests handled</option>
          <option value="response">Response time</option>
          <option value="resolution">Resolution time</option>
          <option value="active">Last active</option>
          <option value="name">Name</option>
        </select>

        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-black/70 transition-colors hover:border-brand-gold/40 hover:text-brand-gold"
        >
          <Download className="size-3.5" aria-hidden />
          CSV
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              filter === f.key
                ? "bg-brand-gold text-surface"
                : "bg-surface-subtle text-black/55 hover:bg-surface-border",
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto self-center text-[11.5px] text-black/45">
          {nf.format(visible.length)} of {nf.format(rows.length)}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-surface-border bg-white">
        <table className="w-full min-w-[720px] text-left">
          <caption className="sr-only">Academy trainees ranked by quality of work</caption>
          <thead>
            <tr className="border-b border-surface-border text-[10.5px] uppercase tracking-[0.08em] text-black/45">
              <th scope="col" className="px-3 py-2.5 font-semibold">#</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Trainee</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Progress</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Quality</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">AI</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Response</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Resolution</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Handled</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Last active</th>
              <th scope="col" className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-[13px] text-black/45">
                  No trainees match that filter.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.internId} className="border-b border-surface-border/60 last:border-0">
                  <td className="px-3 py-2.5 text-[12.5px] tabular-nums text-black/45">{r.rank}</td>
                  <td className="px-3 py-2.5">
                    <p className="text-[13px] font-medium text-black/85">{r.name}</p>
                    <p className="text-[11px] text-black/45">{r.jobTitle ?? r.email}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-20"><ProgressBar percent={r.progressPercent} tone="gold" /></div>
                      <span className="text-[11.5px] tabular-nums text-black/55">
                        {r.progressPercent}%
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-black/40">
                      {nf.format(r.requestsCompleted)}/{nf.format(r.totalRequests)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold tabular-nums text-black/85">
                        {r.qualityPercent}%
                      </span>
                      <TrendPill trend={r.trend} />
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 inline-block rounded px-1 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] ring-1",
                        r.tier.className,
                      )}
                    >
                      {r.tier.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] tabular-nums text-black/70">
                    {r.aiScore !== null ? `${r.aiScore}/5` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <TimingCell
                      value={r.timing.avgResponseMinutes}
                      average={kpis.avgResponseMinutes}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <TimingCell
                      value={r.timing.avgResolutionMinutes}
                      average={kpis.avgResolutionMinutes}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] tabular-nums text-black/70">
                    {nf.format(r.requestsCompleted)}
                    {r.awaitingTicket > 0 ? (
                      <span className="ml-1 text-[10.5px] text-warning" title="Conversations closed with the ticket still owed">
                        +{r.awaitingTicket}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px] text-black/45">
                    {relative(r.lastActiveAt, now)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/academy/admin/${r.internId}`}
                      className="text-[12px] font-medium text-brand-gold hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page body ────────────────────────────────────────────────────────────────

export function AdminDashboard({
  kpis,
  trainees,
}: {
  kpis: AcademyKpis;
  trainees: TraineeAnalytics[];
}): JSX.Element {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <LiveRefresh />
      </div>

      {/*
       * Without this, a dashboard reading zero looks broken. It is not: every
       * metric that represents *reward* is gated on an accepted ticket, so a
       * cohort that has closed conversations but written no tickets legitimately
       * shows nothing earned. Saying so is the difference between "no data" and
       * "here is exactly what is missing".
       */}
      {kpis.totalRequestsCompleted === 0 && kpis.ticketsPending > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-light px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-warning">
              No requests have been completed yet — {nf.format(kpis.ticketsPending)}{" "}
              {kpis.ticketsPending === 1 ? "conversation is" : "conversations are"} waiting on a Freshdesk ticket
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-warning/85">
              Quality, progress and rankings are only awarded once a ticket is
              accepted. Response times and AI scores below are live and already
              reflect the work done.
            </p>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">Academy overview</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Kpi
            icon={<Users className="size-3.5" aria-hidden />}
            label="Trainees"
            value={nf.format(kpis.totalTrainees)}
            sub={`${nf.format(kpis.activeTrainees)} active this week · ${nf.format(kpis.activeToday)} today`}
          />
          <Kpi
            icon={<TrendingUp className="size-3.5" aria-hidden />}
            label="Avg quality"
            value={`${kpis.avgQualityPercent}%`}
            sub={`Avg progress ${kpis.avgProgressPercent}%`}
          />
          <Kpi
            icon={<Award className="size-3.5" aria-hidden />}
            label="Avg AI score"
            value={kpis.avgAiScore !== null ? `${kpis.avgAiScore}/5` : "—"}
            sub="Evaluator overall, across scored requests"
          />
          <Kpi
            icon={<CheckCircle2 className="size-3.5" aria-hidden />}
            label="Requests handled"
            value={nf.format(kpis.totalRequestsCompleted)}
            sub={`${nf.format(kpis.completedTraining)} finished the curriculum`}
          />
          <Kpi
            icon={<Ticket className="size-3.5" aria-hidden />}
            label="Tickets accepted"
            value={nf.format(kpis.ticketsAccepted)}
            sub={`${nf.format(kpis.ticketsPending)} still owed`}
          />
          <Kpi
            icon={<TrendingUp className="size-3.5" aria-hidden />}
            label="Response quality"
            value={`${kpis.avgResponseQuality}%`}
            sub={`Accuracy ${kpis.avgAccuracy}%`}
          />
          <Kpi
            icon={<Timer className="size-3.5" aria-hidden />}
            label="Avg response time"
            value={formatDuration(kpis.avgResponseMinutes)}
            sub={
              kpis.unansweredMessages > 0
                ? `${nf.format(kpis.unansweredMessages)} message${kpis.unansweredMessages === 1 ? "" : "s"} never answered`
                : "How long members wait for a reply"
            }
          />
          <Kpi
            icon={<Clock className="size-3.5" aria-hidden />}
            label="Avg resolution time"
            value={formatDuration(kpis.avgResolutionMinutes)}
            sub={
              kpis.fastestResolutionMinutes !== null
                ? `Fastest ${formatDuration(kpis.fastestResolutionMinutes)} · slowest ${formatDuration(kpis.slowestResolutionMinutes)}`
                : "Opening message to accepted ticket"
            }
          />
        </div>
      </section>

      <section aria-labelledby="leaderboard-heading">
        <h2
          id="leaderboard-heading"
          className="mb-3 font-serif text-[17px] text-black/85"
        >
          Leaderboard
        </h2>
        <p className="mb-3 text-[12px] text-black/45">
          Ranked on quality of work handled, not volume — volume only breaks ties.
        </p>
        <Leaderboard rows={trainees} />
      </section>

      <section aria-labelledby="cohort-heading">
        <h2 id="cohort-heading" className="mb-3 font-serif text-[17px] text-black/85">
          All trainees
        </h2>
        <TraineeTable rows={trainees} kpis={kpis} />
      </section>
    </div>
  );
}

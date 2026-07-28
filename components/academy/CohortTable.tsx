"use client";

/**
 * Academy — trainer cohort table.
 *
 * Renders one row per intern with their completed-session count, weighted
 * overall average, a column per rubric dimension, and a trend delta.
 *
 * Everything here is derived from the `rows` prop — the component never
 * fetches. Sorting and name filtering are local `useState`, no table library.
 *
 * Design rule for `components/academy/**`: zero hardcoded hex. Every colour is
 * an Atlas design token from `app/globals.css` (`brand-gold*`, `surface*`,
 * `taupe*`, `success`/`warning`/`danger`) or a neutral opacity utility.
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Gauge,
  Minus,
  MessagesSquare,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getInitials } from "@/lib/utils";
import { ACADEMY_DIMENSIONS } from "@/lib/academy/rubric";
import type { CohortInternRow } from "@/lib/academy/types";
import type { AcademyRubricDimension } from "@/lib/types/database";

// ── Formatters ─────────────────────────────────────────────────────────────
// Module scope + explicit locale so SSR and client render identical strings.

const scoreFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const deltaFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

const countFormatter = new Intl.NumberFormat("en-IN");

// ── Column model ───────────────────────────────────────────────────────────

type SortKey = "intern" | "sessions" | "overall" | "trend" | AcademyRubricDimension;
type SortDirection = "asc" | "desc";

interface SortState {
  key: SortKey;
  dir: SortDirection;
}

/**
 * Compact header labels for the six rubric dimensions. The full
 * `RubricDimensionDef.label` is exposed via the header `title` tooltip.
 */
const DIMENSION_SHORT_LABELS: Record<AcademyRubricDimension, string> = {
  comprehension: "Compr.",
  brand_tone: "Tone",
  factual_accuracy: "Accuracy",
  proactivity: "Proactivity",
  escalation_judgment: "Escalation",
  closure: "Closure",
};

/** A trend smaller than this reads as flat rather than up/down. */
const FLAT_TREND_EPSILON = 0.05;

/** Numeric value backing a sortable column. `null` always sorts last. */
function sortValue(row: CohortInternRow, key: SortKey): number | null {
  switch (key) {
    case "intern":
      return null; // handled separately (string compare)
    case "sessions":
      return row.sessionsCompleted;
    case "overall":
      return row.avgOverall;
    case "trend":
      return row.trend;
    default:
      return row.avgByDimension[key] ?? null;
  }
}

// ── Score banding ──────────────────────────────────────────────────────────

type ScoreBand = "low" | "warn" | "fair" | "high";

/** 1–5 rubric scale → band. danger ≤2, warning ≤3, neutral <4, success ≥4. */
function scoreBand(value: number): ScoreBand {
  if (value <= 2) return "low";
  if (value <= 3) return "warn";
  if (value < 4) return "fair";
  return "high";
}

const BAND_CLASSES: Record<ScoreBand, string> = {
  low: "bg-danger-light text-danger ring-danger/20",
  warn: "bg-warning-light text-warning ring-warning/20",
  fair: "bg-surface-subtle text-black/65 ring-surface-border",
  high: "bg-success-light text-success ring-success/25",
};

function ScoreCell({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="text-sm text-taupe" aria-label="No score yet">
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.9rem] items-center justify-center rounded-md px-2 py-1",
        "text-xs font-semibold tabular-nums ring-1 ring-inset",
        BAND_CLASSES[scoreBand(value)],
      )}
    >
      {scoreFormatter.format(value)}
    </span>
  );
}

function TrendCell({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-taupe">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Not enough data</span>
      </span>
    );
  }

  const flat = Math.abs(value) < FLAT_TREND_EPSILON;
  const Icon = flat ? Minus : value > 0 ? TrendingUp : TrendingDown;
  const tone = flat ? "text-taupe" : value > 0 ? "text-success" : "text-danger";

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums", tone)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {flat ? "Steady" : deltaFormatter.format(value)}
    </span>
  );
}

// ── Sortable header ────────────────────────────────────────────────────────

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "center";
  title?: string;
  className?: string;
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  title,
  className,
}: SortableHeaderProps) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-4 py-3", align === "center" ? "text-center" : "text-left", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={title ?? `Sort by ${label}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm text-[11px] font-semibold uppercase tracking-wider",
          "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/40",
          align === "center" && "justify-center",
          active ? "text-brand-gold-dark" : "text-taupe hover:text-brand-black",
        )}
      >
        <span>{label}</span>
        <Icon
          className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-40")}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}

// ── Summary tile ───────────────────────────────────────────────────────────

function SummaryTile({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3 shadow-card">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gold/10 text-brand-gold-dark">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-taupe">{label}</p>
        <p className="font-serif text-lg leading-tight text-brand-black tabular-nums">{value}</p>
        <p className="truncate text-[11px] text-taupe">{caption}</p>
      </div>
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────

export function CohortTable({ rows }: { rows: CohortInternRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "overall", dir: "desc" });

  /**
   * Cohort roll-up. The average is session-weighted so an intern with one
   * lucky session doesn't move the cohort number as much as one with twenty.
   */
  const summary = useMemo(() => {
    let totalSessions = 0;
    let weightedSum = 0;
    let weightTotal = 0;
    let scoredInterns = 0;

    for (const row of rows) {
      totalSessions += row.sessionsCompleted;
      if (row.avgOverall != null && Number.isFinite(row.avgOverall)) {
        const weight = row.sessionsCompleted > 0 ? row.sessionsCompleted : 1;
        weightedSum += row.avgOverall * weight;
        weightTotal += weight;
        scoredInterns += 1;
      }
    }

    return {
      totalSessions,
      scoredInterns,
      cohortAverage: weightTotal > 0 ? weightedSum / weightTotal : null,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.internName.toLowerCase().includes(needle));
  }, [rows, query]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const factor = sort.dir === "asc" ? 1 : -1;

    list.sort((a, b) => {
      if (sort.key === "intern") {
        return (
          factor * a.internName.localeCompare(b.internName, undefined, { sensitivity: "base" })
        );
      }

      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);

      // Nulls always sink to the bottom, whichever direction is active.
      if (av == null && bv == null) {
        return a.internName.localeCompare(b.internName, undefined, { sensitivity: "base" });
      }
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) {
        return a.internName.localeCompare(b.internName, undefined, { sensitivity: "base" });
      }
      return factor * (av - bv);
    });

    return list;
  }, [filtered, sort]);

  function handleSort(key: SortKey) {
    setSort((current) => {
      if (current.key === key) {
        return { key, dir: current.dir === "asc" ? "desc" : "asc" };
      }
      // Names read best A→Z; every numeric column is most useful high-first.
      return { key, dir: key === "intern" ? "asc" : "desc" };
    });
  }

  const totalColumns = 4 + ACADEMY_DIMENSIONS.length;
  const isEmpty = rows.length === 0;
  const noMatches = !isEmpty && sorted.length === 0;

  return (
    <div className="space-y-5">
      {/* Summary strip — derived from `rows`, never a per-row fetch. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={Users}
          label="Cohort"
          value={countFormatter.format(rows.length)}
          caption={rows.length === 1 ? "intern" : "interns"}
        />
        <SummaryTile
          icon={MessagesSquare}
          label="Sessions"
          value={countFormatter.format(summary.totalSessions)}
          caption={summary.totalSessions === 1 ? "completed" : "completed in total"}
        />
        <SummaryTile
          icon={Gauge}
          label="Cohort average"
          value={
            summary.cohortAverage == null ? "—" : `${scoreFormatter.format(summary.cohortAverage)} / 5`
          }
          caption={
            summary.cohortAverage == null
              ? "awaiting first evaluation"
              : `session-weighted, ${countFormatter.format(summary.scoredInterns)} scored`
          }
        />
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-xl border border-surface-border bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div>
            <h2 className="font-serif text-sm font-semibold text-brand-black">Intern performance</h2>
            <p className="mt-0.5 text-xs text-taupe">
              {countFormatter.format(sorted.length)} intern{sorted.length === 1 ? "" : "s"}
              {query.trim() ? ` matching “${query.trim()}”` : " shown"}
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-taupe"
              aria-hidden="true"
            />
            <Input
              size="sm"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by intern name"
              aria-label="Filter interns by name"
              className="pl-8 pr-8"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-taupe transition-colors hover:text-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/40"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Horizontal scroll so the six dimension columns never crush the layout. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface">
                <SortableHeader
                  label="Intern"
                  sortKey="intern"
                  sort={sort}
                  onSort={handleSort}
                  className="sticky left-0 z-20 w-[15rem] border-r border-surface-border bg-surface px-5"
                />
                <SortableHeader
                  label="Sessions"
                  sortKey="sessions"
                  sort={sort}
                  onSort={handleSort}
                  align="center"
                  title="Sort by completed sessions"
                />
                <SortableHeader
                  label="Overall"
                  sortKey="overall"
                  sort={sort}
                  onSort={handleSort}
                  align="center"
                  title="Sort by weighted overall average"
                />
                {ACADEMY_DIMENSIONS.map((dimension) => (
                  <SortableHeader
                    key={dimension.key}
                    label={DIMENSION_SHORT_LABELS[dimension.key]}
                    sortKey={dimension.key}
                    sort={sort}
                    onSort={handleSort}
                    align="center"
                    title={`Sort by ${dimension.label}`}
                  />
                ))}
                <SortableHeader
                  label="Trend"
                  sortKey="trend"
                  sort={sort}
                  onSort={handleSort}
                  title="Sort by trend — last 3 sessions vs. earlier ones"
                />
              </tr>
            </thead>

            <tbody>
              {isEmpty && (
                <tr>
                  <td colSpan={totalColumns} className="px-5 py-14 text-center">
                    <p className="font-serif text-base text-brand-black">
                      No completed sessions yet
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-xs text-taupe">
                      Cohort scores appear here once an intern closes a training session and the
                      evaluator returns a review.
                    </p>
                  </td>
                </tr>
              )}

              {noMatches && (
                <tr>
                  <td colSpan={totalColumns} className="px-5 py-12 text-center">
                    <p className="text-sm text-brand-black">
                      No intern matches “{query.trim()}”.
                    </p>
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="mt-2 text-xs font-medium text-brand-gold-dark underline underline-offset-2 transition-colors hover:text-brand-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/40"
                    >
                      Clear filter
                    </button>
                  </td>
                </tr>
              )}

              {sorted.map((row) => (
                <tr
                  key={row.internId}
                  className="group border-b border-surface-subtle transition-colors last:border-0 hover:bg-surface-subtle/60"
                >
                  {/* Intern — pinned so the name stays visible while scrolling. */}
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-surface-border bg-white px-5 py-3.5 text-left font-normal transition-colors group-hover:bg-surface-subtle"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gold/10 text-[11px] font-semibold text-brand-gold-dark">
                        {getInitials(row.internName) || "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-brand-black">
                          {row.internName}
                        </p>
                        <p className="text-xs text-taupe">
                          {row.avgOverall == null
                            ? "Not yet scored"
                            : `${scoreFormatter.format(row.avgOverall)} avg`}
                        </p>
                      </div>
                    </div>
                  </th>

                  {/* Sessions */}
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-sm font-medium tabular-nums text-brand-black">
                      {countFormatter.format(row.sessionsCompleted)}
                    </span>
                  </td>

                  {/* Overall */}
                  <td className="px-4 py-3.5 text-center">
                    <ScoreCell value={row.avgOverall} />
                  </td>

                  {/* One column per rubric dimension */}
                  {ACADEMY_DIMENSIONS.map((dimension) => (
                    <td key={dimension.key} className="px-4 py-3.5 text-center">
                      <ScoreCell value={row.avgByDimension[dimension.key]} />
                    </td>
                  ))}

                  {/* Trend */}
                  <td className="px-4 py-3.5">
                    <TrendCell value={row.trend} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!isEmpty && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-surface-border bg-surface px-5 py-2.5 text-[11px] text-taupe">
            <span>Scores are 1–5 per rubric dimension.</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
              ≤ 2 needs work
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
              ≤ 3 developing
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              ≥ 4 strong
            </span>
            <span className="ml-auto">Trend = last 3 sessions vs. earlier.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

export function CohortTableSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-surface-border bg-white">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-56 rounded-md" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-surface-subtle px-5 py-3.5 last:border-0"
          >
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
            {[0, 1, 2, 3, 4, 5, 6].map((c) => (
              <Skeleton key={c} className="h-6 w-11 shrink-0 rounded-md" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

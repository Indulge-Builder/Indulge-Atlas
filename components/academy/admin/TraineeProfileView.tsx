"use client";

/**
 * Individual trainee analysis.
 *
 * The point of this page is not the scores — those are on the dashboard. It is
 * WHY the scores are what they are: which metrics stand out against the
 * trainee's own average, what the evaluator keeps flagging across sessions, and
 * what to do about it.
 *
 * The recurring-themes panels aggregate the evaluator's existing per-review
 * `strengths` / `misses`. That is real feedback the model already wrote at
 * scoring time, grouped — not a fresh model call, and not invented.
 */

import { useState, type JSX } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Lightbulb,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressBar, ProgressRing } from "@/components/academy/ProgressRing";
import { PROGRESS_METRICS } from "@/lib/academy/progressScore";
import { toCsv } from "@/lib/academy/analytics";
import { compareToAverage, formatDuration } from "@/lib/academy/timing";
import type { TraineeProfile } from "@/lib/actions/academy-analytics";

const nf = new Intl.NumberFormat("en-IN");

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-xl border border-surface-border bg-white p-4">
      <h2 className="font-serif text-[15px] text-black/85">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-[11.5px] text-black/45">{subtitle}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function NoteList({
  notes,
  tone,
}: {
  notes: { text: string; count: number }[];
  tone: "good" | "bad";
}): JSX.Element {
  if (notes.length === 0) {
    return (
      <p className="text-[12.5px] text-black/45">
        Nothing recurring yet — themes appear once several requests are scored.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li key={n.text} className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ring-1",
              tone === "good"
                ? "bg-success-light text-success ring-success/20"
                : "bg-warning-light text-warning ring-warning/20",
            )}
          >
            ×{n.count}
          </span>
          <span className="text-[12.5px] leading-relaxed text-black/75">{n.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** One timing figure with its standing against the academy baseline. */
function TimingStat({
  label,
  value,
  average,
  hint,
}: {
  label: string;
  value: number | null;
  average?: number | null;
  hint?: string;
}): JSX.Element {
  const cmp = average !== undefined ? compareToAverage(value, average) : null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-black/45">
        {label}
      </p>
      <p className="mt-0.5 font-serif text-[20px] text-black/85">
        {formatDuration(value)}
      </p>
      {cmp ? (
        <p
          className={cn(
            "mt-0.5 text-[11px] font-medium",
            cmp.faster ? "text-success" : "text-warning",
          )}
        >
          {formatDuration(cmp.deltaMinutes)} {cmp.faster ? "faster" : "slower"} than average
        </p>
      ) : hint ? (
        <p className="mt-0.5 text-[11px] text-black/40">{hint}</p>
      ) : null}
    </div>
  );
}

export function TraineeProfileView({
  profile,
  academyAvgResponseMinutes,
  academyAvgResolutionMinutes,
}: {
  profile: TraineeProfile;
  academyAvgResponseMinutes: number | null;
  academyAvgResolutionMinutes: number | null;
}): JSX.Element {
  const { trainee: t, timeline, timelineTrend: tt, strengths, weaknesses, coaching } = profile;
  const [showAllTasks, setShowAllTasks] = useState(false);

  const tasks = showAllTasks ? profile.tasks : profile.tasks.slice(0, 10);
  const peak = Math.max(100, ...timeline.map((p) => p.percent));

  function exportCsv() {
    const csv = toCsv(
      ["Task", "Client", "Ended", "Minutes", "Score %", "AI (1-5)", "Ticket quality", "Status"],
      profile.tasks.map((r) => [
        r.taskTitle, r.clientName, r.endedAt ?? "", r.minutes ?? "",
        r.scorePercent ?? "", r.aiScore ?? "", r.ticketQuality ?? "", r.status,
      ]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `academy-${t.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Link
        href="/academy/admin"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-black/45 transition-colors hover:text-brand-gold"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to dashboard
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="rounded-xl border border-surface-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-[24px] leading-tight text-black/85">{t.name}</h1>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ring-1",
                  t.tier.className,
                )}
              >
                {t.tier.label}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-black/45">
              {[t.jobTitle, t.email].filter(Boolean).join(" · ")}
            </p>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-surface-border px-2.5 py-1.5 text-[12.5px] font-medium text-black/70 transition-colors hover:border-brand-gold/40 hover:text-brand-gold"
          >
            <Download className="size-3.5" aria-hidden />
            Export tasks
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Overall rank", value: `#${t.rank}` },
            { label: "Quality", value: `${t.qualityPercent}%` },
            { label: "AI score", value: t.aiScore !== null ? `${t.aiScore}/5` : "—" },
            {
              label: "Avg resolution",
              value: formatDuration(t.timing.avgResolutionMinutes),
            },
          ].map((s) => (
            <div key={s.label}>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-black/45">
                {s.label}
              </dt>
              <dd className="mt-0.5 font-serif text-[20px] text-black/85">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-[11.5px] font-medium text-black/70">Academy progress</span>
            <span className="text-[11.5px] tabular-nums text-black/45">
              {nf.format(t.requestsCompleted)}/{nf.format(t.totalRequests)} requests · {t.progressPercent}%
              {t.awaitingTicket > 0 ? ` · ${t.awaitingTicket} ticket${t.awaitingTicket === 1 ? "" : "s"} owed` : ""}
            </span>
          </div>
          <ProgressBar percent={t.progressPercent} tone="gold" />
        </div>
      </header>

      {/* ── Metric rings ───────────────────────────────────────────────────── */}
      <Panel
        title="Performance breakdown"
        subtitle="All eleven weighted metrics behind the academy score."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {PROGRESS_METRICS.map((m) => (
            <div key={m.key} className="flex flex-col items-center gap-1.5 text-center">
              <ProgressRing percent={t.breakdown[m.key] ?? 0} size={56} tone="gold" />
              <span className="text-[11px] leading-tight text-black/60">{m.label}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Efficiency ─────────────────────────────────────────────────────── */}
      <Panel
        title="Efficiency"
        subtitle="Response time is how long members waited for a reply; resolution runs from the opening message to the accepted ticket."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <TimingStat
            label="Avg response"
            value={t.timing.avgResponseMinutes}
            average={academyAvgResponseMinutes}
          />
          <TimingStat
            label="Median response"
            value={t.timing.medianResponseMinutes}
            hint="Unmoved by one long gap"
          />
          <TimingStat
            label="Avg resolution"
            value={t.timing.avgResolutionMinutes}
            average={academyAvgResolutionMinutes}
          />
          <TimingStat
            label="Fastest resolution"
            value={t.timing.fastestResolutionMinutes}
            hint={`across ${nf.format(t.timing.resolvedCount)} resolved`}
          />
          <TimingStat
            label="Slowest resolution"
            value={t.timing.slowestResolutionMinutes}
          />
        </div>

        {t.timing.unanswered > 0 ? (
          <p className="mt-4 rounded-lg border border-warning/25 bg-warning-light px-3 py-2 text-[12px] text-warning">
            {nf.format(t.timing.unanswered)} client message
            {t.timing.unanswered === 1 ? " was" : "s were"} never answered. These are
            excluded from the averages above — an unbounded wait cannot be averaged
            honestly, so it is reported rather than folded in.
          </p>
        ) : null}
      </Panel>

      {/* ── Timeline ───────────────────────────────────────────────────────── */}
      <Panel
        title="Progress over time"
        subtitle={
          tt === null
            ? "Two or more active weeks are needed before a direction can be read."
            : tt >= 0
              ? `Improving — up ${tt} points since the first active week.`
              : `Declining — down ${Math.abs(tt)} points since the first active week.`
        }
      >
        {timeline.length === 0 ? (
          <p className="text-[12.5px] text-black/45">No completed requests yet.</p>
        ) : (
          <div className="flex items-end gap-2 overflow-x-auto pb-1">
            {timeline.map((p) => (
              <div key={p.weekStart} className="flex min-w-[52px] flex-1 flex-col items-center gap-1.5">
                <span className="text-[11px] font-semibold tabular-nums text-black/70">
                  {p.percent}%
                </span>
                <div
                  className="w-full rounded-t bg-brand-gold/80"
                  style={{ height: `${Math.max(4, (p.percent / peak) * 110)}px` }}
                  role="img"
                  aria-label={`${p.label}: ${p.percent} percent across ${p.completed} requests`}
                />
                <span className="text-[10.5px] text-black/45">{p.label}</span>
                <span className="text-[10px] text-black/35">{p.completed} req</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Strengths / weaknesses ─────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Strengths"
          subtitle="Metrics standing clear of this trainee's own average."
        >
          {strengths.length === 0 ? (
            <p className="text-[12.5px] text-black/45">
              Performance is even across metrics — nothing stands out either way.
            </p>
          ) : (
            <ul className="space-y-2">
              {strengths.map((s) => (
                <li key={s.key} className="flex items-center gap-2.5">
                  <ThumbsUp className="size-3.5 shrink-0 text-success" aria-hidden />
                  <span className="flex-1 text-[12.5px] text-black/75">{s.label}</span>
                  <span className="text-[12.5px] font-semibold tabular-nums text-success">
                    {s.percent}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Needs improvement"
          subtitle="Measured against their own average, not a fixed bar."
        >
          {weaknesses.length === 0 ? (
            <p className="text-[12.5px] text-black/45">No metric is lagging the rest.</p>
          ) : (
            <ul className="space-y-2">
              {weaknesses.map((s) => (
                <li key={s.key} className="flex items-center gap-2.5">
                  <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden />
                  <span className="flex-1 text-[12.5px] text-black/75">{s.label}</span>
                  <span className="text-[12.5px] font-semibold tabular-nums text-warning">
                    {s.percent}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Recurring evaluator themes ─────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="What keeps going well"
          subtitle="Recurring strengths across every scored review."
        >
          <NoteList notes={profile.recurringStrengths} tone="good" />
        </Panel>
        <Panel
          title="Recurring mistakes"
          subtitle="The same miss flagged across multiple requests — coach these first."
        >
          <NoteList notes={profile.recurringMisses} tone="bad" />
        </Panel>
      </div>

      {/* ── Coaching ───────────────────────────────────────────────────────── */}
      {coaching.length > 0 ? (
        <Panel title="Coaching plan" subtitle="Derived from the weakest metrics above.">
          <ul className="space-y-2">
            {coaching.map((c) => (
              <li key={c} className="flex items-start gap-2.5">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-brand-gold" aria-hidden />
                <span className="text-[12.5px] leading-relaxed text-black/75">{c}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* ── Task history ───────────────────────────────────────────────────── */}
      <Panel title="Task history" subtitle={`${nf.format(profile.tasks.length)} sessions`}>
        {profile.tasks.length === 0 ? (
          <p className="text-[12.5px] text-black/45">No sessions yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-surface-border text-[10.5px] uppercase tracking-[0.08em] text-black/45">
                    <th scope="col" className="py-2 pr-3 font-semibold">Request</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Client</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Closed</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Time</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Score</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Ticket</th>
                    <th scope="col" className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((r) => (
                    <tr key={r.sessionId} className="border-b border-surface-border/60 last:border-0">
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/academy/session/${r.sessionId}`}
                          className="text-[12.5px] font-medium text-black/85 hover:text-brand-gold hover:underline"
                        >
                          {r.taskTitle}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-[12px] text-black/55">{r.clientName}</td>
                      <td className="py-2.5 pr-3 text-[12px] text-black/55">{fmtDate(r.endedAt)}</td>
                      <td className="py-2.5 pr-3 text-[12px] tabular-nums text-black/55">
                        {r.minutes !== null ? `${r.minutes}m` : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-[12px] tabular-nums text-black/70">
                        {r.aiScore !== null ? `${r.aiScore}/5` : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-[12px] tabular-nums text-black/70">
                        {r.ticketQuality !== null ? `${r.ticketQuality}/5` : "—"}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ring-1",
                            r.status === "completed"
                              ? "bg-success-light text-success ring-success/20"
                              : r.status === "awaiting_ticket"
                                ? "bg-warning-light text-warning ring-warning/20"
                                : "bg-surface-subtle text-black/55 ring-black/10",
                          )}
                        >
                          {r.status === "awaiting_ticket" ? "Ticket owed" : r.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {profile.tasks.length > 10 ? (
              <button
                type="button"
                onClick={() => setShowAllTasks((v) => !v)}
                className="mt-3 text-[12px] font-medium text-brand-gold hover:underline"
              >
                {showAllTasks ? "Show fewer" : `Show all ${nf.format(profile.tasks.length)}`}
              </button>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  );
}

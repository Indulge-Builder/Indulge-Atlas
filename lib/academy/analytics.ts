/**
 * Academy analytics — the derivation layer behind the admin dashboard.
 *
 * Every number here comes from something the academy actually recorded: closed
 * sessions, evaluator reviews (six rubric dimensions plus free-text
 * strengths/misses), Freshdesk ticket verdicts (five more dimensions), and the
 * eleven-metric progress model. Nothing is invented — if the data does not
 * support a figure, the figure is not offered.
 *
 * DELIBERATELY ABSENT (no data source exists yet, so no placeholder is shown):
 *   photos, employee IDs, batches, online/offline presence, streaks, badges,
 *   week-over-week rank history. Adding any of these means adding a real source
 *   first — see docs, not this module.
 *
 * Pure module — no I/O, fully deterministic, safe on client and server.
 */

import { PROGRESS_METRICS, type MetricBreakdown, type ProgressMetric } from "@/lib/academy/progressScore";
import type { TimingSummary } from "@/lib/academy/timing";

// ── Performance tiers ────────────────────────────────────────────────────────

export type PerformanceTier =
  | "elite"
  | "outstanding"
  | "excellent"
  | "proficient"
  | "developing"
  | "at_risk";

export interface TierDef {
  key: PerformanceTier;
  label: string;
  /** Inclusive lower bound on the 0–100 academy quality score. */
  min: number;
  className: string;
}

/**
 * Banded on QUALITY (how well work was handled), not progress. A trainee three
 * tasks in can be Elite; a trainee who has ground through forty sloppily is not.
 */
export const PERFORMANCE_TIERS: TierDef[] = [
  { key: "elite", label: "Elite Performer", min: 90, className: "bg-success-light text-success ring-success/20" },
  { key: "outstanding", label: "Outstanding", min: 80, className: "bg-success-light text-success ring-success/20" },
  { key: "excellent", label: "Excellent", min: 70, className: "bg-info-light text-info ring-info/20" },
  { key: "proficient", label: "Proficient", min: 55, className: "bg-info-light text-info ring-info/20" },
  { key: "developing", label: "Developing", min: 40, className: "bg-warning-light text-warning ring-warning/20" },
  { key: "at_risk", label: "Needs support", min: 0, className: "bg-danger-light text-danger ring-danger/20" },
];

export function tierFor(qualityPercent: number): TierDef {
  return (
    PERFORMANCE_TIERS.find((t) => qualityPercent >= t.min) ??
    PERFORMANCE_TIERS[PERFORMANCE_TIERS.length - 1]
  );
}

// ── Row model ────────────────────────────────────────────────────────────────

/** One trainee, fully derived. `rank` is assigned by `rankTrainees`. */
export interface TraineeAnalytics {
  internId: string;
  name: string;
  email: string;
  jobTitle: string | null;
  /** Performance-weighted progress across the whole curriculum, 0–100. */
  progressPercent: number;
  /** Mean quality of work actually handled, 0–100 — the ranking key. */
  qualityPercent: number;
  /** Evaluator overall, 1–5, averaged. Null before anything is scored. */
  aiScore: number | null;
  requestsCompleted: number;
  /** Closed and scored but the ticket is not accepted yet. */
  awaitingTicket: number;
  totalRequests: number;
  /** Per-metric averages, 0–100. */
  breakdown: Record<ProgressMetric, number>;
  /** Mean minutes per handled request. Null when unmeasurable. */
  avgMinutes: number | null;
  /** Response and resolution timing across every handled request. */
  timing: TimingSummary;
  /** Last time this trainee did anything at all. */
  lastActiveAt: string | null;
  /** Mean of the last 3 scored requests minus the prior ones, in points. */
  trend: number | null;
  rank: number;
  tier: TierDef;
}

/**
 * Rank by quality, then by volume as the tie-break.
 *
 * Quality first is the whole point: the spec asked for "overall performance
 * instead of just task completion". Volume only separates trainees who are
 * genuinely performing at the same standard.
 *
 * Ties share a rank (1,2,2,4) — competition ranking, so two equal trainees are
 * not arbitrarily ordered by whichever the database returned first.
 */
export function rankTrainees(
  rows: Omit<TraineeAnalytics, "rank" | "tier">[],
): TraineeAnalytics[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.qualityPercent !== a.qualityPercent) return b.qualityPercent - a.qualityPercent;
    if (b.requestsCompleted !== a.requestsCompleted) return b.requestsCompleted - a.requestsCompleted;
    return a.name.localeCompare(b.name);
  });

  let lastKey = "";
  let lastRank = 0;
  return sorted.map((row, i) => {
    const key = `${row.qualityPercent}|${row.requestsCompleted}`;
    const rank = key === lastKey ? lastRank : i + 1;
    lastKey = key;
    lastRank = rank;
    return { ...row, rank, tier: tierFor(row.qualityPercent) };
  });
}

// ── Academy-wide KPIs ────────────────────────────────────────────────────────

export interface AcademyKpis {
  totalTrainees: number;
  /** Did something in the last 7 days. */
  activeTrainees: number;
  /** Active today (IST day boundary applied by the caller). */
  activeToday: number;
  /** Finished every request in the curriculum. */
  completedTraining: number;
  avgProgressPercent: number;
  avgQualityPercent: number;
  avgAiScore: number | null;
  avgResponseQuality: number;
  avgAccuracy: number;
  avgMinutesPerRequest: number | null;
  totalRequestsCompleted: number;
  ticketsAccepted: number;
  ticketsPending: number;
  /** Academy-wide mean reply wait — the baseline every trainee is compared to. */
  avgResponseMinutes: number | null;
  /** Academy-wide mean start-to-resolved time. */
  avgResolutionMinutes: number | null;
  fastestResolutionMinutes: number | null;
  slowestResolutionMinutes: number | null;
  /** Client messages left with no reply, across the whole academy. */
  unansweredMessages: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function computeKpis(
  rows: TraineeAnalytics[],
  opts: { activeSince: number; todaySince: number; ticketsAccepted: number; ticketsPending: number },
): AcademyKpis {
  const activeAt = (r: TraineeAnalytics) =>
    r.lastActiveAt ? Date.parse(r.lastActiveAt) : NaN;

  const aiScores = rows.map((r) => r.aiScore).filter((v): v is number => v !== null);
  const minutes = rows.map((r) => r.avgMinutes).filter((v): v is number => v !== null);

  const nn = (vs: (number | null)[]) => vs.filter((v): v is number => v !== null);
  const responses = nn(rows.map((r) => r.timing.avgResponseMinutes));
  const resolutions = nn(rows.map((r) => r.timing.avgResolutionMinutes));
  const fastest = nn(rows.map((r) => r.timing.fastestResolutionMinutes));
  const slowest = nn(rows.map((r) => r.timing.slowestResolutionMinutes));

  return {
    // Mean of per-trainee means, not of all sessions: the academy baseline
    // should describe the typical trainee, not be dominated by whoever handled
    // the most requests.
    avgResponseMinutes: responses.length ? round(mean(responses), 1) : null,
    avgResolutionMinutes: resolutions.length ? round(mean(resolutions), 1) : null,
    fastestResolutionMinutes: fastest.length ? round(Math.min(...fastest), 1) : null,
    slowestResolutionMinutes: slowest.length ? round(Math.max(...slowest), 1) : null,
    unansweredMessages: rows.reduce((n, r) => n + r.timing.unanswered, 0),
    totalTrainees: rows.length,
    activeTrainees: rows.filter((r) => activeAt(r) >= opts.activeSince).length,
    activeToday: rows.filter((r) => activeAt(r) >= opts.todaySince).length,
    completedTraining: rows.filter(
      (r) => r.totalRequests > 0 && r.requestsCompleted >= r.totalRequests,
    ).length,
    avgProgressPercent: round(mean(rows.map((r) => r.progressPercent))),
    avgQualityPercent: round(mean(rows.map((r) => r.qualityPercent))),
    avgAiScore: aiScores.length ? round(mean(aiScores), 1) : null,
    avgResponseQuality: round(mean(rows.map((r) => r.breakdown.response_quality ?? 0))),
    avgAccuracy: round(mean(rows.map((r) => r.breakdown.information_accuracy ?? 0))),
    avgMinutesPerRequest: minutes.length ? round(mean(minutes)) : null,
    totalRequestsCompleted: rows.reduce((s, r) => s + r.requestsCompleted, 0),
    ticketsAccepted: opts.ticketsAccepted,
    ticketsPending: opts.ticketsPending,
  };
}

// ── Strengths and mistakes ───────────────────────────────────────────────────

/**
 * The evaluator already writes three `strengths` and three `misses` per review
 * as free text. Aggregating them is what turns a pile of one-off notes into
 * "this keeps happening" — which is the coaching signal a trainer actually acts
 * on, and it needs no extra model call.
 */
export interface RecurringNote {
  /** The canonical phrasing — the longest variant seen, which reads best. */
  text: string;
  count: number;
}

/** Words too common to distinguish one note from another. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with",
  "was", "were", "is", "are", "be", "been", "did", "not", "no", "it", "its",
  "this", "that", "their", "them", "they", "you", "your", "concierge", "client",
  "member", "had", "has", "have", "would", "could", "should", "more", "very",
]);

/**
 * Crude suffix stripper.
 *
 * The evaluator writes the same criticism in whatever tense the sentence wants
 * — "missed the warranty", "missing warranty details", "misses warranty info".
 * Without this they fingerprint apart and the recurring-themes panel reports
 * three separate one-off notes instead of one pattern seen three times, which
 * is precisely the signal it exists to surface.
 *
 * Not a real stemmer, and it does not need to be: over-merging two adjacent
 * ideas is a far better failure here than splitting one idea into three.
 */
function stem(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Fingerprint a note so near-duplicates collapse.
 *
 * Deliberately crude — lowercase, strip punctuation, drop stop words, stem what
 * remains, keep the three most distinctive words sorted. "Missed the warranty
 * details" and "The warranty details are missing" both reduce to
 * `detail|miss|warranty`.
 */
export function noteFingerprint(note: string): string {
  const words = note
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map(stem);
  if (words.length === 0) return note.trim().toLowerCase();
  return [...new Set(words)].sort().slice(0, 3).join("|");
}

/** Collapse free-text notes into recurring themes, most frequent first. */
export function recurringNotes(notes: string[], limit = 6): RecurringNote[] {
  const groups = new Map<string, { texts: string[]; count: number }>();
  for (const raw of notes) {
    const note = raw.trim();
    if (!note) continue;
    const key = noteFingerprint(note);
    const g = groups.get(key) ?? { texts: [], count: 0 };
    g.texts.push(note);
    g.count += 1;
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => ({
      // Longest variant: the fullest phrasing of the same idea.
      text: g.texts.reduce((a, b) => (b.length > a.length ? b : a)),
      count: g.count,
    }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, limit);
}

// ── Strength / weakness split ────────────────────────────────────────────────

export interface MetricStanding {
  key: ProgressMetric;
  label: string;
  percent: number;
}

/**
 * Split the eleven metrics into what this trainee does well and what needs
 * work, measured against their OWN average rather than a fixed cut-off.
 *
 * A fixed threshold mislabels everyone: a strong trainee shows no weaknesses
 * and a struggling one shows no strengths, which is useless for coaching. The
 * question worth answering is "relative to how you generally perform, what
 * stands out?".
 */
export function splitStrengths(
  breakdown: Record<ProgressMetric, number>,
  spread = 5,
): { strengths: MetricStanding[]; weaknesses: MetricStanding[] } {
  const all: MetricStanding[] = PROGRESS_METRICS.map((m) => ({
    key: m.key,
    label: m.label,
    percent: breakdown[m.key] ?? 0,
  }));
  const avg = mean(all.map((m) => m.percent));

  return {
    strengths: all
      .filter((m) => m.percent >= avg + spread)
      .sort((a, b) => b.percent - a.percent),
    weaknesses: all
      .filter((m) => m.percent <= avg - spread)
      .sort((a, b) => a.percent - b.percent),
  };
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelinePoint {
  /** ISO date of the bucket start. */
  weekStart: string;
  label: string;
  /** Mean request score in that week, 0–100. */
  percent: number;
  completed: number;
}

/** Monday 00:00 UTC of the week containing `ms`. */
function weekStartMs(ms: number): number {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/**
 * Bucket scored requests into weeks so a trainer can see improvement or decline
 * at a glance. Weeks with no activity are omitted rather than drawn as zero — a
 * quiet week is not a week of failure, and plotting it as one would misread.
 */
export function buildTimeline(
  points: { at: string; scorePercent: number }[],
): TimelinePoint[] {
  const buckets = new Map<number, number[]>();
  for (const p of points) {
    const ms = Date.parse(p.at);
    if (!Number.isFinite(ms)) continue;
    const k = weekStartMs(ms);
    const arr = buckets.get(k) ?? [];
    arr.push(p.scorePercent);
    buckets.set(k, arr);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, scores], i) => ({
      weekStart: new Date(k).toISOString(),
      label: `Week ${i + 1}`,
      percent: round(mean(scores)),
      completed: scores.length,
    }));
}

/** Direction of travel across the timeline, in points. Null if too few weeks. */
export function timelineTrend(points: TimelinePoint[]): number | null {
  if (points.length < 2) return null;
  return round(points[points.length - 1].percent - points[0].percent);
}

// ── Coaching ─────────────────────────────────────────────────────────────────

/**
 * Turn the weakest metrics into concrete next actions.
 *
 * Written in code, not generated: it must be instant, it must never contradict
 * the scores it is derived from, and a model call per profile view would be
 * both slow and expensive. The evaluator's own free-text `misses` carry the
 * task-specific nuance — this supplies the standing advice per weak metric.
 */
const COACHING: Partial<Record<ProgressMetric, string>> = {
  task_completion: "Finish what you open — a conversation without an accepted ticket earns nothing.",
  response_quality: "Tighten structure: lead with the answer, then the detail, then the next step.",
  information_accuracy: "Verify before you assert. Say what is confirmed and what is still being arranged.",
  documentation_quality: "Write the ticket as if someone else has to take it over cold tomorrow.",
  time_efficiency: "Reply sooner with less. A fast partial answer beats a slow perfect one.",
  ai_evaluation: "Re-read your strongest scored transcript and copy its shape.",
  first_attempt: "Slow down on the first pass — retries cost more than the time they save.",
  critical_thinking: "Probe before proposing. The constraint you did not ask about is the one that bites.",
  communication: "Warm, specific, brand-appropriate — read it back as if you were the member.",
  research_quality: "Go one source deeper than feels necessary and cite what you checked.",
  consistency: "Aim for a repeatable standard rather than occasional brilliance.",
};

export function coachingFor(weaknesses: MetricStanding[], limit = 5): string[] {
  return weaknesses
    .map((w) => COACHING[w.key])
    .filter((s): s is string => !!s)
    .slice(0, limit);
}

// ── CSV export ───────────────────────────────────────────────────────────────

/** RFC-4180 escaping: quote when the value contains a comma, quote or newline. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** The leaderboard as a spreadsheet-ready CSV. */
export function leaderboardCsv(rows: TraineeAnalytics[]): string {
  const metricCols = PROGRESS_METRICS.map((m) => m.label);
  return toCsv(
    [
      "Rank", "Name", "Email", "Tier", "Quality %", "Progress %",
      "AI score (1-5)", "Requests completed", "Awaiting ticket",
      "Avg response (min)", "Median response (min)", "Avg resolution (min)",
      "Fastest resolution (min)", "Slowest resolution (min)", "Unanswered messages",
      "Trend", "Last active",
      ...metricCols,
    ],
    rows.map((r) => [
      r.rank, r.name, r.email, r.tier.label, r.qualityPercent, r.progressPercent,
      r.aiScore ?? "", r.requestsCompleted, r.awaitingTicket,
      r.timing.avgResponseMinutes ?? "", r.timing.medianResponseMinutes ?? "",
      r.timing.avgResolutionMinutes ?? "", r.timing.fastestResolutionMinutes ?? "",
      r.timing.slowestResolutionMinutes ?? "", r.timing.unanswered,
      r.trend ?? "", r.lastActiveAt ?? "",
      ...PROGRESS_METRICS.map((m) => r.breakdown[m.key] ?? 0),
    ]),
  );
}

export type { MetricBreakdown };

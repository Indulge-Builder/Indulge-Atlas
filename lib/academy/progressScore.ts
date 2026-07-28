/**
 * Performance-weighted academy progress.
 *
 * Progress is NOT "tasks finished ÷ tasks total". Every completed request earns
 * a slice of the bar proportional to how well it was handled, so two interns who
 * finish the same client can sit at different percentages. Rushing a request
 * still moves the bar — just less far.
 *
 *   requestScore  = Σ (metric × weight)                 → 0..1 for one request
 *   academyScore  = Σ requestScores ÷ totalRequests     → 0..1 across the academy
 *
 * The second line is what stops the bar reading 100% after one good drill: an
 * unattempted request contributes zero, exactly like a failed one, so the bar
 * measures ground covered *and* quality of coverage.
 *
 * ── PROVENANCE (be honest about this) ────────────────────────────────────────
 * The evaluator scores six rubric dimensions. Ten metrics are required. Four are
 * measured directly from session telemetry; six are read off rubric dimensions,
 * some of which are shared between metrics. Every mapping is declared in
 * METRIC_SOURCE below so nothing here looks more precisely instrumented than it
 * is. Extending the evaluator to emit all ten natively is a clean follow-up: only
 * `scoreRequest` would change, and only where marked `rubric`.
 *
 * Pure module — no I/O, fully deterministic, safe on client and server.
 */

import type { AcademyRubricScores } from "@/lib/types/database";

export type ProgressMetric =
  | "task_completion"
  | "response_quality"
  | "information_accuracy"
  | "time_efficiency"
  | "ai_evaluation"
  | "first_attempt"
  | "critical_thinking"
  | "communication"
  | "research_quality"
  | "consistency";

export interface MetricDef {
  key: ProgressMetric;
  label: string;
  /** Fraction of the total, summing to exactly 1. */
  weight: number;
  /** One line for the breakdown tooltip. */
  description: string;
  /** Where the number actually comes from. */
  source: "telemetry" | "rubric" | "history";
}

export const PROGRESS_METRICS: MetricDef[] = [
  {
    key: "task_completion",
    label: "Task completion",
    weight: 0.2,
    description: "Conversation closed with a real exchange and a scored outcome.",
    source: "telemetry",
  },
  {
    key: "response_quality",
    label: "Response quality",
    weight: 0.2,
    description: "Clarity, structure and professional tone across your replies.",
    source: "rubric",
  },
  {
    key: "information_accuracy",
    label: "Accuracy & completeness",
    weight: 0.15,
    description: "Nothing invented, nothing important left out.",
    source: "rubric",
  },
  {
    key: "time_efficiency",
    label: "Time efficiency",
    weight: 0.15,
    description: "Handled briskly — but only counts when quality holds up.",
    source: "telemetry",
  },
  {
    key: "ai_evaluation",
    label: "Overall AI assessment",
    weight: 0.1,
    description: "The evaluator's overall read of how you handled it.",
    source: "rubric",
  },
  {
    key: "first_attempt",
    label: "First-attempt success",
    weight: 0.05,
    description: "Cleared without needing a retry.",
    source: "telemetry",
  },
  {
    key: "critical_thinking",
    label: "Critical thinking",
    weight: 0.05,
    description: "Probing, judgement and handling the awkward turns.",
    source: "rubric",
  },
  {
    key: "communication",
    label: "Communication",
    weight: 0.05,
    description: "Client-ready language and a warm, professional register.",
    source: "rubric",
  },
  {
    key: "research_quality",
    label: "Research quality",
    weight: 0.03,
    description: "Depth behind the answer — verified, not guessed.",
    source: "rubric",
  },
  {
    key: "consistency",
    label: "Consistency",
    weight: 0.02,
    description: "Holding a standard across requests, not just on a good day.",
    source: "history",
  },
];

/** Declares which rubric dimension(s) stand in for each metric. */
export const METRIC_SOURCE: Partial<Record<ProgressMetric, string[]>> = {
  response_quality: ["brand_tone", "closure"],
  information_accuracy: ["factual_accuracy", "comprehension"],
  ai_evaluation: ["overall"],
  critical_thinking: ["comprehension", "escalation_judgment"],
  communication: ["brand_tone"],
  research_quality: ["proactivity"],
};

/** Baseline minutes a request should take, before difficulty scaling. */
const EXPECTED_MINUTES: Record<string, number> = {
  easy: 8,
  medium: 12,
  hard: 16,
  advanced: 16,
  expert: 20,
};

/** 1–5 rubric score → 0..1. */
function norm(score: number | undefined): number {
  if (typeof score !== "number" || Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(1, (score - 1) / 4));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface RequestInput {
  scores: AcademyRubricScores;
  /** Evaluator overall, 1–5. */
  overall: number;
  difficulty: string;
  /** Minutes from first message to close. Null when not measurable. */
  durationMinutes: number | null;
  /** How many sessions this intern opened against this request. */
  attempts: number;
  /** Intern messages sent — a one-line close is not a handled request. */
  internTurns: number;
  /**
   * Mean requestScore of this intern's other completed requests, 0..1.
   * Null for their first, which scores neutral rather than being punished.
   */
  priorMean: number | null;
}

export type MetricBreakdown = Record<ProgressMetric, number>;

/**
 * Time efficiency is gated on quality on purpose: closing in two minutes with a
 * poor answer must not outrank a careful ten-minute one. Speed can only add to a
 * response that already scored well.
 */
function timeEfficiency(durationMinutes: number | null, difficulty: string, quality: number): number {
  if (durationMinutes === null || durationMinutes <= 0) return 0.6; // unmeasured → neutral
  const expected = EXPECTED_MINUTES[difficulty] ?? 12;
  const ratio = durationMinutes / expected;
  // At or under expected = full marks; degrades to 0 at triple the time.
  const raw = ratio <= 1 ? 1 : Math.max(0, 1 - (ratio - 1) / 2);
  return raw * Math.max(0.35, quality);
}

/** Per-metric 0..1 scores for a single completed request. */
export function scoreRequestMetrics(input: RequestInput): MetricBreakdown {
  const s = input.scores ?? ({} as AcademyRubricScores);
  const dim = (k: keyof AcademyRubricScores) => norm(s[k]?.score);

  const responseQuality = mean([dim("brand_tone"), dim("closure")]);
  const accuracy = mean([dim("factual_accuracy"), dim("comprehension")]);
  const aiOverall = norm(input.overall);

  // A "completed" request that the intern never actually engaged with should not
  // collect the full completion weight.
  const engaged = input.internTurns >= 3 ? 1 : input.internTurns >= 1 ? 0.6 : 0;

  return {
    task_completion: engaged,
    response_quality: responseQuality,
    information_accuracy: accuracy,
    time_efficiency: timeEfficiency(input.durationMinutes, input.difficulty, responseQuality),
    ai_evaluation: aiOverall,
    first_attempt: input.attempts <= 1 ? 1 : Math.max(0, 1 - (input.attempts - 1) * 0.5),
    critical_thinking: mean([dim("comprehension"), dim("escalation_judgment")]),
    communication: dim("brand_tone"),
    research_quality: dim("proactivity"),
    // Consistency compares this request against the intern's running standard.
    // First request scores neutral — there is nothing to be consistent with yet.
    consistency:
      input.priorMean === null
        ? 0.7
        : Math.max(0, 1 - Math.abs(aiOverall - input.priorMean) * 1.5),
  };
}

/** Weighted 0..1 score for one completed request. */
export function scoreRequest(input: RequestInput): number {
  const m = scoreRequestMetrics(input);
  return PROGRESS_METRICS.reduce((sum, def) => sum + m[def.key] * def.weight, 0);
}

export interface AcademyPerformance {
  /** 0–100, the number on the bar. */
  percent: number;
  /** Mean quality of what has been attempted, 0–100. */
  qualityPercent: number;
  completed: number;
  total: number;
  /** Weighted average per metric across completed requests, 0–100 each. */
  breakdown: Record<ProgressMetric, number>;
}

/**
 * Roll per-request scores into the academy bar.
 *
 * `percent` spreads earned quality across the whole curriculum, so it only
 * reaches 100 by handling every request well. `qualityPercent` is the average
 * standard of the work actually done — the honest answer to "how good am I",
 * separate from "how far through am I".
 */
export function computeAcademyPerformance(
  requestScores: { score: number; metrics: MetricBreakdown }[],
  totalRequests: number,
): AcademyPerformance {
  const completed = requestScores.length;
  const totalEarned = requestScores.reduce((sum, r) => sum + r.score, 0);

  const breakdown = {} as Record<ProgressMetric, number>;
  for (const def of PROGRESS_METRICS) {
    breakdown[def.key] =
      completed === 0
        ? 0
        : Math.round(mean(requestScores.map((r) => r.metrics[def.key])) * 100);
  }

  return {
    percent: totalRequests === 0 ? 0 : Math.round((totalEarned / totalRequests) * 100),
    qualityPercent: completed === 0 ? 0 : Math.round((totalEarned / completed) * 100),
    completed,
    total: totalRequests,
    breakdown,
  };
}

/** Weights must sum to 1 — guarded by a test so a future edit cannot skew the bar. */
export const TOTAL_WEIGHT = PROGRESS_METRICS.reduce((s, m) => s + m.weight, 0);

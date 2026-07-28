/**
 * Academy rubric — the six dimensions the evaluator scores, plus the weighted
 * overall. Pure module (no I/O). Overall is computed in code from the model's
 * per-dimension 1–5 scores so it never depends on the model inventing a total.
 */

import type {
  AcademyRubricDimension,
  AcademyRubricScores,
  AcademyRubricWeights,
} from "@/lib/types/database";

export interface RubricDimensionDef {
  key: AcademyRubricDimension;
  label: string;
  /** What "good" looks like — fed to the evaluator prompt. */
  description: string;
}

export const ACADEMY_DIMENSIONS: RubricDimensionDef[] = [
  {
    key: "comprehension",
    label: "Comprehension",
    description:
      "Did the intern correctly understand the request and surface the hidden constraints by probing well, rather than assuming?",
  },
  {
    key: "brand_tone",
    label: "Brand tone",
    description:
      "Warm, discreet, unflappable luxury-concierge voice. Never robotic, never over-familiar, never defensive.",
  },
  {
    key: "factual_accuracy",
    label: "Factual accuracy",
    description:
      "Did the intern avoid inventing details (availability, prices, confirmations, timelines) that were never established? Fabrication is penalised hard.",
  },
  {
    key: "proactivity",
    label: "Proactivity",
    description:
      "Did the intern anticipate needs, offer real options, and drive the request forward rather than waiting to be told?",
  },
  {
    key: "escalation_judgment",
    label: "Escalation judgment",
    description:
      "Did the intern read urgency correctly and escalate/act with appropriate speed — neither panicking nor under-reacting?",
  },
  {
    key: "closure",
    label: "Closure & next steps",
    description:
      "Did the intern land a clear outcome, confirm details back, and set expectations for what happens next?",
  },
];

/** factual_accuracy weighted higher — invented details are the worst failure. */
export const DEFAULT_RUBRIC_WEIGHTS: Required<AcademyRubricWeights> = {
  comprehension: 1,
  brand_tone: 1,
  factual_accuracy: 1.5,
  proactivity: 1,
  escalation_judgment: 1,
  closure: 1,
};

/** Clamp any model score into the valid 1–5 integer band. */
export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/**
 * Weighted mean of the six 1–5 dimension scores, on the 1–5 scale, rounded to
 * one decimal. Falls back to per-dimension weight 1 when a weight is missing or
 * non-positive, so a malformed `rubric_weights` can never zero out the overall.
 */
export function computeOverall(
  scores: AcademyRubricScores,
  weights?: AcademyRubricWeights,
): number {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const dim of ACADEMY_DIMENSIONS) {
    const raw = weights?.[dim.key];
    const w = typeof raw === "number" && raw > 0 ? raw : 1;
    const s = clampScore(scores[dim.key]?.score ?? 1);
    weightedSum += s * w;
    weightTotal += w;
  }
  if (weightTotal === 0) return 1;
  return Math.round((weightedSum / weightTotal) * 10) / 10;
}

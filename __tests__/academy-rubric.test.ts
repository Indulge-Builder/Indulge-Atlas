/**
 * Academy — rubric maths.
 *
 * The overall score is computed in code, never asked of the model, so these are
 * the assertions that make an intern's number defensible:
 *   - every dimension score is clamped into the 1–5 band before it counts;
 *   - factual_accuracy really is weighted heavier than the rest by default
 *     (fabrication is the failure Academy cares most about);
 *   - a malformed `rubric_weights` degrades to equal weighting instead of
 *     silently zeroing someone's score.
 *
 * Pure module under test — no I/O, no mocks.
 */

import { describe, it, expect } from "vitest";
import {
  ACADEMY_DIMENSIONS,
  DEFAULT_RUBRIC_WEIGHTS,
  clampScore,
  computeOverall,
} from "@/lib/academy/rubric";
import type {
  AcademyRubricDimension,
  AcademyRubricScores,
  AcademyRubricWeights,
} from "@/lib/types/database";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a full score set: `base` everywhere, then per-dimension overrides. */
function scores(
  base: number,
  overrides: Partial<Record<AcademyRubricDimension, number>> = {},
): AcademyRubricScores {
  const out = {} as AcademyRubricScores;
  for (const dim of ACADEMY_DIMENSIONS) {
    out[dim.key] = {
      score: overrides[dim.key] ?? base,
      justification: `because of ${dim.key}`,
    };
  }
  return out;
}

const EQUAL_WEIGHTS: Required<AcademyRubricWeights> = {
  comprehension: 1,
  brand_tone: 1,
  factual_accuracy: 1,
  proactivity: 1,
  escalation_judgment: 1,
  closure: 1,
};

// ── Dimension table ──────────────────────────────────────────────────────────

describe("ACADEMY_DIMENSIONS", () => {
  it("has exactly six unique dimensions", () => {
    expect(ACADEMY_DIMENSIONS).toHaveLength(6);
    expect(new Set(ACADEMY_DIMENSIONS.map((d) => d.key)).size).toBe(6);
  });

  it("gives every dimension a label and a description for the prompt", () => {
    for (const dim of ACADEMY_DIMENSIONS) {
      expect(dim.label.length).toBeGreaterThan(0);
      expect(dim.description.length).toBeGreaterThan(10);
    }
  });

  it("has a default weight for every dimension", () => {
    for (const dim of ACADEMY_DIMENSIONS) {
      expect(DEFAULT_RUBRIC_WEIGHTS[dim.key]).toBeGreaterThan(0);
    }
  });
});

// ── clampScore ───────────────────────────────────────────────────────────────

describe("clampScore — bounds", () => {
  it("passes valid scores through", () => {
    expect(clampScore(1)).toBe(1);
    expect(clampScore(2)).toBe(2);
    expect(clampScore(3)).toBe(3);
    expect(clampScore(4)).toBe(4);
    expect(clampScore(5)).toBe(5);
  });

  it("raises anything below 1 up to 1", () => {
    expect(clampScore(0)).toBe(1);
    expect(clampScore(0.4)).toBe(1);
    expect(clampScore(-4)).toBe(1);
    expect(clampScore(-1000)).toBe(1);
  });

  it("lowers anything above 5 down to 5", () => {
    expect(clampScore(6)).toBe(5);
    expect(clampScore(9)).toBe(5);
    expect(clampScore(1000)).toBe(5);
  });
});

describe("clampScore — rounding and garbage", () => {
  it("rounds half-up to the nearest integer", () => {
    expect(clampScore(3.4)).toBe(3);
    expect(clampScore(3.5)).toBe(4);
    expect(clampScore(4.6)).toBe(5);
    expect(clampScore(1.49)).toBe(1);
  });

  it("falls back to the lowest score for non-finite input", () => {
    // Conservative by design: a score we cannot read is never a good score.
    expect(clampScore(Number.NaN)).toBe(1);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampScore(Number.NEGATIVE_INFINITY)).toBe(1);
  });

  it("always returns an integer inside the band", () => {
    for (const n of [-9, -0.5, 0, 1.2, 2.7, 3, 4.5, 5, 7.9, 42]) {
      const v = clampScore(n);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

// ── computeOverall — endpoints ───────────────────────────────────────────────

describe("computeOverall — endpoints", () => {
  it("gives exactly 5 for an all-5 set", () => {
    expect(computeOverall(scores(5), DEFAULT_RUBRIC_WEIGHTS)).toBe(5);
    expect(computeOverall(scores(5))).toBe(5);
    expect(computeOverall(scores(5), EQUAL_WEIGHTS)).toBe(5);
  });

  it("gives exactly 1 for an all-1 set", () => {
    expect(computeOverall(scores(1), DEFAULT_RUBRIC_WEIGHTS)).toBe(1);
    expect(computeOverall(scores(1))).toBe(1);
    expect(computeOverall(scores(1), EQUAL_WEIGHTS)).toBe(1);
  });

  it("gives exactly 3 for an all-3 set regardless of weighting", () => {
    expect(computeOverall(scores(3), DEFAULT_RUBRIC_WEIGHTS)).toBe(3);
    expect(computeOverall(scores(3), EQUAL_WEIGHTS)).toBe(3);
  });

  it("stays inside the 1–5 band and rounds to one decimal", () => {
    // (3·1 + 3·1 + 5·1.5 + 3·1 + 3·1 + 1·1) / 6.5 = 20.5 / 6.5 = 3.1538… → 3.2
    const overall = computeOverall(
      scores(3, { factual_accuracy: 5, closure: 1 }),
      DEFAULT_RUBRIC_WEIGHTS,
    );
    expect(overall).toBe(3.2);
    expect(overall).toBeGreaterThanOrEqual(1);
    expect(overall).toBeLessThanOrEqual(5);
  });

  it("clamps out-of-band dimension scores before weighting", () => {
    expect(computeOverall(scores(9), DEFAULT_RUBRIC_WEIGHTS)).toBe(5);
    expect(computeOverall(scores(-3), DEFAULT_RUBRIC_WEIGHTS)).toBe(1);
  });

  it("treats a missing dimension as the lowest score", () => {
    const partial = scores(5);
    delete (partial as Partial<AcademyRubricScores>).closure;
    // (5·1 + 5·1 + 5·1.5 + 5·1 + 5·1 + 1·1) / 6.5 = 28.5 / 6.5 = 4.4
    expect(computeOverall(partial, DEFAULT_RUBRIC_WEIGHTS)).toBe(4.4);
  });
});

// ── computeOverall — factual_accuracy carries more weight ────────────────────

describe("computeOverall — factual_accuracy is weighted higher by default", () => {
  it("declares a heavier default weight than every other dimension", () => {
    for (const dim of ACADEMY_DIMENSIONS) {
      if (dim.key === "factual_accuracy") continue;
      expect(DEFAULT_RUBRIC_WEIGHTS.factual_accuracy).toBeGreaterThan(
        DEFAULT_RUBRIC_WEIGHTS[dim.key],
      );
    }
  });

  it("moves the overall more when factual_accuracy improves than when another dimension does", () => {
    const baseline = computeOverall(scores(3), DEFAULT_RUBRIC_WEIGHTS);
    const factualUp = computeOverall(
      scores(3, { factual_accuracy: 5 }),
      DEFAULT_RUBRIC_WEIGHTS,
    );
    const comprehensionUp = computeOverall(
      scores(3, { comprehension: 5 }),
      DEFAULT_RUBRIC_WEIGHTS,
    );

    expect(baseline).toBe(3);
    const deltaFactual = factualUp - baseline;
    const deltaOther = comprehensionUp - baseline;

    expect(deltaFactual).toBeGreaterThan(0);
    expect(deltaOther).toBeGreaterThan(0);
    expect(deltaFactual).toBeGreaterThan(deltaOther);
  });

  it("moves the overall more under default weights than under equal weights", () => {
    const defaultDelta =
      computeOverall(scores(3, { factual_accuracy: 5 }), DEFAULT_RUBRIC_WEIGHTS) -
      computeOverall(scores(3), DEFAULT_RUBRIC_WEIGHTS);
    const equalDelta =
      computeOverall(scores(3, { factual_accuracy: 5 }), EQUAL_WEIGHTS) -
      computeOverall(scores(3), EQUAL_WEIGHTS);

    expect(defaultDelta).toBeGreaterThan(equalDelta);
  });

  it("punishes a fabrication (factual_accuracy 1) harder than a flat tone", () => {
    const fabricated = computeOverall(
      scores(4, { factual_accuracy: 1 }),
      DEFAULT_RUBRIC_WEIGHTS,
    );
    const flatTone = computeOverall(
      scores(4, { brand_tone: 1 }),
      DEFAULT_RUBRIC_WEIGHTS,
    );
    expect(fabricated).toBeLessThan(flatTone);
  });
});

// ── computeOverall — malformed weights degrade safely ────────────────────────

describe("computeOverall — malformed weights fall back to 1", () => {
  it("treats an empty weights object as equal weighting", () => {
    const s = scores(3, { comprehension: 5, factual_accuracy: 1 });
    expect(computeOverall(s, {})).toBe(computeOverall(s, EQUAL_WEIGHTS));
  });

  it("treats undefined weights as equal weighting", () => {
    const s = scores(3, { comprehension: 5, factual_accuracy: 1 });
    expect(computeOverall(s, undefined)).toBe(computeOverall(s, EQUAL_WEIGHTS));
    expect(computeOverall(s)).toBe(computeOverall(s, EQUAL_WEIGHTS));
  });

  it("treats zero and negative weights as 1 rather than dropping the dimension", () => {
    const s = scores(3, { comprehension: 5, factual_accuracy: 1 });
    const malformed: AcademyRubricWeights = {
      comprehension: -3,
      factual_accuracy: 0,
      brand_tone: 0,
    };
    expect(computeOverall(s, malformed)).toBe(computeOverall(s, EQUAL_WEIGHTS));
  });

  it("never zeroes the total when every weight is zero", () => {
    const allZero: AcademyRubricWeights = {
      comprehension: 0,
      brand_tone: 0,
      factual_accuracy: 0,
      proactivity: 0,
      escalation_judgment: 0,
      closure: 0,
    };
    // Fallback weighting keeps the score honest instead of collapsing to 0 or 1.
    expect(computeOverall(scores(5), allZero)).toBe(5);
    expect(computeOverall(scores(4), allZero)).toBe(4);
  });

  it("ignores non-numeric weights smuggled in from the database", () => {
    const s = scores(3, { comprehension: 5, factual_accuracy: 1 });
    const dirty = {
      comprehension: "heavy",
      factual_accuracy: null,
      proactivity: Number.NaN,
    } as unknown as AcademyRubricWeights;
    expect(computeOverall(s, dirty)).toBe(computeOverall(s, EQUAL_WEIGHTS));
  });

  it("still honours a valid custom weighting", () => {
    const s = scores(3, { closure: 5 });
    const closureHeavy: AcademyRubricWeights = { closure: 4 };
    // (3+3+3+3+3 + 5·4) / (5 + 4) = 35 / 9 = 3.9
    expect(computeOverall(s, closureHeavy)).toBe(3.9);
    expect(computeOverall(s, closureHeavy)).toBeGreaterThan(
      computeOverall(s, EQUAL_WEIGHTS),
    );
  });
});

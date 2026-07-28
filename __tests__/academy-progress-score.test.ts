/**
 * Performance-weighted progress — the properties that must not drift.
 *
 * These pin the behaviours the model exists to guarantee: weights sum to 1,
 * quality changes the bar, speed cannot buy a good score, and unattempted work
 * still counts against you.
 */

import { describe, it, expect } from "vitest";
import {
  PROGRESS_METRICS,
  TOTAL_WEIGHT,
  computeAcademyPerformance,
  scoreRequest,
  scoreRequestMetrics,
  type RequestInput,
} from "@/lib/academy/progressScore";
import type { AcademyRubricScores } from "@/lib/types/database";

function scores(value: number): AcademyRubricScores {
  const one = { score: value, justification: "" };
  return {
    comprehension: one,
    brand_tone: one,
    factual_accuracy: one,
    proactivity: one,
    escalation_judgment: one,
    closure: one,
  };
}

function req(over: Partial<RequestInput> = {}): RequestInput {
  return {
    scores: scores(5),
    overall: 5,
    difficulty: "medium",
    durationMinutes: 10,
    attempts: 1,
    internTurns: 6,
    priorMean: null,
    ...over,
  };
}

describe("progress weights", () => {
  it("sum to exactly 1", () => {
    expect(Number(TOTAL_WEIGHT.toFixed(10))).toBe(1);
  });

  it("match the specified distribution", () => {
    const byKey = Object.fromEntries(PROGRESS_METRICS.map((m) => [m.key, m.weight]));
    expect(byKey.task_completion).toBe(0.2);
    expect(byKey.response_quality).toBe(0.2);
    expect(byKey.information_accuracy).toBe(0.15);
    expect(byKey.time_efficiency).toBe(0.15);
    expect(byKey.ai_evaluation).toBe(0.1);
    expect(byKey.first_attempt).toBe(0.05);
    expect(byKey.critical_thinking).toBe(0.05);
    expect(byKey.communication).toBe(0.05);
    expect(byKey.research_quality).toBe(0.03);
    expect(byKey.consistency).toBe(0.02);
  });

  it("covers all ten metrics", () => {
    expect(PROGRESS_METRICS).toHaveLength(10);
  });
});

describe("scoreRequest", () => {
  it("a flawless request scores at or near the maximum", () => {
    expect(scoreRequest(req())).toBeGreaterThan(0.95);
  });

  it("a poor request scores far lower than a strong one", () => {
    const strong = scoreRequest(req());
    const weak = scoreRequest(req({ scores: scores(1), overall: 1 }));
    expect(weak).toBeLessThan(strong * 0.5);
  });

  it("two trainees on the same request can score differently", () => {
    const a = scoreRequest(req({ scores: scores(5), overall: 5 }));
    const b = scoreRequest(req({ scores: scores(3), overall: 3 }));
    expect(a).not.toBeCloseTo(b, 2);
    expect(a).toBeGreaterThan(b);
  });

  it("penalises a retry against a first-attempt clear", () => {
    expect(scoreRequest(req({ attempts: 3 }))).toBeLessThan(scoreRequest(req({ attempts: 1 })));
  });

  it("does not award full completion credit for a one-line drive-by", () => {
    const m = scoreRequestMetrics(req({ internTurns: 1 }));
    expect(m.task_completion).toBeLessThan(1);
    expect(scoreRequestMetrics(req({ internTurns: 0 })).task_completion).toBe(0);
  });
});

describe("speed cannot buy a good score", () => {
  it("rushing a bad answer scores below a slower good one", () => {
    const rushedBad = scoreRequest(
      req({ scores: scores(1), overall: 1, durationMinutes: 1 }),
    );
    const slowGood = scoreRequest(
      req({ scores: scores(5), overall: 5, durationMinutes: 25 }),
    );
    expect(rushedBad).toBeLessThan(slowGood);
  });

  it("time efficiency is gated on response quality", () => {
    const fastPoor = scoreRequestMetrics(
      req({ scores: scores(1), overall: 1, durationMinutes: 2 }),
    ).time_efficiency;
    const fastStrong = scoreRequestMetrics(
      req({ scores: scores(5), overall: 5, durationMinutes: 2 }),
    ).time_efficiency;
    expect(fastPoor).toBeLessThan(fastStrong);
  });

  it("an unmeasurable duration is neutral, not zero", () => {
    expect(scoreRequestMetrics(req({ durationMinutes: null })).time_efficiency).toBeGreaterThan(0);
  });
});

describe("computeAcademyPerformance", () => {
  const perfect = { score: 1, metrics: scoreRequestMetrics(req()) };

  it("is zero with nothing completed", () => {
    const p = computeAcademyPerformance([], 176);
    expect(p.percent).toBe(0);
    expect(p.qualityPercent).toBe(0);
  });

  it("one perfect request out of 176 does not read as finished", () => {
    const p = computeAcademyPerformance([perfect], 176);
    expect(p.percent).toBeLessThan(2);
    // ...but the quality of the work done is high
    expect(p.qualityPercent).toBe(100);
  });

  it("reaches 100 only when every request is handled perfectly", () => {
    const all = Array.from({ length: 10 }, () => perfect);
    expect(computeAcademyPerformance(all, 10).percent).toBe(100);
  });

  it("completing everything poorly does NOT reach 100", () => {
    const bad = req({ scores: scores(1), overall: 1, internTurns: 1, attempts: 2 });
    const all = Array.from({ length: 10 }, () => ({
      score: scoreRequest(bad),
      metrics: scoreRequestMetrics(bad),
    }));
    const p = computeAcademyPerformance(all, 10);
    expect(p.percent).toBeLessThan(50);
    expect(p.completed).toBe(10);
  });

  it("exposes a per-metric breakdown for the tooltip", () => {
    const p = computeAcademyPerformance([perfect], 176);
    for (const m of PROGRESS_METRICS) {
      expect(p.breakdown[m.key]).toBeGreaterThanOrEqual(0);
      expect(p.breakdown[m.key]).toBeLessThanOrEqual(100);
    }
  });
});

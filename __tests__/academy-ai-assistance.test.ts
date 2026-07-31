import { describe, expect, it } from "vitest";
import {
  AI_ASSISTANCE_BANDS,
  HIGH_ASSISTANCE_THRESHOLD,
  LARGE_PASTE_SHARE,
  MIN_WORDS_FOR_ESTIMATE,
  aiAssistanceByTask,
  aiAssistanceTimeline,
  bandFor,
  clampPercent,
  isEstimable,
  summariseAiAssistance,
  summariseComposition,
  wordCount,
  type AiAssistanceRecord,
  type CompositionInput,
} from "@/lib/academy/aiAssistance";

const COMPOSITION: CompositionInput = {
  pasteCount: 0,
  pastedChars: 0,
  largestPasteChars: 0,
  typedChars: 100,
  timeToFirstInputMs: 1_200,
  compositionMs: 30_000,
  finalChars: 100,
};

function record(over: Partial<AiAssistanceRecord> = {}): AiAssistanceRecord {
  return {
    turnId: "turn-1",
    sessionId: "session-1",
    internId: "intern-1",
    seedId: "seed-1",
    percent: 40,
    outcome: "estimated",
    rationale: "Reads conversationally.",
    signals: summariseComposition(COMPOSITION),
    modelVersion: "test",
    createdAt: "2026-07-31T10:00:00.000Z",
    ...over,
  };
}

describe("bands", () => {
  it("covers 0–100 with no gaps or overlaps", () => {
    const sorted = [...AI_ASSISTANCE_BANDS].sort((a, b) => a.min - b.min);
    expect(sorted[0].min).toBe(0);
    expect(sorted[sorted.length - 1].max).toBe(100);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].min).toBe(sorted[i - 1].max + 1);
    }
  });

  it("maps each boundary to the band the spec names", () => {
    expect(bandFor(0).id).toBe("low");
    expect(bandFor(20).id).toBe("low");
    expect(bandFor(21).id).toBe("moderate");
    expect(bandFor(50).id).toBe("moderate");
    expect(bandFor(51).id).toBe("high");
    expect(bandFor(75).id).toBe("high");
    expect(bandFor(76).id).toBe("very_high");
    expect(bandFor(100).id).toBe("very_high");
  });

  it("high band starts exactly at the rollup threshold", () => {
    expect(bandFor(HIGH_ASSISTANCE_THRESHOLD).id).toBe("high");
  });

  it("clamps values from outside the range instead of throwing", () => {
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(42.6)).toBe(43);
    expect(bandFor(-5).id).toBe("low");
    expect(bandFor(1000).id).toBe("very_high");
  });
});

describe("short-text guard", () => {
  it("counts words irrespective of whitespace shape", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
    expect(wordCount("one")).toBe(1);
    expect(wordCount("  two   words \n here ")).toBe(3);
  });

  it("refuses to estimate a reply below the threshold", () => {
    const short = Array.from({ length: MIN_WORDS_FOR_ESTIMATE - 1 }, () => "w").join(" ");
    const long = Array.from({ length: MIN_WORDS_FOR_ESTIMATE }, () => "w").join(" ");
    expect(isEstimable(short)).toBe(false);
    expect(isEstimable(long)).toBe(true);
  });

  it("rejects the kind of one-line reply this trainer app is full of", () => {
    expect(isEstimable("Sure, will share options in 30 minutes.")).toBe(false);
  });
});

describe("composition signals", () => {
  it("derives paste shares from the submitted length", () => {
    const s = summariseComposition({
      ...COMPOSITION,
      pasteCount: 1,
      pastedChars: 90,
      largestPasteChars: 90,
      typedChars: 10,
      finalChars: 100,
    });
    expect(s.pastedSharePercent).toBe(90);
    expect(s.largestPasteSharePercent).toBe(90);
    expect(s.singleLargePaste).toBe(true);
  });

  it("does not flag many small pastes as a single large paste", () => {
    const s = summariseComposition({
      ...COMPOSITION,
      pasteCount: 4,
      pastedChars: 80,
      largestPasteChars: 20,
      typedChars: 20,
      finalChars: 100,
    });
    expect(s.pastedSharePercent).toBe(80);
    expect(s.singleLargePaste).toBe(false);
  });

  it("treats the large-paste line as inclusive", () => {
    const s = summariseComposition({
      ...COMPOSITION,
      largestPasteChars: LARGE_PASTE_SHARE,
      finalChars: 100,
    });
    expect(s.singleLargePaste).toBe(true);
  });

  it("survives a zero-length submission without dividing by zero", () => {
    const s = summariseComposition({ ...COMPOSITION, typedChars: 0, finalChars: 0 });
    expect(s.pastedSharePercent).toBe(0);
    expect(Number.isFinite(s.largestPasteSharePercent)).toBe(true);
  });

  it("clamps a paste larger than the final text (edited down after pasting)", () => {
    const s = summariseComposition({
      ...COMPOSITION,
      pasteCount: 1,
      pastedChars: 500,
      largestPasteChars: 500,
      finalChars: 100,
    });
    expect(s.pastedSharePercent).toBe(100);
    expect(s.largestPasteSharePercent).toBe(100);
  });
});

describe("summariseAiAssistance", () => {
  it("returns an empty summary for no records", () => {
    const s = summariseAiAssistance([]);
    expect(s.analysed).toBe(0);
    expect(s.averagePercent).toBeNull();
    expect(s.highestPercent).toBeNull();
    expect(s.lowestPercent).toBeNull();
    expect(s.highAssistancePercent).toBeNull();
  });

  it("averages only the responses that produced an estimate", () => {
    const s = summariseAiAssistance([
      record({ percent: 20 }),
      record({ percent: 60 }),
      record({ percent: null, outcome: "insufficient_text" }),
      record({ percent: null, outcome: "unavailable" }),
    ]);
    expect(s.analysed).toBe(2);
    expect(s.averagePercent).toBe(40);
    expect(s.highestPercent).toBe(60);
    expect(s.lowestPercent).toBe(20);
    expect(s.skippedTooShort).toBe(1);
  });

  it("never invents a midpoint for skipped responses", () => {
    // All skipped: averages must stay null rather than collapsing to 0 or 50.
    const s = summariseAiAssistance([
      record({ percent: null, outcome: "insufficient_text" }),
      record({ percent: null, outcome: "insufficient_text" }),
    ]);
    expect(s.analysed).toBe(0);
    expect(s.averagePercent).toBeNull();
    expect(s.skippedTooShort).toBe(2);
  });

  it("counts high-assistance responses at the threshold, not above it", () => {
    const s = summariseAiAssistance([
      record({ percent: 50 }),
      record({ percent: 51 }),
      record({ percent: 90 }),
    ]);
    expect(s.highAssistanceCount).toBe(2);
    expect(s.highAssistancePercent).toBe(67);
  });

  it("counts large pastes independently of the estimate", () => {
    const pasted = summariseComposition({
      ...COMPOSITION,
      pasteCount: 1,
      pastedChars: 95,
      largestPasteChars: 95,
      finalChars: 100,
    });
    // A skipped-too-short response still contributes its observed paste fact.
    const s = summariseAiAssistance([
      record({ percent: 10, signals: pasted }),
      record({ percent: null, outcome: "insufficient_text", signals: pasted }),
    ]);
    expect(s.largePasteCount).toBe(2);
    expect(s.analysed).toBe(1);
  });
});

describe("rollups", () => {
  it("averages per task and ignores unscored responses", () => {
    const byTask = aiAssistanceByTask([
      record({ seedId: "seed-a", percent: 10 }),
      record({ seedId: "seed-a", percent: 30 }),
      record({ seedId: "seed-b", percent: 80 }),
      record({ seedId: "seed-b", percent: null, outcome: "insufficient_text" }),
      record({ seedId: null, percent: 99 }),
    ]);
    expect(byTask).toEqual([
      { seedId: "seed-a", analysed: 2, averagePercent: 20 },
      { seedId: "seed-b", analysed: 1, averagePercent: 80 },
    ]);
  });

  it("orders the timeline oldest first regardless of input order", () => {
    const points = aiAssistanceTimeline([
      record({ createdAt: "2026-07-31T12:00:00.000Z", percent: 30 }),
      record({ createdAt: "2026-07-31T09:00:00.000Z", percent: 70 }),
      record({ createdAt: "2026-07-31T10:00:00.000Z", percent: null, outcome: "unavailable" }),
    ]);
    expect(points.map((p) => p.percent)).toEqual([70, 30]);
  });
});

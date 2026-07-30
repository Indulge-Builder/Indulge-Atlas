/**
 * Response and resolution timing.
 *
 * The definitions here are the load-bearing part: measuring the wait from the
 * wrong message, or counting an unanswered message as zero, would quietly
 * reward the exact behaviour the academy grades against.
 */

import { describe, it, expect } from "vitest";
import {
  compareToAverage,
  formatDuration,
  median,
  responsivenessScore,
  sessionTiming,
  summariseTimings,
  type TimedTurn,
} from "@/lib/academy/timing";

const T0 = Date.parse("2026-07-28T10:00:00.000Z");
const at = (mins: number) => new Date(T0 + mins * 60_000).toISOString();

function turns(spec: [role: "client" | "intern", mins: number][]): TimedTurn[] {
  return spec.map(([role, mins], i) => ({ role, created_at: at(mins), seq: i + 1 }));
}

describe("response time", () => {
  it("measures the gap from a client message to the reply", () => {
    const t = sessionTiming(turns([["client", 0], ["intern", 5]]), {
      startedAt: at(0),
      resolvedAt: at(5),
    });
    expect(t.responses).toEqual([5]);
    expect(t.avgResponseMinutes).toBe(5);
    expect(t.firstResponseMinutes).toBe(5);
  });

  it("measures from the FIRST unanswered message, not the last", () => {
    // Client writes at 0, chases at 8, trainee finally replies at 10.
    // The member waited 10 minutes, not 2.
    const t = sessionTiming(
      turns([["client", 0], ["client", 8], ["intern", 10]]),
      { startedAt: at(0), resolvedAt: at(10) },
    );
    expect(t.responses).toEqual([10]);
  });

  it("averages across several exchanges", () => {
    const t = sessionTiming(
      turns([["client", 0], ["intern", 2], ["client", 5], ["intern", 11]]),
      { startedAt: at(0), resolvedAt: at(11) },
    );
    expect(t.responses).toEqual([2, 6]);
    expect(t.avgResponseMinutes).toBe(4);
    expect(t.firstResponseMinutes).toBe(2);
  });

  it("does not count a trailing client message as an instant reply", () => {
    const t = sessionTiming(
      turns([["client", 0], ["intern", 3], ["client", 9]]),
      { startedAt: at(0), resolvedAt: at(9) },
    );
    expect(t.responses).toEqual([3]);
    expect(t.unanswered).toBe(1);
  });

  it("reports nothing rather than zero when the trainee never replied", () => {
    const t = sessionTiming(turns([["client", 0]]), {
      startedAt: at(0),
      resolvedAt: null,
    });
    expect(t.avgResponseMinutes).toBeNull();
    expect(t.firstResponseMinutes).toBeNull();
    expect(t.unanswered).toBe(1);
  });

  it("orders by seq, not by array position", () => {
    const shuffled: TimedTurn[] = [
      { role: "intern", created_at: at(4), seq: 2 },
      { role: "client", created_at: at(0), seq: 1 },
    ];
    expect(sessionTiming(shuffled, { startedAt: at(0), resolvedAt: at(4) }).responses)
      .toEqual([4]);
  });
});

describe("resolution time", () => {
  it("runs from the opening message to the resolving moment", () => {
    const t = sessionTiming(turns([["client", 0], ["intern", 5]]), {
      startedAt: at(0),
      resolvedAt: at(42),
    });
    expect(t.resolutionMinutes).toBe(42);
  });

  it("is null when either end is missing", () => {
    expect(
      sessionTiming(turns([["client", 0]]), { startedAt: null, resolvedAt: at(9) })
        .resolutionMinutes,
    ).toBeNull();
  });

  it("refuses to report a negative duration from clock skew", () => {
    expect(
      sessionTiming([], { startedAt: at(30), resolvedAt: at(10) }).resolutionMinutes,
    ).toBeNull();
  });
});

describe("summary across sessions", () => {
  const build = (spec: { responses: number[]; resolution: number | null }) => ({
    responses: spec.responses,
    firstResponseMinutes: spec.responses[0] ?? null,
    avgResponseMinutes: spec.responses.length
      ? spec.responses.reduce((a, b) => a + b, 0) / spec.responses.length
      : null,
    unanswered: 0,
    resolutionMinutes: spec.resolution,
  });

  it("reports fastest and slowest resolutions", () => {
    const s = summariseTimings([
      build({ responses: [2], resolution: 12 }),
      build({ responses: [6], resolution: 55 }),
      build({ responses: [4], resolution: 30 }),
    ]);
    expect(s.fastestResolutionMinutes).toBe(12);
    expect(s.slowestResolutionMinutes).toBe(55);
    expect(s.avgResolutionMinutes).toBeCloseTo(32.3, 1);
    expect(s.resolvedCount).toBe(3);
  });

  it("reports a median that one outlier cannot distort", () => {
    const s = summariseTimings([
      build({ responses: [2, 3, 3, 400], resolution: 20 }),
    ]);
    // The mean is dragged past 100; the median still describes normal behaviour.
    expect(s.avgResponseMinutes!).toBeGreaterThan(100);
    expect(s.medianResponseMinutes).toBe(3);
  });

  it("ignores sessions with no measurable resolution", () => {
    const s = summariseTimings([
      build({ responses: [2], resolution: null }),
      build({ responses: [4], resolution: 20 }),
    ]);
    expect(s.resolvedCount).toBe(1);
    expect(s.avgResolutionMinutes).toBe(20);
  });

  it("returns nulls rather than zeros for an empty cohort", () => {
    const s = summariseTimings([]);
    expect(s.avgResponseMinutes).toBeNull();
    expect(s.avgResolutionMinutes).toBeNull();
    expect(s.fastestResolutionMinutes).toBeNull();
  });
});

describe("responsiveness scoring", () => {
  it("gives full marks at or under the target for the tier", () => {
    expect(responsivenessScore(2, "easy", 1)).toBe(1);
    expect(responsivenessScore(3, "easy", 1)).toBe(1);
  });

  it("decays as the wait grows", () => {
    const quick = responsivenessScore(4, "medium", 1);
    const slow = responsivenessScore(12, "medium", 1);
    const glacial = responsivenessScore(40, "medium", 1);
    expect(quick).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(glacial);
    expect(glacial).toBe(0);
  });

  it("allows a longer reply window on harder requests", () => {
    expect(responsivenessScore(6, "expert", 1)).toBeGreaterThan(
      responsivenessScore(6, "easy", 1),
    );
  });

  it("is gated on quality, so a fast bad reply cannot win", () => {
    expect(responsivenessScore(1, "medium", 0)).toBeLessThan(
      responsivenessScore(1, "medium", 1),
    );
  });

  it("scores neutral when unmeasured", () => {
    expect(responsivenessScore(null, "medium", 1)).toBe(0.6);
  });
});

describe("presentation helpers", () => {
  it("formats durations readably", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(0.4)).toBe("<1m");
    expect(formatDuration(42)).toBe("42m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(95)).toBe("1h 35m");
  });

  it("computes median for even and odd counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("compares against the academy average in both directions", () => {
    expect(compareToAverage(3, 5)).toEqual({ deltaMinutes: 2, faster: true });
    expect(compareToAverage(8, 5)).toEqual({ deltaMinutes: 3, faster: false });
    // Identical to the average is not a comparison worth drawing.
    expect(compareToAverage(5, 5)).toBeNull();
    expect(compareToAverage(null, 5)).toBeNull();
  });
});

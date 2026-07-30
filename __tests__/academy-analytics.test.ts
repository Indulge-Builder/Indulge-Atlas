/**
 * Admin analytics derivation — the properties a trainer's decisions rest on.
 *
 * These pin the things that would quietly mislead if they drifted: ranking on
 * quality rather than volume, ties not being ordered arbitrarily, recurring
 * themes actually collapsing near-duplicates, and CSV export not corrupting a
 * cell that contains a comma.
 */

import { describe, it, expect } from "vitest";
import {
  PERFORMANCE_TIERS,
  buildTimeline,
  coachingFor,
  computeKpis,
  leaderboardCsv,
  noteFingerprint,
  rankTrainees,
  recurringNotes,
  splitStrengths,
  tierFor,
  timelineTrend,
  toCsv,
  type TraineeAnalytics,
} from "@/lib/academy/analytics";
import { PROGRESS_METRICS, type ProgressMetric } from "@/lib/academy/progressScore";

type BareRow = Omit<TraineeAnalytics, "rank" | "tier">;

function breakdown(value: number): Record<ProgressMetric, number> {
  return Object.fromEntries(
    PROGRESS_METRICS.map((m) => [m.key, value]),
  ) as Record<ProgressMetric, number>;
}

function row(over: Partial<BareRow> = {}): BareRow {
  return {
    internId: "i1",
    name: "Aria Menon",
    email: "aria@indulge.global",
    jobTitle: null,
    progressPercent: 40,
    qualityPercent: 80,
    aiScore: 4,
    requestsCompleted: 10,
    awaitingTicket: 0,
    totalRequests: 176,
    breakdown: breakdown(80),
    avgMinutes: 12,
    timing: {
      avgResponseMinutes: 4,
      medianResponseMinutes: 3,
      avgResolutionMinutes: 18,
      fastestResolutionMinutes: 9,
      slowestResolutionMinutes: 40,
      resolvedCount: 10,
      unanswered: 0,
    },
    lastActiveAt: "2026-07-28T10:00:00.000Z",
    trend: null,
    ...over,
  };
}

// ── Ranking ──────────────────────────────────────────────────────────────────

describe("ranking", () => {
  it("ranks on quality, not volume — the whole point of the leaderboard", () => {
    const ranked = rankTrainees([
      row({ internId: "grinder", name: "Grinder", qualityPercent: 60, requestsCompleted: 100 }),
      row({ internId: "careful", name: "Careful", qualityPercent: 92, requestsCompleted: 5 }),
    ]);
    expect(ranked[0].internId).toBe("careful");
    expect(ranked[0].rank).toBe(1);
  });

  it("uses volume only to break a genuine quality tie", () => {
    const ranked = rankTrainees([
      row({ internId: "few", name: "Few", qualityPercent: 80, requestsCompleted: 3 }),
      row({ internId: "many", name: "Many", qualityPercent: 80, requestsCompleted: 30 }),
    ]);
    expect(ranked[0].internId).toBe("many");
  });

  it("gives identical trainees the same rank rather than an arbitrary order", () => {
    const ranked = rankTrainees([
      row({ internId: "a", name: "Aaa", qualityPercent: 90, requestsCompleted: 10 }),
      row({ internId: "b", name: "Bbb", qualityPercent: 90, requestsCompleted: 10 }),
      row({ internId: "c", name: "Ccc", qualityPercent: 70, requestsCompleted: 10 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("assigns a tier from quality", () => {
    const ranked = rankTrainees([row({ qualityPercent: 95 })]);
    expect(ranked[0].tier.key).toBe("elite");
  });

  it("covers the whole 0–100 range with no gap", () => {
    for (let p = 0; p <= 100; p++) expect(tierFor(p)).toBeDefined();
    expect(PERFORMANCE_TIERS[PERFORMANCE_TIERS.length - 1].min).toBe(0);
  });
});

// ── KPIs ─────────────────────────────────────────────────────────────────────

describe("KPIs", () => {
  const NOW = Date.parse("2026-07-28T12:00:00.000Z");

  it("counts active trainees by real recency, not by existence", () => {
    const rows = rankTrainees([
      row({ internId: "recent", lastActiveAt: new Date(NOW - 3600_000).toISOString() }),
      row({ internId: "stale", lastActiveAt: "2026-01-01T00:00:00.000Z" }),
      row({ internId: "never", lastActiveAt: null }),
    ]);
    const k = computeKpis(rows, {
      activeSince: NOW - 7 * 86_400_000,
      todaySince: NOW - 12 * 3600_000,
      ticketsAccepted: 0,
      ticketsPending: 0,
    });
    expect(k.totalTrainees).toBe(3);
    expect(k.activeTrainees).toBe(1);
    expect(k.activeToday).toBe(1);
  });

  it("only counts a trainee as finished when every request is handled", () => {
    const rows = rankTrainees([
      row({ internId: "done", requestsCompleted: 176, totalRequests: 176 }),
      row({ internId: "nearly", requestsCompleted: 175, totalRequests: 176 }),
    ]);
    const k = computeKpis(rows, {
      activeSince: 0, todaySince: 0, ticketsAccepted: 0, ticketsPending: 0,
    });
    expect(k.completedTraining).toBe(1);
  });

  it("reports no average AI score rather than 0 when nothing is scored", () => {
    const rows = rankTrainees([row({ aiScore: null, avgMinutes: null })]);
    const k = computeKpis(rows, {
      activeSince: 0, todaySince: 0, ticketsAccepted: 0, ticketsPending: 0,
    });
    expect(k.avgAiScore).toBeNull();
    expect(k.avgMinutesPerRequest).toBeNull();
  });
});

// ── Recurring themes ─────────────────────────────────────────────────────────

describe("recurring notes", () => {
  it("collapses the same idea phrased differently", () => {
    expect(noteFingerprint("Missed the warranty details")).toBe(
      noteFingerprint("Warranty details were missed"),
    );
  });

  it("keeps genuinely different notes apart", () => {
    expect(noteFingerprint("Missed the warranty details")).not.toBe(
      noteFingerprint("Response was far too lengthy"),
    );
  });

  it("counts repeats and surfaces the most frequent first", () => {
    const out = recurringNotes([
      "Missed the warranty details",
      "Warranty details were missed",
      "The warranty details are missing",
      "Response too lengthy",
      "Response too lengthy",
      "Grammar slip in the closing line",
    ]);
    expect(out[0].count).toBe(3);
    expect(out[0].text.toLowerCase()).toContain("warranty");
    expect(out[1].count).toBe(2);
  });

  it("prefers the fullest phrasing as the canonical text", () => {
    const out = recurringNotes(["Missed warranty", "Missed the warranty information entirely"]);
    expect(out[0].text).toBe("Missed the warranty information entirely");
  });

  it("ignores blank notes and respects the limit", () => {
    const out = recurringNotes(["", "   ", "a real note"], 1);
    expect(out).toHaveLength(1);
  });
});

// ── Strengths / weaknesses ───────────────────────────────────────────────────

describe("strength split", () => {
  it("measures against the trainee's own average, not a fixed bar", () => {
    // Uniformly strong: nothing should be labelled a weakness.
    const flat = splitStrengths(breakdown(95));
    expect(flat.strengths).toHaveLength(0);
    expect(flat.weaknesses).toHaveLength(0);
  });

  it("surfaces a genuine outlier in an otherwise even profile", () => {
    const b = { ...breakdown(80), time_efficiency: 30 } as Record<ProgressMetric, number>;
    const { weaknesses } = splitStrengths(b);
    expect(weaknesses[0].key).toBe("time_efficiency");
  });

  it("turns weaknesses into concrete coaching lines", () => {
    const b = { ...breakdown(80), documentation_quality: 20 } as Record<ProgressMetric, number>;
    const { weaknesses } = splitStrengths(b);
    const coaching = coachingFor(weaknesses);
    expect(coaching.length).toBeGreaterThan(0);
    expect(coaching[0]).toMatch(/ticket/i);
  });
});

// ── Timeline ─────────────────────────────────────────────────────────────────

describe("timeline", () => {
  it("buckets by week and averages within each", () => {
    const out = buildTimeline([
      { at: "2026-07-06T09:00:00Z", scorePercent: 60 },
      { at: "2026-07-08T09:00:00Z", scorePercent: 80 },
      { at: "2026-07-14T09:00:00Z", scorePercent: 90 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].percent).toBe(70);
    expect(out[0].completed).toBe(2);
    expect(out[1].percent).toBe(90);
  });

  it("omits quiet weeks rather than plotting them as zero", () => {
    const out = buildTimeline([
      { at: "2026-07-06T09:00:00Z", scorePercent: 60 },
      { at: "2026-07-27T09:00:00Z", scorePercent: 90 },
    ]);
    // Three calendar weeks apart, but only two data points exist.
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.completed > 0)).toBe(true);
  });

  it("reads direction across the whole timeline", () => {
    const up = buildTimeline([
      { at: "2026-07-06T09:00:00Z", scorePercent: 60 },
      { at: "2026-07-14T09:00:00Z", scorePercent: 85 },
    ]);
    expect(timelineTrend(up)).toBe(25);
    expect(timelineTrend(up.slice(0, 1))).toBeNull();
  });

  it("ignores unparseable timestamps instead of producing NaN buckets", () => {
    const out = buildTimeline([
      { at: "not-a-date", scorePercent: 50 },
      { at: "2026-07-06T09:00:00Z", scorePercent: 60 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].percent).toBe(60);
  });
});

// ── CSV ──────────────────────────────────────────────────────────────────────

describe("CSV export", () => {
  it("quotes cells containing commas, quotes or newlines", () => {
    const csv = toCsv(["a", "b"], [["plain", 'has, comma'], ['say "hi"', "line\nbreak"]]);
    expect(csv).toContain('"has, comma"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line\nbreak"');
  });

  it("emits one header plus one row per trainee, with every metric column", () => {
    const rows = rankTrainees([row({ internId: "a" }), row({ internId: "b", name: "Bea" })]);
    const lines = leaderboardCsv(rows).split("\r\n");
    expect(lines).toHaveLength(3);
    for (const m of PROGRESS_METRICS) expect(lines[0]).toContain(m.label);
  });

  it("survives a name containing a comma without shifting columns", () => {
    const rows = rankTrainees([row({ name: "Menon, Aria" })]);
    const lines = leaderboardCsv(rows).split("\r\n");
    expect(lines[1]).toContain('"Menon, Aria"');

    // Count fields the way a CSV reader does — a naive split on "," would count
    // the comma *inside* the quoted name and wrongly report a shifted row.
    const fields = (line: string): number => {
      let n = 1;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') i++; // escaped quote
          else inQuotes = !inQuotes;
        } else if (c === "," && !inQuotes) n++;
      }
      return n;
    };
    expect(fields(lines[1])).toBe(fields(lines[0]));
  });
});

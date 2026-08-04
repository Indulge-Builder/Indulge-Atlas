/**
 * Freshdesk ticket workflow — the properties that must not drift.
 *
 * The ticket is what turns Academy from an exercise into a shift on the desk,
 * and the reviewer is what stops a well-worded but empty write-up from closing
 * a request. These pin both.
 */

import { describe, it, expect } from "vitest";
import {
  categoryForVertical,
  deriveTicket,
  elapsedMinutes,
  formatMinutes,
  isTerminalStatus,
  priorityForDifficulty,
  ticketRefFor,
  validateTicketUpdate,
  type TicketUpdateInput,
} from "@/lib/academy/ticket";
import {
  TICKET_HARD_FLOOR,
  TICKET_PASS_THRESHOLD,
  TICKET_REVIEW_DIMENSIONS,
  buildVerdict,
  computeTicketQuality,
  decidePassed,
  parseTicketReviewResponse,
  ticketQualityNormalised,
} from "@/lib/academy/ticketReview";
import type {
  AcademyTicketReviewScores,
  AcademyTicketStatus,
} from "@/lib/types/database";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function ticketScores(value: number): AcademyTicketReviewScores {
  const one = { score: value, justification: "" };
  return {
    completeness: one,
    professionalism: one,
    accuracy: one,
    client_satisfaction: one,
    documentation: one,
  };
}

function update(over: Partial<TicketUpdateInput> = {}): TicketUpdateInput {
  return {
    resolution_summary:
      "Compared pricing across three vendors, confirmed the 24-month warranty and verified delivery lands before the 14th.",
    internal_notes: "Member prefers the local retailer; awaiting payment confirmation.",
    public_reply:
      "All sorted — the piece is reserved with the boutique on Linking Road and will reach you before the 14th.",
    status: "resolved",
    priority: "high",
    tags: ["luxury", "shopping"],
    time_spent_minutes: 18,
    ...over,
  };
}

// ── Derivation ───────────────────────────────────────────────────────────────

describe("ticket derivation", () => {
  it("is stable for a given seed — the ref must never move under the user", () => {
    const a = ticketRefFor("6f1c2b64-1111-4aaa-9999-000000000001");
    const b = ticketRefFor("6f1c2b64-1111-4aaa-9999-000000000001");
    expect(a).toBe(b);
    expect(a).toMatch(/^INDG-\d{6}$/);
  });

  it("gives different seeds different refs", () => {
    const refs = new Set(
      ["seed-a", "seed-b", "seed-c", "seed-d"].map(ticketRefFor),
    );
    expect(refs.size).toBe(4);
  });

  it("triages priority from difficulty", () => {
    expect(priorityForDifficulty("easy")).toBe("low");
    expect(priorityForDifficulty("expert")).toBe("urgent");
    // Unknown tiers must not throw — they fall back to the middle.
    expect(priorityForDifficulty("nonsense")).toBe("medium");
  });

  it("sets a tighter due date for higher-priority work", () => {
    const base = {
      seedId: "s",
      requestTitle: "T",
      clientName: "C",
      assignedTo: "A",
      createdAt: "2026-07-01T00:00:00.000Z",
    };
    const urgent = deriveTicket({ ...base, vertical: "travel", difficulty: "expert" });
    const low = deriveTicket({ ...base, vertical: "travel", difficulty: "easy" });
    expect(new Date(urgent.dueAt).getTime()).toBeLessThan(
      new Date(low.dueAt).getTime(),
    );
  });

  it("reflects the intern's saved status and priority once one exists", () => {
    const t = deriveTicket({
      seedId: "s",
      requestTitle: "T",
      clientName: "C",
      vertical: "watches",
      difficulty: "easy",
      assignedTo: "A",
      createdAt: "2026-07-01T00:00:00.000Z",
      currentStatus: "waiting_on_customer",
      currentPriority: "urgent",
    });
    expect(t.status).toBe("waiting_on_customer");
    expect(t.priority).toBe("urgent");
  });

  it("humanises the vertical into a category", () => {
    expect(categoryForVertical("private_travel")).toBe("Private Travel");
    expect(categoryForVertical("")).toBe("General");
  });
});

describe("time helpers", () => {
  it("measures elapsed minutes, flooring at 1", () => {
    expect(
      elapsedMinutes("2026-07-01T10:00:00Z", "2026-07-01T10:18:00Z"),
    ).toBe(18);
    // Sub-minute conversations still took a minute of someone's life.
    expect(
      elapsedMinutes("2026-07-01T10:00:00Z", "2026-07-01T10:00:10Z"),
    ).toBe(1);
  });

  it("returns null when it cannot be measured", () => {
    expect(elapsedMinutes(null, "2026-07-01T10:00:00Z")).toBeNull();
    expect(
      elapsedMinutes("2026-07-01T10:00:00Z", "2026-06-01T10:00:00Z"),
    ).toBeNull();
  });

  it("formats minutes readably", () => {
    expect(formatMinutes(1)).toBe("1 minute");
    expect(formatMinutes(45)).toBe("45 minutes");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(95)).toBe("1h 35m");
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe("ticket update validation", () => {
  it("accepts a properly written ticket", () => {
    expect(validateTicketUpdate(update())).toEqual([]);
  });

  it("rejects a thin resolution summary", () => {
    expect(validateTicketUpdate(update({ resolution_summary: "done" }))).toHaveLength(1);
  });

  it("rejects empty internal notes — the handover is the point", () => {
    expect(validateTicketUpdate(update({ internal_notes: "" }))).toHaveLength(1);
  });

  it("requires at least one tag", () => {
    expect(validateTicketUpdate(update({ tags: [] }))).toHaveLength(1);
  });

  it("rejects tags outside the vocabulary", () => {
    expect(validateTicketUpdate(update({ tags: ["not-a-tag"] }))).toHaveLength(1);
  });

  it("reports every failing field at once, not just the first", () => {
    const errs = validateTicketUpdate(
      update({ resolution_summary: "", internal_notes: "", tags: [] }),
    );
    expect(errs.length).toBe(3);
  });

  it("no longer requires a public reply — the field was removed", () => {
    // The member already got the answer in the conversation; writing it again
    // for the ticket was duplicate work. An empty value must validate cleanly.
    expect(validateTicketUpdate(update({ public_reply: "" }))).toHaveLength(0);
  });

  it("knows which statuses actually close a request", () => {
    expect(isTerminalStatus("resolved")).toBe(true);
    expect(isTerminalStatus("closed")).toBe(true);
    expect(isTerminalStatus("waiting_on_customer")).toBe(false);
    expect(isTerminalStatus("open")).toBe(false);
  });
});

// ── Scoring ──────────────────────────────────────────────────────────────────

describe("ticket quality", () => {
  it("weights accuracy and documentation above the rest", () => {
    const base = computeTicketQuality(ticketScores(3));
    const betterAccuracy = computeTicketQuality({
      ...ticketScores(3),
      accuracy: { score: 5, justification: "" },
    });
    const betterProfessionalism = computeTicketQuality({
      ...ticketScores(3),
      professionalism: { score: 5, justification: "" },
    });
    expect(betterAccuracy).toBeGreaterThan(base);
    // accuracy carries 1.5 vs professionalism's 1.0
    expect(betterAccuracy).toBeGreaterThan(betterProfessionalism);
  });

  it("normalises 1–5 onto 0..1", () => {
    expect(ticketQualityNormalised(1)).toBe(0);
    expect(ticketQualityNormalised(5)).toBe(1);
    expect(ticketQualityNormalised(3)).toBeCloseTo(0.5, 5);
  });
});

describe("pass decision — the model only ever gets downgraded", () => {
  it("passes a genuinely good ticket in a terminal status", () => {
    const s = ticketScores(4);
    expect(decidePassed(true, s, computeTicketQuality(s), "resolved")).toBe(true);
  });

  it("never passes what the model itself rejected", () => {
    const s = ticketScores(5);
    expect(decidePassed(false, s, computeTicketQuality(s), "resolved")).toBe(false);
  });

  it("refuses to close a ticket parked in a non-terminal status", () => {
    const s = ticketScores(5);
    expect(
      decidePassed(true, s, computeTicketQuality(s), "waiting_on_customer"),
    ).toBe(false);
  });

  it("vetoes a model pass when any dimension is in the floor", () => {
    const s = { ...ticketScores(5), accuracy: { score: TICKET_HARD_FLOOR, justification: "" } };
    expect(decidePassed(true, s, computeTicketQuality(s), "resolved")).toBe(false);
  });

  it("vetoes a model pass below the quality threshold", () => {
    const s = ticketScores(TICKET_PASS_THRESHOLD - 1);
    expect(decidePassed(true, s, computeTicketQuality(s), "resolved")).toBe(false);
  });
});

// ── Parsing ──────────────────────────────────────────────────────────────────

describe("review parsing", () => {
  const good = JSON.stringify({
    scores: Object.fromEntries(
      TICKET_REVIEW_DIMENSIONS.map((d) => [d.key, { score: 4, justification: "fine" }]),
    ),
    passed: true,
    feedback: [],
  });

  it("parses a well-formed review", () => {
    const parsed = parseTicketReviewResponse(good);
    expect(parsed.passed).toBe(true);
    expect(parsed.scores.accuracy.score).toBe(4);
  });

  it("recovers JSON wrapped in prose", () => {
    const parsed = parseTicketReviewResponse(`Sure, here you go:\n${good}\nHope that helps.`);
    expect(parsed.passed).toBe(true);
  });

  it("clamps out-of-range scores rather than trusting them", () => {
    const wild = JSON.stringify({
      scores: Object.fromEntries(
        TICKET_REVIEW_DIMENSIONS.map((d) => [d.key, { score: 99, justification: "" }]),
      ),
      passed: true,
      feedback: [],
    });
    expect(parseTicketReviewResponse(wild).scores.accuracy.score).toBe(5);
  });

  it("throws rather than silently passing a review missing a dimension", () => {
    const missing = JSON.stringify({
      scores: { completeness: { score: 4, justification: "" } },
      passed: true,
      feedback: [],
    });
    expect(() => parseTicketReviewResponse(missing)).toThrow(/ACADEMY_PARSE_ERROR/);
  });

  it("throws on output with no JSON at all", () => {
    expect(() => parseTicketReviewResponse("I cannot help with that.")).toThrow(
      /ACADEMY_PARSE_ERROR/,
    );
  });
});

describe("verdict assembly", () => {
  it("clears feedback when the write-up met the bar", () => {
    const v = buildVerdict(
      { scores: ticketScores(5), passed: true, feedback: ["nitpick"] },
      "resolved",
      "test",
    );
    expect(v.meets_bar).toBe(true);
    expect(v.feedback).toEqual([]);
  });

  it("accepts the ticket on submission regardless of the quality call", () => {
    // One submission per ticket: `passed` records that the request was handed
    // in, `meets_bar` records how well. A weak write-up still completes the
    // request — it just scores badly and comes back with notes.
    const weak = buildVerdict(
      { scores: ticketScores(2), passed: false, feedback: ["thin summary"] },
      "resolved",
      "test",
    );
    expect(weak.passed).toBe(true);
    expect(weak.meets_bar).toBe(false);
    expect(weak.feedback.length).toBeGreaterThan(0);
  });

  it("always explains a sub-bar verdict, so the intern is never left guessing", () => {
    // Model said pass, but the status is not terminal and it returned no notes.
    const v = buildVerdict(
      { scores: ticketScores(5), passed: true, feedback: [] },
      "waiting_on_customer" as AcademyTicketStatus,
      "test",
    );
    expect(v.meets_bar).toBe(false);
    expect(v.feedback.length).toBeGreaterThan(0);
    expect(v.feedback[0]).toMatch(/Resolved or Closed/);
  });

  it("stamps the model version so scoring drift stays detectable", () => {
    const v = buildVerdict(
      { scores: ticketScores(4), passed: true, feedback: [] },
      "resolved",
      "academy-ticket-1@test",
    );
    expect(v.model_version).toBe("academy-ticket-1@test");
    expect(v.quality).toBeGreaterThan(0);
  });
});

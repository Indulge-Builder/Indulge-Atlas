import { describe, it, expect } from "vitest";
import { scoreAttempt } from "@/training/scoring/score";
import { TRAINING_SCHEMA_VERSION } from "@/training/types";
import type { InternAction, Scenario } from "@/training/types";

const MIN = 60_000;

function mkScenario(overrides: Partial<Scenario> = {}): Scenario {
  const base: Scenario = {
    schemaVersion: TRAINING_SCHEMA_VERSION,
    id: "scn_test",
    title: "Test request",
    category: "Travel",
    subcategory: "Ground Transport",
    subcategoryBackfillNeeded: false,
    priority: "medium",
    openingMessage: "Hi, I have a request. Can you help?",
    requestFields: [],
    slaFirstResponseMinutes: 60,
    slaResolutionMinutes: 1440,
    events: [{ offsetMs: 0, kind: "member_opened", label: "opened" }],
    groundTruth: {
      firstResponseOffsetMs: 20 * MIN,
      resolutionOffsetMs: 300 * MIN,
      closedOffsetMs: null,
      escalated: false,
      escalatedOffsetMs: null,
      finalStatus: "resolved",
      expectedPath: ["open", "pending", "resolved"],
    },
    redactionCount: 0,
  };
  return { ...base, ...overrides };
}

function attempt(actions: InternAction[]) {
  return { scenarioId: "scn_test", actions, submittedAt: "2026-07-25T00:00:00.000Z" };
}

describe("perfect run", () => {
  it("scores 100 with no wrong turns", () => {
    const s = mkScenario();
    const r = scoreAttempt(
      s,
      attempt([
        { kind: "reply", atMs: 10 * MIN }, // within 60m SLA
        { kind: "transition", atMs: 30 * MIN, to: "pending" },
        { kind: "resolve", atMs: 200 * MIN },
      ]),
    );
    expect(r.wrongTurns).toHaveLength(0);
    expect(r.ttfr.withinSla).toBe(true);
    expect(r.stage.reachedFinalStatus).toBe(true);
    expect(r.stage.path).toEqual(["open", "pending", "resolved"]);
    expect(r.score).toBe(100);
  });
});

describe("time-to-first-response", () => {
  it("flags a reply outside SLA and reports delta vs the real Genie", () => {
    const s = mkScenario();
    const r = scoreAttempt(
      s,
      attempt([
        { kind: "reply", atMs: 120 * MIN }, // 2× the 60m SLA
        { kind: "transition", atMs: 130 * MIN, to: "pending" },
        { kind: "resolve", atMs: 200 * MIN },
      ]),
    );
    expect(r.ttfr.withinSla).toBe(false);
    expect(r.ttfr.deltaVsRealMs).toBe(120 * MIN - 20 * MIN); // slower than real by 100m
    expect(r.breakdown.responsiveness).toBeLessThan(100);
  });

  it("penalises never responding", () => {
    const s = mkScenario();
    const r = scoreAttempt(s, attempt([{ kind: "transition", atMs: 10 * MIN, to: "pending" }]));
    expect(r.ttfr.internMs).toBeNull();
    expect(r.breakdown.responsiveness).toBe(0);
    expect(r.wrongTurns.map((w) => w.code)).toContain("never_responded");
  });
});

describe("stage legality (concierge state machine)", () => {
  it("marks an illegal transition as a wrong turn and does not advance", () => {
    const s = mkScenario();
    const r = scoreAttempt(
      s,
      attempt([
        { kind: "reply", atMs: 10 * MIN },
        { kind: "transition", atMs: 20 * MIN, to: "closed" }, // open→closed illegal
      ]),
    );
    expect(r.stage.illegalTransitions).toBe(1);
    expect(r.stage.path).toEqual(["open"]); // stayed put
    expect(r.wrongTurns.map((w) => w.code)).toContain("illegal_transition");
    expect(r.wrongTurns.map((w) => w.code)).toContain("never_resolved");
  });

  it("requires resolved→closed to reach a 'closed' final status", () => {
    const s = mkScenario({
      groundTruth: { ...mkScenario().groundTruth, finalStatus: "closed", expectedPath: ["open", "pending", "resolved", "closed"] },
    });
    const good = scoreAttempt(
      s,
      attempt([
        { kind: "reply", atMs: 10 * MIN },
        { kind: "transition", atMs: 20 * MIN, to: "pending" },
        { kind: "transition", atMs: 30 * MIN, to: "resolved" },
        { kind: "transition", atMs: 40 * MIN, to: "closed" },
      ]),
    );
    expect(good.stage.reachedFinalStatus).toBe(true);
    expect(good.stage.path).toEqual(["open", "pending", "resolved", "closed"]);
  });

  it("flags resolving before any first response", () => {
    const s = mkScenario();
    const r = scoreAttempt(s, attempt([{ kind: "resolve", atMs: 30 * MIN }]));
    expect(r.wrongTurns.map((w) => w.code)).toContain("resolved_before_first_response");
  });
});

describe("escalation", () => {
  it("rewards correctly NOT escalating a normal ticket", () => {
    const s = mkScenario();
    const r = scoreAttempt(
      s,
      attempt([
        { kind: "reply", atMs: 10 * MIN },
        { kind: "resolve", atMs: 100 * MIN },
      ]),
    );
    expect(r.escalation.correct).toBe(true);
    expect(r.breakdown.escalation).toBe(100);
  });

  it("flags a missed escalation", () => {
    const s = mkScenario({ groundTruth: { ...mkScenario().groundTruth, escalated: true } });
    const r = scoreAttempt(
      s,
      attempt([
        { kind: "reply", atMs: 10 * MIN },
        { kind: "resolve", atMs: 100 * MIN },
      ]),
    );
    expect(r.escalation.correct).toBe(false);
    expect(r.wrongTurns.map((w) => w.code)).toContain("missed_escalation");
    expect(r.breakdown.escalation).toBe(0);
  });

  it("flags an unnecessary escalation", () => {
    const s = mkScenario(); // escalated: false
    const r = scoreAttempt(
      s,
      attempt([
        { kind: "reply", atMs: 10 * MIN },
        { kind: "escalate", atMs: 40 * MIN },
        { kind: "resolve", atMs: 100 * MIN },
      ]),
    );
    expect(r.escalation.internEscalated).toBe(true);
    expect(r.escalation.correct).toBe(false);
    expect(r.wrongTurns.map((w) => w.code)).toContain("escalated_unnecessarily");
  });
});

import { describe, it, expect } from "vitest";
import {
  DEFAULT_REPLAY_SPEED,
  ReplayClock,
  eventsDueBy,
  formatOffset,
  realMsForOffset,
  scenarioDurationMs,
  scenarioOffsetFromReal,
} from "@/training/replay/clock";
import type { ScenarioEvent } from "@/training/types";

const EVENTS: ScenarioEvent[] = [
  { offsetMs: 0, kind: "member_opened", label: "opened" },
  { offsetMs: 60_000, kind: "agent_first_response", label: "fr" },
  { offsetMs: 3_600_000, kind: "resolved", label: "resolved", status: "resolved" },
];

describe("offset math", () => {
  it("converts real → scenario time by speed", () => {
    expect(scenarioOffsetFromReal(1000, 60)).toBe(60_000); // 1 real s → 60 scenario s
  });

  it("realMsForOffset is the inverse of scenarioOffsetFromReal", () => {
    const speed = 60;
    const offset = scenarioOffsetFromReal(2500, speed);
    expect(realMsForOffset(offset, speed)).toBeCloseTo(2500, 5);
  });

  it("never returns negative offsets", () => {
    expect(scenarioOffsetFromReal(-999, 60)).toBe(0);
  });

  it("guards against non-positive speed", () => {
    expect(realMsForOffset(1000, 0)).toBe(0);
  });
});

describe("eventsDueBy / duration", () => {
  it("returns only events whose offset has been reached, ascending", () => {
    expect(eventsDueBy(EVENTS, 60_000).map((e) => e.kind)).toEqual([
      "member_opened",
      "agent_first_response",
    ]);
  });

  it("duration is the last event offset plus tail", () => {
    expect(scenarioDurationMs(EVENTS, 30_000)).toBe(3_630_000);
  });
});

describe("ReplayClock", () => {
  it("defaults to the standard speed", () => {
    const c = new ReplayClock(0);
    expect(c.speed).toBe(DEFAULT_REPLAY_SPEED);
  });

  it("reports scenario offset from wall elapsed × speed", () => {
    const c = new ReplayClock(1_000, 60);
    // 2 real seconds later → 120 scenario seconds
    expect(c.offsetAt(3_000)).toBe(120_000);
  });

  it("freezes scenario-time while paused", () => {
    const c = new ReplayClock(0, 60);
    c.pause(1_000); // paused at 1 real s → offset 60_000
    expect(c.isPaused).toBe(true);
    const whilePaused = c.offsetAt(5_000); // 4 real s pass, all paused
    expect(whilePaused).toBe(60_000);
    c.resume(5_000);
    expect(c.isPaused).toBe(false);
    // now 1 more real second of play → +60_000
    expect(c.offsetAt(6_000)).toBe(120_000);
  });
});

describe("formatOffset", () => {
  it("formats minutes, hours, and days", () => {
    expect(formatOffset(14 * 60_000)).toBe("14m");
    expect(formatOffset(2 * 3_600_000 + 14 * 60_000)).toBe("2h 14m");
    expect(formatOffset(26 * 3_600_000)).toBe("1d 2h");
  });
});

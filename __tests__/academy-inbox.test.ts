/**
 * Live inbox scheduling.
 *
 * These pin the behaviours that keep the simulation from feeling like a script:
 * events stay spaced out, the person waiting longest gets chased first, the
 * conversation on screen is never interrupted, and nothing chases forever.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_TUNING,
  INBOX_MAX_INTERVAL_MS,
  INBOX_MIN_INTERVAL_MS,
  REMINDER_LINES,
  nextInboxEvent,
  nextTickDelay,
  reminderFor,
  sortInbox,
  type InboxClientState,
} from "@/lib/academy/inbox";

const NOW = 1_000_000;

function client(over: Partial<InboxClientState> = {}): InboxClientState {
  return {
    seedId: "s1",
    status: "not_started",
    lastActivityAt: null,
    unread: 0,
    awaitingReply: false,
    reminderCount: 0,
    surfaced: false,
    ...over,
  };
}

/** A conversation the intern started and then abandoned. */
function stale(seedId: string, agoMs: number, over: Partial<InboxClientState> = {}) {
  return client({
    seedId,
    status: "in_progress",
    awaitingReply: true,
    lastActivityAt: NOW - agoMs,
    ...over,
  });
}

describe("event spacing", () => {
  it("stays quiet inside the minimum gap", () => {
    const event = nextInboxEvent({
      clients: [stale("a", 500_000)],
      now: NOW,
      lastEventAt: NOW - 1_000,
      activeSeedId: null,
      arrivalsSoFar: 0,
    });
    expect(event).toBeNull();
  });

  it("fires once the gap has passed", () => {
    const event = nextInboxEvent({
      clients: [stale("a", 500_000)],
      now: NOW,
      lastEventAt: NOW - DEFAULT_TUNING.minGapMs - 1,
      activeSeedId: null,
      arrivalsSoFar: 0,
    });
    expect(event?.kind).toBe("reminder");
  });

  it("ticks every 2–5 minutes, jittered so it never feels metronomic", () => {
    const floor = nextTickDelay(() => 0);
    const ceiling = nextTickDelay(() => 0.999);

    expect(floor).toBe(INBOX_MIN_INTERVAL_MS);
    expect(floor).toBe(2 * 60_000);
    expect(ceiling).toBeLessThan(INBOX_MAX_INTERVAL_MS);
    expect(INBOX_MAX_INTERVAL_MS).toBe(5 * 60_000);

    // Genuinely spread across the window rather than clustered at one end.
    const samples = Array.from({ length: 200 }, () => nextTickDelay());
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(INBOX_MIN_INTERVAL_MS);
    expect(Math.max(...samples)).toBeLessThan(INBOX_MAX_INTERVAL_MS);
    expect(new Set(samples).size).toBeGreaterThan(50);
  });

  it("every possible delay lands inside the stated 2–5 minute window", () => {
    // Sweep the rng domain rather than sampling, so no edge of the range can
    // drift outside the window a future edit claims in the docs.
    for (let r = 0; r < 1; r += 0.001) {
      const d = nextTickDelay(() => r);
      expect(d).toBeGreaterThanOrEqual(2 * 60_000);
      expect(d).toBeLessThan(5 * 60_000);
    }
  });

  it("allows enough arrivals to stay live across a full sitting", () => {
    // At the 2–5 min cadence the old cap of 12 was exhausted in ~40 minutes and
    // the inbox fell silent. Guard the relationship, not just the number.
    const slowestMs = DEFAULT_TUNING.maxArrivals * INBOX_MAX_INTERVAL_MS;
    const fastestMs = DEFAULT_TUNING.maxArrivals * INBOX_MIN_INTERVAL_MS;
    expect(fastestMs).toBeGreaterThanOrEqual(60 * 60_000);
    expect(slowestMs).toBeGreaterThan(2 * 60 * 60_000);
  });

  it("never lets two events land closer together than the tick floor", () => {
    expect(DEFAULT_TUNING.minGapMs).toBe(INBOX_MIN_INTERVAL_MS);
  });
});

describe("reminders", () => {
  it("chases the person who has waited longest", () => {
    const event = nextInboxEvent({
      clients: [stale("recent", 80_000), stale("ancient", 900_000)],
      now: NOW,
      lastEventAt: null,
      activeSeedId: null,
      arrivalsSoFar: 0,
    });
    expect(event?.seedId).toBe("ancient");
  });

  it("never chases the conversation on screen", () => {
    const event = nextInboxEvent({
      clients: [stale("open-now", 900_000)],
      now: NOW,
      lastEventAt: null,
      activeSeedId: "open-now",
      arrivalsSoFar: 0,
    });
    expect(event?.kind).not.toBe("reminder");
  });

  it("does not chase someone who owes the intern nothing", () => {
    const event = nextInboxEvent({
      clients: [stale("a", 900_000, { awaitingReply: false })],
      now: NOW,
      lastEventAt: null,
      activeSeedId: null,
      arrivalsSoFar: 0,
      tuning: { ...DEFAULT_TUNING, maxArrivals: 0 },
    });
    expect(event).toBeNull();
  });

  it("stops after the reminder cap", () => {
    const event = nextInboxEvent({
      clients: [
        stale("a", 900_000, { reminderCount: DEFAULT_TUNING.maxRemindersPerClient }),
      ],
      now: NOW,
      lastEventAt: null,
      activeSeedId: null,
      arrivalsSoFar: 0,
      tuning: { ...DEFAULT_TUNING, maxArrivals: 0 },
    });
    expect(event).toBeNull();
  });

  it("will not chase a conversation that is still fresh", () => {
    const event = nextInboxEvent({
      clients: [stale("a", 5_000)],
      now: NOW,
      lastEventAt: null,
      activeSeedId: null,
      arrivalsSoFar: 0,
      tuning: { ...DEFAULT_TUNING, maxArrivals: 0 },
    });
    expect(event).toBeNull();
  });

  it("sharpens as it repeats, then holds at the last line", () => {
    expect(reminderFor(0)).toBe(REMINDER_LINES[0]);
    expect(reminderFor(2)).toBe(REMINDER_LINES[2]);
    expect(reminderFor(99)).toBe(REMINDER_LINES[REMINDER_LINES.length - 1]);
  });
});

describe("arrivals", () => {
  it("surfaces an unopened client when nobody needs chasing", () => {
    const event = nextInboxEvent({
      clients: [client({ seedId: "new-one" })],
      now: NOW,
      lastEventAt: null,
      activeSeedId: null,
      arrivalsSoFar: 0,
      rng: () => 0,
    });
    expect(event).toEqual({ kind: "arrival", seedId: "new-one" });
  });

  it("prioritises a chase over a new arrival", () => {
    const event = nextInboxEvent({
      clients: [client({ seedId: "new-one" }), stale("waiting", 900_000)],
      now: NOW,
      lastEventAt: null,
      activeSeedId: null,
      arrivalsSoFar: 0,
    });
    expect(event?.kind).toBe("reminder");
  });

  it("never surfaces the same client twice", () => {
    const event = nextInboxEvent({
      clients: [client({ seedId: "seen", surfaced: true })],
      now: NOW,
      lastEventAt: null,
      activeSeedId: null,
      arrivalsSoFar: 0,
    });
    expect(event).toBeNull();
  });

  it("stops at the arrival cap", () => {
    const event = nextInboxEvent({
      clients: [client({ seedId: "new-one" })],
      now: NOW,
      lastEventAt: null,
      activeSeedId: null,
      arrivalsSoFar: DEFAULT_TUNING.maxArrivals,
    });
    expect(event).toBeNull();
  });
});

describe("sortInbox", () => {
  const rows = [
    { seedId: "a", taskNumber: 1 },
    { seedId: "b", taskNumber: 2 },
    { seedId: "c", taskNumber: 3 },
    { seedId: "d", taskNumber: 4 },
  ];

  it("floats unread to the top and sinks completed to the bottom", () => {
    const state = new Map<string, InboxClientState>([
      ["a", client({ seedId: "a" })],
      ["b", client({ seedId: "b", unread: 2, lastActivityAt: NOW })],
      ["c", client({ seedId: "c", status: "completed", lastActivityAt: NOW + 10 })],
      ["d", client({ seedId: "d", status: "in_progress", lastActivityAt: NOW - 5 })],
    ]);
    const order = sortInbox(rows, state).map((r) => r.seedId);
    expect(order[0]).toBe("b"); // unread wins
    expect(order[order.length - 1]).toBe("c"); // completed sinks despite being newest
  });

  it("orders untouched clients by curriculum position", () => {
    const state = new Map<string, InboxClientState>();
    expect(sortInbox(rows, state).map((r) => r.seedId)).toEqual(["a", "b", "c", "d"]);
  });

  it("puts the most recent activity first among read conversations", () => {
    const state = new Map<string, InboxClientState>([
      ["a", client({ seedId: "a", status: "in_progress", lastActivityAt: NOW - 100 })],
      ["b", client({ seedId: "b", status: "in_progress", lastActivityAt: NOW })],
    ]);
    const order = sortInbox(rows, state).map((r) => r.seedId);
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("a"));
  });
});

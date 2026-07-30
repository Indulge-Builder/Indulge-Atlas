/**
 * Live inbox simulation.
 *
 * The academy should feel like a shift on the concierge floor: requests land
 * while you are mid-conversation, people chase you when you go quiet, and the
 * list reorders under you. This module decides *what happens next* — the timers
 * and rendering live in the shell.
 *
 * ── TWO EVENTS, DELIBERATELY DIFFERENT ───────────────────────────────────────
 * `arrival`  — an unopened client surfaces to the top of the inbox with an
 *              unread badge. Nothing is written: their request genuinely is an
 *              unread message, it was simply always sitting there. Staggering
 *              when it *surfaces* is presentation, not fabrication.
 *
 * `reminder` — a real follow-up in a conversation the intern has started and
 *              left hanging. This one IS persisted as a client turn, because a
 *              member chasing you is part of the transcript and the evaluator
 *              should see it. "Own the follow-up" is one of the standing rules
 *              the register grades against, so a nudge that vanished from the
 *              record would hide the very failure it exists to catch.
 *
 * Pure module: deterministic given a clock and an rng, so the scheduler is
 * testable without waiting on real time.
 */

import type { AcademyRequestStatus } from "@/lib/academy/types";

export type InboxEventKind = "arrival" | "reminder";

export interface InboxClientState {
  seedId: string;
  status: AcademyRequestStatus;
  /** Epoch ms of the last thing that happened here. Null = never touched. */
  lastActivityAt: number | null;
  unread: number;
  /**
   * True when the client spoke last and is waiting on the intern. Only these
   * can be reminded — nudging someone who owes *you* a reply makes no sense.
   */
  awaitingReply: boolean;
  /** Reminders already sent in this conversation. */
  reminderCount: number;
  /** Whether this client has ever surfaced in the inbox. */
  surfaced: boolean;
}

export interface InboxEvent {
  kind: InboxEventKind;
  seedId: string;
  /** Present for reminders — the line the client sends. */
  text?: string;
}

/** Escalating chase lines. Order matters: politeness decays with waiting. */
export const REMINDER_LINES: string[] = [
  "Just checking if you have had a chance to look into this.",
  "Any update on my request?",
  "Let me know if you need any more details from me.",
  "Sorry to chase — I do need an answer on this today.",
  "I have not heard back. Should I be speaking to someone else?",
];

/** The nth reminder in a conversation, clamped to the last (sharpest) line. */
export function reminderFor(reminderCount: number): string {
  const i = Math.min(Math.max(reminderCount, 0), REMINDER_LINES.length - 1);
  return REMINDER_LINES[i];
}

export interface InboxTuning {
  /** A conversation must be quiet this long before anyone chases. */
  staleAfterMs: number;
  /** Never chase the same conversation more than this many times. */
  maxRemindersPerClient: number;
  /** Minimum gap between any two inbox events, so it never feels spammy. */
  minGapMs: number;
  /** Cap on how many clients surface unprompted per session. */
  maxArrivals: number;
}

const MINUTE = 60_000;

/**
 * How often the inbox does anything at all: one event every 2–5 minutes.
 *
 * This is the throttle for the whole simulation. A busy concierge desk does not
 * go quiet for a quarter of an hour, so requests and chases land often enough
 * that the trainee has to actually triage — but never so fast that they cannot
 * finish a thought. The jitter (below) is what stops it reading as a metronome.
 */
export const INBOX_MIN_INTERVAL_MS = 2 * MINUTE;
export const INBOX_MAX_INTERVAL_MS = 5 * MINUTE;

export const DEFAULT_TUNING: InboxTuning = {
  // Long enough that stepping away from a conversation for a moment does not
  // make it chase-worthy — it should feel forgotten, not merely paused.
  staleAfterMs: 6 * MINUTE,
  maxRemindersPerClient: 3,
  // Matches the tick floor, so two events can never land back to back.
  minGapMs: INBOX_MIN_INTERVAL_MS,
  /*
   * Raised with the cadence. At the old 8–15 min tick, 12 arrivals covered ~2
   * hours; at 2–5 min they would be exhausted in ~40 minutes and the inbox
   * would go silent for the rest of the sitting — the opposite of the point.
   * 30 keeps new work landing across a realistic session without ever
   * approaching the 176-client roster.
   */
  maxArrivals: 30,
};

export interface InboxDecisionInput {
  clients: InboxClientState[];
  now: number;
  /** When the last inbox event fired, so events stay spaced out. */
  lastEventAt: number | null;
  /** The conversation on screen — never interrupt what they are reading. */
  activeSeedId: string | null;
  arrivalsSoFar: number;
  tuning?: InboxTuning;
  rng?: () => number;
}

/**
 * The single next thing the inbox should do, or null to stay quiet.
 *
 * Reminders outrank arrivals: an unanswered person chasing you is more
 * important than another request landing, and it is the behaviour that actually
 * trains prioritisation.
 */
export function nextInboxEvent(input: InboxDecisionInput): InboxEvent | null {
  const t = input.tuning ?? DEFAULT_TUNING;
  const rng = input.rng ?? Math.random;

  // Space events out regardless of what is eligible.
  if (input.lastEventAt !== null && input.now - input.lastEventAt < t.minGapMs) {
    return null;
  }

  // 1. Anyone left hanging long enough to chase?
  const stale = input.clients.filter(
    (c) =>
      c.status === "in_progress" &&
      c.awaitingReply &&
      c.seedId !== input.activeSeedId &&
      c.reminderCount < t.maxRemindersPerClient &&
      c.lastActivityAt !== null &&
      input.now - c.lastActivityAt >= t.staleAfterMs,
  );

  if (stale.length > 0) {
    // Longest-ignored first — the person who has waited most deserves the chase.
    stale.sort((a, b) => (a.lastActivityAt ?? 0) - (b.lastActivityAt ?? 0));
    const target = stale[0];
    return {
      kind: "reminder",
      seedId: target.seedId,
      text: reminderFor(target.reminderCount),
    };
  }

  // 2. Otherwise let a new request surface, up to the cap.
  if (input.arrivalsSoFar >= t.maxArrivals) return null;

  const fresh = input.clients.filter(
    (c) => c.status === "not_started" && !c.surfaced && c.seedId !== input.activeSeedId,
  );
  if (fresh.length === 0) return null;

  const pick = fresh[Math.floor(rng() * fresh.length) % fresh.length];
  return { kind: "arrival", seedId: pick.seedId };
}

/**
 * How long to wait before the next check: 2–5 minutes.
 *
 * Jittered across that window so messages never land on a metronome — a
 * perfectly regular inbox reads as a script, which is precisely the feeling
 * this is meant to avoid.
 */
export function nextTickDelay(rng: () => number = Math.random): number {
  const span = INBOX_MAX_INTERVAL_MS - INBOX_MIN_INTERVAL_MS;
  return INBOX_MIN_INTERVAL_MS + Math.floor(rng() * span);
}

/**
 * Sort for the inbox list: unread first, then most recent activity, then
 * curriculum order for everything untouched. Completed conversations sink.
 */
export function sortInbox<T extends { seedId: string; taskNumber: number }>(
  rows: T[],
  state: Map<string, InboxClientState>,
): T[] {
  return [...rows].sort((a, b) => {
    const sa = state.get(a.seedId);
    const sb = state.get(b.seedId);

    const doneA = sa?.status === "completed" ? 1 : 0;
    const doneB = sb?.status === "completed" ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;

    const unreadA = (sa?.unread ?? 0) > 0 ? 1 : 0;
    const unreadB = (sb?.unread ?? 0) > 0 ? 1 : 0;
    if (unreadA !== unreadB) return unreadB - unreadA;

    const atA = sa?.lastActivityAt ?? 0;
    const atB = sb?.lastActivityAt ?? 0;
    if (atA !== atB) return atB - atA;

    return a.taskNumber - b.taskNumber;
  });
}

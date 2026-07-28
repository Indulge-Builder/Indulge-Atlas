/**
 * Scoring engine — compares the intern's path to what the real Genie did.
 *
 * Reads only serialisable inputs (a Scenario + an InternAttempt) and returns an
 * AttemptReport. Pure + deterministic, so it runs identically on the server (for
 * a stored report) or the client (for instant feedback). Reuses the concierge
 * state machine for transition legality — the single source of truth for "wrong
 * turns".
 *
 * NOT a "use server" module.
 */
import { isTransitionAllowed } from "@/lib/concierge/ticketStateMachine";
import { OVERDUE_THRESHOLD_MINUTES } from "@/lib/concierge/slaClock";
import type { ConciergeTicketStatus } from "@/lib/types/database";
import type {
  AttemptReport,
  InternAction,
  InternAttempt,
  Scenario,
  WrongTurn,
} from "@/training/types";

const MIN_MS = 60_000;

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));

/** Normalise the intern's actions into typed streams, all sorted by atMs. */
function partition(actions: InternAction[]) {
  const byTime = [...actions].sort((a, b) => a.atMs - b.atMs);
  const replies = byTime.filter((a) => a.kind === "reply");
  const escalations = byTime.filter((a) => a.kind === "escalate");
  // "resolve" is sugar for a transition to resolved
  const transitions = byTime
    .filter((a): a is Extract<InternAction, { kind: "transition" | "resolve" }> =>
      a.kind === "transition" || a.kind === "resolve",
    )
    .map((a) => ({ atMs: a.atMs, to: (a.kind === "resolve" ? "resolved" : a.to) as ConciergeTicketStatus }));
  return { replies, escalations, transitions };
}

export function scoreAttempt(scenario: Scenario, attempt: InternAttempt): AttemptReport {
  const { replies, escalations, transitions } = partition(attempt.actions);
  const wrongTurns: WrongTurn[] = [];

  // ── Time-to-first-response ───────────────────────────────────────────────────
  const internFirstReplyMs = replies.length ? replies[0]!.atMs : null;
  const slaTargetMs = scenario.slaFirstResponseMinutes * MIN_MS;
  const realMs = scenario.groundTruth.firstResponseOffsetMs;
  const withinSla = internFirstReplyMs != null && internFirstReplyMs <= slaTargetMs;
  const deltaVsRealMs =
    internFirstReplyMs != null && realMs != null ? internFirstReplyMs - realMs : null;

  let responsiveness: number;
  if (internFirstReplyMs == null) {
    responsiveness = 0;
    wrongTurns.push({ code: "never_responded", atMs: null, detail: "No reply was ever sent to the member." });
  } else if (withinSla) {
    responsiveness = 100;
  } else {
    const ratio = internFirstReplyMs / Math.max(1, slaTargetMs);
    responsiveness = clamp(Math.round(100 - (ratio - 1) * 50)); // 2×SLA→50, 3×→0
  }

  // ── Stage path (walk the concierge state machine) ────────────────────────────
  let state: ConciergeTicketStatus = "open";
  const path: ConciergeTicketStatus[] = ["open"];
  let illegalTransitions = 0;
  let legalTransitions = 0;

  for (const t of transitions) {
    if (t.to === state) continue; // no-op
    if (!isTransitionAllowed(state, t.to)) {
      illegalTransitions += 1;
      wrongTurns.push({
        code: "illegal_transition",
        atMs: t.atMs,
        detail: `Cannot move from ${state} to ${t.to}.`,
      });
      continue; // stay put; illegal moves don't advance the ticket
    }
    // Trainer-relevant gate: never resolve before a first response landed.
    if (t.to === "resolved" && internFirstReplyMs == null) {
      wrongTurns.push({
        code: "resolved_before_first_response",
        atMs: t.atMs,
        detail: "Resolved without ever responding to the member.",
      });
    }
    legalTransitions += 1;
    state = t.to;
    path.push(state);
  }

  const finalStatus = scenario.groundTruth.finalStatus;
  const reachedFinalStatus = state === finalStatus;
  const reachedResolvedOrBetter = state === "resolved" || state === "closed";
  if (!reachedResolvedOrBetter) {
    wrongTurns.push({ code: "never_resolved", atMs: null, detail: "The ticket was never resolved." });
  }

  let stageAccuracy = 100;
  stageAccuracy -= 25 * illegalTransitions;
  if (!reachedFinalStatus) stageAccuracy -= 40;
  stageAccuracy = clamp(stageAccuracy);

  // ── Escalation ───────────────────────────────────────────────────────────────
  const internEscalated = escalations.length > 0;
  const internEscalateMs = internEscalated ? escalations[0]!.atMs : null;
  const shouldEscalate = scenario.groundTruth.escalated;
  const correct = internEscalated === shouldEscalate;

  const overdueRefMs = scenario.groundTruth.escalatedOffsetMs ?? OVERDUE_THRESHOLD_MINUTES * MIN_MS;
  const timingDeltaMs =
    internEscalated && shouldEscalate && internEscalateMs != null ? internEscalateMs - overdueRefMs : null;

  let escalation: number;
  if (!correct) {
    escalation = 0;
    if (shouldEscalate) {
      wrongTurns.push({ code: "missed_escalation", atMs: null, detail: "This ticket needed escalation and wasn't escalated." });
    } else {
      wrongTurns.push({ code: "escalated_unnecessarily", atMs: internEscalateMs, detail: "Escalated a ticket that didn't need it." });
    }
  } else if (shouldEscalate && timingDeltaMs != null) {
    // Escalating late (positive delta) costs; early is fine.
    const lateMin = Math.max(0, timingDeltaMs / MIN_MS);
    escalation = clamp(Math.round(100 - lateMin / 4)); // −25 pts per ~100 min late
  } else {
    escalation = 100; // correctly chose NOT to escalate, or escalated on time
  }

  // ── Clean run ────────────────────────────────────────────────────────────────
  const cleanRun = clamp(100 - 20 * wrongTurns.length);

  const breakdown = { responsiveness, stageAccuracy, escalation, cleanRun };
  const score = clamp(
    Math.round(
      responsiveness * 0.3 + stageAccuracy * 0.3 + escalation * 0.2 + cleanRun * 0.2,
    ),
  );

  return {
    scenarioId: scenario.id,
    ttfr: { internMs: internFirstReplyMs, realMs, slaTargetMs, withinSla, deltaVsRealMs },
    stage: {
      path,
      expectedPath: scenario.groundTruth.expectedPath,
      legalTransitions,
      illegalTransitions,
      reachedFinalStatus,
    },
    escalation: { internEscalated, shouldEscalate, correct, timingDeltaMs },
    wrongTurns,
    score,
    breakdown,
  };
}

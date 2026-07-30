/**
 * Response and resolution timing.
 *
 * Both are measured from what the academy actually recorded — `training_turns`
 * timestamps and the ticket's `submitted_at` — never estimated.
 *
 * ── HOW RESPONSE TIME IS DEFINED (this is the load-bearing decision) ─────────
 * Response time is *how long the client waited*, not "gap since the previous
 * message". When a member sends two messages before anyone replies — which the
 * inbox simulation produces deliberately via reminders — the wait is measured
 * from the FIRST unanswered message. Measuring from the last one would reward a
 * trainee for ignoring someone until they chased, which is exactly the habit
 * the register grades against.
 *
 * A trailing client message with no reply at all is NOT counted. It is an
 * unbounded wait, and folding it in as some arbitrary number would quietly
 * flatter or punish depending on the constant chosen. It is surfaced as
 * `unanswered` instead, so the omission is visible rather than hidden.
 *
 * Pure module — no I/O, fully deterministic, safe on client and server.
 */

export interface TimedTurn {
  role: "client" | "intern";
  created_at: string;
  seq: number;
}

export interface SessionTiming {
  /** Minutes the client waited, per reply. Empty when the intern never replied. */
  responses: number[];
  /** Wait before the very first reply — the one a member notices most. */
  firstResponseMinutes: number | null;
  /** Mean wait across every reply in the session. */
  avgResponseMinutes: number | null;
  /** Client messages left with no reply after them. */
  unanswered: number;
  /** Start of the conversation to the moment it was finally resolved. */
  resolutionMinutes: number | null;
}

function minutesBetween(a: string, b: string): number | null {
  const x = Date.parse(a);
  const y = Date.parse(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || y < x) return null;
  return (y - x) / 60_000;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Fold one session's turns into timings.
 *
 * `resolvedAt` should be the ticket's `submitted_at` once accepted — the moment
 * the request was genuinely finished. Falling back to the session's `ended_at`
 * measures only "stopped talking", which is why the caller passes the ticket
 * timestamp when it has one.
 */
export function sessionTiming(
  turns: TimedTurn[],
  opts: { startedAt: string | null; resolvedAt: string | null },
): SessionTiming {
  const ordered = [...turns].sort((a, b) => a.seq - b.seq);

  const responses: number[] = [];
  // The first client message in the current unanswered run.
  let waitingSince: string | null = null;
  let unanswered = 0;

  for (const t of ordered) {
    if (t.role === "client") {
      if (waitingSince === null) waitingSince = t.created_at;
      continue;
    }
    if (waitingSince !== null) {
      const m = minutesBetween(waitingSince, t.created_at);
      if (m !== null) responses.push(m);
      waitingSince = null;
    }
  }
  if (waitingSince !== null) unanswered = 1;

  const resolutionMinutes =
    opts.startedAt && opts.resolvedAt
      ? minutesBetween(opts.startedAt, opts.resolvedAt)
      : null;

  const avg = mean(responses);
  return {
    responses,
    firstResponseMinutes: responses.length ? round(responses[0]) : null,
    avgResponseMinutes: avg === null ? null : round(avg),
    unanswered,
    resolutionMinutes: resolutionMinutes === null ? null : round(resolutionMinutes),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Aggregation across sessions ──────────────────────────────────────────────

export interface TimingSummary {
  avgResponseMinutes: number | null;
  medianResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  fastestResolutionMinutes: number | null;
  slowestResolutionMinutes: number | null;
  /** Sessions that contributed a resolution time. */
  resolvedCount: number;
  /** Client messages left hanging across all sessions. */
  unanswered: number;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Median is reported alongside the mean on purpose: one abandoned tab left open
 * over lunch drags a mean response time into uselessness, while the median
 * still describes the trainee's normal behaviour.
 */
export function summariseTimings(sessions: SessionTiming[]): TimingSummary {
  const allResponses = sessions.flatMap((s) => s.responses);
  const resolutions = sessions
    .map((s) => s.resolutionMinutes)
    .filter((v): v is number => v !== null);

  const avgR = mean(allResponses);
  const avgRes = mean(resolutions);
  const med = median(allResponses);

  return {
    avgResponseMinutes: avgR === null ? null : round(avgR),
    medianResponseMinutes: med === null ? null : round(med),
    avgResolutionMinutes: avgRes === null ? null : round(avgRes),
    fastestResolutionMinutes: resolutions.length ? round(Math.min(...resolutions)) : null,
    slowestResolutionMinutes: resolutions.length ? round(Math.max(...resolutions)) : null,
    resolvedCount: resolutions.length,
    unanswered: sessions.reduce((n, s) => n + s.unanswered, 0),
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/**
 * What a good reply time looks like, by difficulty tier. A luxury concierge is
 * expected to acknowledge quickly even when the answer takes longer to source.
 */
const EXPECTED_RESPONSE_MINUTES: Record<string, number> = {
  easy: 3,
  medium: 4,
  hard: 5,
  advanced: 5,
  expert: 6,
};

/**
 * Responsiveness as 0..1, gated on quality exactly like time efficiency.
 *
 * The gate is the whole point: replying in eight seconds with "noted" must not
 * outscore a considered three-minute answer. Speed can only amplify a reply
 * that already scored well.
 */
export function responsivenessScore(
  avgResponseMinutes: number | null,
  difficulty: string,
  quality: number,
): number {
  if (avgResponseMinutes === null || avgResponseMinutes <= 0) return 0.6; // unmeasured → neutral
  const expected = EXPECTED_RESPONSE_MINUTES[difficulty] ?? 4;
  const ratio = avgResponseMinutes / expected;
  // At or under target = full marks, decaying to zero at four times the target.
  const raw = ratio <= 1 ? 1 : Math.max(0, 1 - (ratio - 1) / 3);
  return raw * Math.max(0.35, quality);
}

/** Human-friendly duration. Minutes below an hour, then h/m. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Signed delta vs the academy average, for the comparison chips. */
export function compareToAverage(
  value: number | null,
  average: number | null,
): { deltaMinutes: number; faster: boolean } | null {
  if (value === null || average === null) return null;
  const delta = round(value - average);
  if (delta === 0) return null;
  return { deltaMinutes: Math.abs(delta), faster: delta < 0 };
}

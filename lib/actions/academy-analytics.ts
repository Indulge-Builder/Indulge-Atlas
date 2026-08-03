"use server";

/**
 * Academy analytics server actions — the admin dashboard's data layer.
 *
 * Trainer-gated (privileged roles OR department='academy'), service-role reads,
 * and never a per-row query: every figure is assembled from a handful of bulk
 * fetches folded together in memory. With 176 curriculum tasks and a cohort of
 * interns, the N+1 shape would be thousands of round trips per page load.
 *
 * All derivation lives in `lib/academy/analytics.ts` (pure, tested). This module
 * only fetches, authorises and folds.
 */

import { getAuthUser } from "@/lib/auth/getAuthUser";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { isPrivilegedRole } from "@/lib/types/database";
import {
  computeKpis,
  rankTrainees,
  recurringNotes,
  buildTimeline,
  splitStrengths,
  coachingFor,
  timelineTrend,
  type AcademyKpis,
  type TraineeAnalytics,
  type TimelinePoint,
  type RecurringNote,
  type MetricStanding,
} from "@/lib/academy/analytics";
import {
  computeAcademyPerformance,
  scoreRequest,
  scoreRequestMetrics,
  type MetricBreakdown,
  type ProgressMetric,
} from "@/lib/academy/progressScore";
import { ticketQualityNormalised } from "@/lib/academy/ticketReview";
import {
  sessionTiming,
  summariseTimings,
  type SessionTiming,
  type TimedTurn,
} from "@/lib/academy/timing";
import { buildRoster, type RosterClient } from "@/lib/academy/roster";
import type {
  AcademyRubricScores,
  AcademyTicketVerdict,
  TrainingReview,
} from "@/lib/types/database";

type Result<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

const DAY_MS = 86_400_000;

/** Mean of the non-null values, or null when nothing is measurable. */
function avgAcross(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/**
 * Cohort-wide analytics is an admin dashboard, not a trainer surface.
 *
 * Gated here as well as on the page: a server action is a callable endpoint, so
 * a `notFound()` in the route component alone would still leave the data
 * reachable by anyone who invoked the action directly. Trainers review their
 * cohort through the Cohort tab (`getAcademyCohort`), which remains open to
 * them.
 */
async function assertAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { role } = await getAuthUser();
  if (!isPrivilegedRole(role)) {
    return { ok: false, error: "Administrators only" };
  }
  return { ok: true };
}

// ── Shared fold ──────────────────────────────────────────────────────────────

interface RawSession {
  id: string;
  intern_id: string;
  seed_id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
}

/**
 * One pass over the whole academy: every closed session, its review, its ticket
 * and its turn counts, folded per intern.
 *
 * Scored EXACTLY as the intern's own progress bar is — same `scoreRequest`, same
 * ticket gate. A dashboard that ranked people on a different formula from the
 * one they see would be worse than no dashboard.
 */
async function foldAcademy(): Promise<
  | {
      ok: true;
      rows: TraineeAnalytics[];
      ticketsAccepted: number;
      ticketsPending: number;
      totalRequests: number;
    }
  | { ok: false; error: string }
> {
  const db = getServiceSupabaseClient();

  const [seedsRes, sessionsRes, profilesRes] = await Promise.all([
    db
      .from("scenario_seeds")
      .select("id, difficulty, task_number")
      .not("task_number", "is", null)
      .eq("is_active", true),
    db
      .from("training_sessions")
      .select("id, intern_id, seed_id, status, started_at, ended_at")
      .order("started_at", { ascending: true }),
    db.from("profiles").select("id, full_name, email, job_title"),
  ]);

  if (seedsRes.error) return { ok: false, error: seedsRes.error.message };
  if (sessionsRes.error) return { ok: false, error: sessionsRes.error.message };
  if (profilesRes.error) return { ok: false, error: profilesRes.error.message };

  const totalRequests = (seedsRes.data ?? []).length;
  const difficultyBySeed = new Map<string, string>(
    (seedsRes.data ?? []).map((s) => [s.id as string, (s.difficulty as string) ?? "medium"]),
  );

  const sessions = (sessionsRes.data ?? []) as unknown as RawSession[];
  const closedIds = sessions.filter((s) => s.status === "closed").map((s) => s.id);

  const [reviewsRes, turnsRes, ticketsRes] = await Promise.all([
    closedIds.length
      ? db.from("training_reviews").select("session_id, overall, scores").in("session_id", closedIds)
      : Promise.resolve({ data: [], error: null }),
    closedIds.length
      ? db
          .from("training_turns")
          .select("session_id, role, created_at, seq")
          .in("session_id", closedIds)
      : Promise.resolve({ data: [], error: null }),
    closedIds.length
      ? db
          .from("training_ticket_updates")
          .select("session_id, passed, verdict, attempts, submitted_at")
          .in("session_id", closedIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (reviewsRes.error) return { ok: false, error: reviewsRes.error.message };
  if (turnsRes.error) return { ok: false, error: turnsRes.error.message };
  // A missing ticket table degrades to "no tickets accepted" rather than a hard
  // failure, so the dashboard still renders before migration 131 is applied.
  const ticketRows = ticketsRes.error ? [] : (ticketsRes.data ?? []);

  const reviewBySession = new Map<string, { overall: number; scores: AcademyRubricScores }>();
  for (const r of reviewsRes.data ?? []) {
    reviewBySession.set(r.session_id as string, {
      overall: Number(r.overall),
      scores: r.scores as AcademyRubricScores,
    });
  }

  const internTurns = new Map<string, number>();
  const lastTurnAt = new Map<string, string>();
  const turnsBySession = new Map<string, TimedTurn[]>();
  for (const t of turnsRes.data ?? []) {
    const sid = t.session_id as string;
    if (t.role === "intern") internTurns.set(sid, (internTurns.get(sid) ?? 0) + 1);
    const at = t.created_at as string;
    const prev = lastTurnAt.get(sid);
    if (!prev || at > prev) lastTurnAt.set(sid, at);

    const arr = turnsBySession.get(sid) ?? [];
    arr.push({ role: t.role as "client" | "intern", created_at: at, seq: Number(t.seq ?? 0) });
    turnsBySession.set(sid, arr);
  }

  const ticketBySession = new Map<
    string,
    { passed: boolean; quality: number | null; attempts: number; submittedAt: string | null }
  >();
  let ticketsAccepted = 0;
  let ticketsPending = 0;
  for (const t of ticketRows) {
    const verdict = t.verdict as AcademyTicketVerdict | null;
    const passed = t.passed === true;
    ticketBySession.set(t.session_id as string, {
      passed,
      quality: typeof verdict?.quality === "number" ? verdict.quality : null,
      attempts: Number(t.attempts ?? 0),
      submittedAt: (t.submitted_at as string | null) ?? null,
    });
    if (passed) ticketsAccepted += 1;
    else ticketsPending += 1;
  }
  // A closed session with no ticket row at all is also outstanding work.
  ticketsPending += closedIds.filter((id) => !ticketBySession.has(id)).length;

  // Attempts per (intern, seed) — drives the first-attempt metric.
  const attemptsByInternSeed = new Map<string, number>();
  for (const s of sessions) {
    const k = `${s.intern_id}|${s.seed_id}`;
    attemptsByInternSeed.set(k, (attemptsByInternSeed.get(k) ?? 0) + 1);
  }

  interface Acc {
    scored: { score: number; metrics: MetricBreakdown }[];
    completed: number;
    awaiting: number;
    aiScores: number[];
    minutes: number[];
    lastActive: string | null;
    timeline: { at: string; scorePercent: number }[];
    /** Per-session timings, summarised once the fold is done. */
    timings: SessionTiming[];
  }
  const acc = new Map<string, Acc>();
  const priorByIntern = new Map<string, number[]>();

  const touch = (internId: string): Acc => {
    let a = acc.get(internId);
    if (!a) {
      a = {
        scored: [], completed: 0, awaiting: 0, aiScores: [], minutes: [],
        lastActive: null, timeline: [], timings: [],
      };
      acc.set(internId, a);
    }
    return a;
  };

  // Chronological: `consistency` compares each request to the running mean.
  for (const s of sessions) {
    const a = touch(s.intern_id);

    const activity = lastTurnAt.get(s.id) ?? s.ended_at ?? s.started_at;
    if (activity && (!a.lastActive || activity > a.lastActive)) a.lastActive = activity;

    if (s.status !== "closed") continue;
    const review = reviewBySession.get(s.id);
    if (!review) continue;

    const ticket = ticketBySession.get(s.id);

    /*
     * TWO DIFFERENT GATES, DELIBERATELY.
     *
     * Reward — completion, quality, progress — is gated on an ACCEPTED ticket.
     * That is the premise of the ticket workflow and it stays.
     *
     * Observation is not. An evaluator score and a set of reply timings are
     * records of work that genuinely happened; withholding them until the
     * paperwork lands tells a trainer "no data" when five real evaluations
     * exist, which is worse than useless — it reads as a broken dashboard.
     * So AI score and response timing are collected for every scored session,
     * gated or not.
     *
     * `resolvedAt` is still null unless the ticket was accepted, so resolution
     * time counts only genuinely resolved requests while response time counts
     * every reply. `summariseTimings` drops the nulls.
     */
    a.aiScores.push(review.overall);
    const timing = sessionTiming(turnsBySession.get(s.id) ?? [], {
      startedAt: s.started_at,
      resolvedAt: ticket?.passed ? (ticket.submittedAt ?? s.ended_at) : null,
    });
    a.timings.push(timing);

    if (!ticket?.passed) {
      a.awaiting += 1;
      continue; // Earns no progress — exactly as the intern's own bar shows.
    }

    const started = s.started_at ? Date.parse(s.started_at) : NaN;
    const ended = s.ended_at ? Date.parse(s.ended_at) : NaN;
    const durationMinutes =
      Number.isFinite(started) && Number.isFinite(ended) && ended > started
        ? (ended - started) / 60_000
        : null;

    const prior = priorByIntern.get(s.intern_id) ?? [];
    const input = {
      scores: review.scores,
      overall: review.overall,
      difficulty: difficultyBySeed.get(s.seed_id) ?? "medium",
      durationMinutes,
      attempts: attemptsByInternSeed.get(`${s.intern_id}|${s.seed_id}`) ?? 1,
      internTurns: internTurns.get(s.id) ?? 0,
      priorMean: prior.length ? prior.reduce((x, y) => x + y, 0) / prior.length : null,
      ticketQuality: ticketQualityNormalised(ticket.quality ?? 0),
      ticketAttempts: ticket.attempts || 1,
      avgResponseMinutes: timing.avgResponseMinutes,
    };

    const metrics = scoreRequestMetrics(input);
    const score = scoreRequest(input);
    prior.push(score);
    priorByIntern.set(s.intern_id, prior);

    a.scored.push({ score, metrics });
    a.completed += 1;
    // aiScores was already recorded above, before the ticket gate.
    if (durationMinutes !== null) a.minutes.push(durationMinutes);
    if (s.ended_at) a.timeline.push({ at: s.ended_at, scorePercent: Math.round(score * 100) });
  }

  const profileById = new Map(
    (profilesRes.data ?? []).map((p) => [
      p.id as string,
      {
        name: (p.full_name as string) ?? "Unknown",
        email: (p.email as string) ?? "",
        jobTitle: (p.job_title as string | null) ?? null,
      },
    ]),
  );

  const avg = (n: number[]) => (n.length ? n.reduce((a, b) => a + b, 0) / n.length : null);

  const bare = [...acc.entries()].map(([internId, a]) => {
    const perf = computeAcademyPerformance(a.scored, totalRequests);
    const p = profileById.get(internId);

    // Trend: last 3 scored requests vs everything before them.
    let trend: number | null = null;
    if (a.scored.length >= 4) {
      const pcts = a.scored.map((s) => s.score * 100);
      const last3 = pcts.slice(-3);
      const before = pcts.slice(0, -3);
      const x = avg(last3);
      const y = avg(before);
      if (x !== null && y !== null) trend = Math.round((x - y) * 10) / 10;
    }

    return {
      internId,
      name: p?.name ?? "Unknown",
      email: p?.email ?? "",
      jobTitle: p?.jobTitle ?? null,
      timing: summariseTimings(a.timings),
      progressPercent: perf.percent,
      qualityPercent: perf.qualityPercent,
      aiScore: a.aiScores.length ? Math.round((avg(a.aiScores) ?? 0) * 10) / 10 : null,
      requestsCompleted: a.completed,
      awaitingTicket: a.awaiting,
      totalRequests,
      breakdown: perf.breakdown as Record<ProgressMetric, number>,
      avgMinutes: a.minutes.length ? Math.round(avg(a.minutes) ?? 0) : null,
      lastActiveAt: a.lastActive,
      trend,
    };
  });

  return {
    ok: true,
    rows: rankTrainees(bare),
    ticketsAccepted,
    ticketsPending,
    totalRequests,
  };
}

// ── Public actions ───────────────────────────────────────────────────────────

export interface AcademyDashboard {
  kpis: AcademyKpis;
  trainees: TraineeAnalytics[];
}

/** KPI strip + ranked trainee table + leaderboard, in one payload. */
export async function getAcademyDashboard(): Promise<Result<AcademyDashboard>> {
  const gate = await assertAdmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const folded = await foldAcademy();
  if (!folded.ok) return { success: false, error: folded.error };

  const now = Date.now();
  const startOfTodayIst = (() => {
    // IST is UTC+5:30; the academy runs on Indian working hours.
    const shifted = new Date(now + 5.5 * 3600_000);
    const utcMidnight = Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    );
    return utcMidnight - 5.5 * 3600_000;
  })();

  return {
    success: true,
    data: {
      kpis: computeKpis(folded.rows, {
        activeSince: now - 7 * DAY_MS,
        todaySince: startOfTodayIst,
        ticketsAccepted: folded.ticketsAccepted,
        ticketsPending: folded.ticketsPending,
      }),
      trainees: folded.rows,
    },
  };
}

export interface TraineeTaskRow {
  sessionId: string;
  taskNumber: number;
  taskTitle: string;
  clientName: string;
  endedAt: string | null;
  minutes: number | null;
  scorePercent: number | null;
  aiScore: number | null;
  ticketQuality: number | null;
  status: "completed" | "awaiting_ticket" | "in_progress";
}

export interface TraineeProfile {
  trainee: TraineeAnalytics;
  timeline: TimelinePoint[];
  timelineTrend: number | null;
  strengths: MetricStanding[];
  weaknesses: MetricStanding[];
  coaching: string[];
  /** Aggregated evaluator free-text, so recurring themes surface. */
  recurringStrengths: RecurringNote[];
  recurringMisses: RecurringNote[];
  tasks: TraineeTaskRow[];
  /** Cohort baselines, so the profile can show standing without a second call. */
  academyAvgResponseMinutes: number | null;
  academyAvgResolutionMinutes: number | null;
}

/** Everything the individual analysis page renders. */
export async function getTraineeProfile(
  internId: string,
): Promise<Result<TraineeProfile>> {
  const gate = await assertAdmin();
  if (!gate.ok) return { success: false, error: gate.error };

  const folded = await foldAcademy();
  if (!folded.ok) return { success: false, error: folded.error };

  const trainee = folded.rows.find((r) => r.internId === internId);
  if (!trainee) return { success: false, error: "Trainee has no academy activity yet" };

  const db = getServiceSupabaseClient();
  const { data: sessions, error: sErr } = await db
    .from("training_sessions")
    .select("id, seed_id, status, started_at, ended_at")
    .eq("intern_id", internId)
    .order("started_at", { ascending: true });
  if (sErr) return { success: false, error: sErr.message };

  const ids = (sessions ?? []).map((s) => s.id as string);
  const [reviewsRes, ticketsRes, seedsRes] = await Promise.all([
    ids.length
      ? db
          .from("training_reviews")
          .select("session_id, overall, scores, strengths, misses")
          .in("session_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? db.from("training_ticket_updates").select("session_id, passed, verdict").in("session_id", ids)
      : Promise.resolve({ data: [], error: null }),
    db.from("scenario_seeds").select("id, title, task_number"),
  ]);
  // Identity columns only, Premium members only — must match the roster filter
  // in lib/actions/academy.ts or task history would name a different person
  // from the one the trainee actually spoke to.
  const { data: rosterRows } = await db
    .from("clients")
    .select("id, first_name, last_name, avatar_url, membership_type, membership_status")
    .eq("membership_type", "Premium");
  if (reviewsRes.error) return { success: false, error: reviewsRes.error.message };
  if (seedsRes.error) return { success: false, error: seedsRes.error.message };

  const reviewBy = new Map<string, TrainingReview>();
  for (const r of reviewsRes.data ?? []) reviewBy.set(r.session_id as string, r as TrainingReview);

  const ticketBy = new Map<string, { passed: boolean; quality: number | null }>();
  for (const t of ticketsRes.error ? [] : (ticketsRes.data ?? [])) {
    const v = t.verdict as AcademyTicketVerdict | null;
    ticketBy.set(t.session_id as string, {
      passed: t.passed === true,
      quality: typeof v?.quality === "number" ? v.quality : null,
    });
  }

  const seedBy = new Map(
    (seedsRes.data ?? []).map((s) => [
      s.id as string,
      { title: (s.title as string) ?? "Request", taskNumber: (s.task_number as number) ?? 0 },
    ]),
  );

  const roster = buildRoster(
    (rosterRows ?? []) as unknown as RosterClient[],
    [...seedBy.values()].map((s) => s.taskNumber),
  );

  const tasks: TraineeTaskRow[] = (sessions ?? []).map((s) => {
    const sid = s.id as string;
    const seed = seedBy.get(s.seed_id as string);
    const review = reviewBy.get(sid);
    const ticket = ticketBy.get(sid);
    const started = s.started_at ? Date.parse(s.started_at as string) : NaN;
    const ended = s.ended_at ? Date.parse(s.ended_at as string) : NaN;

    return {
      sessionId: sid,
      taskNumber: seed?.taskNumber ?? 0,
      taskTitle: seed?.title ?? "Request",
      clientName: roster.get(seed?.taskNumber ?? 0)?.name ?? "Indulge member",
      endedAt: (s.ended_at as string | null) ?? null,
      minutes:
        Number.isFinite(started) && Number.isFinite(ended) && ended > started
          ? Math.round((ended - started) / 60_000)
          : null,
      // Per-task percentage is the evaluator overall normalised; the weighted
      // request score needs cross-session context and lives on the timeline.
      scorePercent: review ? Math.round(((Number(review.overall) - 1) / 4) * 100) : null,
      aiScore: review ? Number(review.overall) : null,
      ticketQuality: ticket?.quality ?? null,
      status:
        s.status !== "closed"
          ? "in_progress"
          : ticket?.passed
            ? "completed"
            : "awaiting_ticket",
    };
  });

  const timeline = buildTimeline(
    tasks
      .filter((t) => t.status === "completed" && t.endedAt && t.scorePercent !== null)
      .map((t) => ({ at: t.endedAt!, scorePercent: t.scorePercent! })),
  );

  const { strengths, weaknesses } = splitStrengths(trainee.breakdown);
  const allReviews = [...reviewBy.values()];

  return {
    success: true,
    data: {
      trainee,
      timeline,
      timelineTrend: timelineTrend(timeline),
      strengths,
      weaknesses,
      coaching: coachingFor(weaknesses),
      recurringStrengths: recurringNotes(allReviews.flatMap((r) => r.strengths ?? [])),
      recurringMisses: recurringNotes(allReviews.flatMap((r) => r.misses ?? [])),
      tasks: tasks.sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? "")),
      academyAvgResponseMinutes: avgAcross(
        folded.rows.map((r) => r.timing.avgResponseMinutes),
      ),
      academyAvgResolutionMinutes: avgAcross(
        folded.rows.map((r) => r.timing.avgResolutionMinutes),
      ),
    },
  };
}

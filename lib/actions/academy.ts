"use server";

/**
 * Academy server actions — the component-facing data layer.
 *
 * Pattern: getAuthUser() first → authorize → mutate (service role) → revalidate
 * → return { success, ... }. Interns never read scenario_seeds; secret fields
 * stay server-side. Trainer-only actions gate on isAcademyTrainer(role, dept).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { isAcademyTrainer, ACADEMY_TICKET_TAGS } from "@/lib/types/database";
import { sanitizeText } from "@/lib/utils/sanitize";
import { randomizeSession, buildSessionVars, renderTemplate } from "@/lib/academy/randomize";
import { ACADEMY_PERSONA_MODEL, ACADEMY_TURN_CAP } from "@/lib/academy/models";
import { DEFAULT_RUBRIC_WEIGHTS, ACADEMY_DIMENSIONS } from "@/lib/academy/rubric";
import { scanSeedForPII } from "@/lib/academy/pii";
import {
  computeAcademyPerformance,
  scoreRequest,
  scoreRequestMetrics,
  type MetricBreakdown,
} from "@/lib/academy/progressScore";
import { runAcademyEvaluation } from "@/lib/services/academyEvaluator";
import { runAcademyTicketReview } from "@/lib/services/academyTicketReview";
import { deriveTicket, validateTicketUpdate } from "@/lib/academy/ticket";
import { ticketQualityNormalised } from "@/lib/academy/ticketReview";
import { sessionTiming, type TimedTurn } from "@/lib/academy/timing";
import {
  buildRoster,
  memberFor,
  orderRoster,
  type AcademyMember,
  type RosterClient,
} from "@/lib/academy/roster";

/** Identity fields only — contact details are deliberately never selected. */
const ROSTER_COLUMNS =
  "id, first_name, last_name, avatar_url, membership_type, membership_status";

/**
 * Only Premium members populate the academy roster.
 *
 * 288 of the 460 records qualify — comfortably more than the 176 curriculum
 * tasks, so every task still gets a distinct member. Trial and Standard tiers
 * are excluded deliberately: the training register is written around the
 * expectations of the Premium membership, so practising against anyone else
 * teaches the wrong service bar.
 */
const ROSTER_MEMBERSHIP = "Premium";

/**
 * The real membership, ordered for deterministic task assignment.
 *
 * Returns an empty array on any failure so the academy degrades to its
 * synthetic roster instead of failing to render.
 */
async function loadRosterClients(): Promise<RosterClient[]> {
  const db = getServiceSupabaseClient();
  const { data, error } = await db
    .from("clients")
    .select(ROSTER_COLUMNS)
    .eq("membership_type", ROSTER_MEMBERSHIP);
  if (error || !data) return [];
  return orderRoster(data as unknown as RosterClient[]);
}
import {
  ACADEMY_TOTAL_GROUPS,
  canAccessTask,
  dayForTask,
  groupTitle,
  overallProgress,
  percentComplete,
  resolveLadder,
  taskStatus,
  tierForGroup,
} from "@/lib/academy/curriculum";
import type {
  AcademyDaySection,
  AcademyGroupDetail,
  AcademyGroupRow,
  AcademyLadder,
  AcademySessionDetail,
  AcademyClientList,
  AcademyClientOverview,
  AcademyClientRow,
  AcademyClientThread,
  AcademyRequestStatus,
  AcademySessionProgress,
  AcademyTaskCard,
  AcademyTicketState,
  CohortInternRow,
  InternSessionRow,
} from "@/lib/academy/types";
import type {
  AcademyRubricScores,
  AcademyScenarioCard,
  AcademySessionVars,
  AcademyTicketVerdict,
  ScenarioSeed,
  TrainingAttachment,
  TrainingReview,
  TrainingSession,
  TrainingTicketUpdate,
  TrainingTurn,
} from "@/lib/types/database";

type Result<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string; piiIssues?: string[] };

// ── Scenario listing (interns + trainers) ─────────────────────────────────────

/** Safe scenario cards for the picker — no secrets ever leave the server. */
export async function listAcademyScenarios(): Promise<
  Result<AcademyScenarioCard[]>
> {
  await getAuthUser(); // any authenticated user may train
  const db = getServiceSupabaseClient();
  const { data, error } = await db
    .from("scenario_seeds")
    .select("id, title, archetype, vertical, difficulty")
    .eq("is_active", true)
    // Free practice means the standalone hand-written scenarios only. Without
    // this the tab also listed all 176 curriculum tasks, duplicating the client
    // list and burying the 24 seeds it exists to surface.
    .is("task_number", null)
    .order("vertical", { ascending: true })
    .order("title", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as AcademyScenarioCard[] };
}

// ── Sessions ──────────────────────────────────────────────────────────────────

/**
 * Refuse a curriculum task whose day is still shut.
 *
 * The sidebar already hides locked days, but hiding a control is not a
 * permission: the Clients tab lists all 176 requests and knows nothing about
 * days, and a session id can be typed into the URL. Without this, a trainee can
 * complete a Day 3 request while Day 1 is unfinished — which is exactly how a
 * stray completion appeared inside a locked day.
 *
 * Only tasks that are part of the four-day programme are gated. A task outside
 * it has no day, so it is archive/free practice and stays open — `canAccessTask`
 * answers "may this be opened as curriculum", which is not the same question.
 *
 * Returns an error string to surface, or null when the task may be opened.
 */
async function lockedDayRefusal(
  internId: string,
  taskNumber: number | null,
): Promise<string | null> {
  if (taskNumber === null || dayForTask(taskNumber) === null) return null;

  const db = getServiceSupabaseClient();
  const [seedsRes, bySeed] = await Promise.all([
    db
      .from("scenario_seeds")
      .select("id, task_number")
      .not("task_number", "is", null),
    loadSeedStatus(internId),
  ]);

  const taskNumberBySeed = new Map<string, number>(
    (seedsRes.data ?? []).map((s) => [s.id as string, s.task_number as number]),
  );

  const completed: number[] = [];
  for (const [seedId, state] of bySeed) {
    if (state.status !== "completed") continue;
    const n = taskNumberBySeed.get(seedId);
    if (n !== undefined) completed.push(n);
  }

  if (canAccessTask(taskNumber, completed)) return null;

  const day = dayForTask(taskNumber);
  return `Day ${day} is locked — finish Day ${(day ?? 2) - 1} first.`;
}

export async function startAcademySession(
  seedId: string,
): Promise<Result<{ sessionId: string; openingMessage: string }>> {
  const parsed = z.string().uuid().safeParse(seedId);
  if (!parsed.success) return { success: false, error: "Invalid scenario id" };

  const { user } = await getAuthUser();
  const db = getServiceSupabaseClient();

  const { data: seed, error: seedErr } = await db
    .from("scenario_seeds")
    .select("*")
    .eq("id", parsed.data)
    .eq("is_active", true)
    .maybeSingle();
  if (seedErr || !seed) {
    return { success: false, error: "Scenario not found or inactive" };
  }

  const typedSeed = seed as ScenarioSeed;
  // One client owns one request, so the person in the chat is the client the
  // row is named after. Free-practice seeds have no task number and keep the
  // randomised pool name.
  const taskNumber = (seed as { task_number?: number | null }).task_number ?? null;
  // The persona must open as the real member the row is named after, or the
  // transcript and the roster would disagree about who is in the room.
  // Gate before any row is written — a locked day must not leave a session behind.
  const refusal = await lockedDayRefusal(user.id, taskNumber);
  if (refusal) return { success: false, error: refusal };

  const rosterName = taskNumber
    ? memberFor(await loadRosterClients(), taskNumber).name
    : undefined;
  const rand = randomizeSession(typedSeed, Math.random, rosterName);
  const sessionVars = buildSessionVars(typedSeed, rand);

  const { data: session, error: insErr } = await db
    .from("training_sessions")
    .insert({
      intern_id: user.id,
      seed_id: typedSeed.id,
      status: "open",
      session_vars: sessionVars,
      model_version: ACADEMY_PERSONA_MODEL,
    })
    .select("id")
    .single();
  if (insErr || !session) {
    return { success: false, error: insErr?.message ?? "Could not start session" };
  }

  // Seed the transcript with the client's rendered opening message (seq 1).
  const { error: turnErr } = await db.from("training_turns").insert({
    session_id: session.id,
    role: "client",
    body: rand.openingMessage,
    seq: 1,
  });
  if (turnErr) return { success: false, error: turnErr.message };

  // The opening goes back with the id so a caller showing a preview can adopt
  // the real, randomised line without a second round trip.
  return {
    success: true,
    data: { sessionId: session.id as string, openingMessage: rand.openingMessage },
  };
}

/**
 * A member chasing an unanswered conversation.
 *
 * This is a REAL turn, not a UI flourish: "own the follow-up" is one of the
 * standards the register grades against, so a nudge that vanished from the
 * transcript would hide the exact failure it exists to expose.
 *
 * Refuses when the intern already replied last — chasing someone who owes you
 * nothing is noise — and when the session is closed or at the turn cap.
 */
export async function sendClientReminder(
  sessionId: string,
  text: string,
): Promise<Result<{ body: string; createdAt: string }>> {
  const parsed = z
    .object({ sessionId: z.string().uuid(), text: z.string().min(1).max(400) })
    .safeParse({ sessionId, text });
  if (!parsed.success) return { success: false, error: "Invalid reminder" };

  const { user } = await getAuthUser();
  const db = getServiceSupabaseClient();

  const { data: session } = await db
    .from("training_sessions")
    .select("id, intern_id, status")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();

  // Only the owning intern's own inbox may generate these.
  if (!session || session.intern_id !== user.id) {
    return { success: false, error: "Session not found" };
  }
  if (session.status !== "open") {
    return { success: false, error: "Session is closed" };
  }

  const { data: turnRows } = await db
    .from("training_turns")
    .select("role, seq")
    .eq("session_id", parsed.data.sessionId)
    .order("seq", { ascending: true });

  const turns = turnRows ?? [];
  if (turns.length === 0) return { success: false, error: "Nothing to follow up" };

  // The client only chases when the ball is in the intern's court.
  if (turns[turns.length - 1].role !== "client") {
    return { success: false, error: "Intern has not been left waiting" };
  }
  if (turns.filter((t) => t.role === "intern").length >= ACADEMY_TURN_CAP) {
    return { success: false, error: "Turn cap reached" };
  }

  const body = sanitizeText(parsed.data.text).trim();
  const createdAt = new Date().toISOString();
  const { error } = await db.from("training_turns").insert({
    session_id: parsed.data.sessionId,
    role: "client",
    body,
    seq: (turns[turns.length - 1].seq as number) + 1,
  });
  if (error) return { success: false, error: error.message };

  return { success: true, data: { body, createdAt } };
}

async function assertCanAccessSession(
  sessionId: string,
): Promise<
  | { ok: true; session: Pick<TrainingSession, "id" | "intern_id" | "status"> }
  | { ok: false; error: string }
> {
  const { user, role, department } = await getAuthUser();
  const db = getServiceSupabaseClient();
  const { data, error } = await db
    .from("training_sessions")
    .select("id, intern_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Session not found" };
  const owns = data.intern_id === user.id;
  if (!owns && !isAcademyTrainer(role, department)) {
    return { ok: false, error: "Not authorized for this session" };
  }
  return {
    ok: true,
    session: data as Pick<TrainingSession, "id" | "intern_id" | "status">,
  };
}

export async function endAcademySession(
  sessionId: string,
): Promise<Result<{ reviewError?: string }>> {
  const parsed = z.string().uuid().safeParse(sessionId);
  if (!parsed.success) return { success: false, error: "Invalid session id" };

  const access = await assertCanAccessSession(parsed.data);
  if (!access.ok) return { success: false, error: access.error };

  const db = getServiceSupabaseClient();
  if (access.session.status !== "closed") {
    const { error: updErr } = await db
      .from("training_sessions")
      .update({ status: "closed", ended_at: new Date().toISOString() })
      .eq("id", parsed.data);
    if (updErr) return { success: false, error: updErr.message };
  }

  const evalResult = await runAcademyEvaluation(parsed.data);

  revalidatePath(`/academy/session/${parsed.data}`);
  revalidatePath("/academy");
  return {
    success: true,
    data: { reviewError: evalResult.success ? undefined : evalResult.error },
  };
}

/** Re-run the evaluator when the first pass failed (e.g. transient API error). */
export async function retryAcademyEvaluation(
  sessionId: string,
): Promise<Result> {
  const parsed = z.string().uuid().safeParse(sessionId);
  if (!parsed.success) return { success: false, error: "Invalid session id" };
  const access = await assertCanAccessSession(parsed.data);
  if (!access.ok) return { success: false, error: access.error };

  const evalResult = await runAcademyEvaluation(parsed.data);
  if (!evalResult.success) {
    return { success: false, error: evalResult.error ?? "Evaluation failed" };
  }
  revalidatePath(`/academy/session/${parsed.data}`);
  revalidatePath("/academy");
  return { success: true };
}

// ── Freshdesk ticket workflow ────────────────────────────────────────────────
//
// Closing the conversation scores the transcript; it does not finish the
// request. The intern then writes the ticket, a reviewer judges it, and only an
// accepted ticket earns progress. See migration 131 for the mutability rules.

const ticketUpdateSchema = z.object({
  resolution_summary: z.string().max(4000),
  internal_notes: z.string().max(4000),
  public_reply: z.string().max(4000),
  status: z.enum([
    "open",
    "pending",
    "waiting_on_customer",
    "resolved",
    "closed",
  ]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  tags: z.array(z.enum(ACADEMY_TICKET_TAGS)).max(ACADEMY_TICKET_TAGS.length),
  // A 16-hour ceiling: anything beyond that is a typo, not a concierge request.
  time_spent_minutes: z.number().int().min(0).max(960),
});

/** Read the ticket row for a session, if the intern has started one. */
async function readTicketUpdate(
  sessionId: string,
): Promise<TrainingTicketUpdate | null> {
  const db = getServiceSupabaseClient();
  const { data } = await db
    .from("training_ticket_updates")
    .select(
      "id, session_id, resolution_summary, internal_notes, public_reply, status, priority, tags, time_spent_minutes, verdict, passed, attempts, submitted_at, created_at, updated_at",
    )
    .eq("session_id", sessionId)
    .maybeSingle();
  return (data as TrainingTicketUpdate | null) ?? null;
}

/**
 * Save the intern's ticket without submitting it for review.
 *
 * Free to call as often as the form autosaves — it never touches `verdict`,
 * `passed` or `attempts`, which is exactly what the migration-131 trigger
 * enforces at the database level too.
 */
export async function saveTicketDraft(
  sessionId: string,
  input: unknown,
): Promise<Result> {
  const id = z.string().uuid().safeParse(sessionId);
  if (!id.success) return { success: false, error: "Invalid session id" };

  const parsed = ticketUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid ticket update" };

  const access = await assertCanAccessSession(id.data);
  if (!access.ok) return { success: false, error: access.error };

  const { user } = await getAuthUser();
  if (access.session.intern_id !== user.id) {
    return { success: false, error: "Only the assigned agent can edit this ticket" };
  }

  const existing = await readTicketUpdate(id.data);
  if (existing?.passed) {
    return { success: false, error: "This ticket has been accepted and is locked" };
  }

  const row = {
    session_id: id.data,
    resolution_summary: sanitizeText(parsed.data.resolution_summary),
    internal_notes: sanitizeText(parsed.data.internal_notes),
    public_reply: sanitizeText(parsed.data.public_reply),
    status: parsed.data.status,
    priority: parsed.data.priority,
    tags: parsed.data.tags,
    time_spent_minutes: parsed.data.time_spent_minutes,
  };

  const db = getServiceSupabaseClient();
  const { error } = await db
    .from("training_ticket_updates")
    .upsert(row, { onConflict: "session_id" });
  if (error) return { success: false, error: error.message };

  return { success: true };
}

/**
 * Submit the ticket for AI review.
 *
 * Structural checks run first so an obviously incomplete ticket never costs an
 * API call. The verdict is authoritative: a pass closes the request out and
 * unlocks the progress it earns, a fail comes back with concrete fixes and the
 * intern revises in place.
 */
export async function submitTicketUpdate(
  sessionId: string,
  input: unknown,
): Promise<Result<{ verdict: AcademyTicketVerdict }>> {
  const id = z.string().uuid().safeParse(sessionId);
  if (!id.success) return { success: false, error: "Invalid session id" };

  const parsed = ticketUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid ticket update" };

  const access = await assertCanAccessSession(id.data);
  if (!access.ok) return { success: false, error: access.error };

  const { user } = await getAuthUser();
  if (access.session.intern_id !== user.id) {
    return { success: false, error: "Only the assigned agent can submit this ticket" };
  }
  if (access.session.status !== "closed") {
    return {
      success: false,
      error: "Close the conversation before updating the ticket",
    };
  }

  const existing = await readTicketUpdate(id.data);
  if (existing?.passed) {
    return { success: false, error: "This ticket has already been accepted" };
  }

  const clean = {
    resolution_summary: sanitizeText(parsed.data.resolution_summary),
    internal_notes: sanitizeText(parsed.data.internal_notes),
    public_reply: sanitizeText(parsed.data.public_reply),
    status: parsed.data.status,
    priority: parsed.data.priority,
    tags: parsed.data.tags,
    time_spent_minutes: parsed.data.time_spent_minutes,
  };

  const structural = validateTicketUpdate(clean);
  if (structural.length > 0) {
    return { success: false, error: structural.join(" ") };
  }

  const db = getServiceSupabaseClient();
  const { error: upErr } = await db.from("training_ticket_updates").upsert(
    {
      session_id: id.data,
      ...clean,
      attempts: (existing?.attempts ?? 0) + 1,
    },
    { onConflict: "session_id" },
  );
  if (upErr) return { success: false, error: upErr.message };

  const review = await runAcademyTicketReview(id.data, clean);
  if (!review.success || !review.verdict) {
    return { success: false, error: review.error ?? "Ticket review failed" };
  }

  revalidatePath(`/academy/session/${id.data}`);
  revalidatePath("/academy");
  return { success: true, data: { verdict: review.verdict } };
}

/** The signed-in intern's own sessions, newest first (with score if reviewed). */
export async function getMyAcademySessions(): Promise<Result<InternSessionRow[]>> {
  const { user } = await getAuthUser();
  const db = getServiceSupabaseClient();

  const { data: sessions, error } = await db
    .from("training_sessions")
    .select("id, session_vars, status, started_at, ended_at")
    .eq("intern_id", user.id)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) return { success: false, error: error.message };

  const rows = sessions ?? [];
  if (rows.length === 0) return { success: true, data: [] };

  // One extra fetch for all reviews — never a per-row call.
  const { data: reviews } = await db
    .from("training_reviews")
    .select("session_id, overall")
    .in(
      "session_id",
      rows.map((s) => s.id as string),
    );
  const overallBySession = new Map<string, number>();
  for (const r of reviews ?? []) {
    overallBySession.set(r.session_id as string, Number(r.overall));
  }

  return {
    success: true,
    data: rows.map((s) => {
      const vars = s.session_vars as AcademySessionVars | null;
      return {
        id: s.id as string,
        title: vars?.display?.title ?? "Training session",
        vertical: vars?.display?.vertical ?? "—",
        difficulty: vars?.display?.difficulty ?? "medium",
        status: s.status as "open" | "closed",
        startedAt: s.started_at as string,
        endedAt: (s.ended_at as string | null) ?? null,
        overall: overallBySession.get(s.id as string) ?? null,
      };
    }),
  };
}

/** Everything the session page needs. Owner or trainer only. */
export async function getAcademySessionDetail(
  sessionId: string,
): Promise<Result<AcademySessionDetail>> {
  const parsed = z.string().uuid().safeParse(sessionId);
  if (!parsed.success) return { success: false, error: "Invalid session id" };

  const { user, role, department } = await getAuthUser();
  const db = getServiceSupabaseClient();

  const { data: session, error } = await db
    .from("training_sessions")
    .select("id, intern_id, seed_id, status, session_vars, model_version, started_at, ended_at")
    .eq("id", parsed.data)
    .maybeSingle();
  if (error || !session) return { success: false, error: "Session not found" };

  const owns = session.intern_id === user.id;
  const trainer = isAcademyTrainer(role, department);
  if (!owns && !trainer) {
    return { success: false, error: "Not authorized for this session" };
  }

  // `attachments` only exists once migration 127 is applied. Select it when we
  // can, but fall back to the pre-127 column list rather than failing the whole
  // session view — text-only drills must keep working on an older schema.
  const TURN_COLUMNS_WITH_MEDIA =
    "id, session_id, role, body, seq, created_at, attachments";
  const TURN_COLUMNS_BASE = "id, session_id, role, body, seq, created_at";

  const fetchTurns = async () => {
    const withMedia = await db
      .from("training_turns")
      .select(TURN_COLUMNS_WITH_MEDIA)
      .eq("session_id", parsed.data)
      .order("seq", { ascending: true });
    if (!withMedia.error) return withMedia;

    const missingColumn =
      withMedia.error.code === "PGRST204" ||
      withMedia.error.code === "42703" ||
      /attachments/i.test(withMedia.error.message ?? "");
    if (!missingColumn) return withMedia;

    console.error(
      "[academy] `training_turns.attachments` is missing — apply migration 127 " +
        "(supabase/manual/academy_part5_attachments.sql). Rendering without media.",
    );
    return db
      .from("training_turns")
      .select(TURN_COLUMNS_BASE)
      .eq("session_id", parsed.data)
      .order("seq", { ascending: true });
  };

  const [turnsRes, reviewRes, profileRes] = await Promise.all([
    fetchTurns(),
    db
      .from("training_reviews")
      .select("*")
      .eq("session_id", parsed.data)
      .maybeSingle(),
    db
      .from("profiles")
      .select("full_name")
      .eq("id", session.intern_id)
      .maybeSingle(),
  ]);

  if (turnsRes.error) return { success: false, error: turnsRes.error.message };

  // Hydrate signed URLs for any shared media. The bucket is private, so a bare
  // path is unrenderable — mint short-lived URLs here in one batched call
  // rather than per-bubble from the client.
  const turns = (turnsRes.data ?? []) as TrainingTurn[];
  const mediaPaths = turns.flatMap((t) => (t.attachments ?? []).map((a) => a.path));
  if (mediaPaths.length > 0) {
    const { data: signed } = await db.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrls(mediaPaths, SIGNED_URL_TTL_SECONDS);
    const urlByPath = new Map<string, string>();
    for (const row of signed ?? []) {
      if (row.path && row.signedUrl) urlByPath.set(row.path, row.signedUrl);
    }
    for (const t of turns) {
      if (!t.attachments?.length) continue;
      t.attachments = t.attachments.map((a) => ({
        ...a,
        signedUrl: urlByPath.get(a.path),
      }));
    }
  }

  const vars = session.session_vars as AcademySessionVars | null;
  const review = (reviewRes.data as TrainingReview | null) ?? null;

  return {
    success: true,
    data: {
      session: session as unknown as TrainingSession,
      display: vars?.display ?? {
        id: session.seed_id as string,
        title: "Training session",
        archetype: "—",
        vertical: "Global",
        difficulty: "medium",
      },
      turns,
      review,
      readOnly: !owns,
      internName: (profileRes.data?.full_name as string) ?? "Intern",
      progress: await buildSessionProgress({
        seedId: session.seed_id as string,
        internId: session.intern_id as string,
        sessionStatus: session.status as "open" | "closed",
        review,
      }),
    },
  };
}

/**
 * Progress context for the header above the chat.
 *
 * `nextHint` is derived, not generated — it has to be instant and it has to be
 * one short line. The most useful thing to say changes with state: mid-drill it
 * is the turn budget, after scoring it is the single biggest miss, and between
 * drills it is what is left in this member's queue.
 */
async function buildSessionProgress(params: {
  seedId: string;
  internId: string;
  sessionStatus: "open" | "closed";
  review: TrainingReview | null;
}): Promise<AcademySessionProgress> {
  const db = getServiceSupabaseClient();

  const { data: seed } = await db
    .from("scenario_seeds")
    .select("group_number")
    .eq("id", params.seedId)
    .maybeSingle();

  const groupNumber = (seed?.group_number as number | null) ?? null;

  // Free practice sits outside the ladder — no group, no academy-wide totals.
  if (!groupNumber) {
    return {
      groupNumber: null,
      groupTitle: null,
      groupCompleted: 0,
      groupTotal: 0,
      groupPercent: 0,
      overallCompleted: 0,
      overallTotal: 0,
      overallPercent: 0,
      nextHint: params.review
        ? `Scored ${params.review.overall}/5 — read the rewritten reply below.`
        : "Free practice — this one is not part of the ladder.",
    };
  }

  const [seedsRes, sessionsRes] = await Promise.all([
    db
      .from("scenario_seeds")
      .select("id, group_number, task_number, title")
      .not("group_number", "is", null)
      .eq("is_active", true),
    db
      .from("training_sessions")
      .select("id, seed_id, status")
      .eq("intern_id", params.internId),
  ]);

  const sessions = sessionsRes.data ?? [];
  const closedIds = sessions.filter((s) => s.status === "closed").map((s) => s.id as string);

  let scored = new Set<string>();
  if (closedIds.length > 0) {
    const { data: reviews } = await db
      .from("training_reviews")
      .select("session_id")
      .in("session_id", closedIds);
    scored = new Set((reviews ?? []).map((r) => r.session_id as string));
  }

  const doneSeeds = new Set(
    sessions
      .filter((s) => s.status === "closed" && scored.has(s.id as string))
      .map((s) => s.seed_id as string),
  );

  const allSeeds = seedsRes.data ?? [];
  const groupSeeds = allSeeds
    .filter((s) => s.group_number === groupNumber)
    .sort((a, b) => (a.task_number as number) - (b.task_number as number));

  const groupCompleted = groupSeeds.filter((s) => doneSeeds.has(s.id as string)).length;
  const overallCompleted = allSeeds.filter((s) => doneSeeds.has(s.id as string)).length;
  const nextInGroup = groupSeeds.find((s) => !doneSeeds.has(s.id as string));
  const groupTitleValue = groupTitle(groupNumber);

  let nextHint: string;
  if (params.review) {
    const topMiss = params.review.misses?.[0]?.trim();
    nextHint = topMiss
      ? `Biggest miss: ${topMiss}`
      : `Scored ${params.review.overall}/5. ${nextInGroup ? `Next: ${nextInGroup.title}` : "Group complete."}`;
  } else if (params.sessionStatus === "open") {
    nextHint = "Probe before you promise — close when you have a clear outcome.";
  } else if (nextInGroup) {
    nextHint = `Next up: ${nextInGroup.title}`;
  } else {
    nextHint = `Every request from ${groupTitleValue} is handled.`;
  }

  // "Academy overall" must be the SAME number the client-list bar shows, or the
  // two surfaces disagree about the intern's progress. Reuse the weighted model
  // rather than recomputing a plain done÷total here.
  const weighted = buildOverview(allSeeds, await loadSeedStatus(params.internId));

  return {
    groupNumber,
    groupTitle: groupTitleValue,
    groupCompleted,
    groupTotal: groupSeeds.length,
    groupPercent: percentComplete(groupCompleted, groupSeeds.length),
    overallCompleted,
    overallTotal: allSeeds.length,
    overallPercent: weighted.percent,
    nextHint,
  };
}

// ── Attachments (migration 127) ───────────────────────────────────────────────

/** Per-kind ceilings, tighter than the bucket's coarse 50MB limit. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const ATTACHMENT_BUCKET = "academy-attachments";
/** Signed URLs are short-lived — the bucket is private by design. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function attachmentKind(mime: string): "image" | "video" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
}

/** Strip anything that could escape the session folder or confuse storage. */
function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "file";
}

/**
 * Upload one image/video for a session. Owner-only (a trainer viewing someone
 * else's transcript must not be able to inject media into it).
 * Returns the metadata to attach to the next turn.
 */
export async function uploadAcademyAttachment(
  formData: FormData,
): Promise<Result<TrainingAttachment>> {
  const { user } = await getAuthUser();

  const sessionId = String(formData.get("sessionId") ?? "");
  if (!z.string().uuid().safeParse(sessionId).success) {
    return { success: false, error: "Invalid session id" };
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "No file provided" };

  const kind = attachmentKind(file.type);
  if (!kind) return { success: false, error: "Only images and videos can be shared" };

  const cap = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > cap) {
    return {
      success: false,
      error: `${kind === "image" ? "Images" : "Videos"} must be under ${Math.round(cap / 1024 / 1024)}MB`,
    };
  }

  const db = getServiceSupabaseClient();

  // Owner + still-open check. Trainers deliberately cannot upload here.
  const { data: session } = await db
    .from("training_sessions")
    .select("id, intern_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { success: false, error: "Session not found" };
  if (session.intern_id !== user.id) {
    return { success: false, error: "Only the intern in this session can share media" };
  }
  if (session.status !== "open") {
    return { success: false, error: "This conversation is closed" };
  }

  const path = `academy/${sessionId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: upErr } = await db.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { success: false, error: upErr.message };

  return {
    success: true,
    data: {
      path,
      kind,
      mime: file.type,
      name: safeFileName(file.name),
      size: file.size,
    },
  };
}

/**
 * Mint short-lived signed URLs for a set of attachment paths.
 * Access is re-checked here — never trust paths supplied by the caller.
 */
export async function getAcademyAttachmentUrls(
  sessionId: string,
  paths: string[],
): Promise<Result<Record<string, string>>> {
  if (!z.string().uuid().safeParse(sessionId).success) {
    return { success: false, error: "Invalid session id" };
  }
  const access = await assertCanAccessSession(sessionId);
  if (!access.ok) return { success: false, error: access.error };

  // Only paths inside this session's own folder are eligible.
  const prefix = `academy/${sessionId}/`;
  const scoped = paths.filter((p) => p.startsWith(prefix));
  if (scoped.length === 0) return { success: true, data: {} };

  const db = getServiceSupabaseClient();
  const { data, error } = await db.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(scoped, SIGNED_URL_TTL_SECONDS);
  if (error) return { success: false, error: error.message };

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return { success: true, data: map };
}

// ── Clients: one member, one request ──────────────────────────────────────────

type SeedState = {
  sessionId: string;
  /**
   * `awaiting_ticket` = conversation closed and scored, ticket not yet accepted.
   * It is not `completed` and earns no progress.
   */
  status: Exclude<AcademyRequestStatus, "not_started">;
  overall: number | null;
  at: string | null;
  /** Per-request performance score, 0..1. Null until scored. */
  requestScore: number | null;
  metrics: MetricBreakdown | null;
  /** The accepted ticket's weighted quality, 1–5. Null until one passes. */
  ticketQuality: number | null;
};

/**
 * Fold an intern's sessions into per-seed state, including the performance score
 * for every completed request.
 *
 * Requests are scored in chronological order because `consistency` compares each
 * one against the running mean of the ones before it.
 */
async function loadSeedStatus(internId: string): Promise<Map<string, SeedState>> {
  const db = getServiceSupabaseClient();

  const [sessionsRes, seedMetaRes] = await Promise.all([
    db
      .from("training_sessions")
      .select("id, seed_id, status, started_at, ended_at")
      .eq("intern_id", internId)
      .order("started_at", { ascending: true }),
    db.from("scenario_seeds").select("id, difficulty"),
  ]);

  const rows = sessionsRes.data ?? [];
  const difficultyBySeed = new Map<string, string>(
    (seedMetaRes.data ?? []).map((s) => [s.id as string, (s.difficulty as string) ?? "medium"]),
  );

  const closedIds = rows.filter((s) => s.status === "closed").map((s) => s.id as string);

  const reviewBySession = new Map<string, { overall: number; scores: AcademyRubricScores }>();
  const internTurnsBySession = new Map<string, number>();
  const turnsBySession = new Map<string, TimedTurn[]>();
  const ticketBySession = new Map<
    string,
    { passed: boolean; quality: number | null; attempts: number }
  >();

  if (closedIds.length > 0) {
    const [reviewsRes, turnsRes, ticketsRes] = await Promise.all([
      db.from("training_reviews").select("session_id, overall, scores").in("session_id", closedIds),
      // created_at + seq are needed for response timing, not just the count.
      db
        .from("training_turns")
        .select("session_id, role, created_at, seq")
        .in("session_id", closedIds),
      db
        .from("training_ticket_updates")
        .select("session_id, passed, verdict, attempts")
        .in("session_id", closedIds),
    ]);
    for (const r of reviewsRes.data ?? []) {
      reviewBySession.set(r.session_id as string, {
        overall: Number(r.overall),
        scores: r.scores as AcademyRubricScores,
      });
    }
    for (const t of turnsRes.data ?? []) {
      const k = t.session_id as string;
      if (t.role === "intern") {
        internTurnsBySession.set(k, (internTurnsBySession.get(k) ?? 0) + 1);
      }
      const arr = turnsBySession.get(k) ?? [];
      arr.push({
        role: t.role as "client" | "intern",
        created_at: t.created_at as string,
        seq: Number(t.seq ?? 0),
      });
      turnsBySession.set(k, arr);
    }
    for (const t of ticketsRes.data ?? []) {
      const verdict = t.verdict as AcademyTicketVerdict | null;
      ticketBySession.set(t.session_id as string, {
        passed: t.passed === true,
        quality: typeof verdict?.quality === "number" ? verdict.quality : null,
        attempts: Number(t.attempts ?? 0),
      });
    }
  }

  // How many times this intern has opened each request — drives first-attempt.
  const attemptsBySeed = new Map<string, number>();
  for (const s of rows) {
    const k = s.seed_id as string;
    attemptsBySeed.set(k, (attemptsBySeed.get(k) ?? 0) + 1);
  }

  const bySeed = new Map<string, SeedState>();
  const priorScores: number[] = [];

  for (const s of rows) {
    const id = s.id as string;
    const seedId = s.seed_id as string;
    const review = reviewBySession.get(id);
    const ticket = ticketBySession.get(id);
    const scored = s.status === "closed" && review !== undefined;
    // The ticket, not the conversation, is the finish line.
    const isComplete = scored && ticket?.passed === true;

    let requestScore: number | null = null;
    let metrics: MetricBreakdown | null = null;

    if (isComplete && review) {
      const started = s.started_at ? Date.parse(s.started_at as string) : NaN;
      const ended = s.ended_at ? Date.parse(s.ended_at as string) : NaN;
      const durationMinutes =
        Number.isFinite(started) && Number.isFinite(ended) && ended > started
          ? (ended - started) / 60000
          : null;

      const input = {
        scores: review.scores,
        overall: review.overall,
        difficulty: difficultyBySeed.get(seedId) ?? "medium",
        durationMinutes,
        attempts: attemptsBySeed.get(seedId) ?? 1,
        internTurns: internTurnsBySession.get(id) ?? 0,
        priorMean:
          priorScores.length > 0
            ? priorScores.reduce((a, b) => a + b, 0) / priorScores.length
            : null,
        ticketQuality: ticketQualityNormalised(ticket?.quality ?? 0),
        ticketAttempts: ticket?.attempts ?? 1,
        avgResponseMinutes: sessionTiming(turnsBySession.get(id) ?? [], {
          startedAt: s.started_at as string | null,
          resolvedAt: s.ended_at as string | null,
        }).avgResponseMinutes,
      };
      metrics = scoreRequestMetrics(input);
      requestScore = scoreRequest(input);
      priorScores.push(requestScore);
    }

    // Later sessions win, so a retry supersedes an earlier attempt.
    bySeed.set(seedId, {
      sessionId: id,
      status: isComplete
        ? "completed"
        : scored
          ? "awaiting_ticket"
          : // Closed with no review is a failed evaluation, not open work.
            // Calling it in_progress reopened the composer over a session the
            // chat route refuses, stranding the request permanently.
            s.status === "closed"
            ? "scoring_failed"
            : "in_progress",
      overall: review?.overall ?? null,
      at: (s.ended_at as string | null) ?? (s.started_at as string | null) ?? null,
      requestScore,
      metrics,
      ticketQuality: ticket?.passed ? (ticket.quality ?? null) : null,
    });
  }

  return bySeed;
}

/**
 * Roll per-request performance into the bar.
 *
 * `percent` is deliberately NOT completed/total: an excellent request moves it
 * further than a scraped one, and an unattempted request contributes nothing —
 * so the bar only reaches 100 by handling everything, well.
 */
function buildOverview(
  seeds: { id: string }[],
  bySeed: Map<string, SeedState>,
): AcademyClientOverview {
  let completed = 0;
  let inProgress = 0;
  const scored: { score: number; metrics: MetricBreakdown }[] = [];

  for (const s of seeds) {
    const state = bySeed.get(s.id);
    if (!state) continue;
    if (state.status === "completed") {
      completed += 1;
      if (state.requestScore !== null && state.metrics) {
        scored.push({ score: state.requestScore, metrics: state.metrics });
      }
    } else if (
      state.status === "in_progress" ||
      state.status === "awaiting_ticket" ||
      state.status === "scoring_failed"
    ) {
      // A request whose ticket is still outstanding is open work, not done.
      inProgress += 1;
    }
  }

  const perf = computeAcademyPerformance(scored, seeds.length);

  return {
    completed,
    total: seeds.length,
    percent: perf.percent,
    completionPercent: percentComplete(completed, seeds.length),
    qualityPercent: perf.qualityPercent,
    inProgress,
    breakdown: perf.breakdown,
  };
}

/** Every client and their single request, ordered as the curriculum runs. */
export async function getAcademyClients(): Promise<Result<AcademyClientList>> {
  const { user } = await getAuthUser();
  const db = getServiceSupabaseClient();

  const [seedsRes, bySeed, rosterClients] = await Promise.all([
    db
      .from("scenario_seeds")
      .select("id, title, vertical, difficulty, task_number")
      // The Clients tab is the full register — all 176 requests. The four-day
      // programme is a curated 40 of these, and the Training page scopes itself
      // to them; this surface deliberately does not, so the whole archive stays
      // browsable and workable.
      .not("task_number", "is", null)
      .eq("is_active", true)
      .order("task_number", { ascending: true }),
    loadSeedStatus(user.id),
    loadRosterClients(),
  ]);

  if (seedsRes.error) return { success: false, error: seedsRes.error.message };
  const seeds = seedsRes.data ?? [];

  const roster = buildRoster(
    rosterClients,
    seeds.map((s) => (s.task_number as number) ?? 0),
  );

  const clients: AcademyClientRow[] = seeds.map((s) => {
    const taskNumber = (s.task_number as number) ?? 0;
    const state = bySeed.get(s.id as string);
    const member = roster.get(taskNumber);
    return {
      seedId: s.id as string,
      taskNumber,
      member,
      name: member?.name ?? "Indulge member",
      requestTitle: (s.title as string) ?? "Request",
      vertical: (s.vertical as string) ?? "Global",
      difficulty: (s.difficulty as string) ?? "medium",
      status: state?.status ?? "not_started",
      sessionId: state?.sessionId ?? null,
      overall: state?.overall ?? null,
      lastActivity: state?.at ?? null,
    };
  });

  return {
    success: true,
    data: { clients, overview: buildOverview(seeds, bySeed) },
  };
}

/**
 * One client's conversation.
 *
 * Deliberately does NOT create a session — browsing the list would otherwise
 * litter the database with empty rows. The opening message is rendered from the
 * seed for the preview; a real session (and a persisted transcript) is created
 * the moment the intern actually replies.
 */
export async function getAcademyClientThread(
  seedId: string,
): Promise<Result<AcademyClientThread>> {
  const parsed = z.string().uuid().safeParse(seedId);
  if (!parsed.success) return { success: false, error: "Invalid client" };

  const { user, profile, role, department } = await getAuthUser();
  const db = getServiceSupabaseClient();

  const { data: seed, error: seedErr } = await db
    .from("scenario_seeds")
    .select("id, title, brief, vertical, difficulty, raised_by, task_date, task_number, opening_message, hidden_constraints")
    .eq("id", parsed.data)
    .eq("is_active", true)
    .maybeSingle();
  if (seedErr || !seed) return { success: false, error: "Client not found" };

  const taskNumber = (seed.task_number as number) ?? 0;

  // Trainers review any transcript; only the trainee walking the ladder is gated.
  if (!isAcademyTrainer(role, department)) {
    const refusal = await lockedDayRefusal(user.id, taskNumber);
    if (refusal) return { success: false, error: refusal };
  }

  const member = memberFor(await loadRosterClients(), taskNumber);
  const name = member.name;

  const [allSeedsRes, bySeed] = await Promise.all([
    db
      .from("scenario_seeds")
      .select("id")
      // Same 176 as the client list — this feeds the overview shown above the
      // conversation, and the two must not disagree.
      .not("task_number", "is", null)
      .eq("is_active", true),
    loadSeedStatus(user.id),
  ]);

  const state = bySeed.get(parsed.data);
  let turns: TrainingTurn[] = [];
  let review: TrainingReview | null = null;
  let ticketUpdate: TrainingTicketUpdate | null = null;

  if (state?.sessionId) {
    ticketUpdate = await readTicketUpdate(state.sessionId);

    const [turnsRes, reviewRes] = await Promise.all([
      db
        .from("training_turns")
        .select("id, session_id, role, body, seq, created_at, attachments")
        .eq("session_id", state.sessionId)
        .order("seq", { ascending: true }),
      db
        .from("training_reviews")
        .select("*")
        .eq("session_id", state.sessionId)
        .maybeSingle(),
    ]);
    turns = (turnsRes.data ?? []) as TrainingTurn[];
    review = (reviewRes.data as TrainingReview | null) ?? null;

    // Private bucket — mint short-lived URLs so shared media renders.
    const mediaPaths = turns.flatMap((t) => (t.attachments ?? []).map((a) => a.path));
    if (mediaPaths.length > 0) {
      const { data: signed } = await db.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrls(mediaPaths, SIGNED_URL_TTL_SECONDS);
      const urlByPath = new Map<string, string>();
      for (const row of signed ?? []) {
        if (row.path && row.signedUrl) urlByPath.set(row.path, row.signedUrl);
      }
      for (const t of turns) {
        if (!t.attachments?.length) continue;
        t.attachments = t.attachments.map((a) => ({ ...a, signedUrl: urlByPath.get(a.path) }));
      }
    }
  }

  // Preview the opening line for a client not yet started. The real randomised
  // opening is written into the transcript when the session begins.
  const previewOpening = renderTemplate((seed.opening_message as string) ?? "", {
    name,
    date: "shortly",
  });

  return {
    success: true,
    data: {
      seedId: parsed.data,
      taskNumber,
      name,
      member,
      requestTitle: (seed.title as string) ?? "Request",
      brief: (seed.brief as string | null) ?? null,
      vertical: (seed.vertical as string) ?? "Global",
      difficulty: (seed.difficulty as string) ?? "medium",
      raisedBy: (seed.raised_by as string | null) ?? null,
      taskDate: (seed.task_date as string | null) ?? null,
      openingMessage: previewOpening,
      constraintCount: Array.isArray(seed.hidden_constraints) ? seed.hidden_constraints.length : 0,
      mentorIntro: buildMentorIntro({
        name,
        vertical: (seed.vertical as string) ?? "Global",
        constraintCount: Array.isArray(seed.hidden_constraints)
          ? seed.hidden_constraints.length
          : 0,
        status: state?.status ?? "not_started",
        overall: state?.overall ?? null,
      }),
      sessionId: state?.sessionId ?? null,
      status: state?.status ?? "not_started",
      turns,
      review,
      readOnly: false,
      overview: buildOverview(allSeedsRes.data ?? [], bySeed),
      ticket: {
        // Derived, not stored — see lib/academy/ticket.ts. A client who has
        // never been opened still has a ticket, which is what makes the request
        // read as inbound work rather than an exercise.
        ticket: deriveTicket({
          seedId: parsed.data,
          requestTitle: (seed.title as string) ?? "Request",
          clientName: name,
          vertical: (seed.vertical as string) ?? "Global",
          difficulty: (seed.difficulty as string) ?? "medium",
          assignedTo: profile?.full_name ?? "Unassigned",
          createdAt:
            (seed.task_date as string | null) ??
            state?.at ??
            new Date().toISOString(),
          currentStatus: ticketUpdate?.status ?? null,
          currentPriority: ticketUpdate?.priority ?? null,
        }),
        update: ticketUpdate,
      },
    },
  };
}

/**
 * The mentor's opening line. Written in code, not generated: it must be instant,
 * and it must stay one or two short sentences. An LLM call here would add a
 * second of latency to every click and tends to pad.
 */
function buildMentorIntro(p: {
  name: string;
  vertical: string;
  constraintCount: number;
  status: AcademyRequestStatus;
  overall: number | null;
}): string {
  if (p.status === "completed") {
    return `Scored ${p.overall ?? "—"}/5. Read the review below, then try another client.`;
  }
  if (p.status === "awaiting_ticket") {
    return `${p.name} is handled — now write up the Freshdesk ticket to close it out.`;
  }
  if (p.status === "in_progress") {
    return `You're mid-conversation with ${p.name}. Pick up where you left off.`;
  }
  const probe =
    p.constraintCount > 0
      ? `${p.constraintCount === 1 ? "One detail" : `${p.constraintCount} details`} won't come out unless you ask.`
      : "Ask before you promise.";
  return `${p.name} has a ${p.vertical} request. ${probe}`;
}

// ── Curriculum: the 50-group ladder ───────────────────────────────────────────

/**
 * The whole left-hand group list plus overall progress, in three fetches.
 *
 * Deliberately NOT one query per group: the seeds, the intern's closed sessions
 * and their reviews are each read once and folded together in JS.
 */
export async function getAcademyLadder(): Promise<Result<AcademyLadder>> {
  const { user } = await getAuthUser();
  const db = getServiceSupabaseClient();

  const [seedsRes, sessionsRes] = await Promise.all([
    db
      .from("scenario_seeds")
      .select("id, title, group_number, day_number, task_number, task_date")
      .not("group_number", "is", null)
      .eq("is_active", true)
      .order("task_number", { ascending: true }),
    db
      .from("training_sessions")
      .select("id, seed_id, status, ended_at")
      .eq("intern_id", user.id),
  ]);

  if (seedsRes.error) return { success: false, error: seedsRes.error.message };
  if (sessionsRes.error) return { success: false, error: sessionsRes.error.message };

  const sessions = sessionsRes.data ?? [];
  const closedIds = sessions
    .filter((s) => s.status === "closed")
    .map((s) => s.id as string);

  // One more fetch: which closed sessions actually produced a score.
  let reviewed = new Set<string>();
  if (closedIds.length > 0) {
    const { data: reviews } = await db
      .from("training_reviews")
      .select("session_id")
      .in("session_id", closedIds);
    reviewed = new Set((reviews ?? []).map((r) => r.session_id as string));
  }

  // seed_id -> most recent completion time (only sessions that were scored)
  const completedAt = new Map<string, string | null>();
  for (const s of sessions) {
    if (s.status !== "closed" || !reviewed.has(s.id as string)) continue;
    const seedId = s.seed_id as string;
    const at = (s.ended_at as string | null) ?? null;
    const prev = completedAt.get(seedId);
    if (prev === undefined || (at && prev && at > prev) || (at && !prev)) {
      completedAt.set(seedId, at);
    }
  }

  type Agg = { taskCount: number; completedCount: number; days: Set<number>; last: string | null; firstTitle: string | null };
  const byGroup = new Map<number, Agg>();
  for (const seed of seedsRes.data ?? []) {
    const g = seed.group_number as number;
    const agg = byGroup.get(g) ?? {
      taskCount: 0,
      completedCount: 0,
      days: new Set<number>(),
      last: null,
      firstTitle: null,
    };
    agg.taskCount += 1;
    agg.days.add((seed.day_number as number) ?? 1);
    if (agg.firstTitle === null) agg.firstTitle = (seed.title as string) ?? null;
    if (completedAt.has(seed.id as string)) {
      agg.completedCount += 1;
      const at = completedAt.get(seed.id as string) ?? null;
      if (at && (!agg.last || at > agg.last)) agg.last = at;
    }
    byGroup.set(g, agg);
  }

  const ladder = resolveLadder(
    [...byGroup.entries()].map(([groupNumber, a]) => ({
      groupNumber,
      taskCount: a.taskCount,
      completedCount: a.completedCount,
      dayCount: a.days.size,
      lastActivity: a.last,
    })),
  );

  const groups: AcademyGroupRow[] = ladder.map((g) => ({
    ...g,
    title: groupTitle(g.groupNumber),
  }));

  const totals = overallProgress(ladder);
  return {
    success: true,
    data: {
      groups,
      overview: {
        completedTasks: totals.completedTasks,
        totalTasks: totals.totalTasks,
        percent: totals.percent,
        completedGroups: totals.completedGroups,
        totalGroups: ACADEMY_TOTAL_GROUPS,
      },
    },
  };
}

/** One group's tasks, split into day sections, with per-task status. */
export async function getAcademyGroup(
  groupNumber: number,
): Promise<Result<AcademyGroupDetail>> {
  const parsed = z.number().int().min(1).max(ACADEMY_TOTAL_GROUPS).safeParse(groupNumber);
  if (!parsed.success) return { success: false, error: "Invalid group" };

  const { user } = await getAuthUser();
  const db = getServiceSupabaseClient();

  const [seedsRes, sessionsRes, ladderRes] = await Promise.all([
    db
      .from("scenario_seeds")
      .select("id, title, brief, vertical, raised_by, group_number, day_number, task_number, task_date")
      .eq("group_number", parsed.data)
      .eq("is_active", true)
      .order("task_number", { ascending: true }),
    db
      .from("training_sessions")
      .select("id, seed_id, status, started_at")
      .eq("intern_id", user.id),
    getAcademyLadder(),
  ]);

  if (seedsRes.error) return { success: false, error: seedsRes.error.message };
  if (sessionsRes.error) return { success: false, error: sessionsRes.error.message };

  const seeds = seedsRes.data ?? [];
  if (seeds.length === 0) return { success: false, error: "Group not found" };

  const sessions = sessionsRes.data ?? [];
  const closedIds = sessions.filter((s) => s.status === "closed").map((s) => s.id as string);

  const overallBySession = new Map<string, number>();
  if (closedIds.length > 0) {
    const { data: reviews } = await db
      .from("training_reviews")
      .select("session_id, overall")
      .in("session_id", closedIds);
    for (const r of reviews ?? []) {
      overallBySession.set(r.session_id as string, Number(r.overall));
    }
  }

  const isLocked =
    ladderRes.success && ladderRes.data
      ? (ladderRes.data.groups.find((g) => g.groupNumber === parsed.data)?.isLocked ?? false)
      : false;

  // Newest session per seed wins, so "Continue" resumes the latest attempt.
  const latestBySeed = new Map<string, { id: string; status: string; startedAt: string }>();
  for (const s of sessions) {
    const seedId = s.seed_id as string;
    const cur = latestBySeed.get(seedId);
    const startedAt = (s.started_at as string) ?? "";
    if (!cur || startedAt > cur.startedAt) {
      latestBySeed.set(seedId, { id: s.id as string, status: s.status as string, startedAt });
    }
  }

  const byDay = new Map<number, { date: string | null; tasks: AcademyTaskCard[] }>();
  for (const seed of seeds) {
    const day = (seed.day_number as number) ?? 1;
    const latest = latestBySeed.get(seed.id as string);
    const scored = latest && overallBySession.has(latest.id);
    const status = taskStatus({
      groupLocked: isLocked,
      hasCompletedSession: Boolean(latest && latest.status === "closed" && scored),
      hasOpenSession: Boolean(latest && latest.status === "open"),
    });

    const bucket = byDay.get(day) ?? { date: (seed.task_date as string | null) ?? null, tasks: [] };
    bucket.tasks.push({
      seedId: seed.id as string,
      taskNumber: (seed.task_number as number) ?? 0,
      title: (seed.title as string) ?? "Task",
      brief: (seed.brief as string | null) ?? null,
      raisedBy: (seed.raised_by as string | null) ?? null,
      vertical: (seed.vertical as string) ?? "Global",
      status,
      sessionId: latest?.id ?? null,
      overall: latest ? (overallBySession.get(latest.id) ?? null) : null,
    });
    byDay.set(day, bucket);
  }

  const days: AcademyDaySection[] = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayNumber, bucket]) => ({
      dayNumber,
      date: bucket.date,
      label: `Day ${dayNumber}`,
      tasks: bucket.tasks,
      isComplete: bucket.tasks.every((t) => t.status === "completed"),
    }));

  const completedCount = seeds.filter((s) => {
    const latest = latestBySeed.get(s.id as string);
    return Boolean(latest && latest.status === "closed" && overallBySession.has(latest.id));
  }).length;

  return {
    success: true,
    data: {
      groupNumber: parsed.data,
      title: groupTitle(parsed.data),
      tier: tierForGroup(parsed.data),
      isLocked,
      percent: percentComplete(completedCount, seeds.length),
      taskCount: seeds.length,
      completedCount,
      days,
    },
  };
}

// ── Trainer: cohort dashboard ─────────────────────────────────────────────────

export async function getAcademyCohort(): Promise<Result<CohortInternRow[]>> {
  const { role, department } = await getAuthUser();
  if (!isAcademyTrainer(role, department)) {
    return { success: false, error: "Trainers only" };
  }

  const db = getServiceSupabaseClient();

  // One fetch per data source, in parallel — never a per-row call.
  const [sessionsRes, reviewsRes, profilesRes] = await Promise.all([
    db
      .from("training_sessions")
      .select("id, intern_id, started_at")
      .eq("status", "closed"),
    db
      .from("training_reviews")
      .select("session_id, overall, scores, created_at")
      .order("created_at", { ascending: true }),
    db.from("profiles").select("id, full_name"),
  ]);

  if (sessionsRes.error) return { success: false, error: sessionsRes.error.message };
  if (reviewsRes.error) return { success: false, error: reviewsRes.error.message };
  if (profilesRes.error) return { success: false, error: profilesRes.error.message };

  const sessionIntern = new Map<string, string>();
  for (const s of sessionsRes.data ?? []) {
    sessionIntern.set(s.id as string, s.intern_id as string);
  }
  const nameById = new Map<string, string>();
  for (const p of profilesRes.data ?? []) {
    nameById.set(p.id as string, (p.full_name as string) ?? "Unknown");
  }

  type Row = { overall: number; scores: TrainingReview["scores"] };
  const byIntern = new Map<string, Row[]>();
  for (const r of reviewsRes.data ?? []) {
    const internId = sessionIntern.get(r.session_id as string);
    if (!internId) continue; // review whose session isn't closed/known — skip
    const arr = byIntern.get(internId) ?? [];
    arr.push({
      overall: Number(r.overall),
      scores: r.scores as TrainingReview["scores"],
    });
    byIntern.set(internId, arr);
  }

  const avg = (nums: number[]): number | null =>
    nums.length === 0
      ? null
      : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;

  const rows: CohortInternRow[] = [];
  for (const [internId, reviews] of byIntern) {
    const overalls = reviews.map((r) => r.overall);
    const avgByDimension: Record<string, number | null> = {};
    for (const dim of ACADEMY_DIMENSIONS) {
      const vals = reviews
        .map((r) => r.scores?.[dim.key]?.score)
        .filter((v): v is number => typeof v === "number");
      avgByDimension[dim.key] = avg(vals);
    }

    let trend: number | null = null;
    if (reviews.length >= 4) {
      const last3 = overalls.slice(-3);
      const prior = overalls.slice(0, -3);
      const a = avg(last3);
      const b = avg(prior);
      if (a !== null && b !== null) trend = Math.round((a - b) * 10) / 10;
    }

    rows.push({
      internId,
      internName: nameById.get(internId) ?? "Unknown",
      sessionsCompleted: reviews.length,
      avgOverall: avg(overalls),
      avgByDimension,
      trend,
    });
  }

  rows.sort((a, b) => (b.avgOverall ?? 0) - (a.avgOverall ?? 0));
  return { success: true, data: rows };
}

// ── Trainer: seed authoring ───────────────────────────────────────────────────

const hiddenConstraintSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  reveal_when: z.string().min(1).max(400),
  value: z.string().min(1).max(600),
});

const seedInputSchema = z.object({
  title: z.string().min(1).max(160),
  archetype: z.string().min(1).max(160),
  vertical: z.enum(["Global", "House", "Shop", "Legacy", "Dubai", "GMR"]),
  opening_message: z.string().min(1).max(2000),
  hidden_constraints: z.array(hiddenConstraintSchema).max(8),
  difficulty: z.enum(["easy", "medium", "hard"]),
  escalation_trigger: z.string().min(1).max(1000),
  ideal_outcome: z.string().min(1).max(1000),
  rubric_weights: z.record(z.string(), z.number()).optional(),
  is_active: z.boolean().optional(),
});

export type SeedInput = z.infer<typeof seedInputSchema>;

function sanitizeSeed(input: SeedInput) {
  return {
    title: sanitizeText(input.title),
    archetype: sanitizeText(input.archetype),
    vertical: input.vertical,
    opening_message: sanitizeText(input.opening_message),
    hidden_constraints: input.hidden_constraints.map((c) => ({
      id: sanitizeText(c.id),
      label: sanitizeText(c.label),
      reveal_when: sanitizeText(c.reveal_when),
      value: sanitizeText(c.value),
    })),
    difficulty: input.difficulty,
    escalation_trigger: sanitizeText(input.escalation_trigger),
    ideal_outcome: sanitizeText(input.ideal_outcome),
    rubric_weights: input.rubric_weights ?? DEFAULT_RUBRIC_WEIGHTS,
    is_active: input.is_active ?? true,
  };
}

/** Full seed rows for the trainer seed editor (secrets included). */
export async function getSeedsForTrainer(): Promise<Result<ScenarioSeed[]>> {
  const { role, department } = await getAuthUser();
  if (!isAcademyTrainer(role, department)) {
    return { success: false, error: "Trainers only" };
  }
  const db = getServiceSupabaseClient();
  const { data, error } = await db
    .from("scenario_seeds")
    .select("*")
    .order("vertical", { ascending: true })
    .order("title", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as ScenarioSeed[] };
}

export async function createSeed(input: SeedInput): Promise<Result<{ id: string }>> {
  const { user, role, department } = await getAuthUser();
  if (!isAcademyTrainer(role, department)) {
    return { success: false, error: "Trainers only" };
  }
  const parsed = seedInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid seed" };
  }
  const clean = sanitizeSeed(parsed.data);

  const piiIssues = scanSeedForPII(clean);
  if (piiIssues.length > 0) {
    return {
      success: false,
      error: "Possible real / personal data detected — seeds must be synthetic.",
      piiIssues,
    };
  }

  const db = getServiceSupabaseClient();
  const { data, error } = await db
    .from("scenario_seeds")
    .insert({ ...clean, created_by: user.id })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/academy-seeds");
  revalidatePath("/academy");
  return { success: true, data: { id: data.id as string } };
}

export async function updateSeed(
  seedId: string,
  input: SeedInput,
): Promise<Result> {
  const { role, department } = await getAuthUser();
  if (!isAcademyTrainer(role, department)) {
    return { success: false, error: "Trainers only" };
  }
  const idParsed = z.string().uuid().safeParse(seedId);
  if (!idParsed.success) return { success: false, error: "Invalid seed id" };
  const parsed = seedInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid seed" };
  }
  const clean = sanitizeSeed(parsed.data);

  const piiIssues = scanSeedForPII(clean);
  if (piiIssues.length > 0) {
    return {
      success: false,
      error: "Possible real / personal data detected — seeds must be synthetic.",
      piiIssues,
    };
  }

  const db = getServiceSupabaseClient();
  const { error } = await db
    .from("scenario_seeds")
    .update(clean)
    .eq("id", idParsed.data);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/academy-seeds");
  revalidatePath("/academy");
  return { success: true };
}

export async function toggleSeedActive(
  seedId: string,
  isActive: boolean,
): Promise<Result> {
  const { role, department } = await getAuthUser();
  if (!isAcademyTrainer(role, department)) {
    return { success: false, error: "Trainers only" };
  }
  const idParsed = z.string().uuid().safeParse(seedId);
  if (!idParsed.success) return { success: false, error: "Invalid seed id" };

  const db = getServiceSupabaseClient();
  const { error } = await db
    .from("scenario_seeds")
    .update({ is_active: isActive })
    .eq("id", idParsed.data);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/academy-seeds");
  revalidatePath("/academy");
  return { success: true };
}

/**
 * Academy ticket-review service.
 *
 * Runs when an intern submits their Freshdesk ticket write-up. The reviewer
 * model judges the ticket against the actual conversation, the verdict is
 * assembled in code (`buildVerdict`), and the row is updated via the service
 * role.
 *
 * Unlike `academyEvaluator`, this is NOT idempotent-on-existence: a failed
 * review is meant to be resubmitted after revision, and each submission is a
 * fresh judgment. `attempts` records how many it took — that feeds the
 * first-attempt metric in the progress model.
 *
 * NOT a "use server" module — consumed by lib/actions/academy.ts.
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  ACADEMY_TICKET_REVIEW_MODEL,
  ACADEMY_TICKET_REVIEW_VERSION,
  modelSupportsEffort,
} from "@/lib/academy/models";
import {
  buildTicketReviewPrompt,
  buildVerdict,
  parseTicketReviewResponse,
  TICKET_REVIEW_OUTPUT_SCHEMA,
} from "@/lib/academy/ticketReview";
import type { TicketUpdateInput } from "@/lib/academy/ticket";
import type {
  AcademySessionVars,
  AcademyTicketVerdict,
  TrainingTurn,
} from "@/lib/types/database";

interface AnthropicResult {
  content?: { text?: string }[];
  stop_reason?: string;
}

/**
 * Same two-attempt shape as the evaluator: constrain the output with
 * output_config.format, and retry without it if the API rejects that shape.
 */
async function callReviewer(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");

  const baseBody: Record<string, unknown> = {
    model: ACADEMY_TICKET_REVIEW_MODEL,
    max_tokens: 1500,
    stream: false,
    system,
    messages: [{ role: "user", content: user }],
  };

  // `effort` is not accepted by every model — Haiku rejects the request outright
  // rather than ignoring it, so it is included only where it is supported.
  const effort = modelSupportsEffort(ACADEMY_TICKET_REVIEW_MODEL)
    ? { effort: "medium" }
    : {};

  const attempts: Record<string, unknown>[] = [
    {
      ...baseBody,
      output_config: {
        ...effort,
        format: { type: "json_schema", schema: TICKET_REVIEW_OUTPUT_SCHEMA },
      },
    },
    // Fallback for a wire-format change: drop the schema and let the prompt
    // carry the JSON requirement. With no effort to send there is no
    // output_config left, so the plain body is the request.
    Object.keys(effort).length > 0
      ? { ...baseBody, output_config: effort }
      : { ...baseBody },
  ];

  let lastErr = "";
  for (const body of attempts) {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      lastErr = `Anthropic API error ${res.status}: ${await res
        .text()
        .catch(() => "")}`;
      continue;
    }

    const result = (await res.json()) as AnthropicResult;
    if (result.stop_reason === "max_tokens") {
      throw new Error(
        "ACADEMY_PARSE_ERROR: ticket review was truncated — not saved",
      );
    }
    return result.content?.[0]?.text?.trim() ?? "";
  }

  throw new Error(lastErr || "Ticket review request failed");
}

function transcriptText(turns: TrainingTurn[]): string {
  if (turns.length === 0) return "(no messages)";
  return turns
    .map((t) => `${t.role === "intern" ? "Concierge" : "Client"}: ${t.body}`)
    .join("\n");
}

export interface TicketReviewResult {
  success: boolean;
  verdict?: AcademyTicketVerdict;
  error?: string;
}

/**
 * Review a submitted ticket and persist the verdict.
 *
 * The caller has already written `update` to the row; this reads the session
 * context, judges, and stamps the outcome. Returns the verdict so the UI can
 * show the feedback immediately.
 *
 * `attempts` is stamped here rather than by the caller so it lands in the same
 * write as the verdict: a submission the reviewer never returned from is not an
 * attempt, and counting it would penalise the trainee for an outage through the
 * first-attempt metric.
 */
export async function runAcademyTicketReview(
  sessionId: string,
  update: TicketUpdateInput,
  opts?: { attempts?: number },
): Promise<TicketReviewResult> {
  try {
    const db = getServiceSupabaseClient();

    const { data: session, error: sErr } = await db
      .from("training_sessions")
      .select("id, seed_id, session_vars")
      .eq("id", sessionId)
      .maybeSingle();
    if (sErr || !session) return { success: false, error: "Session not found" };

    const { data: seed, error: seedErr } = await db
      .from("scenario_seeds")
      .select("id, title, archetype, ideal_outcome")
      .eq("id", session.seed_id)
      .maybeSingle();
    if (seedErr || !seed) return { success: false, error: "Seed not found" };

    const { data: turns, error: tErr } = await db
      .from("training_turns")
      .select("id, session_id, role, body, seq, created_at")
      .eq("session_id", sessionId)
      .order("seq", { ascending: true });
    if (tErr) return { success: false, error: tErr.message };

    const vars = session.session_vars as AcademySessionVars | null;
    const clientName = vars?.randomized?.name ?? (seed.archetype as string);
    const requestTitle = vars?.display?.title ?? (seed.title as string);

    const { system, user } = buildTicketReviewPrompt({
      requestTitle,
      clientName,
      idealOutcome: (seed.ideal_outcome as string) ?? "",
      transcript: transcriptText((turns ?? []) as TrainingTurn[]),
      update,
    });

    const raw = await callReviewer(system, user);
    const parsed = parseTicketReviewResponse(raw);
    const verdict = buildVerdict(
      parsed,
      update.status,
      ACADEMY_TICKET_REVIEW_VERSION,
    );

    const { error: updErr } = await db
      .from("training_ticket_updates")
      .update({
        verdict,
        passed: verdict.passed,
        submitted_at: new Date().toISOString(),
        ...(typeof opts?.attempts === "number"
          ? { attempts: opts.attempts }
          : {}),
      })
      .eq("session_id", sessionId);

    if (updErr) return { success: false, error: updErr.message };
    return { success: true, verdict };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[academyTicketReview] runAcademyTicketReview failed:", message);
    return { success: false, error: message };
  }
}

/**
 * Academy evaluator service.
 *
 * Runs on session close against the full transcript: Opus 4.8 (structured JSON
 * output) scores the six rubric dimensions; the overall is computed in code; the
 * review is persisted via the service role. NOT a "use server" module — consumed
 * by lib/actions/academy.ts.
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  ACADEMY_EVALUATOR_MODEL,
  ACADEMY_EVALUATOR_VERSION,
} from "@/lib/academy/models";
import {
  buildEvaluatorPrompt,
  parseEvaluatorResponse,
  EVALUATOR_OUTPUT_SCHEMA,
} from "@/lib/academy/evaluator";
import { computeOverall } from "@/lib/academy/rubric";
import type {
  AcademyHiddenConstraint,
  AcademySessionVars,
  ScenarioSeed,
  TrainingTurn,
} from "@/lib/types/database";

interface AnthropicResult {
  content?: { text?: string }[];
  stop_reason?: string;
}

/**
 * Call the evaluator. First attempt constrains the output with
 * output_config.format; if the API rejects that shape we retry without it (the
 * prompt still demands JSON) so a wire-format change can't break scoring.
 */
async function callEvaluator(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");

  const baseBody: Record<string, unknown> = {
    model: ACADEMY_EVALUATOR_MODEL,
    max_tokens: 2000,
    stream: false,
    system,
    messages: [{ role: "user", content: user }],
  };

  const attempts: Record<string, unknown>[] = [
    {
      ...baseBody,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: EVALUATOR_OUTPUT_SCHEMA },
      },
    },
    { ...baseBody, output_config: { effort: "medium" } },
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
      continue; // fall through to the no-format attempt
    }

    const result = (await res.json()) as AnthropicResult;
    if (result.stop_reason === "max_tokens") {
      throw new Error(
        "ACADEMY_PARSE_ERROR: evaluator response was truncated — not saved",
      );
    }
    return result.content?.[0]?.text?.trim() ?? "";
  }

  throw new Error(lastErr || "Evaluator request failed");
}

function resolveConstraints(
  seed: ScenarioSeed,
  vars: AcademySessionVars | null,
): AcademyHiddenConstraint[] {
  const override = vars?.constraint_override ?? null;
  const constraints = Array.isArray(seed.hidden_constraints)
    ? seed.hidden_constraints
    : [];
  if (!override) return constraints;
  return constraints.map((c) =>
    c.id === override.id ? { ...c, value: override.value } : c,
  );
}

export interface EvaluationResult {
  success: boolean;
  reviewId?: string;
  error?: string;
}

export async function runAcademyEvaluation(
  sessionId: string,
): Promise<EvaluationResult> {
  try {
    const db = getServiceSupabaseClient();

    // Idempotency — a review already exists (unique on session_id).
    const { data: existing } = await db
      .from("training_reviews")
      .select("id")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (existing?.id) return { success: true, reviewId: existing.id as string };

    const { data: session, error: sErr } = await db
      .from("training_sessions")
      .select("id, seed_id, session_vars")
      .eq("id", sessionId)
      .maybeSingle();
    if (sErr || !session) return { success: false, error: "Session not found" };

    const { data: seed, error: seedErr } = await db
      .from("scenario_seeds")
      .select(
        "id, archetype, vertical, ideal_outcome, escalation_trigger, hidden_constraints, rubric_weights",
      )
      .eq("id", session.seed_id)
      .maybeSingle();
    if (seedErr || !seed) return { success: false, error: "Seed not found" };

    const { data: turns, error: tErr } = await db
      .from("training_turns")
      .select("id, session_id, role, body, seq, created_at")
      .eq("session_id", sessionId)
      .order("seq", { ascending: true });
    if (tErr) return { success: false, error: tErr.message };

    const internTurns = (turns ?? []) as TrainingTurn[];
    // No intern reply at all — nothing meaningful to grade.
    if (!internTurns.some((t) => t.role === "intern")) {
      return { success: false, error: "No intern messages to evaluate" };
    }

    const resolved = resolveConstraints(
      seed as ScenarioSeed,
      session.session_vars as AcademySessionVars | null,
    );

    const { system, user } = buildEvaluatorPrompt({
      seed: {
        archetype: (seed as ScenarioSeed).archetype,
        vertical: (seed as ScenarioSeed).vertical,
        ideal_outcome: (seed as ScenarioSeed).ideal_outcome,
        escalation_trigger: (seed as ScenarioSeed).escalation_trigger,
      },
      resolvedConstraints: resolved,
      turns: internTurns,
    });

    const rawText = await callEvaluator(system, user);
    const parsed = parseEvaluatorResponse(rawText);
    const overall = computeOverall(
      parsed.scores,
      (seed as ScenarioSeed).rubric_weights,
    );

    const { data: inserted, error: insErr } = await db
      .from("training_reviews")
      .insert({
        session_id: sessionId,
        scores: parsed.scores,
        strengths: parsed.strengths,
        misses: parsed.misses,
        rewritten_reply: parsed.rewritten_reply || null,
        overall,
        model_version: ACADEMY_EVALUATOR_VERSION,
      })
      .select("id")
      .single();

    if (insErr) return { success: false, error: insErr.message };
    return { success: true, reviewId: inserted?.id as string };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[academyEvaluator] runAcademyEvaluation failed:", message);
    return { success: false, error: message };
  }
}

/**
 * Evaluator prompt + output schema + defensive parser.
 *
 * Anti-inflation is designed in: conservative anchoring, pinned few-shot
 * examples of a 2 and a 5, and factual fabrication penalised hard. The overall
 * score is NOT asked of the model — it is computed in code from the per-dimension
 * scores (`lib/academy/rubric.ts`) so it stays deterministic.
 *
 * Pure module — no I/O.
 */

import type {
  AcademyHiddenConstraint,
  AcademyRubricScores,
  ScenarioSeed,
  TrainingTurn,
} from "@/lib/types/database";
import { ACADEMY_DIMENSIONS, clampScore } from "@/lib/academy/rubric";

// ── Structured-output JSON schema (for output_config.format) ──────────────────

const DIMENSION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "justification"],
  properties: {
    score: { type: "integer", enum: [1, 2, 3, 4, 5] },
    justification: { type: "string" },
  },
} as const;

export const EVALUATOR_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "strengths", "misses", "rewritten_reply"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: ACADEMY_DIMENSIONS.map((d) => d.key),
      properties: Object.fromEntries(
        ACADEMY_DIMENSIONS.map((d) => [d.key, DIMENSION_SCHEMA]),
      ),
    },
    strengths: { type: "array", items: { type: "string" } },
    misses: { type: "array", items: { type: "string" } },
    rewritten_reply: { type: "string" },
  },
} as const;

// ── Prompt ────────────────────────────────────────────────────────────────────

function transcriptText(turns: TrainingTurn[]): string {
  if (turns.length === 0) return "(no messages)";
  return turns
    .map((t) => `${t.role === "intern" ? "Concierge" : "Client"}: ${t.body}`)
    .join("\n");
}

function constraintsText(constraints: AcademyHiddenConstraint[]): string {
  if (constraints.length === 0) return "(none)";
  return constraints
    .map((c) => `- ${c.label}: ${c.value} (only fair to know if probed: "${c.reveal_when}")`)
    .join("\n");
}

const RUBRIC_TEXT = ACADEMY_DIMENSIONS.map(
  (d) => `- ${d.key} (${d.label}): ${d.description}`,
).join("\n");

const FEW_SHOT = `Calibration — score conservatively against these anchors:

A score of 2 (below standard) looks like: the concierge acknowledges the request but assumes instead of probing, misses the hidden constraints entirely, writes stiffly or defensively, and/or invents a detail that was never established ("I've confirmed your table for 8pm" when nothing was confirmed). Fabrication alone caps factual_accuracy at 2.

A score of 5 (exceptional, rare — roughly the top 5% of trainees) looks like: warm, unmistakably on-brand voice; probes precisely and surfaces the hidden constraints; invents nothing and is careful to say what is confirmed vs. being arranged; offers real, specific options; reads urgency correctly; and closes by confirming the concrete next step.

Most trainees land at 2 or 3. A 4 or 5 must be clearly earned — do not round up out of politeness. When in doubt between two scores, choose the lower.`;

export interface EvaluatorPromptInput {
  seed: Pick<
    ScenarioSeed,
    "archetype" | "vertical" | "ideal_outcome" | "escalation_trigger"
  >;
  /** Hidden constraints with per-session override applied. */
  resolvedConstraints: AcademyHiddenConstraint[];
  turns: TrainingTurn[];
}

export function buildEvaluatorPrompt(input: EvaluatorPromptInput): {
  system: string;
  user: string;
} {
  const system = `You are a rigorous, fair training evaluator for Indulge, a luxury lifestyle concierge company. You grade a trainee concierge's handling of a simulated member conversation. You are exacting and never inflate scores. You reward genuine skill and penalise invented details hard. You output ONLY the requested JSON — no preamble, no commentary.`;

  const user = `SCENARIO (private context — the trainee could only learn the "known if probed" facts by asking well):
Area: ${input.seed.vertical}
Client manner: ${input.seed.archetype}
Ideal outcome: ${input.seed.ideal_outcome}
The client was scripted to get impatient when: ${input.seed.escalation_trigger}
Hidden constraints and their true values this session:
${constraintsText(input.resolvedConstraints)}

RUBRIC — score each dimension 1–5:
${RUBRIC_TEXT}

${FEW_SHOT}

TRANSCRIPT (grade the Concierge's messages only):
${transcriptText(input.turns)}

Produce a JSON object with exactly these keys:
- "scores": an object with one entry per rubric dimension key above, each { "score": 1-5 integer, "justification": one concise sentence }.
- "strengths": an array of exactly 3 short strings — the strongest things the trainee did.
- "misses": an array of exactly 3 short strings — the most important things they missed or got wrong.
- "rewritten_reply": a single string — rewrite the trainee's single weakest message the way a top concierge would have written it (WhatsApp tone). If the trainee sent no messages, return an empty string.

Output only that JSON object.`;

  return { system, user };
}

// ── Parsing ───────────────────────────────────────────────────────────────────

export interface ParsedEvaluation {
  scores: AcademyRubricScores;
  strengths: string[];
  misses: string[];
  rewritten_reply: string;
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("ACADEMY_PARSE_ERROR: no JSON object in evaluator output");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function asStringArray(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, cap);
}

/**
 * Parse + normalise the model output. Clamps every dimension score to 1–5,
 * caps strengths/misses at 3, and throws if a rubric dimension is missing (so a
 * malformed evaluation is never silently persisted).
 */
export function parseEvaluatorResponse(raw: string): ParsedEvaluation {
  const obj = extractJson(raw) as Record<string, unknown>;
  const rawScores = (obj.scores ?? {}) as Record<string, unknown>;

  const scores = {} as AcademyRubricScores;
  for (const dim of ACADEMY_DIMENSIONS) {
    const entry = rawScores[dim.key] as
      | { score?: unknown; justification?: unknown }
      | undefined;
    if (!entry || typeof entry.score === "undefined") {
      throw new Error(
        `ACADEMY_PARSE_ERROR: missing score for dimension "${dim.key}"`,
      );
    }
    scores[dim.key] = {
      score: clampScore(Number(entry.score)),
      justification:
        typeof entry.justification === "string"
          ? entry.justification.trim()
          : "",
    };
  }

  return {
    scores,
    strengths: asStringArray(obj.strengths, 3),
    misses: asStringArray(obj.misses, 3),
    rewritten_reply:
      typeof obj.rewritten_reply === "string" ? obj.rewritten_reply.trim() : "",
  };
}

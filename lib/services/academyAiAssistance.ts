/**
 * Estimates how machine-like a trainee's submitted reply reads, and records it
 * beside the turn.
 *
 * This is a STYLE judgment, not provenance detection. Nothing available here can
 * observe where text came from: Anthropic's Messages API returns no token
 * log-probabilities, so the perplexity/burstiness method real detectors use is
 * not implementable on this stack. What a model *can* do is say whether prose
 * reads like a person or like generated copy — which, in a training simulator,
 * is the more useful signal anyway: an intern writing stiff bot prose needs the
 * same coaching either way.
 *
 * Two rules the prompt enforces and callers must preserve:
 *   1. Never name or guess a tool. "Sounds like ChatGPT" is not a finding.
 *   2. Refuse rather than guess. Short replies get `insufficient_text`, not a
 *      number — see MIN_WORDS_FOR_ESTIMATE.
 *
 * Swapping in a paid detector later means implementing `AiAssistanceDetector`
 * and passing it to `runAiAssistanceEstimate`; nothing else changes.
 *
 * Service-role writes only, matching academyEvaluator — an intern must not be
 * able to author their own score. NOT a "use server" module.
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";
import {
  ACADEMY_AI_ASSIST_MODEL,
  ACADEMY_AI_ASSIST_VERSION,
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
} from "@/lib/academy/models";
import {
  clampPercent,
  isEstimable,
  summariseComposition,
  wordCount,
  type AiAssistanceOutcome,
  type CompositionInput,
} from "@/lib/academy/aiAssistance";

// ── Detector interface (the swap point) ───────────────────────────────────────

export interface DetectorVerdict {
  percent: number;
  rationale: string;
}

export interface AiAssistanceDetector {
  /** Stored on the row as model_version, so score drift stays attributable. */
  version: string;
  /** Resolves null when the detector could not produce a usable verdict. */
  estimate(text: string): Promise<DetectorVerdict | null>;
}

// ── Claude style estimator ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You judge how machine-like a piece of writing reads.

You are reading one reply written by a trainee concierge to a luxury-lifestyle
client, in a WhatsApp-style chat. Estimate, from 0 to 100, how strongly the
writing reads as generated or heavily AI-assisted rather than personally written.

What raises the estimate:
- Uniform, evenly-weighted sentences with little rhythmic variation
- Hedging scaffolds and filler transitions ("Certainly!", "I'd be happy to
  assist you with that", "Rest assured", "Please don't hesitate to")
- Over-complete structure for the register: full restatement of the request,
  tidy enumerated options, a summarising closer — in a chat message
- Generic courtesy that could be pasted into any conversation unchanged
- Explaining rather than answering; padding around a thin fact

What LOWERS the estimate:
- Specifics only someone following THIS conversation would write
- Natural chat register: contractions, ellipsis, fragments, asides
- Small human irregularities — an abbreviation, a correction, uneven pacing
- Directness; answering in the fewest words the situation needs

Judge ONLY the writing in front of you. Critical constraints:
- Never name or speculate about any AI product. You cannot tell which tool, or
  whether one was used at all.
- Polished, correct or fluent writing is NOT by itself machine-like. Trainees
  are taught a house style and many are strong writers. Do not penalise
  competence, and do not penalise non-native phrasing or grammar slips — neither
  is evidence either way.
- Be conservative. When the reply is short or the signal is genuinely ambiguous,
  stay near the low end. A wrong high score has a real cost to a real person.

Reply with JSON only: {"percent": <integer 0-100>, "rationale": "<one sentence
about the writing itself, naming no tool>"}`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    percent: { type: "integer", minimum: 0, maximum: 100 },
    rationale: { type: "string" },
  },
  required: ["percent", "rationale"],
  additionalProperties: false,
} as const;

interface AnthropicResult {
  content?: { text?: string }[];
  stop_reason?: string;
}

/** Pull the JSON object out of a reply that may carry prose or fences around it. */
function parseVerdict(raw: string): DetectorVerdict | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.percent !== "number" || !Number.isFinite(obj.percent)) return null;

  return {
    percent: clampPercent(obj.percent),
    rationale:
      typeof obj.rationale === "string" && obj.rationale.trim()
        ? obj.rationale.trim().slice(0, 300)
        : "No rationale returned.",
  };
}

export const claudeStyleDetector: AiAssistanceDetector = {
  version: ACADEMY_AI_ASSIST_VERSION,

  async estimate(text) {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) return null;

    const body = {
      model: ACADEMY_AI_ASSIST_MODEL,
      max_tokens: 300,
      stream: false,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Reply to judge:\n\n${text}` }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    };

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
      console.error(
        "[academy/ai-assist] Anthropic error",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }

    const result = (await res.json()) as AnthropicResult;
    // A truncated verdict is not a verdict — better recorded as unavailable.
    if (result.stop_reason === "max_tokens") return null;

    return parseVerdict(result.content?.[0]?.text ?? "");
  },
};

// ── Persistence ───────────────────────────────────────────────────────────────

export interface EstimateParams {
  turnId: string;
  sessionId: string;
  internId: string;
  /** The exact text the trainee submitted. */
  text: string;
  /** Editor telemetry, when the client reported it. */
  composition?: CompositionInput | null;
}

export interface EstimateResult {
  outcome: AiAssistanceOutcome;
  percent: number | null;
}

/**
 * Estimate and persist. Never throws: a failed estimate must not take down the
 * chat turn it describes, so every failure is recorded as `unavailable` and
 * returned normally. Idempotent — `turn_id` is UNIQUE and a duplicate is ignored.
 */
export async function runAiAssistanceEstimate(
  params: EstimateParams,
  detector: AiAssistanceDetector = claudeStyleDetector,
): Promise<EstimateResult> {
  const { turnId, sessionId, internId, text } = params;
  const words = wordCount(text);

  let outcome: AiAssistanceOutcome = "estimated";
  let percent: number | null = null;
  let rationale: string | null = null;

  if (!isEstimable(text)) {
    // Deliberately no number. A score on a one-line reply would be noise, and
    // an invented midpoint would quietly drag every average toward it.
    outcome = "insufficient_text";
  } else {
    let verdict: DetectorVerdict | null = null;
    try {
      verdict = await detector.estimate(text);
    } catch (e) {
      console.error("[academy/ai-assist] detector threw:", (e as Error).message);
    }

    if (verdict) {
      percent = verdict.percent;
      rationale = verdict.rationale;
    } else {
      outcome = "unavailable";
    }
  }

  const composition = params.composition
    ? summariseComposition(params.composition)
    : null;

  const db = getServiceSupabaseClient();
  const { error } = await db.from("training_response_signals").insert({
    turn_id: turnId,
    session_id: sessionId,
    intern_id: internId,
    outcome,
    estimate_percent: percent,
    rationale,
    composition,
    model_version: outcome === "estimated" ? detector.version : null,
    word_count: words,
  });

  // 23505 = duplicate turn_id: already estimated, nothing to do.
  if (error && error.code !== "23505") {
    console.error("[academy/ai-assist] failed to persist:", error.code, error.message);
  }

  return { outcome, percent };
}

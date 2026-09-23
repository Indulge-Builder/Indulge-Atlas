/**
 * Ticket-review prompt + output schema + defensive parser.
 *
 * The second of Academy's two AI judgments. The evaluator
 * (`lib/academy/evaluator.ts`) grades the *conversation*; this grades the
 * *paperwork* — the Freshdesk update the intern writes once the client is
 * handled. They are deliberately separate calls with separate prompts: a
 * beautiful conversation with a useless ticket is a real failure mode on a
 * support desk, and it has to be able to show up in the score.
 *
 * As with the rubric, the headline number is NOT asked of the model:
 * `computeTicketQuality` derives it in code from the per-dimension scores, and
 * `decidePassed` can veto a model "pass" that contradicts its own scoring.
 *
 * Pure module — no I/O.
 */

import type {
  AcademyTicketReviewScores,
  AcademyTicketStatus,
  AcademyTicketVerdict,
} from "@/lib/types/database";
import { ACADEMY_TICKET_REVIEW_DIMENSIONS } from "@/lib/types/database";
import { clampScore } from "@/lib/academy/rubric";
import { isTerminalStatus, type TicketUpdateInput } from "@/lib/academy/ticket";

// ── Dimension definitions ────────────────────────────────────────────────────

export interface TicketDimensionDef {
  key: (typeof ACADEMY_TICKET_REVIEW_DIMENSIONS)[number];
  label: string;
  description: string;
  /** Relative weight in the quality score. */
  weight: number;
}

export const TICKET_REVIEW_DIMENSIONS: TicketDimensionDef[] = [
  {
    key: "completeness",
    label: "Completeness",
    description:
      "Does the update account for everything the client actually asked for, with nothing left dangling?",
    weight: 1.25,
  },
  {
    key: "professionalism",
    label: "Professionalism",
    description:
      "Is the write-up professional — clear, on-brand, free of blame and of shorthand a colleague would have to decode?",
    weight: 1,
  },
  {
    key: "accuracy",
    label: "Accuracy",
    description:
      "Does the write-up match what actually happened in the conversation, inventing nothing?",
    weight: 1.5,
  },
  {
    key: "client_satisfaction",
    label: "Client satisfaction",
    description:
      "Judging by the conversation and this write-up, would the member consider themselves properly looked after?",
    weight: 1,
  },
  {
    key: "documentation",
    label: "Documentation quality",
    description:
      "Could a different agent pick this ticket up cold and know exactly where things stand?",
    weight: 1.25,
  },
];

/** Any dimension at or below this fails the ticket regardless of the model's call. */
export const TICKET_HARD_FLOOR = 2;

/** Weighted quality must reach this to pass. */
export const TICKET_PASS_THRESHOLD = 3;

// ── Structured-output JSON schema ────────────────────────────────────────────

const DIMENSION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "justification"],
  properties: {
    score: { type: "integer", enum: [1, 2, 3, 4, 5] },
    justification: { type: "string" },
  },
} as const;

export const TICKET_REVIEW_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "passed", "feedback"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: TICKET_REVIEW_DIMENSIONS.map((d) => d.key),
      properties: Object.fromEntries(
        TICKET_REVIEW_DIMENSIONS.map((d) => [d.key, DIMENSION_SCHEMA]),
      ),
    },
    passed: { type: "boolean" },
    feedback: { type: "array", items: { type: "string" } },
  },
} as const;

// ── Prompt ───────────────────────────────────────────────────────────────────

const RUBRIC_TEXT = TICKET_REVIEW_DIMENSIONS.map(
  (d) => `- ${d.key} (${d.label}): ${d.description}`,
).join("\n");

export interface TicketReviewPromptInput {
  /** What the client originally wanted. */
  requestTitle: string;
  clientName: string;
  /** The ideal outcome from the seed — what "handled" actually means here. */
  idealOutcome: string;
  /** The conversation, so the reviewer can check the write-up against reality. */
  transcript: string;
  update: TicketUpdateInput;
}

export function buildTicketReviewPrompt(input: TicketReviewPromptInput): {
  system: string;
  user: string;
} {
  const system = `You are a senior support-desk quality reviewer at Indulge, a luxury lifestyle concierge company. You review the Freshdesk ticket a trainee concierge wrote after handling a member, and decide whether it is fit to close. You care about one thing above all: could a colleague pick this ticket up cold and know exactly what happened and what is outstanding? You are exacting, you never inflate, and you penalise write-ups that claim things the conversation does not support. You output ONLY the requested JSON — no preamble, no commentary.`;

  const user = `THE REQUEST
Client: ${input.clientName}
Subject: ${input.requestTitle}
What "handled" should mean here: ${input.idealOutcome}

THE CONVERSATION (ground truth — the ticket must not contradict or overclaim this):
${input.transcript || "(no messages)"}

THE TICKET THE TRAINEE SUBMITTED
Status: ${input.update.status}
Priority: ${input.update.priority}
Tags: ${input.update.tags.join(", ") || "(none)"}
Time spent: ${input.update.time_spent_minutes} minutes

Resolution summary:
${input.update.resolution_summary}

Internal notes:
${input.update.internal_notes}

REVIEW RUBRIC — score each dimension 1–5:
${RUBRIC_TEXT}

Score conservatively. A 3 means "acceptable, would pass on a busy day". A 5 is rare and must be earned. If the resolution summary asserts something the conversation never established, accuracy cannot exceed 2. If the internal notes are empty of real context ("done", "resolved", "n/a"), documentation cannot exceed 2.

Produce a JSON object with exactly these keys:
- "scores": an object with one entry per rubric dimension key above, each { "score": 1-5 integer, "justification": one concise sentence }.
- "passed": boolean — true only if this ticket is genuinely fit to close as written.
- "feedback": an array of 0–4 short, concrete, actionable strings telling the trainee exactly what to fix. Empty array if passed. Each item must name the field and the missing thing, e.g. "Add the warranty period to the resolution summary" or "Internal notes should record which vendor you recommended and why". Never vague ("be more detailed").

Output only that JSON object.`;

  return { system, user };
}

// ── Scoring (computed in code) ───────────────────────────────────────────────

/** Weighted 1–5 quality from the per-dimension scores. */
export function computeTicketQuality(scores: AcademyTicketReviewScores): number {
  let weighted = 0;
  let total = 0;
  for (const dim of TICKET_REVIEW_DIMENSIONS) {
    const s = scores[dim.key]?.score;
    if (typeof s !== "number" || Number.isNaN(s)) continue;
    weighted += s * dim.weight;
    total += dim.weight;
  }
  if (total === 0) return 0;
  return Math.round((weighted / total) * 10) / 10;
}

/**
 * The final pass call.
 *
 * The model's `passed` is treated as a recommendation that can only ever be
 * *downgraded* here — a ticket cannot pass with a dimension in the floor, with
 * a sub-threshold weighted quality, or while parked in a non-terminal status.
 * A support desk does not close a ticket that is still "Waiting on Customer".
 */
export function decidePassed(
  modelPassed: boolean,
  scores: AcademyTicketReviewScores,
  quality: number,
  status: AcademyTicketStatus,
): boolean {
  if (!modelPassed) return false;
  if (!isTerminalStatus(status)) return false;
  if (quality < TICKET_PASS_THRESHOLD) return false;
  return TICKET_REVIEW_DIMENSIONS.every(
    (d) => (scores[d.key]?.score ?? 0) > TICKET_HARD_FLOOR,
  );
}

/** 1–5 weighted quality → 0..1, for the progress model. */
export function ticketQualityNormalised(quality: number): number {
  if (!Number.isFinite(quality)) return 0;
  return Math.max(0, Math.min(1, (quality - 1) / 4));
}

// ── Parsing ──────────────────────────────────────────────────────────────────

export interface ParsedTicketReview {
  scores: AcademyTicketReviewScores;
  passed: boolean;
  feedback: string[];
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(
        "ACADEMY_PARSE_ERROR: no JSON object in ticket-review output",
      );
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/**
 * Parse + normalise. Throws on a missing dimension so a malformed review is
 * never persisted as a pass.
 */
export function parseTicketReviewResponse(raw: string): ParsedTicketReview {
  const obj = extractJson(raw) as Record<string, unknown>;
  const rawScores = (obj.scores ?? {}) as Record<string, unknown>;

  const scores = {} as AcademyTicketReviewScores;
  for (const dim of TICKET_REVIEW_DIMENSIONS) {
    const entry = rawScores[dim.key] as
      | { score?: unknown; justification?: unknown }
      | undefined;
    if (!entry || typeof entry.score === "undefined") {
      throw new Error(
        `ACADEMY_PARSE_ERROR: missing ticket-review score for "${dim.key}"`,
      );
    }
    scores[dim.key] = {
      score: clampScore(Number(entry.score)),
      justification:
        typeof entry.justification === "string" ? entry.justification.trim() : "",
    };
  }

  const feedback = Array.isArray(obj.feedback)
    ? obj.feedback
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
        .slice(0, 4)
    : [];

  return { scores, passed: obj.passed === true, feedback };
}

/** Assemble the persisted verdict from a parsed review. */
export function buildVerdict(
  parsed: ParsedTicketReview,
  status: AcademyTicketStatus,
  modelVersion: string,
): AcademyTicketVerdict {
  const quality = computeTicketQuality(parsed.scores);
  // Whether the write-up met the documentation bar. This no longer gates
  // completion — the trainee gets one submission and the request is handled on
  // it — but it still sets `quality`, which carries into the progress model, and
  // it decides whether the trainee is shown fixes to learn from.
  const meetsBar = decidePassed(parsed.passed, parsed.scores, quality, status);

  // Feedback must explain itself, or the intern sees a weak score with no way to
  // understand it.
  const feedback = [...parsed.feedback];
  if (!meetsBar && feedback.length === 0) {
    if (!isTerminalStatus(status)) {
      feedback.push(
        "Set the ticket status to Resolved or Closed once the request is genuinely handled.",
      );
    } else {
      feedback.push(
        "This write-up came in below the documentation bar — the weakest sections are scored above.",
      );
    }
  }

  return {
    // One submission per ticket: submitting accepts it and hands the request in.
    passed: true,
    meets_bar: meetsBar,
    feedback: meetsBar ? [] : feedback,
    scores: parsed.scores,
    quality,
    model_version: modelVersion,
  };
}

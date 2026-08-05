/**
 * Academy — evaluator prompt, output schema, and parser.
 *
 * The evaluator is the part of Academy an intern will argue with, so its two
 * failure modes are both tested here:
 *   - score inflation (the prompt must anchor low and break ties downward), and
 *   - silent corruption (a malformed model payload must throw, never persist).
 *
 * Pure module under test — no network, no mocks of `@/lib/academy/evaluator`.
 */

import { describe, it, expect } from "vitest";
import {
  EVALUATOR_OUTPUT_SCHEMA,
  buildEvaluatorPrompt,
  parseEvaluatorResponse,
} from "@/lib/academy/evaluator";
import type { EvaluatorPromptInput } from "@/lib/academy/evaluator";
import {
  ACADEMY_DIMENSIONS,
  DEFAULT_RUBRIC_WEIGHTS,
  computeOverall,
} from "@/lib/academy/rubric";
import {
  ACADEMY_EVALUATOR_MODEL,
  ACADEMY_EVALUATOR_VERSION,
  ACADEMY_TICKET_REVIEW_MODEL,
  ACADEMY_TICKET_REVIEW_VERSION,
  modelSupportsEffort,
} from "@/lib/academy/models";
import type {
  AcademyHiddenConstraint,
  AcademyRubricDimension,
  TrainingTurn,
} from "@/lib/types/database";

// ── Fixtures ─────────────────────────────────────────────────────────────────

let seq = 0;
function turn(role: "client" | "intern", body: string): TrainingTurn {
  seq += 1;
  return {
    id: `turn-${seq}`,
    session_id: "session-1",
    role,
    body,
    seq,
    created_at: `2026-07-27T10:0${seq % 10}:00.000Z`,
  };
}

const CONSTRAINTS: AcademyHiddenConstraint[] = [
  {
    id: "c1",
    label: "Dietary",
    reveal_when: "asked directly about dietary needs",
    value: "One guest is strictly vegan",
  },
  {
    id: "c2",
    label: "Timing",
    reveal_when: "asked which evening actually works",
    value: "Only Friday evening works",
  },
];

const TRANSCRIPT: TrainingTurn[] = [
  turn("client", "Need a table for four later this week — somewhere quiet."),
  turn("intern", "Of course. May I ask which evening suits you best?"),
  turn("client", "Only Friday evening works, and one of us is vegan."),
  turn("intern", "Noted. I will come back to you within the hour with options."),
];

function promptInput(
  overrides: Partial<EvaluatorPromptInput> = {},
): EvaluatorPromptInput {
  return {
    seed: {
      archetype: "Warm but exacting; texts in short bursts",
      vertical: "Global",
      ideal_outcome:
        "Concierge probes for the dietary constraint and the evening, then offers two specific venues and confirms the next step.",
      escalation_trigger:
        "the concierge repeats a question already answered, or offers nothing concrete after two replies",
    },
    resolvedConstraints: CONSTRAINTS,
    turns: TRANSCRIPT,
    ...overrides,
  };
}

function payload(
  scoreFor: (dim: AcademyRubricDimension) => number,
  extra: {
    strengths?: string[];
    misses?: string[];
    rewritten_reply?: string;
    omit?: AcademyRubricDimension;
  } = {},
): string {
  const scores: Record<string, { score: number; justification: string }> = {};
  for (const dim of ACADEMY_DIMENSIONS) {
    if (extra.omit === dim.key) continue;
    scores[dim.key] = {
      score: scoreFor(dim.key),
      justification: `Justification for ${dim.key}.`,
    };
  }
  return JSON.stringify({
    scores,
    strengths: extra.strengths ?? ["Probed well", "Warm tone", "Clear close"],
    misses: extra.misses ?? ["No options offered", "No timeline", "No confirmation"],
    rewritten_reply:
      extra.rewritten_reply ??
      "Friday it is — and I have flagged the vegan guest. Two options with you within the hour.",
  });
}

/** A single fixed model output reused by the determinism assertions. */
const FIXED_MODEL_OUTPUT = payload((dim) =>
  dim === "factual_accuracy" ? 4 : dim === "brand_tone" ? 5 : 3,
);

// ── Prompt: anti-inflation anchoring ─────────────────────────────────────────

describe("buildEvaluatorPrompt — calibration anchors", () => {
  it("pins both few-shot anchors: a 2 and a 5", () => {
    const { user } = buildEvaluatorPrompt(promptInput());
    expect(user).toMatch(/A score of 2\b/);
    expect(user).toMatch(/A score of 5\b/);
    // The 2 anchor describes assuming instead of probing + fabrication.
    expect(user).toMatch(/assumes instead of probing/i);
    expect(user).toMatch(/Fabrication alone caps factual_accuracy at 2/);
    // The 5 anchor is explicitly rare.
    expect(user).toMatch(/exceptional, rare/i);
    expect(user).toMatch(/top 5% of trainees/i);
  });

  it("instructs the model to choose the lower score when in doubt", () => {
    const { user } = buildEvaluatorPrompt(promptInput());
    expect(user).toMatch(
      /when in doubt between two scores, choose the lower/i,
    );
    expect(user).toMatch(/do not round up out of politeness/i);
    expect(user).toMatch(/Most trainees land at 2 or 3/i);
  });

  it("tells the system role never to inflate and to emit JSON only", () => {
    const { system } = buildEvaluatorPrompt(promptInput());
    expect(system).toMatch(/never inflate scores/i);
    expect(system).toMatch(/penalise invented details hard/i);
    expect(system).toMatch(/output ONLY the requested JSON/i);
  });
});

describe("buildEvaluatorPrompt — context it must carry", () => {
  it("includes the full transcript with speaker labels", () => {
    const { user } = buildEvaluatorPrompt(promptInput());
    for (const t of TRANSCRIPT) {
      const label = t.role === "intern" ? "Concierge" : "Client";
      expect(user).toContain(`${label}: ${t.body}`);
    }
    expect(user).toMatch(/grade the Concierge's messages only/i);
  });

  it("includes every resolved hidden-constraint value and its probe", () => {
    const { user } = buildEvaluatorPrompt(promptInput());
    for (const c of CONSTRAINTS) {
      expect(user).toContain(c.label);
      expect(user).toContain(c.value);
      expect(user).toContain(c.reveal_when);
    }
  });

  it("uses the per-session override, not the library seed value", () => {
    const overridden = CONSTRAINTS.map((c) =>
      c.id === "c2" ? { ...c, value: "Only Saturday evening works" } : c,
    );
    const { user } = buildEvaluatorPrompt(
      promptInput({ resolvedConstraints: overridden }),
    );
    // The constraints block carries the mutated value…
    expect(user).toContain("- Timing: Only Saturday evening works");
    expect(user).not.toContain("- Timing: Only Friday evening works");
    // …while the transcript is untouched (the client said Friday in this run).
    expect(user).toContain("Client: Only Friday evening works, and one of us is vegan.");
  });

  it("includes the ideal outcome and the escalation trigger", () => {
    const input = promptInput();
    const { user } = buildEvaluatorPrompt(input);
    expect(user).toContain(input.seed.ideal_outcome);
    expect(user).toContain(input.seed.escalation_trigger);
    expect(user).toContain(input.seed.archetype);
    expect(user).toContain(input.seed.vertical);
  });

  it("lists all six rubric dimensions with their descriptions", () => {
    const { user } = buildEvaluatorPrompt(promptInput());
    for (const dim of ACADEMY_DIMENSIONS) {
      expect(user).toContain(dim.key);
      expect(user).toContain(dim.label);
      expect(user).toContain(dim.description);
    }
    expect(user).toMatch(/score each dimension 1–5/i);
  });

  it("never asks the model for the overall score (computed in code)", () => {
    const { user } = buildEvaluatorPrompt(promptInput());
    expect(user).not.toMatch(/"overall"/);
  });

  it("degrades cleanly on an empty transcript and no constraints", () => {
    const { user } = buildEvaluatorPrompt(
      promptInput({ turns: [], resolvedConstraints: [] }),
    );
    expect(user).toContain("(no messages)");
    expect(user).toContain("(none)");
    expect(user).toMatch(/If the trainee sent no messages, return an empty string/i);
  });
});

// ── Output schema ────────────────────────────────────────────────────────────

describe("EVALUATOR_OUTPUT_SCHEMA", () => {
  it("requires all six rubric dimensions", () => {
    const required = EVALUATOR_OUTPUT_SCHEMA.properties.scores.required;
    expect(required).toHaveLength(6);
    for (const dim of ACADEMY_DIMENSIONS) {
      expect(required).toContain(dim.key);
    }
  });

  it("requires the four top-level keys and forbids extras", () => {
    expect([...EVALUATOR_OUTPUT_SCHEMA.required]).toEqual([
      "scores",
      "strengths",
      "misses",
      "rewritten_reply",
    ]);
    expect(EVALUATOR_OUTPUT_SCHEMA.additionalProperties).toBe(false);
    expect(EVALUATOR_OUTPUT_SCHEMA.properties.scores.additionalProperties).toBe(
      false,
    );
  });

  it("constrains every dimension to an integer 1–5 plus a justification", () => {
    const props = EVALUATOR_OUTPUT_SCHEMA.properties.scores.properties as Record<
      string,
      {
        required: readonly string[];
        properties: { score: { type: string; enum: readonly number[] } };
      }
    >;
    for (const dim of ACADEMY_DIMENSIONS) {
      const entry = props[dim.key];
      expect(entry, `missing schema for ${dim.key}`).toBeDefined();
      expect([...entry.required]).toEqual(["score", "justification"]);
      expect(entry.properties.score.type).toBe("integer");
      expect([...entry.properties.score.enum]).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

// ── Parser ───────────────────────────────────────────────────────────────────

describe("parseEvaluatorResponse — happy path", () => {
  it("parses a well-formed payload", () => {
    const parsed = parseEvaluatorResponse(payload(() => 4));
    expect(Object.keys(parsed.scores).sort()).toEqual(
      ACADEMY_DIMENSIONS.map((d) => d.key).sort(),
    );
    for (const dim of ACADEMY_DIMENSIONS) {
      expect(parsed.scores[dim.key].score).toBe(4);
      expect(parsed.scores[dim.key].justification).toBe(
        `Justification for ${dim.key}.`,
      );
    }
    expect(parsed.strengths).toHaveLength(3);
    expect(parsed.misses).toHaveLength(3);
    expect(parsed.rewritten_reply).toMatch(/^Friday it is/);
  });

  it("trims justifications and the rewritten reply", () => {
    const raw = JSON.stringify({
      scores: Object.fromEntries(
        ACADEMY_DIMENSIONS.map((d) => [
          d.key,
          { score: 3, justification: "   padded   " },
        ]),
      ),
      strengths: ["  a  ", "b"],
      misses: ["c"],
      rewritten_reply: "  tidy me  ",
    });
    const parsed = parseEvaluatorResponse(raw);
    expect(parsed.scores.comprehension.justification).toBe("padded");
    expect(parsed.strengths).toEqual(["a", "b"]);
    expect(parsed.rewritten_reply).toBe("tidy me");
  });
});

describe("parseEvaluatorResponse — clamping and capping", () => {
  it("clamps an out-of-range 0 up to 1 and a 9 down to 5", () => {
    const parsed = parseEvaluatorResponse(
      payload((dim) => (dim === "comprehension" ? 0 : dim === "brand_tone" ? 9 : 3)),
    );
    expect(parsed.scores.comprehension.score).toBe(1);
    expect(parsed.scores.brand_tone.score).toBe(5);
    expect(parsed.scores.closure.score).toBe(3);
  });

  it("clamps negatives, rounds fractions, and floors garbage to 1", () => {
    const raw = JSON.stringify({
      scores: {
        comprehension: { score: -7, justification: "" },
        brand_tone: { score: 3.4, justification: "" },
        factual_accuracy: { score: 3.5, justification: "" },
        proactivity: { score: "4", justification: "" },
        escalation_judgment: { score: "not a number", justification: "" },
        closure: { score: 100, justification: "" },
      },
      strengths: [],
      misses: [],
      rewritten_reply: "",
    });
    const parsed = parseEvaluatorResponse(raw);
    expect(parsed.scores.comprehension.score).toBe(1);
    expect(parsed.scores.brand_tone.score).toBe(3);
    expect(parsed.scores.factual_accuracy.score).toBe(4);
    expect(parsed.scores.proactivity.score).toBe(4);
    expect(parsed.scores.escalation_judgment.score).toBe(1);
    expect(parsed.scores.closure.score).toBe(5);
  });

  it("caps strengths and misses at 3 and drops blank entries", () => {
    const parsed = parseEvaluatorResponse(
      payload(() => 3, {
        strengths: ["s1", "s2", "s3", "s4", "s5"],
        misses: ["m1", "   ", "m2", "m3", "m4"],
      }),
    );
    expect(parsed.strengths).toEqual(["s1", "s2", "s3"]);
    expect(parsed.misses).toEqual(["m1", "m2", "m3"]);
  });

  it("returns empty arrays when strengths/misses are not arrays", () => {
    const raw = JSON.stringify({
      scores: Object.fromEntries(
        ACADEMY_DIMENSIONS.map((d) => [d.key, { score: 3, justification: "x" }]),
      ),
      strengths: "nope",
      misses: null,
      rewritten_reply: 42,
    });
    const parsed = parseEvaluatorResponse(raw);
    expect(parsed.strengths).toEqual([]);
    expect(parsed.misses).toEqual([]);
    expect(parsed.rewritten_reply).toBe("");
  });
});

describe("parseEvaluatorResponse — loose model output", () => {
  it("extracts JSON from a ```json markdown fence", () => {
    const fenced = "```json\n" + payload(() => 3) + "\n```";
    const parsed = parseEvaluatorResponse(fenced);
    expect(parsed.scores.proactivity.score).toBe(3);
  });

  it("extracts JSON wrapped in conversational prose", () => {
    const wrapped =
      "Here is my evaluation of the trainee:\n\n" +
      payload(() => 2) +
      "\n\nLet me know if you want more detail.";
    const parsed = parseEvaluatorResponse(wrapped);
    expect(parsed.scores.factual_accuracy.score).toBe(2);
  });

  it("tolerates leading and trailing whitespace", () => {
    const parsed = parseEvaluatorResponse(`\n\n   ${payload(() => 5)}   \n`);
    expect(parsed.scores.closure.score).toBe(5);
  });
});

describe("parseEvaluatorResponse — refuses to persist a broken evaluation", () => {
  it("throws when a rubric dimension is missing", () => {
    expect(() =>
      parseEvaluatorResponse(payload(() => 4, { omit: "closure" })),
    ).toThrow(/ACADEMY_PARSE_ERROR: missing score for dimension "closure"/);
  });

  it("throws for every dimension when it is the one omitted", () => {
    for (const dim of ACADEMY_DIMENSIONS) {
      expect(() =>
        parseEvaluatorResponse(payload(() => 3, { omit: dim.key })),
      ).toThrow(new RegExp(`missing score for dimension "${dim.key}"`));
    }
  });

  it("throws when the scores object is absent entirely", () => {
    const raw = JSON.stringify({ strengths: [], misses: [], rewritten_reply: "" });
    expect(() => parseEvaluatorResponse(raw)).toThrow(/ACADEMY_PARSE_ERROR/);
  });

  it("throws when there is no JSON object at all", () => {
    expect(() => parseEvaluatorResponse("I'm afraid I cannot help with that.")).toThrow(
      /ACADEMY_PARSE_ERROR: no JSON object in evaluator output/,
    );
  });
});

// ── Determinism ──────────────────────────────────────────────────────────────

describe("parsing is deterministic (same model output → same review)", () => {
  it("yields deeply-equal results across 3 parses", () => {
    const runs = [
      parseEvaluatorResponse(FIXED_MODEL_OUTPUT),
      parseEvaluatorResponse(FIXED_MODEL_OUTPUT),
      parseEvaluatorResponse(FIXED_MODEL_OUTPUT),
    ];
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
    // Deep-equal, not identity: each parse builds a fresh object.
    expect(runs[1]).not.toBe(runs[0]);
  });

  it("produces an identical overall across 3 parses", () => {
    const overalls = [0, 1, 2].map(() =>
      computeOverall(
        parseEvaluatorResponse(FIXED_MODEL_OUTPUT).scores,
        DEFAULT_RUBRIC_WEIGHTS,
      ),
    );
    expect(new Set(overalls).size).toBe(1);
    expect(overalls[0]).toBe(overalls[1]);
    expect(overalls[1]).toBe(overalls[2]);
    expect(Number.isFinite(overalls[0])).toBe(true);
    expect(overalls[0]).toBeGreaterThanOrEqual(1);
    expect(overalls[0]).toBeLessThanOrEqual(5);
  });

  it("is stable through the fence/prose variants of the same payload", () => {
    const plain = parseEvaluatorResponse(FIXED_MODEL_OUTPUT);
    const fenced = parseEvaluatorResponse("```json\n" + FIXED_MODEL_OUTPUT + "\n```");
    const prosed = parseEvaluatorResponse(
      "Sure — here it is.\n" + FIXED_MODEL_OUTPUT + "\nDone.",
    );
    expect(fenced).toEqual(plain);
    expect(prosed).toEqual(plain);
    expect(computeOverall(fenced.scores, DEFAULT_RUBRIC_WEIGHTS)).toBe(
      computeOverall(plain.scores, DEFAULT_RUBRIC_WEIGHTS),
    );
  });

  it("builds an identical prompt from identical input", () => {
    const a = buildEvaluatorPrompt(promptInput());
    const b = buildEvaluatorPrompt(promptInput());
    expect(b.system).toBe(a.system);
    expect(b.user).toBe(a.user);
  });
});

// ── Model configuration ──────────────────────────────────────────────────────
//
// Which judge model runs is a cost decision, but `output_config.effort` is not
// universally accepted: Haiku and Sonnet 4.5 reject the whole request rather
// than ignoring the field, so a model change that leaves `effort` attached is a
// 400 on every scoring call, not a quality regression. These pin the pairing.

describe("judge model configuration", () => {
  it("does not send effort to models that reject it", () => {
    expect(modelSupportsEffort("claude-haiku-4-5")).toBe(false);
    expect(modelSupportsEffort("claude-haiku-4-5-20251001")).toBe(false);
    expect(modelSupportsEffort("claude-sonnet-4-5")).toBe(false);
  });

  it("still sends effort to the models that support it", () => {
    for (const model of [
      "claude-opus-4-8",
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-sonnet-4-6",
    ]) {
      expect(modelSupportsEffort(model), `${model} supports effort`).toBe(true);
    }
  });

  it("keeps both judges on a model the effort check agrees with", () => {
    // The services derive their request shape from exactly this call, so the
    // constants and the capability check cannot drift apart unnoticed.
    for (const model of [ACADEMY_EVALUATOR_MODEL, ACADEMY_TICKET_REVIEW_MODEL]) {
      expect(typeof modelSupportsEffort(model)).toBe("boolean");
    }
    // Both judges run on the same tier — a split would make the two halves of
    // one request's score incomparable.
    expect(ACADEMY_TICKET_REVIEW_MODEL).toBe(ACADEMY_EVALUATOR_MODEL);
  });

  it("stamps the model into the version, so a tier change is visible in the data", () => {
    // Reviews persist these strings. If the model moves and the stamp doesn't,
    // scores from two different judges become indistinguishable in the table.
    expect(ACADEMY_EVALUATOR_VERSION).toContain("haiku");
    expect(ACADEMY_TICKET_REVIEW_VERSION).toContain("haiku");
  });
});

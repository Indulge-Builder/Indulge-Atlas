/**
 * Academy — per-session randomisation.
 *
 * This is the anti-memorisation layer: the same seed must not produce the same
 * drill twice. Three properties are load-bearing and tested here:
 *   - the rendered opening message substitutes the session's synthetic name/date;
 *   - EXACTLY ONE hidden constraint is mutated per session (so the "right answer"
 *     moves), and the rest are byte-identical to the library seed;
 *   - with an injected rng the whole thing is reproducible, so a session can be
 *     reasoned about after the fact.
 *
 * Pure module under test — rng is injected, never stubbed globally.
 */

import { describe, it, expect } from "vitest";
import {
  buildSessionVars,
  mutateConstraintValue,
  randomizeSession,
  renderTemplate,
} from "@/lib/academy/randomize";
import type { RandomizeResult } from "@/lib/academy/randomize";
import type {
  AcademyHiddenConstraint,
  ScenarioSeed,
} from "@/lib/types/database";

// ── Deterministic rng ────────────────────────────────────────────────────────

/**
 * `randomizeSession` consumes exactly three rng values: name, date, and the
 * rotation start index for the constraint to mutate. A fresh generator per call
 * makes runs comparable.
 */
function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CONSTRAINTS: AcademyHiddenConstraint[] = [
  {
    id: "c1",
    label: "Dietary",
    // Immutable: no weekday, no standalone 2–9 integer.
    reveal_when: "asked directly about dietary needs",
    value: "One guest is strictly vegan",
  },
  {
    id: "c2",
    label: "Timing",
    reveal_when: "asked which evening actually works",
    value: "Only Thursday works",
  },
  {
    id: "c3",
    label: "Party",
    reveal_when: "asked how many are coming",
    value: "Party of 4 including the host",
  },
];

const OPENING = "Hi, {{name}} here — I need something sorted {{date}}. Can you help?";

function seed(overrides: Partial<ScenarioSeed> = {}): ScenarioSeed {
  return {
    id: "seed-1",
    title: "Late dinner rescue",
    archetype: "Warm but exacting; texts in short bursts",
    vertical: "Global",
    opening_message: OPENING,
    hidden_constraints: CONSTRAINTS,
    difficulty: "medium",
    escalation_trigger:
      "the concierge repeats a question already answered, or offers nothing concrete after two replies",
    ideal_outcome:
      "Concierge probes for the dietary constraint and the evening, then offers two specific venues.",
    rubric_weights: { factual_accuracy: 1.5 },
    is_active: true,
    created_by: "trainer-1",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

// ── renderTemplate ───────────────────────────────────────────────────────────

describe("renderTemplate", () => {
  it("substitutes {{name}} and {{date}}", () => {
    expect(
      renderTemplate("Hi {{name}}, see you {{date}}.", {
        name: "Aria",
        date: "later this week",
      }),
    ).toBe("Hi Aria, see you later this week.");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(
      renderTemplate("Hi {{ name }} — {{  date  }} works?", {
        name: "Idris",
        date: "early next week",
      }),
    ).toBe("Hi Idris — early next week works?");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(
      renderTemplate("{{name}} here. Yes, {{name}} again — {{date}}, {{ date }}.", {
        name: "Noor",
        date: "in a few days",
      }),
    ).toBe("Noor here. Yes, Noor again — in a few days, in a few days.");
  });

  it("leaves unknown tokens untouched", () => {
    expect(
      renderTemplate("{{name}} needs a {{vertical}} booking", {
        name: "Priya",
        date: "later this week",
      }),
    ).toBe("Priya needs a {{vertical}} booking");
  });

  it("returns text without tokens unchanged", () => {
    const text = "No placeholders at all here.";
    expect(renderTemplate(text, { name: "Yara", date: "soon" })).toBe(text);
  });
});

// ── mutateConstraintValue ────────────────────────────────────────────────────

describe("mutateConstraintValue — weekdays", () => {
  it("shifts Thursday to Friday", () => {
    expect(mutateConstraintValue("Only Thursday works")).toBe("Only Friday works");
  });

  it("wraps Sunday round to Monday", () => {
    expect(mutateConstraintValue("Arrives Sunday morning")).toBe(
      "Arrives Monday morning",
    );
  });

  it("matches the weekday case-insensitively and writes back canonical case", () => {
    expect(mutateConstraintValue("only thursday works")).toBe("only Friday works");
  });

  it("prefers the weekday over any number in the same value", () => {
    expect(mutateConstraintValue("Thursday, party of 4")).toBe(
      "Friday, party of 4",
    );
  });
});

describe("mutateConstraintValue — small integers", () => {
  it("nudges a standalone small integer upward", () => {
    expect(mutateConstraintValue("Party of 4 including the host")).toBe(
      "Party of 5 including the host",
    );
  });

  it("nudges 9 downward so it stays in band", () => {
    expect(mutateConstraintValue("Needs 9 seats")).toBe("Needs 8 seats");
  });

  it("ignores 0, 1 and multi-digit numbers", () => {
    expect(mutateConstraintValue("Budget is 1 lakh")).toBeNull();
    expect(mutateConstraintValue("10 guests confirmed")).toBeNull();
    expect(mutateConstraintValue("Suite 24 on the top floor")).toBeNull();
  });
});

describe("mutateConstraintValue — nothing to mutate", () => {
  it("returns null when there is neither a weekday nor a small integer", () => {
    expect(mutateConstraintValue("Prefers a quiet corner table")).toBeNull();
    expect(mutateConstraintValue("Dislikes tasting menus")).toBeNull();
    expect(mutateConstraintValue("")).toBeNull();
  });
});

// ── randomizeSession ─────────────────────────────────────────────────────────

describe("randomizeSession — reproducibility", () => {
  it("returns identical results for two identical injected rngs", () => {
    const a = randomizeSession(seed(), fixedRng([0.1, 0.6, 0.34]));
    const b = randomizeSession(seed(), fixedRng([0.1, 0.6, 0.34]));
    expect(b).toEqual(a);
  });

  it("varies with the rng — a different stream picks a different constraint", () => {
    const first = randomizeSession(seed(), fixedRng([0.1, 0.6, 0.0]));
    const last = randomizeSession(seed(), fixedRng([0.1, 0.6, 0.7]));
    // start = 0 skips the immutable c1 and lands on c2; start = 2 lands on c3.
    expect(first.constraintOverride?.id).toBe("c2");
    expect(last.constraintOverride?.id).toBe("c3");
  });

  it("renders the opening message with the session's name and date", () => {
    const r = randomizeSession(seed(), fixedRng([0.1, 0.6, 0.34]));
    expect(r.name.length).toBeGreaterThan(0);
    expect(r.date.length).toBeGreaterThan(0);
    expect(r.openingMessage).toContain(r.name);
    expect(r.openingMessage).toContain(r.date);
    expect(r.openingMessage).not.toContain("{{");
    expect(r.openingMessage).not.toContain("}}");
  });
});

describe("randomizeSession — mutates exactly one constraint", () => {
  const result = randomizeSession(seed(), fixedRng([0.1, 0.6, 0.34]));

  it("selects a single constraint and reports it as the override", () => {
    // start = floor(0.34 * 3) = 1 → the rotation begins at c2, which is mutable.
    expect(result.constraintOverride).not.toBeNull();
    expect(result.constraintOverride?.id).toBe("c2");
    expect(result.constraintOverride?.value).toBe(
      mutateConstraintValue("Only Thursday works"),
    );
  });

  it("changes exactly one value and no more", () => {
    const changed = result.resolvedConstraints.filter(
      (c, i) => c.value !== CONSTRAINTS[i].value,
    );
    expect(changed).toHaveLength(1);
    expect(changed[0].id).toBe(result.constraintOverride?.id);
  });

  it("leaves the other constraints byte-identical to the seed", () => {
    expect(result.resolvedConstraints).toHaveLength(CONSTRAINTS.length);
    expect(result.resolvedConstraints[0]).toEqual(CONSTRAINTS[0]);
    expect(result.resolvedConstraints[2]).toEqual(CONSTRAINTS[2]);
  });

  it("reflects the override in resolvedConstraints, keeping label and probe", () => {
    const resolved = result.resolvedConstraints.find((c) => c.id === "c2");
    expect(resolved).toBeDefined();
    expect(resolved!.value).toBe("Only Friday works");
    expect(resolved!.label).toBe(CONSTRAINTS[1].label);
    expect(resolved!.reveal_when).toBe(CONSTRAINTS[1].reveal_when);
  });

  it("does not mutate the seed's own constraint objects", () => {
    expect(CONSTRAINTS[1].value).toBe("Only Thursday works");
  });
});

describe("randomizeSession — nothing mutable", () => {
  const immutable: AcademyHiddenConstraint[] = [
    {
      id: "x1",
      label: "Seating",
      reveal_when: "asked about seating",
      value: "Prefers a quiet corner table",
    },
    {
      id: "x2",
      label: "Menu",
      reveal_when: "asked about the menu",
      value: "Dislikes tasting menus",
    },
  ];

  it("returns a null override and passes the constraints through unchanged", () => {
    const r = randomizeSession(
      seed({ hidden_constraints: immutable }),
      fixedRng([0.2, 0.2, 0.2]),
    );
    expect(r.constraintOverride).toBeNull();
    expect(r.resolvedConstraints).toEqual(immutable);
  });

  it("handles a seed with no constraints at all", () => {
    const r = randomizeSession(
      seed({ hidden_constraints: [] }),
      fixedRng([0.2, 0.2, 0.2]),
    );
    expect(r.constraintOverride).toBeNull();
    expect(r.resolvedConstraints).toEqual([]);
    expect(r.openingMessage).toContain(r.name);
  });
});

// ── buildSessionVars ─────────────────────────────────────────────────────────

describe("buildSessionVars", () => {
  const s = seed();
  const result: RandomizeResult = randomizeSession(s, fixedRng([0.1, 0.6, 0.34]));
  const vars = buildSessionVars(s, result);

  it("snapshots exactly the five safe display fields", () => {
    expect(Object.keys(vars.display).sort()).toEqual(
      ["archetype", "difficulty", "id", "title", "vertical"].sort(),
    );
    expect(vars.display).toEqual({
      id: s.id,
      title: s.title,
      archetype: s.archetype,
      vertical: s.vertical,
      difficulty: s.difficulty,
    });
  });

  it("records the randomised name and date", () => {
    expect(vars.randomized).toEqual({ name: result.name, date: result.date });
  });

  it("records the constraint override so the evaluator sees the same truth", () => {
    expect(vars.constraint_override).toEqual(result.constraintOverride);
  });

  it("carries no seed secrets into the browser-visible snapshot", () => {
    const serialised = JSON.stringify(vars);
    expect(serialised).not.toContain(s.escalation_trigger);
    expect(serialised).not.toContain(s.ideal_outcome);
    // Untouched constraint values and every reveal condition stay server-side.
    expect(serialised).not.toContain(CONSTRAINTS[0].value);
    expect(serialised).not.toContain(CONSTRAINTS[2].value);
    for (const c of CONSTRAINTS) {
      expect(serialised).not.toContain(c.reveal_when);
      expect(serialised).not.toContain(c.label);
    }
    expect(serialised).not.toContain("factual_accuracy");
  });

  it("writes a null override through when nothing was mutable", () => {
    const flat = seed({
      hidden_constraints: [
        {
          id: "x1",
          label: "Seating",
          reveal_when: "asked about seating",
          value: "Prefers a quiet corner table",
        },
      ],
    });
    const r = randomizeSession(flat, fixedRng([0.3, 0.3, 0.3]));
    expect(buildSessionVars(flat, r).constraint_override).toBeNull();
  });
});

/**
 * Per-session randomisation — stops interns memorising seeds.
 *
 * Each session gets a fresh synthetic member name, a rendered opening message,
 * and exactly one hidden-constraint value mutated (a weekday shifted or a small
 * number nudged). The persona AND the evaluator both read the mutated value, so
 * the "right answer" moves with the session and stays internally consistent.
 *
 * Pure + deterministic when an `rng` is injected (tests pass a seeded rng).
 */

import type {
  AcademyHiddenConstraint,
  AcademySessionVars,
  ScenarioSeed,
} from "@/lib/types/database";

const NAME_POOL = [
  "Aria",
  "Devan",
  "Marisol",
  "Idris",
  "Priya",
  "Rafael",
  "Noor",
  "Sebastian",
  "Yara",
  "Tomas",
  "Ingrid",
  "Kian",
  "Lucia",
  "Amir",
  "Elena",
  "Jonas",
];

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DATE_HINTS = [
  "later this week",
  "early next week",
  "this coming weekend",
  "in a few days",
];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/**
 * Substitute {{name}} / {{date}} tokens. Unknown tokens are left untouched so a
 * seed can be rendered even if it uses a placeholder we don't randomise yet.
 */
export function renderTemplate(
  text: string,
  vars: { name: string; date: string },
): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/g, vars.name)
    .replace(/\{\{\s*date\s*\}\}/g, vars.date);
}

/**
 * Mutate a single constraint value: shift the first weekday it mentions to the
 * next day, else nudge the first standalone small integer (2–9) by +1. Returns
 * `null` when the value has neither (caller then tries another constraint).
 */
export function mutateConstraintValue(value: string): string | null {
  const dayMatch = value.match(
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
  );
  if (dayMatch) {
    const idx = WEEKDAYS.findIndex(
      (d) => d.toLowerCase() === dayMatch[1].toLowerCase(),
    );
    const next = WEEKDAYS[(idx + 1) % WEEKDAYS.length];
    return value.replace(dayMatch[0], next);
  }
  const numMatch = value.match(/\b([2-9])\b/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    const bumped = n >= 9 ? n - 1 : n + 1;
    return value.replace(numMatch[0], String(bumped));
  }
  return null;
}

export interface RandomizeResult {
  name: string;
  date: string;
  /** The one mutated constraint, or null if none was mutable. */
  constraintOverride: { id: string; value: string } | null;
  /** Opening message with tokens substituted. */
  openingMessage: string;
  /** Hidden constraints with the override applied — for the persona prompt. */
  resolvedConstraints: AcademyHiddenConstraint[];
}

export function randomizeSession(
  seed: Pick<ScenarioSeed, "opening_message" | "hidden_constraints">,
  rng: () => number = Math.random,
  /**
   * Fixes the member's name instead of drawing one from the pool. Curriculum
   * tasks pass the name of the member who owns the group, so the person in the
   * chat is the same person the group is named after. Anti-memorisation does not
   * suffer: the mutated hidden constraint is what actually moves between
   * sessions, the name was only ever cosmetic.
   */
  nameOverride?: string,
): RandomizeResult {
  const name = nameOverride?.trim() || pick(NAME_POOL, rng);
  const date = pick(DATE_HINTS, rng);

  const constraints = Array.isArray(seed.hidden_constraints)
    ? seed.hidden_constraints
    : [];

  // Try constraints in a rotated order so the mutated one varies per session.
  let constraintOverride: { id: string; value: string } | null = null;
  if (constraints.length > 0) {
    const start = Math.floor(rng() * constraints.length);
    for (let i = 0; i < constraints.length; i++) {
      const c = constraints[(start + i) % constraints.length];
      const mutated = mutateConstraintValue(c.value);
      if (mutated && mutated !== c.value) {
        constraintOverride = { id: c.id, value: mutated };
        break;
      }
    }
  }

  const resolvedConstraints = constraints.map((c) =>
    constraintOverride && c.id === constraintOverride.id
      ? { ...c, value: constraintOverride.value }
      : c,
  );

  return {
    name,
    date,
    constraintOverride,
    openingMessage: renderTemplate(seed.opening_message, { name, date }),
    resolvedConstraints,
  };
}

/** Build the `session_vars` snapshot persisted on the session row. */
export function buildSessionVars(
  seed: ScenarioSeed,
  result: RandomizeResult,
): AcademySessionVars {
  return {
    display: {
      id: seed.id,
      title: seed.title,
      archetype: seed.archetype,
      vertical: seed.vertical,
      difficulty: seed.difficulty,
    },
    randomized: { name: result.name, date: result.date },
    constraint_override: result.constraintOverride,
  };
}

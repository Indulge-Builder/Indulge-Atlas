import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CURRICULUM_TASK_NUMBERS,
  DAY_TASK_NUMBERS,
} from "@/lib/academy/curriculum";

/**
 * Requirement-14 validation, as a test rather than a one-off script.
 *
 * Migration 133 re-points the 40 taught tasks at the Task Register PDF, which is
 * a different edition from the one migration 130 seeded — same 176 entries,
 * different numbering. A count check passes against either edition, so counting
 * proves nothing; what matters is that the migration and the day map name the
 * SAME numbers. This fails if either is edited without the other.
 */

const SQL = readFileSync(
  join(process.cwd(), "supabase/migrations/133_academy_pdf_training_tasks.sql"),
  "utf8",
);

/**
 * The VALUES list only. The header comment deliberately quotes old-edition
 * titles to document the divergence, so assertions about what is *seeded* must
 * not read it.
 */
const VALUES_BODY = SQL.slice(SQL.indexOf("FROM (VALUES"), SQL.indexOf("AS v("));

/** Task numbers in the VALUES list — the rows the migration actually rewrites. */
function seededTaskNumbers(): number[] {
  const body = VALUES_BODY;
  // Each row opens `(<number>, '` — the guard clause's bare number list has no
  // quote after it, so it cannot be picked up here by accident.
  return [...body.matchAll(/\(\s*(\d+),\s*'/g)].map((m) => Number(m[1]));
}

const DIFFICULTY_BY_DAY: Record<number, string> = {
  1: "easy",
  2: "medium",
  3: "advanced",
  4: "expert",
};

describe("migration 133 — PDF task seed", () => {
  const numbers = seededTaskNumbers();

  it("rewrites exactly the 40 taught tasks", () => {
    expect(numbers).toHaveLength(40);
    expect(new Set(numbers).size).toBe(40);
    expect([...numbers].sort((a, b) => a - b)).toEqual(
      [...CURRICULUM_TASK_NUMBERS].sort((a, b) => a - b),
    );
  });

  it("reports the requirement-14 tally", () => {
    const required = CURRICULUM_TASK_NUMBERS;
    const found = required.filter((n) => numbers.includes(n));
    const missing = required.filter((n) => !numbers.includes(n));
    const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);

    expect({
      required: required.length,
      found: found.length,
      missing: missing.length,
      duplicates: duplicates.length,
    }).toEqual({ required: 40, found: 40, missing: 0, duplicates: 0 });
  });

  it("carries the PDF wording, not the previously seeded edition", () => {
    // The three the two editions disagree on most visibly. If a future re-seed
    // silently reverts to the old register, these fail.
    expect(VALUES_BODY).toContain("Goa lunch restaurant recommendations");
    expect(VALUES_BODY).toContain("Brother''s birthday gift");
    expect(VALUES_BODY).toContain("Airport meet and greet");
    expect(VALUES_BODY).toContain("150-guest birthday party in August");
    // Old-edition titles must not be what gets written.
    expect(VALUES_BODY).not.toContain("Laptop upgrade advice");
    expect(VALUES_BODY).not.toContain("Ratnagiri road trip");
  });

  it("preserves the multi-part requests instead of summarising them", () => {
    // Task 65 is the spec's own example of what must not be shortened.
    expect(SQL).toContain("Soraia Bombay");
    expect(SQL).toContain("Scarlett House");
    expect(SQL).toContain("Guests aged 25 to 40");
    // Task 2's four references must all survive.
    for (const ref of ["5712R-001", "26393NR", "26394OR", "26393OR"]) {
      expect(SQL).toContain(ref);
    }
  });

  it("escalates difficulty one tier per day", () => {
    for (const [day, tier] of Object.entries(DIFFICULTY_BY_DAY)) {
      for (const taskNumber of DAY_TASK_NUMBERS[Number(day)]) {
        // Each VALUES row ends `'<raised_by>', '<difficulty>')`.
        const row = SQL.match(
          new RegExp(`\\(\\s*${taskNumber},\\s*'[\\s\\S]*?'(\\w+)'\\)`),
        );
        expect(row, `task ${taskNumber} missing from the migration`).not.toBeNull();
        expect(row?.[1], `task ${taskNumber} (day ${day})`).toBe(tier);
      }
    }
  });

  it("refuses to half-apply when a task number is absent", () => {
    // The guard block is what stops a partial rewrite going unnoticed.
    expect(SQL).toContain("RAISE EXCEPTION");
    expect(SQL).toContain("found %");
    expect(SQL).toContain("BEGIN;");
    expect(SQL).toContain("COMMIT;");
  });
});

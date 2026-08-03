/**
 * Academy — cohort ranking and per-reader scoping.
 *
 * The point of these tests is the privacy boundary: a trainee opening the
 * Cohort tab must learn their own standing and nothing about anyone else. The
 * narrowing happens on the server, so if `scopeCohortToReader` ever regresses,
 * every peer's name and score ships to the browser.
 */

import { describe, expect, it } from "vitest";
import { rankCohort, scopeCohortToReader } from "@/lib/academy/cohort";
import type { CohortInternRow } from "@/lib/academy/types";

function row(
  internId: string,
  internName: string,
  avgOverall: number | null,
  sessionsCompleted = 3,
): CohortInternRow {
  return {
    internId,
    internName,
    sessionsCompleted,
    avgOverall,
    avgByDimension: {},
    trend: null,
  };
}

/** Sorted strongest-first, as `getAcademyCohort` sorts before ranking. */
const COHORT: CohortInternRow[] = [
  row("a", "Aisha", 4.6),
  row("b", "Bharat", 4.1),
  row("c", "Chandni", 4.1),
  row("d", "Dev", 2.8),
  row("e", "Esha", null, 0),
];

describe("rankCohort", () => {
  it("ranks strongest first", () => {
    const ranked = rankCohort(COHORT);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].internName).toBe("Aisha");
  });

  it("gives tied scores a joint rank and skips the gap after", () => {
    const ranked = rankCohort(COHORT);
    // Bharat and Chandni both average 4.1 → joint 2nd, so Dev is 4th not 3rd.
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4, null]);
  });

  it("leaves an unscored intern unranked rather than last", () => {
    const ranked = rankCohort(COHORT);
    const esha = ranked.find((r) => r.internId === "e");
    // Not yet ranked is not the same as bottom of the cohort.
    expect(esha?.rank).toBeNull();
  });

  it("reports cohort size including interns who have no score yet", () => {
    const ranked = rankCohort(COHORT);
    expect(ranked.every((r) => r.cohortSize === 5)).toBe(true);
  });

  it("does not mutate the rows it is given", () => {
    const input = [row("a", "Aisha", 4.6)];
    rankCohort(input);
    expect(input[0]).not.toHaveProperty("rank");
  });

  it("handles an empty cohort", () => {
    expect(rankCohort([])).toEqual([]);
  });
});

describe("scopeCohortToReader", () => {
  const ranked = rankCohort(COHORT);

  it("gives a trainer every row", () => {
    const scoped = scopeCohortToReader(ranked, { isTrainer: true, userId: "zz" });
    expect(scoped).toHaveLength(5);
  });

  it("gives a trainee exactly their own row", () => {
    const scoped = scopeCohortToReader(ranked, { isTrainer: false, userId: "c" });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].internId).toBe("c");
  });

  it("never leaks another trainee's name or score", () => {
    const scoped = scopeCohortToReader(ranked, { isTrainer: false, userId: "c" });
    const serialised = JSON.stringify(scoped);
    for (const name of ["Aisha", "Bharat", "Dev", "Esha"]) {
      expect(serialised).not.toContain(name);
    }
    for (const id of ["a", "b", "d", "e"]) {
      expect(scoped.some((r) => r.internId === id)).toBe(false);
    }
  });

  it("keeps the trainee's standing measured against the whole cohort", () => {
    const scoped = scopeCohortToReader(ranked, { isTrainer: false, userId: "d" });
    // Dev is 4th of 5 — ranked before narrowing, so the numbers survive even
    // though he can only see one row.
    expect(scoped[0].rank).toBe(4);
    expect(scoped[0].cohortSize).toBe(5);
  });

  it("returns nothing for a trainee with no scored request", () => {
    const scoped = scopeCohortToReader(ranked, { isTrainer: false, userId: "nobody" });
    // The page renders "your standing appears once your first request is
    // scored" rather than an empty leaderboard.
    expect(scoped).toEqual([]);
  });
});

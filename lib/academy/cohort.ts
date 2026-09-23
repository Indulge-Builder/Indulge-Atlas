/**
 * Academy — cohort ranking and per-reader scoping.
 *
 * Pure functions, deliberately outside `lib/actions/academy.ts`: that module
 * carries "use server" and may only export async functions, and this logic is
 * the part worth pinning with tests. `getAcademyCohort` composes these two.
 *
 * The order matters. Rank is computed over the WHOLE cohort and only then
 * narrowed to the reader, so a trainee's standing is measured against everyone
 * rather than against the single row they are permitted to see.
 */

import type { CohortInternRow } from "@/lib/academy/types";

/**
 * Stamp each row with its standing, strongest first.
 *
 * Assumes `rows` is already sorted by `avgOverall` descending. Ties share a
 * rank and the next distinct score skips the gap — 1, 2, 2, 4 — which is what
 * a leaderboard means by "joint second". An intern with no score yet gets
 * `rank: null` rather than last place: they have not been ranked, which is not
 * the same as being bottom of the cohort.
 */
export function rankCohort(rows: CohortInternRow[]): CohortInternRow[] {
  let lastScore = Number.NaN;
  let lastRank = 0;

  return rows.map((row, index) => {
    let rank: number | null = null;

    if (row.avgOverall !== null && Number.isFinite(row.avgOverall)) {
      rank = row.avgOverall === lastScore ? lastRank : index + 1;
      lastScore = row.avgOverall;
      lastRank = rank;
    }

    return { ...row, rank, cohortSize: rows.length };
  });
}

/**
 * Narrow a ranked cohort to what one reader is allowed to see.
 *
 * A trainer sees every row. A trainee sees their own row and nothing else —
 * their rank survives the narrowing, so they still learn where they stand
 * without learning who is above them or what anyone else scored.
 *
 * This runs on the server, before the payload is serialised to the client.
 * Returning the full set and hiding rows in the UI would publish the whole
 * cohort to anyone who called the action directly.
 */
export function scopeCohortToReader(
  rows: CohortInternRow[],
  opts: { isTrainer: boolean; userId: string },
): CohortInternRow[] {
  if (opts.isTrainer) return rows;
  return rows.filter((row) => row.internId === opts.userId);
}

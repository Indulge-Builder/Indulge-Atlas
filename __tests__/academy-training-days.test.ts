import { describe, expect, it } from "vitest";
import { DAY_TASK_NUMBERS } from "@/lib/academy/curriculum";
import {
  buildTrainingDays,
  type TrainingTaskInput,
} from "@/lib/academy/trainingDays";
import type { AcademyRequestStatus } from "@/lib/academy/types";

const DAY1 = [...DAY_TASK_NUMBERS[1]];
const DAY2 = [...DAY_TASK_NUMBERS[2]];

/** One row per seeded register task, all unstarted unless overridden. */
function rows(overrides: Record<number, AcademyRequestStatus> = {}): TrainingTaskInput[] {
  return Array.from({ length: 176 }, (_, i) => {
    const taskNumber = i + 1;
    return {
      seedId: `seed-${taskNumber}`,
      taskNumber,
      name: `Member ${taskNumber}`,
      requestTitle: `Request ${taskNumber}`,
      status: overrides[taskNumber] ?? ("not_started" as AcademyRequestStatus),
      sessionId: null,
    };
  });
}

function allDone(taskNumbers: number[]): Record<number, AcademyRequestStatus> {
  return Object.fromEntries(taskNumbers.map((t) => [t, "completed"]));
}

describe("buildTrainingDays", () => {
  it("builds four days of ten from the 176 seeded rows", () => {
    const view = buildTrainingDays(rows());
    expect(view.days).toHaveLength(4);
    for (const day of view.days) expect(day.tasks).toHaveLength(10);
    expect(view.progress).toEqual({ completed: 0, total: 40, percent: 0 });
  });

  it("marks every task in a locked day as locked", () => {
    const view = buildTrainingDays(rows());
    expect(view.days[0].tasks.every((t) => t.state === "not_started")).toBe(true);
    expect(view.days[1].tasks.every((t) => t.state === "locked")).toBe(true);
    expect(view.days[3].tasks.every((t) => t.state === "locked")).toBe(true);
  });

  it("treats an owed ticket as in progress, not complete", () => {
    const view = buildTrainingDays(rows({ [DAY1[0]]: "awaiting_ticket" }));
    expect(view.days[0].tasks[0].state).toBe("in_progress");
    expect(view.days[0].completedCount).toBe(0);
    expect(view.days[1].isLocked).toBe(true);
  });

  it("unlocks the next day once the ten specific tasks are accepted", () => {
    const view = buildTrainingDays(rows(allDone(DAY1)));
    expect(view.days[0].isComplete).toBe(true);
    expect(view.days[0].percent).toBe(100);
    expect(view.days[1].isLocked).toBe(false);
    expect(view.days[1].tasks.every((t) => t.state === "not_started")).toBe(true);
    expect(view.days[2].isLocked).toBe(true);
  });

  it("ignores completed tasks outside the programme", () => {
    // 176 is seeded and complete, but is not taught.
    const view = buildTrainingDays(rows({ 176: "completed" }));
    expect(view.progress.completed).toBe(0);
    expect(view.days[1].isLocked).toBe(true);
  });

  it("reports the day the trainee is actually on", () => {
    expect(buildTrainingDays(rows()).currentDay).toBe(1);
    expect(buildTrainingDays(rows(allDone(DAY1))).currentDay).toBe(2);
    expect(
      buildTrainingDays(rows({ ...allDone(DAY1), ...allDone(DAY2) })).currentDay,
    ).toBe(3);
  });

  it("counts 18/40 as 45%, matching the spec's worked example", () => {
    const view = buildTrainingDays(
      rows({ ...allDone(DAY1), ...allDone(DAY2.slice(0, 8)) }),
    );
    expect(view.progress).toEqual({ completed: 18, total: 40, percent: 45 });
  });

  it("keeps a day at ten entries when a task is missing from the seeds", () => {
    // Drop a Day 1 task from the register: the day must not silently shrink.
    const missing = rows().filter((r) => r.taskNumber !== DAY1[3]);
    const view = buildTrainingDays(missing);
    expect(view.days[0].tasks).toHaveLength(10);
    expect(view.days[0].tasks[3].requestTitle).toMatch(/not seeded/);
  });

  it("carries the session id through so a task can be resumed", () => {
    const withSession = rows({ [DAY1[2]]: "in_progress" }).map((r) =>
      r.taskNumber === DAY1[2] ? { ...r, sessionId: "session-abc" } : r,
    );
    const view = buildTrainingDays(withSession);
    expect(view.days[0].tasks[2].sessionId).toBe("session-abc");
    expect(view.days[0].tasks[2].state).toBe("in_progress");
  });
});

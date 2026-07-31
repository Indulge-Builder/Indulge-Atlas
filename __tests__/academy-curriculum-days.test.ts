import { describe, expect, it } from "vitest";
import {
  ACADEMY_DAY_COUNT,
  ACADEMY_TASKS_PER_DAY,
  ACADEMY_TOTAL_TASKS,
  CURRICULUM_TASK_NUMBERS,
  DAY_TASK_NUMBERS,
  canAccessTask,
  curriculumProgress,
  dayForTask,
  isCurriculumTask,
  resolveDays,
} from "@/lib/academy/curriculum";

const DAY1 = [...DAY_TASK_NUMBERS[1]];
const DAY2 = [...DAY_TASK_NUMBERS[2]];
const DAY3 = [...DAY_TASK_NUMBERS[3]];

describe("the four-day map", () => {
  it("has four days of exactly ten tasks", () => {
    expect(Object.keys(DAY_TASK_NUMBERS)).toHaveLength(ACADEMY_DAY_COUNT);
    for (const day of Object.values(DAY_TASK_NUMBERS)) {
      expect(day).toHaveLength(ACADEMY_TASKS_PER_DAY);
    }
    expect(CURRICULUM_TASK_NUMBERS).toHaveLength(40);
  });

  it("never repeats a task across days", () => {
    expect(new Set(CURRICULUM_TASK_NUMBERS).size).toBe(CURRICULUM_TASK_NUMBERS.length);
  });

  it("only references tasks that exist in the seeded register", () => {
    for (const t of CURRICULUM_TASK_NUMBERS) {
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(ACADEMY_TOTAL_TASKS);
    }
  });

  it("maps each task back to its day, and rejects untaught ones", () => {
    expect(dayForTask(4)).toBe(1);
    expect(dayForTask(163)).toBe(2);
    expect(dayForTask(2)).toBe(3);
    expect(dayForTask(65)).toBe(4);
    // 176 is in the register but not in the programme.
    expect(dayForTask(176)).toBeNull();
    expect(isCurriculumTask(176)).toBe(false);
    expect(isCurriculumTask(4)).toBe(true);
  });
});

describe("sequential unlocking", () => {
  it("opens Day 1 and locks the rest for a brand new trainee", () => {
    const days = resolveDays([]);
    expect(days.map((d) => d.isLocked)).toEqual([false, true, true, true]);
    expect(days[1].unlockedBy).toBe(1);
    expect(days[3].unlockedBy).toBe(3);
  });

  it("keeps Day 2 locked until every Day 1 task is done", () => {
    const nine = DAY1.slice(0, 9);
    expect(resolveDays(nine)[1].isLocked).toBe(true);
    expect(resolveDays(DAY1)[1].isLocked).toBe(false);
  });

  it("unlocks strictly one day at a time", () => {
    const afterDay1 = resolveDays(DAY1);
    expect(afterDay1.map((d) => d.isLocked)).toEqual([false, false, true, true]);

    const afterDay2 = resolveDays([...DAY1, ...DAY2]);
    expect(afterDay2.map((d) => d.isLocked)).toEqual([false, false, false, true]);

    const afterDay3 = resolveDays([...DAY1, ...DAY2, ...DAY3]);
    expect(afterDay3.map((d) => d.isLocked)).toEqual([false, false, false, false]);
  });

  it("does NOT unlock on volume — ten completed tasks from elsewhere count for nothing", () => {
    // Ten real register tasks, none of them Day 1's.
    const wrongTen = [1, 7, 8, 9, 11, 13, 15, 17, 19, 20].filter(
      (t) => !DAY1.includes(t),
    );
    expect(wrongTen.length).toBeGreaterThanOrEqual(10);
    const days = resolveDays(wrongTen);
    expect(days[0].completedCount).toBe(0);
    expect(days[1].isLocked).toBe(true);
  });

  it("ignores completions outside the programme entirely", () => {
    const days = resolveDays([...DAY1, 176, 175, 174]);
    expect(curriculumProgress(days).completed).toBe(10);
    expect(days[1].isLocked).toBe(false);
  });

  it("stays locked even when the day already holds a stray completion", () => {
    // The real case this guards: a request handled from the Clients tab (which
    // lists all 176 and is not day-aware) leaves one tick inside a later day.
    // That must not open it — progress made outside the ladder is not a way
    // through it.
    const days = resolveDays([DAY2[0]]);
    expect(days[0].isLocked).toBe(false);
    expect(days[1].completedCount).toBe(1);
    expect(days[1].isLocked).toBe(true);
  });

  it("locks Day 3 while Day 1 is unfinished, whatever Day 3 already holds", () => {
    const days = resolveDays([DAY3[0], DAY3[1], DAY3[2]]);
    expect(days[2].completedCount).toBe(3);
    expect(days[1].isLocked).toBe(true);
    expect(days[2].isLocked).toBe(true);
    expect(days[3].isLocked).toBe(true);
  });
});

describe("progress", () => {
  it("counts against 40, not 176", () => {
    const p = curriculumProgress(resolveDays([...DAY1, ...DAY2.slice(0, 8)]));
    expect(p).toEqual({ completed: 18, total: 40, percent: 45 });
  });

  it("reports per-day counts and completion", () => {
    const days = resolveDays([...DAY1, ...DAY2.slice(0, 6)]);
    expect(days[0].completedCount).toBe(10);
    expect(days[0].isComplete).toBe(true);
    expect(days[0].percent).toBe(100);
    expect(days[1].completedCount).toBe(6);
    expect(days[1].isComplete).toBe(false);
    expect(days[1].percent).toBe(60);
  });

  it("is zero for a new trainee", () => {
    expect(curriculumProgress(resolveDays([])).percent).toBe(0);
  });
});

describe("canAccessTask", () => {
  it("permits Day 1 immediately and refuses later days", () => {
    expect(canAccessTask(DAY1[0], [])).toBe(true);
    expect(canAccessTask(DAY2[0], [])).toBe(false);
    expect(canAccessTask(DAY3[0], [])).toBe(false);
  });

  it("permits a day once its predecessor is finished", () => {
    expect(canAccessTask(DAY2[0], DAY1)).toBe(true);
    expect(canAccessTask(DAY3[0], DAY1)).toBe(false);
    expect(canAccessTask(DAY3[0], [...DAY1, ...DAY2])).toBe(true);
  });

  it("refuses a task that is not in the programme at all", () => {
    // The guard the server needs: a URL naming an untaught register task.
    expect(canAccessTask(176, [...DAY1, ...DAY2, ...DAY3])).toBe(false);
  });
});

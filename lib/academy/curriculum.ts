/**
 * Academy curriculum — the 50-group ladder.
 *
 * Pure module (no I/O). Everything here is derived, never stored:
 *   • which tasks belong to which group  → fixed chunking of the register
 *   • a group's difficulty tier          → its position on the ladder
 *   • progress                           → completed sessions / tasks in group
 *   • lock state                         → previous group complete
 *
 * That keeps the redesign a redesign: no new tables, no write path, nothing to
 * keep in sync with an intern's history.
 */

export const ACADEMY_TOTAL_TASKS = 176;
export const ACADEMY_TOTAL_GROUPS = 50;

/**
 * 176 tasks over 50 groups: the first 26 groups take 4 tasks, the remaining 24
 * take 3 (26x4 + 24x3 = 176). Chunking is by the register's global task number,
 * so groups follow the real chronology of the training period.
 */
export const GROUPS_OF_FOUR = 26;

export type AcademyTier = "easy" | "medium" | "advanced" | "expert";

/** Ladder tiers. Groups get harder as the real training period did. */
export function tierForGroup(groupNumber: number): AcademyTier {
  if (groupNumber <= 10) return "easy";
  if (groupNumber <= 25) return "medium";
  if (groupNumber <= 40) return "advanced";
  return "expert";
}

export const TIER_LABEL: Record<AcademyTier, string> = {
  easy: "Easy",
  medium: "Medium",
  advanced: "Advanced",
  expert: "Expert",
};

/** Token-only classes — no hex anywhere in components/academy. */
export const TIER_CLASS: Record<AcademyTier, string> = {
  easy: "bg-success-light text-success ring-success/25",
  medium: "bg-info-light text-info ring-info/25",
  advanced: "bg-warning-light text-warning ring-warning/25",
  expert: "bg-danger-light text-danger ring-danger/25",
};

/** Inclusive global task-number range covered by a group. */
export function taskRangeForGroup(groupNumber: number): { from: number; to: number } {
  if (groupNumber <= GROUPS_OF_FOUR) {
    const from = (groupNumber - 1) * 4 + 1;
    return { from, to: from + 3 };
  }
  const offset = GROUPS_OF_FOUR * 4; // 104 tasks consumed by the 4-task groups
  const from = offset + (groupNumber - GROUPS_OF_FOUR - 1) * 3 + 1;
  return { from, to: from + 2 };
}

/** Inverse of `taskRangeForGroup` — which group owns a given task number. */
export function groupForTask(taskNumber: number): number {
  const offset = GROUPS_OF_FOUR * 4;
  if (taskNumber <= offset) return Math.ceil(taskNumber / 4);
  return GROUPS_OF_FOUR + Math.ceil((taskNumber - offset) / 3);
}

// ── Progress + locking ────────────────────────────────────────────────────────

/**
 * When true, a group only opens once the previous one is finished. When false,
 * every group is open from the start and an intern can work the ladder in any
 * order — which is closer to how the real training floor ran, where requests
 * arrived in parallel rather than in sequence.
 *
 * Currently OFF: all 50 groups are unlocked. Flip to `true` to restore the
 * strict ladder; nothing else needs to change — the lock rendering, the filters
 * and the task states all still honour it.
 */
export const ACADEMY_SEQUENTIAL_UNLOCK: boolean = false;

export type TaskStatus = "locked" | "not_started" | "in_progress" | "completed";

export interface GroupProgress {
  groupNumber: number;
  tier: AcademyTier;
  taskCount: number;
  completedCount: number;
  dayCount: number;
  /** 0-100, rounded. */
  percent: number;
  isComplete: boolean;
  isLocked: boolean;
  lastActivity: string | null;
}

export function percentComplete(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Walk the ladder in order and resolve lock state.
 *
 * With `ACADEMY_SEQUENTIAL_UNLOCK` off (the default) every group is open and
 * `isLocked` is always false.
 *
 * With it on, group 1 is always open and each later group opens once the one
 * before it is finished, so an intern cannot skip ahead to Expert. Even then a
 * group carrying progress is never locked, which stops an intern being trapped
 * by a curriculum change beneath them.
 */
export function resolveLadder(
  rows: {
    groupNumber: number;
    taskCount: number;
    completedCount: number;
    dayCount: number;
    lastActivity: string | null;
  }[],
): GroupProgress[] {
  const byNumber = new Map(rows.map((r) => [r.groupNumber, r]));
  const ladder: GroupProgress[] = [];
  let previousComplete = true; // group 1 has no predecessor

  for (let n = 1; n <= ACADEMY_TOTAL_GROUPS; n++) {
    const row = byNumber.get(n);
    const range = taskRangeForGroup(n);
    const taskCount = row?.taskCount ?? range.to - range.from + 1;
    const completedCount = row?.completedCount ?? 0;
    const isComplete = taskCount > 0 && completedCount >= taskCount;
    const started = completedCount > 0;

    ladder.push({
      groupNumber: n,
      tier: tierForGroup(n),
      taskCount,
      completedCount,
      dayCount: row?.dayCount ?? 1,
      percent: percentComplete(completedCount, taskCount),
      isComplete,
      isLocked: ACADEMY_SEQUENTIAL_UNLOCK && !previousComplete && !started,
      lastActivity: row?.lastActivity ?? null,
    });

    previousComplete = isComplete;
  }

  return ladder;
}

/** Overall academy progress across the whole ladder. */
export function overallProgress(ladder: GroupProgress[]): {
  completedTasks: number;
  totalTasks: number;
  percent: number;
  completedGroups: number;
} {
  const completedTasks = ladder.reduce((sum, g) => sum + g.completedCount, 0);
  const totalTasks = ladder.reduce((sum, g) => sum + g.taskCount, 0);
  return {
    completedTasks,
    totalTasks,
    percent: percentComplete(completedTasks, totalTasks),
    completedGroups: ladder.filter((g) => g.isComplete).length,
  };
}

/**
 * Task state inside an unlocked group. Tasks within a group are NOT sequentially
 * locked — an intern can take them in any order once the group is open, which
 * matches how the real training group worked (requests arrived in parallel).
 */
export function taskStatus(params: {
  groupLocked: boolean;
  hasCompletedSession: boolean;
  hasOpenSession: boolean;
}): TaskStatus {
  if (params.groupLocked) return "locked";
  if (params.hasCompletedSession) return "completed";
  if (params.hasOpenSession) return "in_progress";
  return "not_started";
}

export const TASK_ACTION_LABEL: Record<TaskStatus, string> = {
  locked: "Locked",
  not_started: "Start",
  in_progress: "Continue",
  completed: "View",
};

// ── The four-day programme ───────────────────────────────────────────────────
//
// The 176 register entries are the archive; these 40 are the taught curriculum.
// Selection is by hand, not by range — Day 3 deliberately runs earlier register
// numbers than Day 1, because the days are ordered by what they teach rather
// than by when the request happened to land in July.
//
// Task numbers reference `scenario_seeds.task_number` (seeded by migration 130),
// so no rows are duplicated and no migration is needed to reshape the ladder.
// Changing a day is a change to this map and nothing else.

export const ACADEMY_DAY_COUNT = 4;
export const ACADEMY_TASKS_PER_DAY = 10;

export const DAY_TASK_NUMBERS: Readonly<Record<number, readonly number[]>> = {
  1: [4, 14, 24, 29, 31, 47, 54, 71, 84, 100],
  2: [95, 107, 110, 115, 117, 133, 141, 150, 152, 163],
  3: [2, 3, 5, 6, 10, 12, 16, 18, 21, 23],
  4: [25, 30, 35, 36, 37, 40, 42, 48, 57, 65],
};

export const ACADEMY_DAY_NUMBERS: number[] = Object.keys(DAY_TASK_NUMBERS)
  .map(Number)
  .sort((a, b) => a - b);

/** Every task in the programme, in day order. 40 in total. */
export const CURRICULUM_TASK_NUMBERS: number[] = ACADEMY_DAY_NUMBERS.flatMap(
  (d) => [...DAY_TASK_NUMBERS[d]],
);

const DAY_BY_TASK = new Map<number, number>(
  ACADEMY_DAY_NUMBERS.flatMap((d) =>
    DAY_TASK_NUMBERS[d].map((t) => [t, d] as const),
  ),
);

/** Which day a register task belongs to, or null if it is not taught. */
export function dayForTask(taskNumber: number): number | null {
  return DAY_BY_TASK.get(taskNumber) ?? null;
}

/** Whether a register task is part of the taught programme at all. */
export function isCurriculumTask(taskNumber: number): boolean {
  return DAY_BY_TASK.has(taskNumber);
}

export interface DayProgress {
  dayNumber: number;
  taskNumbers: number[];
  taskCount: number;
  completedCount: number;
  /** 0-100, rounded. */
  percent: number;
  isComplete: boolean;
  isLocked: boolean;
  /** Why it is locked, for the UI to render without re-deriving it. */
  unlockedBy: number | null;
}

/**
 * Resolve each day's progress and lock state from the tasks actually completed.
 *
 * Locking is by membership, never by count: Day 2 opens because *these ten*
 * tasks are done, not because ten of anything are. Completing forty unrelated
 * tasks unlocks nothing.
 *
 * Day 1 is always open. Every later day is shut until its predecessor is
 * finished — unconditionally.
 *
 * There is deliberately NO exemption for a day that already holds progress.
 * An earlier version unlocked such a day, on the reasoning that reshaping the
 * curriculum beneath a trainee shouldn't strand them. In practice that clause
 * fired on stray completions: a request handled from the Clients tab (which
 * lists all 176 and is not day-aware) put one tick in Day 3 and opened the
 * whole day. Progress made outside the ladder must not be a way through it.
 *
 * Derived purely from completion records, so it is inherently per-trainee and
 * survives logout: there is no unlock flag to persist or fall out of sync.
 */
export function resolveDays(completedTaskNumbers: Iterable<number>): DayProgress[] {
  const done = new Set(completedTaskNumbers);
  const days: DayProgress[] = [];
  let previousComplete = true; // Day 1 has no predecessor to wait on.

  for (const dayNumber of ACADEMY_DAY_NUMBERS) {
    const taskNumbers = [...DAY_TASK_NUMBERS[dayNumber]];
    const completedCount = taskNumbers.filter((t) => done.has(t)).length;
    const isComplete = completedCount === taskNumbers.length;

    days.push({
      dayNumber,
      taskNumbers,
      taskCount: taskNumbers.length,
      completedCount,
      percent: percentComplete(completedCount, taskNumbers.length),
      isComplete,
      isLocked: !previousComplete,
      unlockedBy: previousComplete ? null : dayNumber - 1,
    });

    previousComplete = isComplete;
  }

  return days;
}

/** Overall programme progress across all four days. */
export function curriculumProgress(days: DayProgress[]): {
  completed: number;
  total: number;
  percent: number;
} {
  const completed = days.reduce((sum, d) => sum + d.completedCount, 0);
  const total = days.reduce((sum, d) => sum + d.taskCount, 0);
  return { completed, total, percent: percentComplete(completed, total) };
}

/**
 * Whether a trainee may open a given task. The page hides locked tasks, but this
 * is the check the server must run too — hiding a control is not a permission.
 */
export function canAccessTask(
  taskNumber: number,
  completedTaskNumbers: Iterable<number>,
): boolean {
  const day = dayForTask(taskNumber);
  if (day === null) return false;
  const state = resolveDays(completedTaskNumbers).find((d) => d.dayNumber === day);
  return state ? !state.isLocked : false;
}

/**
 * The member behind each group.
 *
 * A group is one conversation, so it is named after the member whose requests it
 * holds — the same way a chat list is a list of people rather than a list of
 * topics. All the tasks in a group are read as that one member's asks.
 *
 * ⚠ EVERY NAME HERE IS FICTIONAL. These are invented for training and must never
 * be swapped for entries from `clients` — putting a real member's name on a
 * practice drill would leak PII into a surface interns share screens on. The
 * roster is deliberately hard-coded rather than queried for exactly that reason.
 */
const FIRST_NAMES = [
  "Aria", "Devan", "Marisol", "Idris", "Priya", "Rafael", "Noor", "Sebastian",
  "Yara", "Tomas", "Ingrid", "Kian", "Lucia", "Amir", "Elena", "Jonas",
  "Sana", "Rohan", "Tara", "Vikram", "Anaya", "Felix",
] as const;

const LAST_NAMES = [
  "Menon", "Kapoor", "Vaz", "Rahman", "Nair", "Pinto", "Sethi", "Almeida",
] as const;

/**
 * 22 given names x 8 surnames = 176 unique members, one per request.
 *
 * Generated by index rather than typed out so the roster stays exactly as long
 * as the curriculum and can never drift out of step with it.
 */
export function memberForTask(taskNumber: number): string {
  const i = Math.max(1, taskNumber) - 1;
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last}`;
}

/** Kept for the group-era callers; a group is now simply its first task. */
export function memberForGroup(groupNumber: number): string {
  return memberForTask(groupNumber);
}

export function groupTitle(groupNumber: number): string {
  return memberForGroup(groupNumber);
}

export function formatGroupNumber(n: number): string {
  return `Group ${String(n).padStart(2, "0")}`;
}

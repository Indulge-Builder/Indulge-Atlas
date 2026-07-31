/**
 * View model for the Training Tasks page.
 *
 * Deliberately a pure function over the rows `getAcademyClients` already
 * returns, rather than a second query. Completion is decided in exactly one
 * place in this codebase — an accepted ticket, resolved by `loadSeedStatus` —
 * and the day page must not become a fifth opinion on what "done" means. Feed it
 * the same rows the client list renders and the two can never disagree.
 */

import {
  dayForTask,
  resolveDays,
  curriculumProgress,
  type DayProgress,
  type TaskStatus,
} from "@/lib/academy/curriculum";
import type { AcademyRequestStatus } from "@/lib/academy/types";

/** The subset of an AcademyClientRow this view needs. */
export interface TrainingTaskInput {
  seedId: string;
  taskNumber: number;
  name: string;
  requestTitle: string;
  status: AcademyRequestStatus;
  sessionId: string | null;
}

export interface TrainingTaskView extends TrainingTaskInput {
  /** locked | not_started | in_progress | completed */
  state: TaskStatus;
}

export interface TrainingDayView extends DayProgress {
  tasks: TrainingTaskView[];
}

export interface TrainingDaysView {
  days: TrainingDayView[];
  progress: { completed: number; total: number; percent: number };
  /** The day the trainee is actually on — first unfinished, else the last. */
  currentDay: number;
}

/**
 * A request whose ticket is still owed reads as in progress, not done. That
 * matches the ladder's own rule: the conversation being over is not the finish
 * line, the accepted ticket is.
 */
function stateFor(status: AcademyRequestStatus, dayLocked: boolean): TaskStatus {
  if (dayLocked) return "locked";
  if (status === "completed") return "completed";
  if (status === "in_progress" || status === "awaiting_ticket") return "in_progress";
  return "not_started";
}

/**
 * A day as the client-list sidebar needs it: a heading plus the seed ids that
 * belong under it, in day order.
 *
 * Seed ids rather than whole rows so the sidebar keeps rendering the same
 * `ClientRow` it always has, from the same `clients` array — the training view
 * only decides grouping and lock state, never how a row looks.
 */
export interface DaySection {
  dayNumber: number;
  isLocked: boolean;
  isComplete: boolean;
  unlockedBy: number | null;
  completedCount: number;
  taskCount: number;
  seedIds: string[];
}

export function daySections(view: TrainingDaysView): DaySection[] {
  return view.days.map((day) => ({
    dayNumber: day.dayNumber,
    isLocked: day.isLocked,
    isComplete: day.isComplete,
    unlockedBy: day.unlockedBy,
    completedCount: day.completedCount,
    taskCount: day.taskCount,
    // A task with no seeded row has no id to select; it is counted in
    // taskCount but cannot be opened.
    seedIds: day.tasks.map((t) => t.seedId).filter((id) => id !== ""),
  }));
}

/** Seed ids a trainee may currently open — everything in an unlocked day. */
export function unlockedSeedIds(view: TrainingDaysView): Set<string> {
  return new Set(
    view.days.filter((d) => !d.isLocked).flatMap((d) => d.tasks.map((t) => t.seedId)),
  );
}

export function buildTrainingDays(rows: TrainingTaskInput[]): TrainingDaysView {
  const byTaskNumber = new Map<number, TrainingTaskInput>();
  for (const row of rows) byTaskNumber.set(row.taskNumber, row);

  // Only completions inside the programme move the ladder.
  const completed = rows
    .filter((r) => r.status === "completed" && dayForTask(r.taskNumber) !== null)
    .map((r) => r.taskNumber);

  const days: TrainingDayView[] = resolveDays(completed).map((day) => ({
    ...day,
    tasks: day.taskNumbers.map((taskNumber) => {
      const row = byTaskNumber.get(taskNumber);
      // A task in the map with no seeded row is a curriculum/seed mismatch.
      // Render it as unstarted rather than dropping it silently — a missing
      // task would otherwise make a day look shorter than it is.
      if (!row) {
        return {
          seedId: "",
          taskNumber,
          name: "Unavailable",
          requestTitle: `Task ${taskNumber} is not seeded`,
          status: "not_started" as AcademyRequestStatus,
          sessionId: null,
          state: day.isLocked ? ("locked" as TaskStatus) : ("not_started" as TaskStatus),
        };
      }
      return { ...row, state: stateFor(row.status, day.isLocked) };
    }),
  }));

  const firstUnfinished = days.find((d) => !d.isComplete);

  return {
    days,
    progress: curriculumProgress(days),
    currentDay: firstUnfinished?.dayNumber ?? days[days.length - 1]?.dayNumber ?? 1,
  };
}

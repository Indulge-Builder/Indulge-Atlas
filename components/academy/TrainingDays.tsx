"use client";

/**
 * The four-day training programme.
 *
 * A curriculum, not a list: days stack in order, each one shut until the one
 * before it is finished. Everything on screen is derived from the same rows the
 * client list renders, so the counts here and the counts there cannot drift.
 *
 * Locked days render collapsed and unclickable. That is presentation only — the
 * server refuses a locked task independently, because hiding a link is not a
 * permission.
 */

import Link from "next/link";
import { type JSX } from "react";
import { Check, ChevronRight, Circle, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { TASK_ACTION_LABEL, type TaskStatus } from "@/lib/academy/curriculum";
import type { TrainingDayView, TrainingDaysView } from "@/lib/academy/trainingDays";

function StateIcon({ state }: { state: TaskStatus }): JSX.Element {
  if (state === "completed") {
    return <Check className="size-4 shrink-0 text-chat-accent-dark" aria-hidden />;
  }
  if (state === "in_progress") {
    return <Loader2 className="size-4 shrink-0 text-warning" aria-hidden />;
  }
  if (state === "locked") {
    return <Lock className="size-3.5 shrink-0 text-chat-locked" aria-hidden />;
  }
  return <Circle className="size-3.5 shrink-0 text-chat-ink-muted/50" aria-hidden />;
}

function DayHeader({ day }: { day: TrainingDayView }): JSX.Element {
  const label = day.isLocked
    ? `Complete Day ${day.unlockedBy} to unlock`
    : day.isComplete
      ? "Completed"
      : `In progress · ${day.completedCount}/${day.taskCount}`;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-[15px] font-semibold text-chat-ink">
            Day {day.dayNumber}
          </h2>
          {day.isComplete ? (
            <Check className="size-4 text-chat-accent-dark" aria-hidden />
          ) : day.isLocked ? (
            <Lock className="size-3.5 text-chat-locked" aria-hidden />
          ) : null}
        </div>
        <p className="mt-0.5 text-[12px] text-chat-ink-muted">{label}</p>
      </div>

      {!day.isLocked && (
        <span className="shrink-0 text-[12px] font-medium tabular-nums text-chat-ink-muted">
          {day.completedCount}/{day.taskCount}
        </span>
      )}
    </div>
  );
}

function DayBar({ day }: { day: TrainingDayView }): JSX.Element {
  return (
    <div className="h-1 w-full bg-chat-divider" aria-hidden>
      <div
        className={cn(
          "h-full transition-[width] duration-500",
          day.isComplete ? "bg-chat-accent-dark" : "bg-chat-accent",
        )}
        style={{ width: `${day.percent}%` }}
      />
    </div>
  );
}

export function TrainingDays({ view }: { view: TrainingDaysView }): JSX.Element {
  const { days, progress } = view;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5 sm:px-6">
      {/* Overall */}
      <section className="rounded-xl border border-chat-divider bg-chat-panel p-4 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-serif text-[17px] font-semibold text-chat-ink">
            Training progress
          </h1>
          <span className="text-[13px] font-medium tabular-nums text-chat-ink-muted">
            {progress.completed}/{progress.total}
          </span>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-chat-divider">
          <div
            className="h-full rounded-full bg-chat-accent-dark transition-[width] duration-500"
            style={{ width: `${progress.percent}%` }}
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall training progress"
          />
        </div>

        <p className="mt-2 text-[12px] text-chat-ink-muted">
          {progress.percent}% complete · you are on Day {view.currentDay}
        </p>
      </section>

      {/* Days */}
      {days.map((day) => (
        <section
          key={day.dayNumber}
          className={cn(
            "overflow-hidden rounded-xl border bg-chat-panel shadow-card",
            day.isLocked ? "border-chat-divider opacity-70" : "border-chat-divider",
          )}
          aria-label={`Day ${day.dayNumber}`}
        >
          <DayHeader day={day} />
          <DayBar day={day} />

          {day.isLocked ? (
            <p className="px-4 py-4 text-[12.5px] text-chat-ink-muted">
              These ten requests open once every Day {day.unlockedBy} request has
              been handled and its ticket accepted.
            </p>
          ) : (
            <ul className="divide-y divide-chat-divider">
              {day.tasks.map((task) => {
                const done = task.state === "completed";
                const unreachable = task.seedId === "";

                const body = (
                  <>
                    <StateIcon state={task.state} />
                    <span className="w-9 shrink-0 text-[11.5px] font-medium tabular-nums text-chat-ink-muted">
                      {String(task.taskNumber).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-[13.5px]",
                          done ? "text-chat-ink-muted" : "text-chat-ink",
                        )}
                      >
                        {task.requestTitle}
                      </span>
                      <span className="block truncate text-[11.5px] text-chat-ink-muted">
                        {task.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11.5px] font-medium text-chat-accent-dark">
                      {TASK_ACTION_LABEL[task.state]}
                    </span>
                    <ChevronRight
                      className="size-3.5 shrink-0 text-chat-ink-muted/60"
                      aria-hidden
                    />
                  </>
                );

                if (unreachable) {
                  return (
                    <li
                      key={task.taskNumber}
                      className="flex items-center gap-2.5 px-4 py-2.5 opacity-60"
                    >
                      {body}
                    </li>
                  );
                }

                return (
                  <li key={task.taskNumber}>
                    <Link
                      href={`/academy?task=${task.taskNumber}`}
                      className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-chat-panel-hover"
                    >
                      {body}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

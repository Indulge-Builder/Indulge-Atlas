"use client";

/**
 * AcademyProgressHeader — the progress strip above the chat.
 *
 * Collapsed it is one line: overall percentage, this member's progress, and a
 * single short next step. Expanded it shows the two bars and the counts. It
 * stays collapsed by default because the chat is the point of the screen — the
 * progress is context, not the content.
 *
 * The hint is deliberately one short, actionable sentence. A paragraph here
 * competes with the conversation and gets skipped.
 */

import { useState, type JSX } from "react";
import { ChevronDown, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/academy/ProgressRing";
import type { AcademySessionProgress } from "@/lib/academy/types";

const nf = new Intl.NumberFormat("en-IN");

export function AcademyProgressHeader({
  progress,
  score,
  className,
}: {
  progress: AcademySessionProgress;
  /** Overall score once this drill has been evaluated. */
  score?: number | null;
  className?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const inLadder = progress.groupNumber !== null;

  return (
    <div className={cn("shrink-0 border-b border-chat-divider bg-chat-panel", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-chat-panel-hover sm:px-4"
      >
        {typeof score === "number" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-light px-2 py-0.5 text-[11px] font-semibold text-success">
            <Trophy className="size-3" aria-hidden />
            {score.toFixed(1)}/5
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-chat-panel-active px-2 py-0.5 text-[11px] font-semibold tabular-nums text-chat-ink">
            {progress.overallPercent}%
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-chat-ink">
            {inLadder
              ? `${progress.groupTitle} · ${progress.groupCompleted}/${progress.groupTotal} handled`
              : "Free practice"}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-chat-ink-muted">
            <Sparkles className="size-3 shrink-0 text-chat-accent-dark" aria-hidden />
            {progress.nextHint}
          </p>
        </div>

        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-chat-ink-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-chat-divider px-3 pb-3 pt-2.5 sm:px-4">
          {inLadder ? (
            <>
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium text-chat-ink">
                    {progress.groupTitle}
                  </span>
                  <span className="text-[11px] tabular-nums text-chat-ink-muted">
                    {progress.groupCompleted}/{progress.groupTotal} requests ·{" "}
                    {progress.groupPercent}%
                  </span>
                </div>
                <ProgressBar percent={progress.groupPercent} />
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium text-chat-ink">Academy overall</span>
                  <span className="text-[11px] tabular-nums text-chat-ink-muted">
                    {nf.format(progress.overallCompleted)}/{nf.format(progress.overallTotal)}{" "}
                    tasks · {progress.overallPercent}%
                  </span>
                </div>
                <ProgressBar percent={progress.overallPercent} tone="gold" />
              </div>
            </>
          ) : (
            <p className="text-[12px] text-chat-ink-muted">
              This drill sits outside the 50-group ladder, so it does not count towards academy
              progress.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

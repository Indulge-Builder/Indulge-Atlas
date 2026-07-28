"use client";

/**
 * ProgressBreakdown — what the bar is actually made of.
 *
 * The headline number is performance-weighted, which is not self-explanatory, so
 * it has to be inspectable: click the bar and every metric shows its weight, its
 * score and how much of the total it contributed. Otherwise a trainee who worked
 * hard and moved the bar 2% has no way to understand why.
 */

import { useState, type JSX } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressRing, ProgressBar } from "@/components/academy/ProgressRing";
import { PROGRESS_METRICS } from "@/lib/academy/progressScore";
import type { AcademyClientOverview } from "@/lib/academy/types";

const nf = new Intl.NumberFormat("en-IN");
const pct = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function toneFor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 55) return "text-chat-ink";
  if (score > 0) return "text-warning";
  return "text-chat-ink-muted";
}

export function ProgressBreakdown({
  overview,
  className,
}: {
  overview: AcademyClientOverview;
  className?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const started = overview.completed > 0;

  return (
    <div className={cn("", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="See how this score is calculated"
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-chat-panel-hover"
      >
        <ProgressRing percent={overview.percent} size={38} tone="gold" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-medium text-chat-ink">
            {overview.percent}% performance
          </p>
          <p className="truncate text-[11px] text-chat-ink-muted">
            {nf.format(overview.completed)}/{nf.format(overview.total)} handled
            {started ? ` · ${overview.qualityPercent}% quality` : ""}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-chat-ink-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="mt-2 space-y-2.5 rounded-lg border border-chat-divider bg-chat-panel-active p-3">
          {!started ? (
            <p className="text-[11.5px] leading-relaxed text-chat-ink-muted">
              Handle your first client and the breakdown appears here. Progress is weighted by how
              well each request goes, not simply that it was finished.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-chat-ink-muted">Ground covered</span>
                  <span className="text-[11px] tabular-nums text-chat-ink">
                    {overview.completionPercent}%
                  </span>
                </div>
                <ProgressBar percent={overview.completionPercent} />
                <div className="flex items-baseline justify-between gap-2 pt-1">
                  <span className="text-[11px] text-chat-ink-muted">Quality of that work</span>
                  <span className="text-[11px] tabular-nums text-chat-ink">
                    {overview.qualityPercent}%
                  </span>
                </div>
                <ProgressBar percent={overview.qualityPercent} tone="gold" />
              </div>

              <div className="border-t border-chat-divider pt-2">
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-chat-ink-muted">
                  How it is scored
                </p>
                <ul className="space-y-1">
                  {PROGRESS_METRICS.map((m) => {
                    const score = overview.breakdown?.[m.key] ?? 0;
                    return (
                      <li key={m.key} className="flex items-center gap-2" title={m.description}>
                        <span className="w-9 shrink-0 text-[10px] tabular-nums text-chat-ink-muted">
                          {pct.format(m.weight * 100)}%
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-chat-ink">
                          {m.label}
                        </span>
                        <span
                          className={cn(
                            "w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums",
                            toneFor(score),
                          )}
                        >
                          {score}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <p className="flex items-start gap-1.5 border-t border-chat-divider pt-2 text-[10.5px] leading-relaxed text-chat-ink-muted">
                <Info className="mt-px size-3 shrink-0" aria-hidden />
                Speed only helps when quality holds — rushing a weak reply scores lower than taking
                the time to get it right.
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

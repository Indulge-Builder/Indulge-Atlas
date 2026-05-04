"use client";

import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  dwellStatusKeyForSegment,
  getPipelineFillLevel,
  getPipelineSegmentMeta,
  pipelineProgressSummary,
} from "@/lib/leads/pipelineProgress";
import {
  dwellMsByStatus,
  formatJourneyDuration,
  type LeadJourneyActivity,
} from "@/lib/leads/leadJourneyStages";
import type { LeadStatus } from "@/lib/types/database";

const SEGMENT_COUNT = 5;

interface LeadJourneyBarProps {
  currentStatus: LeadStatus;
  activities: LeadJourneyActivity[];
  leadCreatedAt: string;
  /** ISO time from server render — keeps dwell math aligned on SSR + hydration */
  asOf: string;
}

function segmentTooltip(
  meta: ReturnType<typeof getPipelineSegmentMeta>,
  dwellMs: number,
): string {
  if (!meta.filled) {
    return `${meta.label} · Ahead`;
  }
  const time = formatJourneyDuration(dwellMs);
  if (meta.isCurrent) {
    return `${meta.label} · ${time} · Current`;
  }
  return `${meta.label} · ${time}`;
}

export function LeadJourneyBar({
  currentStatus,
  activities,
  leadCreatedAt,
  asOf,
}: LeadJourneyBarProps) {
  const asOfDate = useMemo(() => new Date(asOf), [asOf]);
  const fillLevel = useMemo(
    () => getPipelineFillLevel(currentStatus),
    [currentStatus],
  );

  const dwellByStatus = useMemo(
    () =>
      dwellMsByStatus(activities, currentStatus, {
        leadCreatedAt,
        now: asOfDate,
      }),
    [activities, currentStatus, leadCreatedAt, asOfDate],
  );

  const segments = useMemo(
    () =>
      Array.from({ length: SEGMENT_COUNT }, (_, i) =>
        getPipelineSegmentMeta(i, currentStatus),
      ),
    [currentStatus],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#B5A99A]">
          Lead journey
        </p>
        <p className="text-[10px] font-medium tabular-nums text-[#B5A99A]">
          {pipelineProgressSummary(currentStatus)}
        </p>
      </div>
      <TooltipProvider delayDuration={200}>
        <div
          className="flex h-4 w-full gap-px overflow-hidden rounded-full border border-[#E5E4DF]/90 bg-[#EDEAE4] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
          role="img"
          aria-label={`Pipeline progress: ${pipelineProgressSummary(currentStatus)}`}
        >
          {segments.map((meta, i) => {
            const isFirst = i === 0;
            const isLast = i === SEGMENT_COUNT - 1;
            const dwellKey = dwellStatusKeyForSegment(
              i,
              fillLevel,
              currentStatus,
            );
            const dwellMs =
              meta.filled && dwellKey !== null
                ? (dwellByStatus[dwellKey] ?? 0)
                : 0;
            const tip = segmentTooltip(meta, dwellMs);

            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="relative min-h-[12px] min-w-0 flex-1 border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/45 focus-visible:ring-offset-1"
                    aria-label={tip}
                  >
                    <span
                      className="block h-full w-full origin-left transition-[background-color,box-shadow,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        borderTopLeftRadius: isFirst ? "9999px" : "3px",
                        borderBottomLeftRadius: isFirst ? "9999px" : "3px",
                        borderTopRightRadius: isLast ? "9999px" : "3px",
                        borderBottomRightRadius: isLast ? "9999px" : "3px",
                        backgroundColor: meta.filled ? meta.color : "#D8D4CC",
                        opacity: meta.filled ? 1 : 0.45,
                        boxShadow: meta.filled
                          ? meta.isCurrent
                            ? "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.08)"
                            : "inset 0 1px 0 rgba(255,255,255,0.22)"
                          : "inset 0 1px 2px rgba(0,0,0,0.06)",
                      }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="border border-white/10 bg-[#0A0A0A] px-2.5 py-1.5 text-[11px] font-medium tracking-tight text-white/95"
                >
                  {tip}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}

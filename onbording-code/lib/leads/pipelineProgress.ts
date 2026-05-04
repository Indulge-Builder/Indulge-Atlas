import { LEAD_STATUS_CONFIG, type LeadStatus } from "@/lib/types/database";

/** Visual pipe: four funnel steps + one outcome slot (20% each, full bar at terminal). */
export const PIPELINE_SLOT_STATUSES: readonly LeadStatus[] = [
  "new",
  "attempted",
  "connected",
  "in_discussion",
];

const TERMINAL: ReadonlySet<LeadStatus> = new Set([
  "won",
  "nurturing",
  "lost",
  "trash",
]);

/** How many of the five slots are filled (1–5) for the current lead status. */
export function getPipelineFillLevel(status: LeadStatus): number {
  const i = PIPELINE_SLOT_STATUSES.indexOf(status);
  if (i >= 0) return i + 1;
  if (TERMINAL.has(status)) return 5;
  return 1;
}

export type PipelineSegmentMeta = {
  filled: boolean;
  label: string;
  color: string;
  isCurrent: boolean;
};

/** Per-column label, colour, and fill state for the journey bar (indices 0–4). */
export function getPipelineSegmentMeta(
  segmentIndex: number,
  currentStatus: LeadStatus,
): PipelineSegmentMeta {
  const level = getPipelineFillLevel(currentStatus);
  const terminal = TERMINAL.has(currentStatus);

  if (segmentIndex < 4) {
    const key = PIPELINE_SLOT_STATUSES[segmentIndex];
    const cfg = LEAD_STATUS_CONFIG[key];
    const filled = segmentIndex < level;
    const isCurrent = currentStatus === key;
    return {
      filled,
      label: cfg.label,
      color: cfg.color,
      isCurrent,
    };
  }

  if (level < 5) {
    return {
      filled: false,
      label: "Outcome",
      color: "#D4D0C8",
      isCurrent: false,
    };
  }

  const cfg = LEAD_STATUS_CONFIG[currentStatus];
  return {
    filled: true,
    label: cfg.label,
    color: cfg.color,
    isCurrent: terminal,
  };
}

export function pipelineProgressSummary(status: LeadStatus): string {
  const level = getPipelineFillLevel(status);
  return `${level} / 5 stages`;
}

/** Which pipeline status a filled segment represents (for dwell lookup). */
export function dwellStatusKeyForSegment(
  segmentIndex: number,
  fillLevel: number,
  currentStatus: LeadStatus,
): LeadStatus | null {
  if (segmentIndex >= fillLevel) return null;
  if (segmentIndex < 4) return PIPELINE_SLOT_STATUSES[segmentIndex];
  return currentStatus;
}

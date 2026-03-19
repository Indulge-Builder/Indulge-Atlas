import { differenceInMilliseconds } from "date-fns";
import {
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_ORDER,
  type LeadStatus,
} from "@/lib/types/database";

export type LeadJourneyActivity = {
  action_type: string;
  created_at: string;
  details?: unknown;
};

function asDetails(details: unknown): Record<string, unknown> | null {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  return null;
}

export type LeadJourneyStage = {
  status: LeadStatus;
  label: string;
  color: string;
  /** ms spent in this stage (until next boundary or `now`) */
  durationMs: number;
  startedAt: Date;
};

const STATUS_SET = new Set<string>(LEAD_STATUS_ORDER);

function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && STATUS_SET.has(v);
}

function parseDetailsStatus(
  details: unknown,
  key: "new_status" | "old_status",
): LeadStatus | null {
  const raw = asDetails(details)?.[key];
  return isLeadStatus(raw) ? raw : null;
}

/**
 * Sort, filter to lead_created + status_changed, then compute per-stage dwell times.
 * Uses `leadCreatedAt` when activities omit `lead_created` or to anchor the first stage.
 */
export function aggregateLeadJourneyStages(
  activities: LeadJourneyActivity[],
  currentStatus: LeadStatus,
  options: { leadCreatedAt: string; now?: Date },
): LeadJourneyStage[] {
  const now = options.now ?? new Date();
  const leadCreatedAt = new Date(options.leadCreatedAt);
  if (Number.isNaN(leadCreatedAt.getTime())) {
    return [
      {
        status: currentStatus,
        label: LEAD_STATUS_CONFIG[currentStatus].label,
        color: LEAD_STATUS_CONFIG[currentStatus].color,
        durationMs: 0,
        startedAt: now,
      },
    ];
  }

  const filtered = activities.filter(
    (a) => a.action_type === "lead_created" || a.action_type === "status_changed",
  );

  const sorted = [...filtered].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  type Milestone = { at: Date; status: LeadStatus };

  const milestones: Milestone[] = [];
  let sawLeadCreated = false;

  for (const a of sorted) {
    if (a.action_type === "lead_created") {
      sawLeadCreated = true;
      milestones.push({ at: new Date(a.created_at), status: "new" });
      continue;
    }
    if (a.action_type === "status_changed") {
      const next = parseDetailsStatus(a.details, "new_status");
      if (next) {
        milestones.push({ at: new Date(a.created_at), status: next });
      }
    }
  }

  // No lead_created: anchor first segment using lead row time + first change's old_status
  if (!sawLeadCreated && sorted.length > 0) {
    const firstChange = sorted.find((a) => a.action_type === "status_changed");
    const initial =
      (firstChange && parseDetailsStatus(firstChange.details, "old_status")) ??
      "new";
    milestones.unshift({ at: leadCreatedAt, status: initial });
  } else if (!sawLeadCreated && sorted.length === 0) {
    milestones.push({ at: leadCreatedAt, status: currentStatus });
  }

  milestones.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Dedupe same status at identical timestamps (keep first)
  const deduped: Milestone[] = [];
  for (const m of milestones) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.status === m.status &&
      prev.at.getTime() === m.at.getTime()
    ) {
      continue;
    }
    deduped.push(m);
  }

  // Collapse consecutive duplicate statuses (keep earliest time)
  const collapsed: Milestone[] = [];
  for (const m of deduped) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.status === m.status) continue;
    collapsed.push(m);
  }

  if (collapsed.length === 0) {
    return [
      {
        status: currentStatus,
        label: LEAD_STATUS_CONFIG[currentStatus].label,
        color: LEAD_STATUS_CONFIG[currentStatus].color,
        durationMs: Math.max(
          0,
          differenceInMilliseconds(now, leadCreatedAt),
        ),
        startedAt: leadCreatedAt,
      },
    ];
  }

  const stages: LeadJourneyStage[] = [];
  for (let i = 0; i < collapsed.length; i++) {
    const start = collapsed[i].at;
    const end =
      i + 1 < collapsed.length ? collapsed[i + 1].at : now;
    const durationMs = Math.max(0, differenceInMilliseconds(end, start));
    const status = collapsed[i].status;
    const cfg = LEAD_STATUS_CONFIG[status];
    stages.push({
      status,
      label: cfg.label,
      color: cfg.color,
      durationMs,
      startedAt: start,
    });
  }

  return stages;
}

/** Total ms spent in each status (sums split visits). */
export function dwellMsByStatus(
  activities: LeadJourneyActivity[],
  currentStatus: LeadStatus,
  options: { leadCreatedAt: string; now: Date },
): Partial<Record<LeadStatus, number>> {
  const stages = aggregateLeadJourneyStages(activities, currentStatus, {
    leadCreatedAt: options.leadCreatedAt,
    now: options.now,
  });
  const map: Partial<Record<LeadStatus, number>> = {};
  for (const s of stages) {
    map[s.status] = (map[s.status] ?? 0) + s.durationMs;
  }
  return map;
}

export function formatJourneyDuration(ms: number): string {
  const totalMins = Math.max(0, Math.floor(ms / 60_000));
  if (totalMins < 1) return "< 1 min";
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${totalMins} min${totalMins === 1 ? "" : "s"}`;
  if (mins === 0) return `${hrs} hr${hrs === 1 ? "" : "s"}`;
  return `${hrs} hr${hrs === 1 ? "" : "s"} ${mins} min${mins === 1 ? "" : "s"}`;
}

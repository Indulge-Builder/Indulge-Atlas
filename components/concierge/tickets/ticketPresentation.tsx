import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONCIERGE_STATUS_LABELS,
  CONCIERGE_PRIORITY_LABELS,
  CONCIERGE_GROUP_LABELS,
  type ConciergeTicketStatus,
  type ConciergeTicketPriority,
  type ConciergeGroup,
} from "@/lib/types/database";

// Pure presentation helpers for concierge tickets. No client hooks — safe in RSC.

const STATUS_STYLES: Record<ConciergeTicketStatus, string> = {
  open: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  nudge_client: "bg-sky-50 text-sky-700 border-sky-200",
  nudge_vendor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  ongoing_delivery: "bg-teal-50 text-teal-700 border-teal-200",
  invoice_due: "bg-purple-50 text-purple-700 border-purple-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

const PRIORITY_DOT: Record<ConciergeTicketPriority, string> = {
  low: "bg-neutral-400",
  medium: "bg-sky-500",
  urgent: "bg-red-500",
};

export function statusLabel(status: ConciergeTicketStatus): string {
  return CONCIERGE_STATUS_LABELS[status];
}
export function priorityLabel(priority: ConciergeTicketPriority): string {
  return CONCIERGE_PRIORITY_LABELS[priority];
}
export function groupLabel(group: ConciergeGroup): string {
  return CONCIERGE_GROUP_LABELS[group];
}

export function StatusBadge({ status, className }: { status: ConciergeTicketStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

export function PriorityDot({ priority, withLabel }: { priority: ConciergeTicketPriority; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
      <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[priority])} aria-hidden />
      {withLabel && priorityLabel(priority)}
    </span>
  );
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600",
        className,
      )}
    >
      Overdue
    </span>
  );
}

/** Human "time in status" from an ISO timestamp, e.g. "5h", "2d 3h", "just now". */
export function timeInStatus(sinceIso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(sinceIso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

/** Labels for the append-only timeline entry kinds. */
export function updateKindLabel(kind: string): string {
  switch (kind) {
    case "note": return "Note";
    case "status_change": return "Status changed";
    case "assignment": return "Assignment";
    case "attachment": return "Attachment";
    case "canned_response": return "Canned response";
    case "checklist": return "Checklist";
    case "vendor_feedback": return "Vendor feedback";
    case "system": return "System";
    default: return kind;
  }
}

// ── SLA presentation (pure / RSC-safe) ──────────────────────────────────────────

/** Milliseconds → compact human duration: "3h 20m", "1d 4h", "5m", "<1m". */
function humanizeDuration(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "<1m";
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  return `${rem}m`;
}

export type SlaTone = "neutral" | "amber" | "red";

/** red = overdue or past due · amber = < 1h remaining · neutral otherwise. */
export function slaTone(dueIso: string | null, isOverdue: boolean, now: Date = new Date()): SlaTone {
  if (isOverdue) return "red";
  if (!dueIso) return "neutral";
  const diff = new Date(dueIso).getTime() - now.getTime();
  if (diff <= 0) return "red";
  if (diff <= 60 * 60 * 1000) return "amber";
  return "neutral";
}

/** "Due in 3h 20m" · "Overdue by 1d 4h" · "No target". */
export function formatSlaCountdown(dueIso: string | null, now: Date = new Date()): string {
  if (!dueIso) return "No target";
  const diff = new Date(dueIso).getTime() - now.getTime();
  if (diff <= 0) return `Overdue by ${humanizeDuration(-diff)}`;
  return `Due in ${humanizeDuration(diff)}`;
}

const SLA_TONE_STYLES: Record<SlaTone, string> = {
  neutral: "text-neutral-500",
  amber: "text-amber-600",
  red: "text-red-600 font-medium",
};

/**
 * Compact SLA countdown chip. Computed at render time from the passed timestamps
 * (no polling). suppressHydrationWarning avoids a text mismatch across the SSR/client
 * boundary since `now` differs by a few ms.
 */
export function SlaCountdown({
  dueIso,
  isOverdue,
  withIcon,
  className,
}: {
  dueIso: string | null;
  isOverdue?: boolean;
  withIcon?: boolean;
  className?: string;
}) {
  const tone = slaTone(dueIso, !!isOverdue);
  return (
    <span
      suppressHydrationWarning
      className={cn("inline-flex items-center gap-1 text-xs", SLA_TONE_STYLES[tone], className)}
    >
      {withIcon && <Clock3 className="h-3 w-3" aria-hidden />}
      {formatSlaCountdown(dueIso)}
    </span>
  );
}

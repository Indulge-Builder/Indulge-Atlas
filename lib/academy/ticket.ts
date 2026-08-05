/**
 * Academy Freshdesk ticket model.
 *
 * Every training request is presented as a Freshdesk support ticket, so the
 * intern practises the real concierge loop: read the ticket, work the client,
 * then document the resolution on the ticket. This module owns the ticket
 * *shape* — the header facts, the badge vocabulary, and the pre-flight checks a
 * submission must clear before it is worth spending an AI call on.
 *
 * Ticket facts are DERIVED, not stored. A ticket is a deterministic function of
 * the seed and the session, so the same request always shows the same ticket ID
 * and subject without a second table to keep in sync. Only the intern's *update*
 * is persisted (training_ticket_updates, migration 131).
 *
 * Pure module — no I/O, fully deterministic, safe on client and server.
 */

import type {
  AcademyTicketPriority,
  AcademyTicketStatus,
  AcademyTicketTag,
} from "@/lib/types/database";
import { ACADEMY_TICKET_TAGS } from "@/lib/types/database";

// ── Vocabulary ───────────────────────────────────────────────────────────────

export const TICKET_STATUS_LABEL: Record<AcademyTicketStatus, string> = {
  open: "Open",
  pending: "Pending",
  waiting_on_customer: "Waiting on Customer",
  resolved: "Resolved",
  closed: "Closed",
};

/** Badge classes — Atlas tokens only, no hardcoded hex. */
export const TICKET_STATUS_CLASS: Record<AcademyTicketStatus, string> = {
  open: "bg-info-light text-info ring-info/20",
  pending: "bg-warning-light text-warning ring-warning/20",
  waiting_on_customer: "bg-warning-light text-warning ring-warning/20",
  resolved: "bg-success-light text-success ring-success/20",
  closed: "bg-surface-subtle text-black/55 ring-black/10",
};

export const TICKET_PRIORITY_LABEL: Record<AcademyTicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const TICKET_PRIORITY_CLASS: Record<AcademyTicketPriority, string> = {
  low: "bg-surface-subtle text-black/55 ring-black/10",
  medium: "bg-info-light text-info ring-info/20",
  high: "bg-warning-light text-warning ring-warning/20",
  urgent: "bg-danger-light text-danger ring-danger/20",
};

export const TICKET_TAG_LABEL: Record<AcademyTicketTag, string> = {
  luxury: "Luxury",
  travel: "Travel",
  watches: "Watches",
  concierge: "Concierge",
  shopping: "Shopping",
  urgent: "Urgent",
  other: "Other",
};

/**
 * Statuses that mean "the intern considers this done". Anything else keeps the
 * request open regardless of how good the write-up is — a well-written ticket
 * left Pending is still not a handled request.
 */
export const TERMINAL_TICKET_STATUSES: AcademyTicketStatus[] = [
  "resolved",
  "closed",
];

export function isTerminalStatus(status: AcademyTicketStatus): boolean {
  return TERMINAL_TICKET_STATUSES.includes(status);
}

// ── Derivation ───────────────────────────────────────────────────────────────

/** Difficulty tier → the priority the desk would have triaged it at. */
const PRIORITY_BY_DIFFICULTY: Record<string, AcademyTicketPriority> = {
  easy: "low",
  medium: "medium",
  hard: "high",
  advanced: "high",
  expert: "urgent",
};

/** Hours on the clock before the ticket breaches, by triaged priority. */
const SLA_HOURS: Record<AcademyTicketPriority, number> = {
  low: 48,
  medium: 24,
  high: 8,
  urgent: 4,
};

/**
 * Stable 32-bit hash (FNV-1a). Used only to turn a UUID into a plausible
 * six-digit ticket number — never for anything security-bearing.
 */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** `INDG-482913` — deterministic per seed, so it never changes under the user. */
export function ticketRefFor(seedId: string): string {
  const n = (hash32(seedId) % 900000) + 100000;
  return `INDG-${n}`;
}

export function priorityForDifficulty(difficulty: string): AcademyTicketPriority {
  return PRIORITY_BY_DIFFICULTY[difficulty] ?? "medium";
}

/** Vertical slug → the category label the desk would file it under. */
export function categoryForVertical(vertical: string): string {
  const cleaned = vertical.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "General";
  return cleaned
    .split(/\s+/)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export interface AcademyTicket {
  ref: string;
  subject: string;
  /** Live status: derived from the intern's saved update, else "open". */
  status: AcademyTicketStatus;
  /** Triaged priority — the desk's opening call, before the intern re-triages. */
  priority: AcademyTicketPriority;
  category: string;
  assignedTo: string;
  clientName: string;
  createdAt: string;
  dueAt: string;
}

export interface DeriveTicketInput {
  seedId: string;
  requestTitle: string;
  clientName: string;
  vertical: string;
  difficulty: string;
  /** Who the ticket is assigned to — the signed-in intern. */
  assignedTo: string;
  /** Session start when one exists; otherwise the task date. */
  createdAt: string;
  /** Set once the intern has saved an update. */
  currentStatus?: AcademyTicketStatus | null;
  currentPriority?: AcademyTicketPriority | null;
}

export function deriveTicket(input: DeriveTicketInput): AcademyTicket {
  const priority =
    input.currentPriority ?? priorityForDifficulty(input.difficulty);
  const createdMs = new Date(input.createdAt).getTime();
  const slaMs = SLA_HOURS[priorityForDifficulty(input.difficulty)] * 3600_000;

  return {
    ref: ticketRefFor(input.seedId),
    subject: input.requestTitle,
    status: input.currentStatus ?? "open",
    priority,
    category: categoryForVertical(input.vertical),
    assignedTo: input.assignedTo,
    clientName: input.clientName,
    createdAt: input.createdAt,
    dueAt: new Date(
      Number.isFinite(createdMs) ? createdMs + slaMs : Date.now() + slaMs,
    ).toISOString(),
  };
}

/** Minutes between session start and submission — the "Time Spent" field. */
export function elapsedMinutes(
  startedAt: string | null,
  endedAt: string | null,
): number | null {
  if (!startedAt || !endedAt) return null;
  const a = new Date(startedAt).getTime();
  const b = new Date(endedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(1, Math.round((b - a) / 60_000));
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── Pre-flight validation ────────────────────────────────────────────────────

export interface TicketUpdateInput {
  resolution_summary: string;
  internal_notes: string;
  public_reply: string;
  status: AcademyTicketStatus;
  priority: AcademyTicketPriority;
  tags: string[];
  time_spent_minutes: number;
}

/**
 * Minimum lengths. These are a floor, not a standard — they exist so an empty
 * or one-word field never reaches the reviewer and burns an API call. Judging
 * whether the content is actually *good* is the reviewer's job.
 */
export const MIN_RESOLUTION_SUMMARY = 40;
export const MIN_INTERNAL_NOTES = 15;
export const MIN_PUBLIC_REPLY = 40;

/**
 * Structural checks only, run before the AI review. Returns one message per
 * failing field, in form order, so the UI can show them all at once.
 */
export function validateTicketUpdate(input: TicketUpdateInput): string[] {
  const errors: string[] = [];

  if (input.resolution_summary.trim().length < MIN_RESOLUTION_SUMMARY) {
    errors.push(
      `Resolution summary needs at least ${MIN_RESOLUTION_SUMMARY} characters — describe what you actually did.`,
    );
  }
  if (input.internal_notes.trim().length < MIN_INTERNAL_NOTES) {
    errors.push(
      `Internal notes need at least ${MIN_INTERNAL_NOTES} characters — leave context for whoever picks this up next.`,
    );
  }
  // No public-reply check: the field was removed from the ticket. The reply to
  // the member is the conversation itself, which is already graded by the
  // evaluator — asking the trainee to compose it twice was duplicate work.
  if (input.tags.length === 0) {
    errors.push("Add at least one tag so the ticket is findable.");
  }
  if (input.tags.some((t) => !ACADEMY_TICKET_TAGS.includes(t as AcademyTicketTag))) {
    errors.push("Unrecognised tag.");
  }
  if (
    !Number.isFinite(input.time_spent_minutes) ||
    input.time_spent_minutes < 1
  ) {
    errors.push("Time spent must be at least 1 minute.");
  }

  return errors;
}

/** Can this update close out the request? Structure + a terminal status. */
export function canSubmitForReview(input: TicketUpdateInput): boolean {
  return validateTicketUpdate(input).length === 0 && isTerminalStatus(input.status);
}

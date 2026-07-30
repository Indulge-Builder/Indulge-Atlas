/**
 * Concierge ticket status state machine — the core rules engine.
 *
 * Pure, dependency-free, and fully testable. `changeTicketStatus` (server action)
 * enforces these server-side; the UI reads the same constants to enable/disable
 * status options and to point at the exact missing requirement.
 *
 * NOT a "use server" module — pure sync exports only.
 */
import type { ConciergeTicketStatus } from "@/lib/types/database";

// ── Transition matrix (build spec §4.1; ops may tune) ──────────────────────────

export const ALLOWED_TRANSITIONS: Record<ConciergeTicketStatus, readonly ConciergeTicketStatus[]> = {
  open:             ["pending", "nudge_client", "nudge_vendor", "ongoing_delivery", "invoice_due", "resolved"],
  pending:          ["open", "nudge_client", "nudge_vendor", "ongoing_delivery", "invoice_due", "resolved"],
  nudge_client:     ["open", "pending", "nudge_vendor", "ongoing_delivery", "invoice_due", "resolved"],
  nudge_vendor:     ["open", "pending", "nudge_client", "ongoing_delivery", "invoice_due", "resolved"],
  ongoing_delivery: ["open", "pending", "nudge_client", "nudge_vendor", "invoice_due", "resolved"],
  invoice_due:      ["open", "ongoing_delivery", "resolved"],
  resolved:         ["open", "closed"], // reopen or close
  closed:           ["open"],           // reopen
} as const;

/**
 * Configurable: does an incomplete checklist BLOCK resolve, or just warn?
 * Default = warn (spec §4.2 [DECISION]). Flip to true for a hard block.
 */
export const CHECKLIST_BLOCKS_RESOLVE = false;

/** Statuses that stop the SLA/overdue clock (spec §5). */
export const NON_OVERDUE_STATUSES: readonly ConciergeTicketStatus[] = [
  "resolved", "ongoing_delivery", "nudge_client", "closed",
];

/** Terminal-ish: no active SLA once here. */
export const TERMINAL_STATUSES: readonly ConciergeTicketStatus[] = ["resolved", "closed"];

export function isTransitionAllowed(
  from: ConciergeTicketStatus,
  to: ConciergeTicketStatus,
  isAdminOverride = false,
): boolean {
  if (from === to) return false;
  if (isAdminOverride) return true; // admins/founders may force any transition (gate still runs)
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Statuses selectable in the UI from the current one. Admins see every other status. */
export function allowedTransitionsFrom(
  from: ConciergeTicketStatus,
  isAdminOverride = false,
): ConciergeTicketStatus[] {
  if (isAdminOverride) {
    return (Object.keys(ALLOWED_TRANSITIONS) as ConciergeTicketStatus[]).filter((s) => s !== from);
  }
  return [...ALLOWED_TRANSITIONS[from]];
}

// ── Entry gates (spec §4.2) ────────────────────────────────────────────────────

/** Facts the server action assembles from the ticket + its related rows. */
export interface TicketGateContext {
  from: ConciergeTicketStatus;
  to: ConciergeTicketStatus;
  /** primary_vendor_id is set. */
  hasPrimaryVendor: boolean;
  /** The primary vendor has at least one of {phone, email, name}. */
  vendorHasContact: boolean;
  /** A nudge note body was supplied in this transition. */
  noteBodyProvided: boolean;
  /** ≥1 attachment on the ticket with is_proof = true. */
  hasProofAttachment: boolean;
  /** A tracking_id was supplied in the transition metadata. */
  trackingIdProvided: boolean;
  /** A complete ticket_invoices row exists (all NOT NULL fields present). */
  invoiceComplete: boolean;
  /** The invoice row links an invoice attachment (invoice_att_id). */
  invoiceAttachmentLinked: boolean;
  /** is_billable is not null (decision made). */
  isBillableDecided: boolean;
  /** is_billable === true. */
  isBillable: boolean;
  /** invoice_number present on the ticket. */
  invoiceNumberPresent: boolean;
  checklistTotal: number;
  checklistChecked: number;
  /** Caller is admin/founder forcing the transition. */
  isAdminOverride: boolean;
}

export interface GateIssue {
  code: string;
  /** UI field the requirement maps to (for pointing at the missing input). */
  field?: string;
  message: string;
}

export interface GateEvaluation {
  ok: boolean;
  /** Requirements that failed and block the transition (empty when ok or overridden). */
  blocked: GateIssue[];
  /** Non-blocking issues (e.g. incomplete checklist in warn mode; overridden blocks). */
  warnings: GateIssue[];
}

/** Collect the raw requirement failures for entering `ctx.to` (before override logic). */
function collectGateFailures(ctx: TicketGateContext): GateIssue[] {
  const issues: GateIssue[] = [];

  switch (ctx.to) {
    case "nudge_vendor": {
      if (!ctx.hasPrimaryVendor || !ctx.vendorHasContact) {
        issues.push({
          code: "vendor_contact_required",
          field: "primary_vendor_id",
          message: "Set a primary vendor with a phone, email, or name before nudging the vendor.",
        });
      }
      if (!ctx.noteBodyProvided) {
        issues.push({
          code: "nudge_note_required",
          field: "note",
          message: "Add a note describing what the vendor is being nudged about.",
        });
      }
      break;
    }
    case "nudge_client": {
      if (!ctx.noteBodyProvided) {
        issues.push({
          code: "nudge_note_required",
          field: "note",
          message: "Add a note describing what the client is being nudged about.",
        });
      }
      break;
    }
    case "ongoing_delivery": {
      if (!ctx.hasProofAttachment && !ctx.trackingIdProvided) {
        issues.push({
          code: "proof_required",
          field: "proof",
          message: "Attach proof of confirmation (image/PDF) or provide a tracking ID before marking Ongoing Delivery.",
        });
      }
      break;
    }
    case "invoice_due": {
      if (!ctx.invoiceComplete) {
        issues.push({
          code: "invoice_incomplete",
          field: "invoice",
          message: "Complete the invoice (client, description, cost/selling price, service charge, vendor, payment method) before Invoice Due.",
        });
      }
      if (!ctx.invoiceAttachmentLinked) {
        issues.push({
          code: "invoice_attachment_required",
          field: "invoice_att_id",
          message: "Attach the invoice document before marking Invoice Due.",
        });
      }
      break;
    }
    case "resolved": {
      if (!ctx.isBillableDecided) {
        issues.push({
          code: "billable_required",
          field: "is_billable",
          message: "Set the Billable decision (Yes/No) before resolving.",
        });
      } else if (ctx.isBillable && !ctx.invoiceNumberPresent) {
        issues.push({
          code: "invoice_number_required",
          field: "invoice_number",
          message: "Add an invoice number — the ticket is marked billable.",
        });
      }
      break;
    }
    case "closed": {
      if (ctx.from !== "resolved") {
        issues.push({
          code: "close_from_resolved_only",
          field: "status",
          message: "A ticket can only be closed from Resolved.",
        });
      }
      break;
    }
    default:
      break; // open, pending — no gate
  }

  return issues;
}

/** Checklist completeness, evaluated only on resolve. Warn by default, block if flagged. */
function checklistIssue(ctx: TicketGateContext): GateIssue | null {
  if (ctx.to !== "resolved") return null;
  if (ctx.checklistTotal === 0) return null;
  if (ctx.checklistChecked >= ctx.checklistTotal) return null;
  return {
    code: "checklist_incomplete",
    field: "checklist",
    message: `Checklist is ${ctx.checklistChecked}/${ctx.checklistTotal} complete.`,
  };
}

/**
 * Evaluate whether entering `ctx.to` is permitted.
 * - Deterministic requirement failures block (unless admin override → warnings).
 * - Incomplete checklist warns (or blocks if CHECKLIST_BLOCKS_RESOLVE, still overridable).
 */
export function evaluateEntryGate(ctx: TicketGateContext): GateEvaluation {
  const hardFailures = collectGateFailures(ctx);
  const warnings: GateIssue[] = [];

  const cl = checklistIssue(ctx);
  if (cl) {
    if (CHECKLIST_BLOCKS_RESOLVE) hardFailures.push(cl);
    else warnings.push(cl);
  }

  if (ctx.isAdminOverride) {
    // Force allowed; record what would have blocked as warnings for the timeline.
    return { ok: true, blocked: [], warnings: [...hardFailures, ...warnings] };
  }

  return { ok: hardFailures.length === 0, blocked: hardFailures, warnings };
}

/** Full pre-flight: transition legality + entry gate, in one call. */
export function validateStatusChange(ctx: TicketGateContext): GateEvaluation & { transitionAllowed: boolean } {
  const transitionAllowed = isTransitionAllowed(ctx.from, ctx.to, ctx.isAdminOverride);
  if (!transitionAllowed) {
    return {
      ok: false,
      transitionAllowed: false,
      blocked: [{
        code: "transition_not_allowed",
        field: "status",
        message: `Cannot move a ticket from ${ctx.from} to ${ctx.to}.`,
      }],
      warnings: [],
    };
  }
  return { transitionAllowed: true, ...evaluateEntryGate(ctx) };
}

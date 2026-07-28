/**
 * Scenario builder — turns ONE completed Freshdesk ticket into an anonymised,
 * replayable Scenario. Pure + deterministic given its inputs.
 *
 * Runs only at ingest (node/operator context). Never imported by the trainee UI,
 * which reads the finished store instead. All text passes through the one-way
 * anonymiser before it is placed on the Scenario.
 */
import { createHash } from "node:crypto";
import type {
  FreshdeskTicket,
  TicketPriority as FreshdeskPriority,
} from "@/lib/freshdesk/types";
import { mapPriority, mapStatus } from "@/lib/freshdesk/types";
import type {
  ConciergeTicketPriority,
  ConciergeTicketStatus,
  RequestField,
  Scenario,
  ScenarioEvent,
  GroundTruth,
} from "@/training/types";
import { TRAINING_SCHEMA_VERSION } from "@/training/types";
import { anonymiseText, anonymiseField, type AnonymiseOptions } from "@/training/ingest/anonymise";
import { deriveExpectedPath } from "@/training/scoring/expectedPath";

export interface BuildScenarioInput {
  ticket: FreshdeskTicket;
  /** Requester's real name(s) — scrubbed out of all text. */
  requesterNames?: (string | null | undefined)[];
  /** SLA targets in calendar minutes (matched upstream, or defaults). */
  slaFirstResponseMinutes: number;
  slaResolutionMinutes: number;
  /** Opaque salt so scenario ids can't be reversed to FD ticket ids. */
  idSalt: string;
  /** Operator denylist of proper-noun PII (locations, vendors). */
  denylist?: string[];
}

/** Concierge priority has no "high"; fold Freshdesk high → urgent. */
function toConciergePriority(p: FreshdeskPriority): ConciergeTicketPriority {
  switch (p) {
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    case "urgent":
      return "urgent";
    default:
      return "medium";
  }
}

/** Freshdesk numeric status → concierge terminal status (scenarios are completed). */
function toFinalStatus(status: number): ConciergeTicketStatus {
  // 4 = resolved, 5 = closed. Anything else shouldn't be a scenario, but map safely.
  return status === 5 ? "closed" : "resolved";
}

function offsetMs(fromIso: string, toIso: string | null | undefined): number | null {
  if (!toIso) return null;
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, b - a);
}

function scenarioId(ticketId: number, salt: string): string {
  const h = createHash("sha256").update(`${ticketId}:${salt}`).digest("hex");
  return `scn_${h.slice(0, 12)}`;
}

/** The cf_* fields worth surfacing to the trainee, in display order. */
const REQUEST_FIELD_MAP: [key: string, label: string][] = [
  ["cf_request", "Request"],
  ["cf_events", "Event / Service"],
  ["cf_from_location", "From"],
  ["cf_to_location", "To"],
  ["cf_date", "Date"],
  ["cf_time", "Time"],
  ["cf_duration", "Duration"],
  ["cf_pax", "Guests"],
  ["cf_budget", "Budget"],
  ["cf_location", "Location"],
  ["cf_airport", "Airport"],
  ["cf_early_check_in", "Early Check-in"],
  ["cf_assistance_required", "Assistance"],
  ["cf_gift_specifications", "Gift Details"],
  ["cf_product_details", "Product Details"],
];

/**
 * Synthesize the member's opening bubble from structured fields only. Never uses
 * raw free-text bodies. The result is anonymised by the caller.
 */
function synthesizeOpening(ticket: FreshdeskTicket): string {
  const cf = ticket.custom_fields;
  const core = cf.cf_request?.trim() || ticket.subject?.trim() || "I have a request";
  const bits: string[] = [core.replace(/\s+/g, " ")];

  const route =
    cf.cf_from_location && cf.cf_to_location
      ? `from ${cf.cf_from_location} to ${cf.cf_to_location}`
      : cf.cf_location
        ? `in ${cf.cf_location}`
        : null;
  if (route) bits.push(route);
  if (cf.cf_date) bits.push(`for ${cf.cf_date}${cf.cf_time ? ` at ${cf.cf_time}` : ""}`);
  if (cf.cf_pax) bits.push(`for ${cf.cf_pax} guests`);
  if (cf.cf_budget) bits.push(`budget ${cf.cf_budget}`);

  return `Hi, ${bits.join(", ")}. Can you help?`;
}

export function buildScenario(input: BuildScenarioInput): Scenario {
  const { ticket, requesterNames, slaFirstResponseMinutes, slaResolutionMinutes, idSalt } = input;
  const anonOpts: AnonymiseOptions = {
    requesterNames: [...(requesterNames ?? []), ticket.requester?.name],
    denylist: input.denylist,
  };

  let redactionCount = 0;

  const titleRes = anonymiseText(ticket.subject, anonOpts);
  redactionCount += titleRes.redactions;

  const openingRes = anonymiseText(synthesizeOpening(ticket), anonOpts);
  redactionCount += openingRes.redactions;

  const requestFields: RequestField[] = [];
  for (const [key, label] of REQUEST_FIELD_MAP) {
    const f = anonymiseField(label, ticket.custom_fields[key] ?? null, anonOpts);
    if (f) {
      redactionCount += f.redactions;
      requestFields.push({ label: f.label, value: f.value });
    }
  }

  const priority = toConciergePriority(mapPriority(ticket.priority));
  const finalStatus = toFinalStatus(ticket.status);

  const created = ticket.created_at;
  const frOffset = offsetMs(created, ticket.stats?.first_responded_at);
  const resOffset = offsetMs(created, ticket.stats?.resolved_at);
  const closeOffset = offsetMs(created, ticket.stats?.closed_at);

  const events: ScenarioEvent[] = [{ offsetMs: 0, kind: "member_opened", label: "Member's request arrives" }];
  if (frOffset != null)
    events.push({ offsetMs: frOffset, kind: "agent_first_response", label: "Genie's first response" });
  if (resOffset != null)
    events.push({ offsetMs: resOffset, kind: "resolved", label: "Resolved", status: "resolved" });
  if (closeOffset != null)
    events.push({ offsetMs: closeOffset, kind: "closed", label: "Closed", status: "closed" });
  if (ticket.is_escalated)
    events.push({ offsetMs: frOffset ?? 0, kind: "escalated", label: "Escalated" });
  events.sort((a, b) => a.offsetMs - b.offsetMs);

  const groundTruth: GroundTruth = {
    firstResponseOffsetMs: frOffset,
    resolutionOffsetMs: resOffset,
    closedOffsetMs: closeOffset,
    escalated: ticket.is_escalated,
    // Freshdesk gives no escalation timestamp; leave null and let the scorer use
    // the SLA/overdue reference instead.
    escalatedOffsetMs: null,
    finalStatus,
    expectedPath: deriveExpectedPath(finalStatus),
  };

  // Sub-category drives grouping and is ~59% empty upstream.
  const subcategoryRaw =
    ticket.custom_fields.cf_ticket_type?.trim() || null;
  const category = ticket.type?.trim() || null;

  return {
    schemaVersion: TRAINING_SCHEMA_VERSION,
    id: scenarioId(ticket.id, idSalt),
    title: titleRes.text || `${mapStatus(ticket.status)} request`,
    category,
    subcategory: subcategoryRaw,
    subcategoryBackfillNeeded: subcategoryRaw == null,
    priority,
    openingMessage: openingRes.text || "Hi, I have a request. Can you help?",
    requestFields,
    slaFirstResponseMinutes,
    slaResolutionMinutes,
    events,
    groundTruth,
    redactionCount,
  };
}

/** A completed ticket is one that's resolved (4) or closed (5). */
export function isCompletedTicket(ticket: FreshdeskTicket): boolean {
  return ticket.status === 4 || ticket.status === 5;
}

/**
 * Indulge Atlas — Genie Trainer (trainee-facing WhatsApp-style replay app).
 *
 * DOMAIN CONTRACT. Everything the trainer needs is defined here.
 *
 * Design note (why this shape): a scan of 55,828 real Freshdesk tickets found
 * ~0 member↔agent dialogue — 70% are status-shells, 30% are internal-notes-only,
 * and member-inbound bubbles number exactly 0. So a "chat replay of the Freshdesk
 * conversation" is not possible. Instead a Scenario is built from the parts a
 * ticket DOES carry: the request (subject + structured cf_* fields), the status
 * timeline (created/first-response/resolved/closed/escalated) and priority. The
 * member's opening bubble is SYNTHESIZED from those structured fields — never
 * lifted from raw free-text — and everything reaching this store is anonymised
 * one-way at ingest. See training/CLAUDE.md.
 *
 * Pure types only — no runtime, no "use server", safe to import anywhere.
 */
import type { ConciergeTicketStatus, ConciergeTicketPriority } from "@/lib/types/database";

export type { ConciergeTicketStatus, ConciergeTicketPriority };

/** Schema version stamped onto every seed file + scenario, so a store built by an
 * older ingest can be detected and rejected rather than silently mis-scored. */
export const TRAINING_SCHEMA_VERSION = 1 as const;

// ── The scenario (one anonymised, completed ticket) ────────────────────────────

/** A single structured request field surfaced to the trainee (already anonymised). */
export interface RequestField {
  label: string;
  value: string;
}

/**
 * A ground-truth timeline event, positioned as an offset from t0 (ticket
 * created_at). The clock replays these; the report compares the intern's own
 * event offsets against them. Offsets are milliseconds, always >= 0.
 */
export interface ScenarioEvent {
  offsetMs: number;
  kind:
    | "member_opened" // t0 — the request arrives
    | "agent_first_response" // real Genie's first reply landed
    | "status_milestone" // a status the real ticket passed through (coarse; see note)
    | "escalated" // ticket was escalated
    | "resolved" // resolution recorded
    | "closed"; // ticket closed
  label: string;
  /** Concierge status this milestone corresponds to, when applicable. */
  status?: ConciergeTicketStatus;
}

/**
 * What the real Genie actually did — the answer key. Derived only from the
 * ticket's status timeline + flags; no free-text is stored here.
 *
 * IMPORTANT on stage granularity: historical Freshdesk tickets record only coarse
 * milestones (created → first response → resolved/closed, escalated y/n). The
 * intermediate concierge stages (nudge_vendor, ongoing_delivery, invoice_due …)
 * are a construct of the NEW concierge system and are NOT present in Freshdesk
 * history. So `expectedPath` is a *reasonable* legal path derived from category +
 * final status, not a transcript of what the Genie clicked. Stage scoring rewards
 * legality + reaching the real final status, not matching a fabricated path.
 */
export interface GroundTruth {
  firstResponseOffsetMs: number | null;
  resolutionOffsetMs: number | null;
  closedOffsetMs: number | null;
  escalated: boolean;
  escalatedOffsetMs: number | null;
  finalStatus: ConciergeTicketStatus;
  /** A legal reference path (for the report's "the Genie's route" panel). */
  expectedPath: ConciergeTicketStatus[];
}

export interface Scenario {
  schemaVersion: typeof TRAINING_SCHEMA_VERSION;
  /** Stable opaque id (hash of the source ticket id + salt) — NOT the FD ticket id. */
  id: string;
  /** Anonymised, human-readable one-liner for the list + chat header. */
  title: string;
  category: string | null;
  /**
   * Sub-category drives scenario grouping. It is ~59% empty in source data;
   * when absent this is null and `subcategoryBackfillNeeded` is true. Treated as
   * a data dependency, not polish — see training/CLAUDE.md.
   */
  subcategory: string | null;
  subcategoryBackfillNeeded: boolean;
  priority: ConciergeTicketPriority;
  /** Synthesized member opening bubble (from structured fields, anonymised). */
  openingMessage: string;
  requestFields: RequestField[];
  /** SLA targets (calendar minutes) matched for this scenario's category/priority. */
  slaFirstResponseMinutes: number;
  slaResolutionMinutes: number;
  /** Ground-truth timeline, ascending by offset. */
  events: ScenarioEvent[];
  groundTruth: GroundTruth;
  /** Anonymisation audit: how many redactions were applied to this scenario's text. */
  redactionCount: number;
}

/** The committed store shape. */
export interface ScenarioStore {
  schemaVersion: typeof TRAINING_SCHEMA_VERSION;
  generatedAt: string; // ISO; set by the ingest CLI
  source: "freshdesk-readonly-ingest" | "synthetic-seed";
  scenarios: Scenario[];
}

// ── The intern's side (actions taken during a replay) ──────────────────────────

/**
 * Actions the intern can take, chosen from chips. Every action carries `atMs`:
 * the intern's own offset from t0 on the replay clock. This is the ONLY thing
 * the scorer reads about the intern — a pure, serialisable path.
 */
export type InternAction =
  | { kind: "reply"; atMs: number; cannedId?: string }
  | { kind: "transition"; atMs: number; to: ConciergeTicketStatus }
  | { kind: "escalate"; atMs: number }
  | { kind: "resolve"; atMs: number };

export interface InternAttempt {
  scenarioId: string;
  /** The ordered path the intern took. */
  actions: InternAction[];
  /** Wall-clock the attempt was submitted (ISO); not used for scoring, for records. */
  submittedAt: string;
}

// ── The report (intern path vs the real ticket) ────────────────────────────────

export type WrongTurnCode =
  | "illegal_transition"
  | "gate_violation"
  | "resolved_before_first_response"
  | "escalated_unnecessarily"
  | "missed_escalation"
  | "never_responded"
  | "never_resolved";

export interface WrongTurn {
  code: WrongTurnCode;
  atMs: number | null;
  detail: string;
}

export interface TtfrReport {
  internMs: number | null;
  realMs: number | null;
  slaTargetMs: number;
  withinSla: boolean;
  /** internMs − realMs (positive = slower than the real Genie). Null if no reply. */
  deltaVsRealMs: number | null;
}

export interface StageReport {
  path: ConciergeTicketStatus[];
  expectedPath: ConciergeTicketStatus[];
  legalTransitions: number;
  illegalTransitions: number;
  reachedFinalStatus: boolean;
}

export interface EscalationReport {
  internEscalated: boolean;
  shouldEscalate: boolean;
  correct: boolean;
  /** intern escalate offset − real escalate/overdue offset. Null when N/A. */
  timingDeltaMs: number | null;
}

export interface AttemptReport {
  scenarioId: string;
  ttfr: TtfrReport;
  stage: StageReport;
  escalation: EscalationReport;
  wrongTurns: WrongTurn[];
  /** 0–100 composite, weighted across the four dimensions. */
  score: number;
  /** Per-dimension 0–100 sub-scores (transparency for the report card). */
  breakdown: {
    responsiveness: number;
    stageAccuracy: number;
    escalation: number;
    cleanRun: number;
  };
}

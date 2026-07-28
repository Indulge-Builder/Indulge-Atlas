/**
 * UI-facing Academy view models.
 *
 * These live outside `lib/actions/academy.ts` because that module carries
 * "use server" (Next.js only permits async function exports there). Client
 * components import these shapes from here.
 */

import type {
  AcademyRubricDimension,
  AcademyScenarioCard,
  TrainingReview,
  TrainingSession,
  TrainingTurn,
} from "@/lib/types/database";

/** One row of the trainer cohort table. */
export interface CohortInternRow {
  internId: string;
  internName: string;
  sessionsCompleted: number;
  avgOverall: number | null;
  avgByDimension: Partial<Record<AcademyRubricDimension, number | null>>;
  /** Avg overall of the last 3 reviews minus the prior ones. Null if too few. */
  trend: number | null;
}

/** A session summary row in the intern's "my sessions" list. */
export interface InternSessionRow {
  id: string;
  title: string;
  vertical: string;
  difficulty: string;
  status: "open" | "closed";
  startedAt: string;
  endedAt: string | null;
  overall: number | null;
}

// ── Client model: one member, one request ────────────────────────────────────

/** A row in the left-hand client list. One client = one training request. */
export interface AcademyClientRow {
  seedId: string;
  taskNumber: number;
  /** The member's name — what the row is titled. */
  name: string;
  /** Their request, used as the conversation preview line. */
  requestTitle: string;
  vertical: string;
  difficulty: string;
  status: "not_started" | "in_progress" | "completed";
  sessionId: string | null;
  overall: number | null;
  lastActivity: string | null;
}

/**
 * Academy-wide totals for the client list header.
 *
 * `percent` is performance-weighted, not completion-weighted: each handled
 * request contributes a slice sized by how well it went. `completionPercent` is
 * kept alongside it so the breakdown can show ground covered separately from
 * quality of coverage.
 */
export interface AcademyClientOverview {
  completed: number;
  total: number;
  /** Performance-weighted progress, 0–100 — the number on the bar. */
  percent: number;
  /** Plain tasks-done ÷ total, 0–100. */
  completionPercent: number;
  /** Mean quality of the requests actually handled, 0–100. */
  qualityPercent: number;
  inProgress: number;
  /** Per-metric averages for the breakdown, 0–100 each. */
  breakdown: Record<string, number>;
}

export interface AcademyClientList {
  clients: AcademyClientRow[];
  overview: AcademyClientOverview;
}

/**
 * Everything the right-hand panel needs to render a client's conversation.
 * `sessionId` is null until the intern actually replies — browsing a client
 * should not create a session row.
 */
export interface AcademyClientThread {
  seedId: string;
  taskNumber: number;
  name: string;
  requestTitle: string;
  brief: string | null;
  vertical: string;
  difficulty: string;
  raisedBy: string | null;
  taskDate: string | null;
  /** The member's opening message, rendered from the seed. */
  openingMessage: string;
  /** Short mentor line shown before the member's message. */
  mentorIntro: string;
  /** How many hidden constraints exist — shapes the in-thread mentor cue. */
  constraintCount: number;
  sessionId: string | null;
  status: "not_started" | "in_progress" | "completed";
  turns: TrainingTurn[];
  review: TrainingReview | null;
  readOnly: boolean;
  overview: AcademyClientOverview;
}

// ── Curriculum view models (the 50-group ladder) ─────────────────────────────

/** One row in the left-hand group list. */
export interface AcademyGroupRow {
  groupNumber: number;
  title: string;
  tier: "easy" | "medium" | "advanced" | "expert";
  taskCount: number;
  completedCount: number;
  dayCount: number;
  percent: number;
  isComplete: boolean;
  isLocked: boolean;
  lastActivity: string | null;
}

/** A single task card inside a group. */
export interface AcademyTaskCard {
  seedId: string;
  taskNumber: number;
  title: string;
  brief: string | null;
  raisedBy: string | null;
  vertical: string;
  status: "locked" | "not_started" | "in_progress" | "completed";
  /** Session to resume or review, when one exists. */
  sessionId: string | null;
  /** Score once the drill has been evaluated. */
  overall: number | null;
}

/** Tasks for one day inside a group — renders under a WhatsApp-style separator. */
export interface AcademyDaySection {
  dayNumber: number;
  date: string | null;
  label: string;
  tasks: AcademyTaskCard[];
  isComplete: boolean;
}

/** Everything the right-hand learning panel renders for a group. */
export interface AcademyGroupDetail {
  groupNumber: number;
  title: string;
  tier: "easy" | "medium" | "advanced" | "expert";
  isLocked: boolean;
  percent: number;
  taskCount: number;
  completedCount: number;
  days: AcademyDaySection[];
}

/** Overall academy progress, shown above the group list. */
export interface AcademyOverview {
  completedTasks: number;
  totalTasks: number;
  percent: number;
  completedGroups: number;
  totalGroups: number;
}

/** Everything the /academy page needs in one payload. */
export interface AcademyLadder {
  groups: AcademyGroupRow[];
  overview: AcademyOverview;
}

/**
 * Progress context shown above the chat: where this drill sits in the academy,
 * how the current group is going, and one short actionable next step.
 */
export interface AcademySessionProgress {
  /** Null for free-practice seeds, which sit outside the ladder. */
  groupNumber: number | null;
  groupTitle: string | null;
  groupCompleted: number;
  groupTotal: number;
  groupPercent: number;
  overallCompleted: number;
  overallTotal: number;
  overallPercent: number;
  /** Short, actionable — one line, never a paragraph. */
  nextHint: string;
}

/** Everything the session page renders. */
export interface AcademySessionDetail {
  progress: AcademySessionProgress;
  session: TrainingSession;
  display: AcademyScenarioCard;
  turns: TrainingTurn[];
  review: TrainingReview | null;
  /** True when the viewer is a trainer reviewing someone else's session. */
  readOnly: boolean;
  internName: string;
}

// MANUAL TYPES — To be replaced with generated types.
// Run `npm run types:generate` to regenerate from the live schema.
// See lib/types/database.generated.ts after running.
// Replace YOUR_PROJECT_ID in package.json with your actual Supabase project ID first.

// ── Messaging types ────────────────────────────────────────

export type ConversationType = "direct" | "lead_context";

export interface Conversation {
  id: string;
  type: ConversationType;
  lead_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationParticipant {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
  joined_at: string;
}

// Minimal lead info embedded in a message when a lead is attached
export interface MessageLeadPreview {
  id: string;
  full_name: string;
  status: LeadStatus;
  city: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  lead_id: string | null;
  created_at: string;
  // Enriched client-side
  sender?: Pick<Profile, "id" | "full_name" | "role">;
  lead?: MessageLeadPreview | null;
}

/** Meta WhatsApp Cloud API — persisted thread on the lead dossier */
export type WhatsAppMessageDirection = "inbound" | "outbound";
export type WhatsAppMessageType = "text" | "template" | "image";
export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface WhatsAppMessage {
  id: string;
  lead_id: string;
  direction: WhatsAppMessageDirection;
  message_type: WhatsAppMessageType;
  content: string;
  status: WhatsAppDeliveryStatus;
  wa_message_id: string | null;
  created_at: string;
}

// ── Enums — must match the PostgreSQL enum values exactly ──
// Strict 8-stage pipeline: new → attempted → connected → in_discussion → won | nurturing | lost | trash

export type LeadStatus =
  | "new"
  | "attempted"
  | "connected"
  | "in_discussion"
  | "won"
  | "nurturing"
  | "lost"
  | "trash";

/** Domain display config for sidebar badge, switcher, and table pills (Quiet Luxury) */
export const DOMAIN_DISPLAY_CONFIG: Record<
  IndulgeDomain | string,
  { label: string; ringColor: string; shortLabel: string; pillBg: string; pillColor: string }
> = {
  indulge_concierge: {
    label: "Indulge Concierge",
    shortLabel: "Concierge",
    ringColor: "rgba(99, 102, 241, 0.5)",
    pillBg: "#EEF2FF",
    pillColor: "#4F46E5",
  },
  indulge_house: {
    label: "Indulge House",
    shortLabel: "House",
    ringColor: "rgba(212, 175, 55, 0.4)",
    pillBg: "#FEF3C7",
    pillColor: "#A88B25",
  },
  indulge_shop: {
    label: "Indulge Shop",
    shortLabel: "Shop",
    ringColor: "rgba(16, 185, 129, 0.45)",
    pillBg: "#D1FAE5",
    pillColor: "#0D9488",
  },
  indulge_legacy: {
    label: "Indulge Legacy",
    shortLabel: "Legacy",
    ringColor: "rgba(107, 114, 128, 0.4)",
    pillBg: "#F4F4F5",
    pillColor: "#6B7280",
  },
  // Added migration 066: cross-BU domain for Finance, Tech, Marketing
  indulge_global: {
    label: "Indulge Global",
    shortLabel: "Global",
    ringColor: "rgba(212, 175, 55, 0.5)",
    pillBg: "#FFF7ED",
    pillColor: "#D4AF37",
  },
};

/** Logical pipeline order for dropdowns and filters */
export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "new",
  "attempted",
  "connected",
  "in_discussion",
  "won",
  "nurturing",
  "lost",
  "trash",
];

export type UserRole = "admin" | "founder" | "super_admin" | "manager" | "agent" | "guest";

/** Roles that can mutate data (used for UI guardrails) */
export const MUTABLE_ROLES: UserRole[] = ["admin", "founder", "super_admin", "manager", "agent"];

/** Roles with cross-domain visibility */
export const GLOBAL_ROLES: UserRole[] = ["admin", "founder", "super_admin"];

/** Admin, founder, super_admin — cross-cutting privileges (RLS + UI). Matches migration 076 task policies. */
export function isPrivilegedRole(role: string): boolean {
  return role === "admin" || role === "founder" || role === "super_admin";
}

/** Admin / founder / super_admin / manager — bypass client row ownership for ops (matches `clients` / `leads` patterns). */
export function canManageAnyClient(role: string): boolean {
  return isPrivilegedRole(role) || role === "manager";
}

export type AdPlatform = "meta" | "google" | "website" | "events" | "referral";

export type DraftStatus = "draft" | "approved" | "deployed";

export type TaskStatus = "pending" | "completed" | "overdue";

/** Shop workspace — must match shop_orders.status CHECK */
export type ShopOrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Shop master targets — must match shop_master_targets.priority CHECK */
export type ShopMasterTargetPriority = "super_high" | "high" | "normal";

/** Shop task collaboration mode — `tasks.shop_operation_scope` CHECK */
export type ShopOperationScope = "individual" | "group";

/** Shop master targets — must match shop_master_targets.status CHECK */
export type ShopMasterTargetStatus = "active" | "completed";

// ── Project task system types ──────────────────────────────

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type ProjectMemberRole = 'owner' | 'manager' | 'member' | 'viewer';
export type TaskGroupStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';
export type TaskPriority = 'critical' | 'urgent' | 'high' | 'medium' | 'low';

export interface Project {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  owner_id: string;
  department: string | null;
  domain: string | null;
  color: string | null;
  icon: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  owner?: Pick<Profile, 'id' | 'full_name'> | null;
  members?: ProjectMember[];
  task_groups?: TaskGroup[];
  task_count?: number;
  completed_task_count?: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  added_by: string | null;
  added_at: string;
  // Joined
  profile?: Pick<Profile, 'id' | 'full_name' | 'role'> | null;
}

export interface TaskGroup {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskGroupStatus;
  position: number;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Client-side only: tasks in this group
  tasks?: ProjectTask[];
}

/** A task belonging to a project (extends the base Task with project-specific fields). */
export interface ProjectTask {
  id: string;
  project_id: string;
  group_id: string | null;
  parent_task_id: string | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  due_date: string | null;
  assigned_to_users: string[];
  estimated_minutes: number | null;
  actual_minutes: number | null;
  position: number;
  tags: string[];
  attachments: TaskAttachment[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  assigned_to_profiles?: Pick<Profile, 'id' | 'full_name' | 'role'>[];
  sub_tasks?: ProjectTask[];
  comment_count?: number;
}

export interface TaskAttachment {
  name: string;
  url: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  content: string;
  edited_at: string | null;
  is_system: boolean;
  created_at: string;
  // Joined
  author?: Pick<Profile, 'id' | 'full_name' | 'role'> | null;
}

/**
 * Structured progress log row from the task_progress_updates table.
 * Note: TaskProgressUpdate (the JSONB per-note shape on tasks.progress_updates)
 * is a separate type defined below — these are different entities.
 */
export interface ProjectProgressUpdate {
  id: string;
  task_id: string;
  updated_by: string | null;
  previous_progress: number;
  new_progress: number;
  previous_status: string;
  new_status: string;
  note: string | null;
  created_at: string;
  // Joined
  updater?: Pick<Profile, 'id' | 'full_name'> | null;
}

// ── Atlas Task System — Unified Task Management (migration 067) ────────────

/**
 * unified_task_type column — classifies tasks in the unified hierarchy.
 * 'master'   = top-level objective (was: Project)
 * 'subtask'  = atomic work item inside a Master Task
 * 'personal' = standalone task with no parent (was: delegate task)
 */
export type MasterTaskType = 'master' | 'subtask' | 'personal';

/**
 * atlas_status column — rich status enum for the unified task system.
 * Distinct from the legacy TaskStatus ('pending'|'completed'|'overdue') used
 * by the CRM task flow. Both coexist on the tasks table.
 */
export type AtlasTaskStatus =
  | 'todo'
  | 'in_progress'
  | 'done'
  | 'error'
  | 'cancelled';

/** Canonical order for pickers and filters (To Do → In Progress → Done → Error → Cancelled). */
export const ATLAS_TASK_STATUS_VALUES: readonly AtlasTaskStatus[] = [
  'todo',
  'in_progress',
  'done',
  'error',
  'cancelled',
] as const;

export const ATLAS_TASK_STATUS_LABELS: Record<AtlasTaskStatus, string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
  error:       'Error',
  cancelled:   'Cancelled',
};

export const ATLAS_TASK_STATUS_COLORS: Record<AtlasTaskStatus, string> = {
  todo:        '#6B7280',
  in_progress: '#D4AF37',
  done:        '#10B981',
  error:       '#F97316',
  cancelled:   '#9CA3AF',
};

/**
 * Timeline event source — differentiates author types in the Agentic Timeline.
 * 'agent'  = human agent logged an update via the Log Update form
 * 'system' = auto-inserted by a Server Action when a structural change occurs
 * 'elia'   = future: Elia AI inserts entries as a peer participant
 *
 * Added migration 071.
 */
export type TaskRemarkSource = 'agent' | 'system' | 'elia';

/**
 * The UUID of the synthetic "Atlas System" profile row.
 * Used as author_id for source='system' remarks.
 * Defined in migration 071 and inserted into public.profiles.
 */
export const ATLAS_SYSTEM_AUTHOR_ID = '00000000-0000-0000-0000-000000000001';

/**
 * The UUID reserved for the Elia AI author.
 * No profile row exists yet — this is a placeholder for when Elia goes live.
 * When an entry in task_remarks has author_id equal to this constant,
 * the frontend renders the Elia visual variant.
 */
export const ELIA_AUTHOR_ID = '00000000-0000-0000-0000-000000000002';

/** Remark — append-only state-change log entry on a subtask (migration 067/071) */
export interface TaskRemark {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  state_at_time: AtlasTaskStatus;
  previous_status: AtlasTaskStatus | null;
  progress_at_time: number | null;
  source: TaskRemarkSource;
  created_at: string;
  // Joined
  author?: Pick<Profile, 'id' | 'full_name' | 'job_title'> | null;
}

/** DB row for `task_remarks` (no joins) — used by `Database` generic for typed inserts. */
export interface TaskRemarkRow {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  state_at_time: AtlasTaskStatus;
  previous_status: AtlasTaskStatus | null;
  progress_at_time: number | null;
  source: TaskRemarkSource;
  created_at: string;
}

/** A single item in the subtask checklist stored as JSONB on tasks.attachments */
export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

/** Google Sheets import batch — audit trail row (migration 067) */
export interface ImportBatch {
  id: string;
  created_by: string;
  master_task_id: string | null;
  source: 'google_sheets';
  row_count: number;
  status: 'pending' | 'completed' | 'failed';
  error_log: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * MasterTask — a Project promoted to the unified task hierarchy.
 * Extends ProjectTask with master-task-specific fields.
 */
export interface MasterTask {
  id: string;
  title: string;
  description: string | null;
  unified_task_type: 'master';
  atlas_status: AtlasTaskStatus;
  domain: string | null;
  department: string | null;
  cover_color: string | null;
  icon_key: string | null;
  due_date: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined / computed
  owner?: Pick<Profile, 'id' | 'full_name' | 'job_title'> | null;
  members?: MasterTaskMember[];
  task_groups?: TaskGroup[];
  subtask_count?: number;
  completed_subtask_count?: number;
  member_count?: number;
  last_activity_at?: string | null;
}

export type MasterTaskMemberRole = 'owner' | 'member' | 'viewer';

export interface MasterTaskMember {
  id: string;
  project_id: string;
  user_id: string;
  role: MasterTaskMemberRole;
  added_by: string | null;
  added_at: string;
  profile?: Pick<Profile, 'id' | 'full_name' | 'role' | 'job_title'> | null;
}

/**
 * SubTask — an atomic work item inside a Master Task.
 * Uses ProjectTask as base, extended with Atlas fields.
 */
export interface SubTask extends ProjectTask {
  unified_task_type: 'subtask';
  atlas_status: AtlasTaskStatus;
  domain: string | null;
  department: string | null;
  master_task_id: string | null;
  imported_from: string | null;
  import_batch_id: string | null;
  remarks?: TaskRemark[];
}

/** Personal Task — standalone task with no parent project */
export interface PersonalTask {
  id: string;
  title: string;
  notes: string | null;
  unified_task_type: 'personal';
  atlas_status: AtlasTaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  progress: number;
  created_by: string | null;
  assigned_to_users: string[];
  created_at: string;
  updated_at: string;
  visibility?: 'personal' | 'group' | 'org';
  is_daily?: boolean;
  daily_date?: string | null;
  /** When true, row is a manager SOP template (hidden from normal lists). */
  is_daily_sop_template?: boolean;
  tags?: string[];
  /** Same storage as project tasks; optional on personal rows. */
  attachments?: TaskAttachment[];
  imported_from?: string | null;
}

/**
 * Subtask assigned to an agent under a master workspace (for manager dossier lists).
 */
export type WorkspaceSubtaskAssignment = SubTask & {
  masterTaskTitle: string | null;
  masterCoverColor: string | null;
};

export type EmployeeHealthSignal = 'on_track' | 'overloaded' | 'at_risk' | 'on_leave';

export interface EmployeeTaskMetrics {
  completionRateLast30Days: number;
  averageTaskDurationDays: number;
  overdueCount: number;
  totalActive: number;
  streakDays: number;
  workloadScore: number;
  onTimeRate: number;
  totalCompletedAllTime: number;
  healthSignal: EmployeeHealthSignal;
}

export interface EmployeeDossierPayload {
  profile: Profile;
  metrics: EmployeeTaskMetrics;
  personalTasks: {
    /** Daily SOP rows only; shown in dossier SOP block (tick when done). */
    dailySop: PersonalTask[];
    /** Non-daily, active, due today (IST). */
    pendingToday: PersonalTask[];
    /** Non-daily, active, not due today: overdue; then by due (next week first); undated last — excludes SOP. */
    upcoming: PersonalTask[];
    /** Non-daily completed in the past 7 days (rolling). */
    completedLastWeek: PersonalTask[];
  };
  workspaceSubtasks: WorkspaceSubtaskAssignment[];
}

/** Task Insights workspace cards — always `unified_task_type` master (no separate “group” product surface). */
export interface TaskInsightsWorkspaceCard {
  id: string;
  title: string;
  notes: string | null;
  atlas_status: AtlasTaskStatus;
  priority: TaskPriority;
  progress: number;
  due_date: string | null;
  domain: string | null;
  department: string | null;
  cover_color: string | null;
  icon_key: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  memberProfiles: Pick<Profile, 'id' | 'full_name'>[];
  subtask_count: number;
  completed_subtask_count: number;
  overdue_subtask_count: number;
}

/** @deprecated Alias — use TaskInsightsWorkspaceCard. */
export type GroupTaskDashboardItem = TaskInsightsWorkspaceCard;

export interface OrgTaskSummary {
  totalActiveTasks: number;
  orgCompletionPct: number;
  overdueCount: number;
  onLeaveCount: number;
}

/** Master Task analytics payload */
export interface MasterTaskAnalytics {
  total_subtasks: number;
  by_status: Record<AtlasTaskStatus, number>;
  completion_pct: number;
  by_assignee: Array<{
    profile: Pick<Profile, 'id' | 'full_name'>;
    count: number;
    done: number;
    in_progress: number;
  }>;
  overdue_count: number;
  velocity: Array<{ date: string; completed: number }>;
}

// ── Task Insights (manager / founder / admin) ───────────────────────────────

export type TaskIntelligenceHealthSignal = 'healthy' | 'needs_attention' | 'critical';

/** One department row for the Task Insights index and Elia briefings. */
export interface DepartmentTaskOverview {
  departmentId: EmployeeDepartment;
  label: string;
  icon: string;
  accentColor: string;
  activeMasterTaskCount: number;
  groupSubtaskCompletionPct: number;
  overdueSubtaskCount: number;
  todaySopCompletionPct: number;
  activeAgentCount: number;
  healthSignal: TaskIntelligenceHealthSignal;
}

export interface TaskIntelligenceOverdueSubtaskSnapshot {
  subtaskId: string;
  title: string;
  assigneeName: string;
  overdueDays: number;
}

/** Elia / internal services: org-wide task health snapshot (service-role consumers). */
export interface OrganisationTaskContext {
  generatedAt: string;
  departments: DepartmentTaskOverview[];
  /** Per department that is not `healthy`, up to three worst overdue subtasks. */
  attentionItems: Array<{
    departmentId: EmployeeDepartment;
    departmentLabel: string;
    overdueSubtasks: TaskIntelligenceOverdueSubtaskSnapshot[];
  }>;
  organisationTotals: {
    activeGroupMasterCount: number;
    overdueSubtaskCount: number;
    overallGroupSubtaskCompletionPct: number;
  };
}

/** Agent row for the Task Insights Agents tab. */
export interface TaskIntelligenceAgentSummary {
  id: string;
  full_name: string;
  job_title: string | null;
  is_on_leave: boolean;
  personalTaskTotal: number;
  statusCounts: Partial<Record<AtlasTaskStatus, number>>;
  todaySopCompletionPct: number;
  overduePersonalCount: number;
  /** From `profiles.domain` — used for domain chip filters on the Agents tab. */
  domain: IndulgeDomain;
  /** Agent's department (for dossier + profile context). */
  department: EmployeeDepartment | null;
}

/** Personal task row returned to the intelligence modal. */
export interface TaskIntelligencePersonalTaskRow {
  id: string;
  title: string;
  atlas_status: AtlasTaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  progress: number;
  description: string | null;
  checklist: ChecklistItem[];
  created_at: string;
  updated_at: string;
}

// ── Project display helpers ─────────────────────────────────

export const PROJECT_STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; className: string }
> = {
  active:    { label: 'Active',    className: 'bg-emerald-500/10 text-emerald-700' },
  on_hold:   { label: 'On Hold',   className: 'bg-amber-500/10 text-amber-700' },
  completed: { label: 'Completed', className: 'bg-[#D4AF37]/10 text-[#A88B25]' },
  archived:  { label: 'Archived',  className: 'bg-zinc-500/10 text-zinc-600' },
};

export const TASK_PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; className: string; dotClass: string }
> = {
  critical: { label: 'Critical', className: 'bg-red-500/10 text-red-600',    dotClass: 'bg-red-500' },
  urgent:   { label: 'Critical', className: 'bg-red-500/10 text-red-600',    dotClass: 'bg-red-500' },
  high:     { label: 'High',     className: 'bg-orange-500/10 text-orange-600', dotClass: 'bg-orange-500' },
  medium:   { label: 'Medium',   className: 'bg-amber-500/10 text-amber-600', dotClass: 'bg-amber-500' },
  low:      { label: 'Low',      className: 'bg-zinc-500/10 text-zinc-500',   dotClass: 'bg-zinc-400' },
};

export type TaskType =
  | "call"
  | "whatsapp_message"
  | "email"
  | "file_dispatch"
  | "general_follow_up"
  | "campaign_review"
  | "strategy_meeting"
  | "budget_approval"
  | "performance_analysis";

export type ActivityType =
  | "status_change"
  | "status_changed"
  | "lead_created"
  | "agent_assigned"
  | "note"
  | "note_added"
  | "call_attempt"
  | "task_created"
  | "task_completed";

/** Multi-tenant domain — must match PostgreSQL indulge_domain enum */
export type IndulgeDomain =
  | "indulge_concierge"
  | "indulge_shop"
  | "indulge_house"
  | "indulge_legacy"
  | "indulge_global"; // Cross-business-unit (Finance, Tech, Marketing) — added migration 066

/**
 * Employee department — must match PostgreSQL employee_department enum (migration 066).
 * Drives UI workspace routing (AXIS 2). Orthogonal to domain.
 * NULL on a profiles row = cross-departmental role (admin, founder, system).
 */
export type EmployeeDepartment =
  | "concierge"
  | "finance"
  | "tech"
  | "shop"
  | "house"
  | "legacy"
  | "marketing"
  | "onboarding"
  | "watcher" // Cross-Queendom read-only ticket oversight. Added migration 122.
  | "academy"; // Academy trainers — author seeds + read all training sessions. Added migration 124.

// ── Task type groupings ────────────────────────────────────

export const AGENT_TASK_TYPES: TaskType[] = [
  "call",
  "general_follow_up",
  "whatsapp_message",
  "file_dispatch",
  "email",
];

export const MANAGER_TASK_TYPES: TaskType[] = [
  "campaign_review",
  "strategy_meeting",
  "budget_approval",
  "performance_analysis",
];

export const ALL_TASK_TYPES: TaskType[] = [
  ...AGENT_TASK_TYPES,
  ...MANAGER_TASK_TYPES,
];

// ── Table interfaces ───────────────────────────────────────

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  dob: string | null; // ISO date "YYYY-MM-DD"
  role: UserRole;
  domain: IndulgeDomain;
  /** Employee department. NULL = cross-departmental role (admin/founder). Added migration 066. */
  department: EmployeeDepartment | null;
  /** Human-readable job title e.g. "Senior Concierge Manager". Added migration 066. */
  job_title: string | null;
  /** UUID of the direct manager in the reporting hierarchy. Added migration 066. */
  reports_to: string | null;
  /** Added migration 049 — when true, agent is excluded from routing. */
  is_on_leave?: boolean | null;
  /** Queendom (anishqa/ananyshree) for concierge ticket RLS scoping. Added migration 106 / relabeled 112. Optional: only selected where needed. */
  concierge_group?: ConciergeGroup | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Agent group — matches `agent_groups` (migration 115). Organisational directory
 * imported from Freshdesk's 11 groups. DISTINCT from profiles.department (fixed
 * access-control enum) and profiles.concierge_group (ticket RLS scoping).
 */
export interface AgentGroup {
  id: string;
  name: string;
  slug: string | null;
  /** Provenance, e.g. 'freshdesk' (imported) or 'atlas' (created in-app). */
  source: string;
  /** Freshdesk group id when imported; null for Atlas-native groups. */
  fd_group_id: number | null;
  is_active: boolean;
  created_at: string;
}

/** Agent group membership — matches `agent_group_members` (migration 115). */
export interface AgentGroupMember {
  group_id: string;
  profile_id: string;
  /** Optional per-group role label (e.g. "lead"). */
  role_in_group: string | null;
  created_at: string;
}

/** Group with its members joined in (for the admin Groups manager). */
export interface AgentGroupWithMembers extends AgentGroup {
  members: Array<Pick<Profile, "id" | "full_name" | "email" | "role"> & { role_in_group: string | null }>;
  member_count: number;
}

/** Lead routing engine — matches `lead_routing_rules` */
export type LeadRoutingActionType = "assign_to_agent" | "route_to_domain_pool";

export interface LeadRoutingRule {
  id: string;
  priority: number;
  rule_name: string;
  is_active: boolean;
  condition_field: string;
  condition_operator: string;
  condition_value: string;
  action_type: LeadRoutingActionType;
  action_target_uuid: string | null;
  action_target_domain: string | null;
}

export interface LeadRoutingRuleWithAgent extends LeadRoutingRule {
  target_profile: Pick<Profile, "id" | "full_name" | "email"> | null;
}

/** Agent waterfall routing config — matches `agent_routing_config` table (migration 061) */
export interface AgentRoutingConfig {
  id: string;
  /** UUID matching auth.users(id) and profiles(id) */
  user_id: string;
  /** Denormalised email for fast lookup — kept in sync with profiles.email */
  email: string;
  domain: string;
  is_active: boolean;
  /** Max new leads per IST calendar day. null = no cap. */
  daily_cap: number | null;
  /** Waterfall priority: lower = higher priority */
  priority: number;
  /** IST shift start "HH:MM:SS". null = always available */
  shift_start: string | null;
  /** IST shift end "HH:MM:SS". null = always available */
  shift_end: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type LostReasonTag =
  | "budget_exceeded"
  | "irrelevant_unqualified"
  | "timing_not_ready"
  | "went_with_competitor"
  | "ghosted_unresponsive";

/** Lost deal modal options (Google Sheet tag mapping) */
export type LostReason =
  | "Not Interested"
  | "Price Objection"
  | "Bought Competitor"
  | "Other";

/** Trash modal options */
export type TrashReason = "Incorrect Data" | "Not our TG" | "Spam";

/** Nurture modal options */
export type NurtureReason = "Future Prospect" | "Cold";

export interface Lead {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string;
  secondary_phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_name: string | null;
  platform: string | null;
  /** Acquisition channel label from integrations (e.g. Pabbly `source`) */
  source: string | null;
  // Raw JSONB from Meta Lead Ad, Pabbly passthrough, website form — all dynamic fields (incl. message)
  form_data: Record<string, unknown> | null;
  // UTM attribution — joined to campaign_metrics.campaign_id via utm_campaign
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  deal_value: number | null;
  deal_duration: string | null;
  domain: IndulgeDomain;
  status: LeadStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  is_off_duty: boolean;
  agent_alert_sent?: boolean;
  manager_alert_sent?: boolean;
  notes: string | null;
  // Phase 1: Lost lead churn analysis (legacy)
  lost_reason_tag: LostReasonTag | null;
  lost_reason_notes: string | null;
  // Pipeline overhaul: disposition reasons (TEXT from modals)
  lost_reason: string | null;
  trash_reason: string | null;
  nurture_reason: string | null;
  attempt_count?: number;
  // Phase 2: Agent-private scratchpad (never sent to scouts/admins)
  private_scratchpad: string | null;
  /** Draft text for dossier Follow Up 1–3 accordions (keys "1", "2", "3") */
  follow_up_drafts?: Record<string, string> | null;
  // Phase 4: Client persona & lifestyle notes (birthday, hobbies, etc.)
  personal_details: string | null;
  // Phase 5: Executive Dossier fields
  company: string | null;
  // Tagging system — e.g. griffin_event, furak_party
  tags: string[];
  created_at: string;
  updated_at: string;
  // Joined
  assigned_agent?: Profile;
}

/** Explicit cross-domain (or cross-team) grant to open a lead dossier for a user. */
export interface LeadCollaborator {
  id: string;
  lead_id: string;
  user_id: string;
  added_by: string | null;
  created_at: string;
  /** Joined from profiles */
  profile?: Pick<Profile, "id" | "full_name" | "email" | "department" | "domain" | "job_title">;
}

export interface CampaignDraft {
  id: string;
  campaign_name: string;
  platform: AdPlatform;
  objective: string | null;
  total_budget: number;
  target_cpa: number;
  projected_revenue: number;
  status: DraftStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignMetric {
  id: string;
  platform: AdPlatform;
  campaign_id: string;
  campaign_name: string;
  amount_spent: number;
  impressions: number;
  clicks: number;
  cpc: number;
  last_synced_at: string;
  created_at: string;
  /** Campaign status from ad platform: active | paused */
  status?: string;
  /** Lead form submissions / conversions from Meta/Google Ads API */
  conversions?: number;
}

export interface CampaignWithStats extends CampaignMetric {
  leads_generated: number;
  revenue_closed: number;
  roi: number;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  performed_by?: string | null;
  actor_id?: string | null;
  type?: ActivityType;
  action_type?: ActivityType;
  payload?: Record<string, unknown>;
  details?: Record<string, unknown>;
  created_at: string;
  // Joined
  agent?: Profile;
  actor?: Pick<Profile, "id" | "full_name"> | null;
}

/** Single progress update in the task timeline */
export interface TaskProgressUpdate {
  timestamp: string;
  message: string;
  user_id: string;
  user_name: string;
}

/** Single entry in follow-up history (3-Strike Engine) */
export interface FollowUpHistoryEntry {
  step: number;
  note: string;
  date: string; // ISO date "YYYY-MM-DD"
}

export interface Task {
  id: string;
  lead_id: string | null;
  assigned_to_users: string[];
  created_by: string | null;
  title: string;
  task_type: TaskType;
  status: TaskStatus;
  due_date: string;
  notes: string | null;
  progress_updates: TaskProgressUpdate[];
  follow_up_step: number;
  follow_up_history: FollowUpHistoryEntry[];
  /** Shop ops: individual vs group (distinct from `task_type` enum). */
  shop_operation_scope?: ShopOperationScope;
  target_inventory?: number | null;
  target_sold?: number;
  shop_task_priority?: ShopMasterTargetPriority;
  /** Shop deadline; UI falls back to `due_date` when null. */
  deadline?: string | null;
  shop_product_name?: string | null;
  // ── Project system columns (all nullable / have defaults — backward-compatible) ──
  project_id?: string | null;
  group_id?: string | null;
  parent_task_id?: string | null;
  priority?: TaskPriority | null;
  progress?: number;
  estimated_minutes?: number | null;
  actual_minutes?: number | null;
  position?: number;
  tags?: string[];
  attachments?: TaskAttachment[];
  created_at: string;
  updated_at: string;
  // Joined
  lead?: Pick<
    Lead,
    "id" | "first_name" | "last_name" | "phone_number" | "email" | "status"
  > | null;
  created_by_profile?: Pick<Profile, "id" | "full_name" | "role"> | null;
  /** Primary assignee (first in array) — for backward compat. Prefer assigned_to_profiles. */
  assigned_to_profile?: Pick<Profile, "id" | "full_name" | "role"> | null;
  /** All assignees when fetched with join. */
  assigned_to_profiles?: Pick<Profile, "id" | "full_name" | "role">[];
}

export type TaskWithLead = Task & {
  lead: Pick<
    Lead,
    "id" | "first_name" | "last_name" | "phone_number" | "email" | "status"
  > | null;
};

/** Supabase-compatible JSON for jsonb columns */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ── Database shape (used by Supabase client generics) ──────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      leads: {
        Row: Lead;
        Insert: Omit<
          Lead,
          "id" | "created_at" | "updated_at" | "assigned_agent"
        >;
        Update: Partial<Omit<Lead, "id" | "created_at" | "assigned_agent">>;
        Relationships: [];
      };
      webhook_logs: {
        Row: {
          id: string;
          source: string;
          raw_payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          source: string;
          raw_payload: Json;
          created_at?: string;
        };
        Update: Partial<{
          source: string;
          raw_payload: Json;
        }>;
        Relationships: [];
      };
      lead_notification_logs: {
        Row: {
          id: string;
          lead_id: string | null;
          agent_id: string | null;
          event_type: "lead_received" | "notification_sent" | "notification_failed";
          gupshup_status: number | null;
          gupshup_body: string | null;
          delivered: boolean | null;
          lead_name: string | null;
          lead_phone: string | null;
          agent_phone: string | null;
          source: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id?: string | null;
          agent_id?: string | null;
          event_type: "lead_received" | "notification_sent" | "notification_failed";
          gupshup_status?: number | null;
          gupshup_body?: string | null;
          delivered?: boolean | null;
          lead_name?: string | null;
          lead_phone?: string | null;
          agent_phone?: string | null;
          source?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          lead_id: string | null;
          agent_id: string | null;
          event_type: "lead_received" | "notification_sent" | "notification_failed";
          gupshup_status: number | null;
          gupshup_body: string | null;
          delivered: boolean | null;
          lead_name: string | null;
          lead_phone: string | null;
          agent_phone: string | null;
          source: string | null;
        }>;
        Relationships: [];
      };
      onboarding_leads: {
        Row: {
          id: string;
          client_name: string;
          amount: number;
          agent_name: string;
          assigned_to: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_name: string;
          amount: number;
          agent_name: string;
          assigned_to: string;
          created_at?: string;
        };
        Update: Partial<{
          client_name: string;
          amount: number;
          agent_name: string;
          assigned_to: string;
        }>;
        Relationships: [];
      };
      whatsapp_messages: {
        Row: WhatsAppMessage;
        Insert: Omit<WhatsAppMessage, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<
          Pick<
            WhatsAppMessage,
            | "content"
            | "status"
            | "wa_message_id"
            | "message_type"
            | "direction"
          >
        >;
        Relationships: [];
      };
      lead_activities: {
        Row: LeadActivity;
        Insert: Omit<LeadActivity, "id" | "created_at" | "agent">;
        Update: Partial<LeadActivity>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Omit<
          Task,
          | "id"
          | "created_at"
          | "updated_at"
          | "lead"
          | "created_by_profile"
          | "assigned_to_profile"
          | "assigned_to_profiles"
          | "shop_operation_scope"
          | "target_inventory"
          | "target_sold"
          | "shop_task_priority"
          | "deadline"
          | "shop_product_name"
        > & {
          created_by?: string | null;
          progress_updates?: TaskProgressUpdate[];
          follow_up_step?: number;
          follow_up_history?: FollowUpHistoryEntry[];
          shop_operation_scope?: ShopOperationScope;
          target_inventory?: number | null;
          target_sold?: number;
          shop_task_priority?: ShopMasterTargetPriority;
          deadline?: string | null;
          shop_product_name?: string | null;
        };
        Update: Partial<
          Omit<
            Task,
            | "id"
            | "created_at"
            | "lead"
            | "created_by_profile"
            | "assigned_to_profile"
            | "assigned_to_profiles"
          >
        >;
        Relationships: [];
      };
      /** Append-only timeline (migration 067 / 071). Insert via user RLS or service role. */
      task_remarks: {
        Row: TaskRemarkRow;
        Insert: Omit<TaskRemarkRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        /** Append-only in DB; typed as partial for Supabase `GenericTable` compatibility. */
        Update: Partial<TaskRemarkRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Enums: {
      lead_status: LeadStatus;
      user_role: UserRole;
      task_status: TaskStatus;
      task_type: TaskType;
      activity_type: ActivityType;
      ad_platform: AdPlatform;
    };
    Functions: {
      increment_shop_task_target_sold: {
        Args: { p_task_id: string };
        Returns: number;
      };
      assign_next_agent: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_leads_columns: {
        Args: Record<string, unknown>;
        Returns: { column_name: string; data_type: string }[];
      };
    };
  };
}

// ── Lead status display config (Quiet Luxury color coding) ──

export const LEAD_STATUS_CONFIG: Record<
  LeadStatus,
  {
    label: string;
    color: string;
    bgColor: string;
    description: string;
    className?: string;
  }
> = {
  new: {
    label: "New",
    color: "#D4AF37",
    bgColor: "rgba(212, 175, 55, 0.2)",
    description: "Freshly assigned, not yet contacted",
    className: "bg-amber-500/20 text-amber-500",
  },
  attempted: {
    label: "Attempted",
    color: "#3B82F6",
    bgColor: "rgba(59, 130, 246, 0.2)",
    description: "Contact attempted, awaiting response",
    className: "bg-blue-500/20 text-blue-500",
  },
  connected: {
    label: "Connected",
    color: "#818CF8",
    bgColor: "rgba(129, 140, 248, 0.2)",
    description: "First contact established",
    className: "bg-indigo-500/20 text-indigo-400",
  },
  in_discussion: {
    label: "In Discussion",
    color: "#10B981",
    bgColor: "rgba(16, 185, 129, 0.2)",
    description: "Actively engaged in conversation",
    className: "bg-emerald-500/20 text-emerald-500",
  },
  won: {
    label: "Won",
    color: "#D4AF37",
    bgColor: "rgba(212, 175, 55, 0.2)",
    description: "Qualified and sent to Finance",
    className: "bg-[#D4AF37]/20 text-[#D4AF37]",
  },
  nurturing: {
    label: "Nurturing",
    color: "#0E7490",
    bgColor: "rgba(14, 116, 144, 0.2)",
    description: "Long-term follow-up scheduled",
    className: "bg-cyan-600/20 text-cyan-700",
  },
  lost: {
    label: "Lost",
    color: "#EF4444",
    bgColor: "rgba(239, 68, 68, 0.2)",
    description: "Lead did not convert",
    className: "bg-red-500/20 text-red-500",
  },
  trash: {
    label: "Trash",
    color: "#6B7280",
    bgColor: "rgba(107, 114, 128, 0.15)",
    description: "Invalid or irrelevant contact",
    className: "bg-zinc-500/20 text-zinc-500",
  },
};

// ─── Notification Types ───────────────────────────────────────────────────────

export type TaskNotificationType =
  | "subtask_assigned"
  | "subtask_updated"
  | "group_task_added";

export interface TaskNotification {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: TaskNotificationType;
  task_id: string;
  parent_task_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  /** Joined fields (from select with profile join) */
  actor?: Pick<Profile, "id" | "full_name" | "department">;
}

export interface NotificationSummary {
  notifications: TaskNotification[];
  unreadCount: number;
}

export type ClientStatus = 'active' | 'expired' | 'prospect' | 'inactive' | 'unknown';

export type MembershipType = 'Premium' | 'Standard' | 'Celebrity' | 'Genie' | 'Monthly Trial';

export type MembershipInterval = 'year' | 'month' | 'week';

export type ProfileSourceType = 'typeform' | 'whatsapp' | 'manual' | 'social_enrichment' | 'meeting_transcript' | 'lead_form_data';

export type ClientTravelProfile = {
  seat_preference?: string;
  stay_preferences?: string[];
  go_to_country?: string;
  needs_assistance_with?: string;
};

export type ClientLifestyleProfile = {
  dietary_preference?: string;
  favourite_cuisine?: string[];
  favourite_food?: string;
  favourite_drink?: string;
  go_to_restaurant?: string[];
  favourite_brands?: string[];
};

export type ClientPassionsProfile = {
  favourite_sports?: string[];
  favourite_car?: string;
  favourite_watch?: string;
};

export type ClientEliaProfile = {
  summary?: string;
  hard_nos?: string[];
  special_dates?: string[];
  last_enriched_at?: string;
};

/** Structured intelligence profile derived from WhatsApp chat analysis (migration 091). */
export interface EliaProfile {
  summary: string;
  identity: {
    sentiment: "positive" | "neutral" | "needs_attention";
    relationship_strength: "strong" | "developing" | "new" | "at_risk";
    communication_style: string;
    key_traits: string[];
  };
  travel: {
    preferred_operators: string[];
    preferred_cabin: string | null;
    usual_group_size: string | null;
    typical_destinations: string[];
    upcoming_trips: Array<{ destination: string; approximate_date: string | null }>;
    travel_notes: string | null;
  };
  dining: {
    preferred_cuisines: string[];
    dietary_restrictions: string[];
    go_to_restaurants: string[];
    dining_notes: string | null;
  };
  accommodation: {
    preferred_hotel_chains: string[];
    preferred_room_type: string | null;
    accommodation_notes: string | null;
  };
  requests: {
    recent: Array<{ date: string; description: string; status: string }>;
    recurring_themes: string[];
  };
  milestones: {
    birthdays: string[];
    anniversaries: string[];
    other: string[];
  };
  sources: {
    analysis_runs: number;
    message_count_analyzed: number;
    whatsapp_analyzed_through: string | null;
  };
  last_updated_at: string;
  last_updated_by: string;
  version: number;
}

export interface Client {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string;
  email: string | null;
  queendom: string | null;
  former_queendom: string | null;
  client_status: ClientStatus;
  membership_type: MembershipType | null;
  membership_start: string | null;
  membership_end: string | null;
  membership_amount_paid: number | null;
  membership_interval: MembershipInterval | null;
  external_id: string | null;
  assigned_agent_id: string | null;
  avatar_url: string | null;
  notes: string | null;
  lead_origin_id: string | null;
  closed_by: string | null;
  membership_status: string;
  created_at: string;
  updated_at: string;
  chetto_group_id: string | null;
  /** Queendom (anishqa/ananyshree); default source for a ticket's group. Added migration 106 / relabeled 112. Optional: only selected where needed. */
  concierge_group?: ConciergeGroup | null;
}

export type ChettoSuggestionMethod =
  | "phone"
  | "name"
  | "name_fuzzy"
  | "timeline"
  | "insights"
  | "search";

export type ChettoSuggestionStatus = "pending" | "accepted" | "rejected";

export interface ClientChettoSuggestion {
  id: string;
  client_id: string;
  chetto_group_id: string;
  confidence: number;
  method: ChettoSuggestionMethod;
  evidence: string | null;
  status: ChettoSuggestionStatus;
  created_at: string;
  updated_at: string;
  resolved_by: string | null;
}

export type ChettoUnmappedQueueStatus = "pending" | "resolved";

export interface ClientChettoUnmappedQueue {
  client_id: string;
  display_name: string;
  queendom: string | null;
  source: string;
  status: ChettoUnmappedQueueStatus;
  queued_at: string;
  resolved_at: string | null;
}

export interface ClientProfile {
  id: string;
  client_id: string;
  personality_type: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  marital_status: string | null;
  wedding_anniversary: string | null;
  primary_city: string | null;
  company_designation: string | null;
  social_handles: string | null;
  travel: ClientTravelProfile;
  lifestyle: ClientLifestyleProfile;
  passions: ClientPassionsProfile;
  elia_notes: ClientEliaProfile;
  elia_profile: EliaProfile | null;
  elia_version: number;
  elia_analyzed_at: string | null;
  elia_messages_through: string | null;
  profile_completeness: number;
  last_enriched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileSource {
  id: string;
  client_id: string;
  source_type: ProfileSourceType;
  source_ref: string | null;
  raw_data: Record<string, unknown>;
  mapped_fields: Record<string, unknown>;
  confidence: number;
  ingested_by: string | null;
  ingested_at: string;
}

export interface ClientWithProfile extends Client {
  client_profiles: ClientProfile | null;
}

// ── Budget ────────────────────────────────────────────────────────────────────

export type BudgetDomain = "meta" | "elia" | "zoho";
export type BudgetCurrency = "INR" | "USD";

export interface BudgetTransaction {
  id: string;
  domain: BudgetDomain;
  date: string;
  item: string;
  amount: number;
  currency: BudgetCurrency;
  paid_by: string | null;
  created_by: string;
  created_at: string;
}

export interface BudgetDeliverable {
  id: string;
  domain: BudgetDomain;
  text: string;
  done: boolean;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Gupshup WhatsApp bot (migration 094) ─────────────────────────────────────

export type BotCatalogCategory = 'watches' | 'travel' | 'events' | 'sports' | 'art' | 'fashion';

export interface BotCatalogItem {
  id: string;
  category: BotCatalogCategory;
  name: string;
  description: string;
  image_url: string | null;
  price_range: string | null;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type BotSessionState =
  | 'greeting'
  | 'browsing'
  | 'viewing_products'
  | 'handoff_pending'
  | 'handed_off';

export interface BotSession {
  id: string;
  phone: string;
  state: BotSessionState;
  last_category: string | null;
  last_message_at: string;
  bot_turn_count: number;
  lead_id: string | null;
  context_jsonb: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BotMessage {
  id: string;
  session_id: string;
  phone: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  created_at: string;
}

/** Structured JSON Claude Haiku must return for each bot turn. */
export interface BotClaudeResponse {
  intent: 'greeting' | 'browsing' | 'product_inquiry' | 'interested' | 'out_of_scope' | 'handoff_request';
  category: BotCatalogCategory | null;
  reply_type: 'text' | 'image' | 'list' | 'buttons';
  text_reply: string;
  image_reply: { product_id: string; caption: string } | null;
  list_reply: {
    body: string;
    button_text: string;
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  } | null;
  buttons_reply: {
    body: string;
    buttons: Array<{ id: string; title: string }>;
  } | null;
  should_handoff: boolean;
  handoff_reason: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Concierge ticketing subsystem (migrations 106–110)
// Native replacement for the Freshdesk concierge workflow. Hand-written to match
// the Postgres enums/tables exactly (this repo has no generated types).
// ═══════════════════════════════════════════════════════════════════════════════

/** Matches PG enum public.concierge_ticket_status. */
export type ConciergeTicketStatus =
  | "open"
  | "pending"
  | "nudge_client"
  | "nudge_vendor"
  | "ongoing_delivery"
  | "invoice_due"
  | "resolved"
  | "closed";

/** Matches PG enum public.concierge_ticket_priority. */
export type ConciergeTicketPriority = "low" | "medium" | "urgent";

/**
 * Matches the active values of PG enum public.concierge_group used for ticket
 * RLS + agent assignment. Only the two Queendoms are assignable (migration 118
 * deactivated the other 9 Freshdesk groups). Column is `org_group` (not `group`).
 * PG may still hold legacy enum labels on old rows; UI only offers these two.
 */
export type ConciergeGroup = "anishqa" | "ananyshree";

/** Matches PG enum public.concierge_update_kind (append-only timeline entry kinds). */
export type ConciergeUpdateKind =
  | "note"
  | "status_change"
  | "assignment"
  | "attachment"
  | "canned_response"
  | "checklist"
  | "vendor_feedback"
  | "system";

/** Matches PG enum public.vendor_promptness. */
export type VendorPromptness = "within_1h" | "within_24h" | "2_3_days";
/** Matches PG enum public.vendor_cost_band. */
export type VendorCostBand = "lowest" | "moderate" | "high_premium";
/** Matches PG enum public.vendor_delivery. */
export type VendorDelivery = "on_time" | "delay" | "poor_communication";

/** Matches PG enum public.concierge_ticket_notification_type. */
export type ConciergeTicketNotificationType =
  | "ticket_assigned"
  | "ticket_transferred"
  | "ticket_status_changed"
  | "ticket_note_added"
  | "invoice_due";

export const CONCIERGE_TICKET_STATUSES: readonly ConciergeTicketStatus[] = [
  "open", "pending", "nudge_client", "nudge_vendor",
  "ongoing_delivery", "invoice_due", "resolved", "closed",
] as const;

export const CONCIERGE_TICKET_PRIORITIES: readonly ConciergeTicketPriority[] = [
  "low", "medium", "urgent",
] as const;

export const CONCIERGE_GROUPS: readonly ConciergeGroup[] = [
  "anishqa",
  "ananyshree",
] as const;

/** Human labels for the status enum (UI). */
export const CONCIERGE_STATUS_LABELS: Record<ConciergeTicketStatus, string> = {
  open: "Open",
  pending: "Pending",
  nudge_client: "Nudge Client",
  nudge_vendor: "Nudge Vendor",
  ongoing_delivery: "Ongoing Delivery",
  invoice_due: "Invoice Due",
  resolved: "Resolved",
  closed: "Closed",
};

export const CONCIERGE_PRIORITY_LABELS: Record<ConciergeTicketPriority, string> = {
  low: "Low", medium: "Medium", urgent: "Urgent",
};

export const CONCIERGE_GROUP_LABELS: Record<ConciergeGroup, string> = {
  anishqa: "Anishqa Queendom",
  ananyshree: "Ananyshree Queendom",
};

/**
 * FD-style escalation tracker — matches PG enum public.concierge_escalation_status.
 * SEPARATE from the workflow `status` state machine; never feeds it.
 */
export type ConciergeEscalationStatus =
  | "not_escalated"
  | "under_review"
  | "unable_to_solve"
  | "delay_in_response"
  | "resolved"
  | "closed";

export const CONCIERGE_ESCALATION_STATUSES: readonly ConciergeEscalationStatus[] = [
  "not_escalated", "under_review", "unable_to_solve", "delay_in_response", "resolved", "closed",
] as const;

export const CONCIERGE_ESCALATION_STATUS_LABELS: Record<ConciergeEscalationStatus, string> = {
  not_escalated: "Not Escalated",
  under_review: "Under Review",
  unable_to_solve: "Unable to Solve",
  delay_in_response: "Delay in Response",
  resolved: "Resolved",
  closed: "Closed",
};

/**
 * Ticket ops gate — mirrors canManageAnyClient. Bishops (managers) + privileged
 * roles create/assign/transfer. Genies (agents) work assigned tickets only, which
 * is enforced per-row by RLS, not by this coarse helper.
 */
export function canManageConciergeTickets(role: string): boolean {
  return isPrivilegedRole(role) || role === "manager";
}

// ── Academy (intern training simulator — migrations 120–122) ───────────────────

/**
 * A "trainer" reads every training session and authors the scenario seed
 * library. Every other authenticated user is a trainee who owns only their own
 * sessions.
 *
 * ── WHY DEPARTMENT ALONE IS NOT ENOUGH ──────────────────────────────────────
 * This used to be `isPrivilegedRole(role) || department === "academy"`. But
 * trainees and trainers BOTH sit in the `academy` department — that is what
 * assigns someone to Indulge Training in the first place — so every trainee an
 * admin created was silently handed the Scenario Library (which holds the
 * hidden constraints and ideal outcomes the evaluator grades against), the
 * whole cohort's analytics, and every other trainee's transcripts.
 *
 * Role is what separates them, using the existing role field rather than a
 * second permission system:
 *     trainee = role "agent"   + department "academy"
 *     trainer = role "manager" + department "academy"  (or any privileged role)
 *
 * MUST stay in lockstep with the SQL helper `public.is_academy_trainer()`
 * (migration 135). The SQL side gates scenario_seeds at the RLS layer; if the
 * two disagree, hiding the UI achieves nothing because the rows are still
 * readable over the REST API.
 */
export function isAcademyTrainer(
  role: string,
  department: string | null | undefined,
): boolean {
  return (
    isPrivilegedRole(role) ||
    (department === "academy" && role === "manager")
  );
}

/** The six Indulge verticals a scenario seed can belong to. */
export type AcademyVertical =
  | "Global"
  | "House"
  | "Shop"
  | "Legacy"
  | "Dubai"
  | "GMR";

export const ACADEMY_VERTICALS: AcademyVertical[] = [
  "Global",
  "House",
  "Shop",
  "Legacy",
  "Dubai",
  "GMR",
];

export type AcademyDifficulty = "easy" | "medium" | "hard";

export const ACADEMY_DIFFICULTIES: AcademyDifficulty[] = [
  "easy",
  "medium",
  "hard",
];

/** The rubric dimensions the evaluator scores (1–5 each). */
export type AcademyRubricDimension =
  | "comprehension"
  | "brand_tone"
  | "factual_accuracy"
  | "proactivity"
  | "escalation_judgment"
  | "closure";

/** A hidden constraint the client reveals only when correctly probed. */
export interface AcademyHiddenConstraint {
  id: string;
  label: string;
  /** Natural-language description of the probe that unlocks `value`. */
  reveal_when: string;
  value: string;
}

/** Relative weight per rubric dimension (used to compute the overall score). */
export type AcademyRubricWeights = Partial<
  Record<AcademyRubricDimension, number>
>;

/** scenario_seeds row (secrets: hidden_constraints/escalation_trigger/rubric_weights/ideal_outcome). */
export interface ScenarioSeed {
  id: string;
  title: string;
  archetype: string;
  vertical: AcademyVertical;
  opening_message: string;
  hidden_constraints: AcademyHiddenConstraint[];
  difficulty: AcademyDifficulty;
  escalation_trigger: string;
  ideal_outcome: string;
  rubric_weights: AcademyRubricWeights;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Safe subset of a seed exposed to interns (no secrets). */
export interface AcademyScenarioCard {
  id: string;
  title: string;
  archetype: string;
  vertical: AcademyVertical;
  difficulty: AcademyDifficulty;
}

/**
 * Snapshot stored on each session so the intern UI never has to read
 * scenario_seeds. `randomized` holds the per-session name/date substitutions;
 * `constraint_override` records the single mutated constraint value.
 */
export interface AcademySessionVars {
  display: AcademyScenarioCard;
  randomized: { name: string; date: string };
  constraint_override?: { id: string; value: string } | null;
}

/** training_sessions row. */
export interface TrainingSession {
  id: string;
  intern_id: string;
  seed_id: string;
  status: "open" | "closed";
  session_vars: AcademySessionVars;
  model_version: string | null;
  started_at: string;
  ended_at: string | null;
}

/**
 * An image/video shared into a training conversation (migration 127).
 * `path` is a storage object path in the private `academy-attachments` bucket;
 * the UI renders it via a short-lived signed URL, never a public URL.
 */
export interface TrainingAttachment {
  path: string;
  kind: "image" | "video";
  mime: string;
  name: string;
  size: number;
  /** Populated at read time by the server action — never persisted. */
  signedUrl?: string;
}

/** training_turns row — APPEND-ONLY (ordering by created_at + seq). */
export interface TrainingTurn {
  id: string;
  session_id: string;
  role: "client" | "intern";
  body: string;
  seq: number;
  created_at: string;
  /** Added migration 127. Written at INSERT only — turns are never updated. */
  attachments?: TrainingAttachment[];
}

/** One scored rubric dimension. */
export interface AcademyDimensionScore {
  score: number; // 1–5
  justification: string;
}

export type AcademyRubricScores = Record<
  AcademyRubricDimension,
  AcademyDimensionScore
>;

/** training_reviews row — evaluator output. */
export interface TrainingReview {
  id: string;
  session_id: string;
  scores: AcademyRubricScores;
  strengths: string[];
  misses: string[];
  rewritten_reply: string | null;
  overall: number;
  model_version: string;
  created_at: string;
}

// ── Academy Freshdesk ticket workflow (migration 131) ────────────────────────
//
// Every training request is framed as a Freshdesk support ticket. Closing the
// conversation is no longer the finish line: the intern must then document the
// resolution on the ticket, and an AI reviewer must pass that write-up before
// the request counts as handled. Deliberately distinct from the `Concierge*`
// ticket types above — those model the real ticketing product, these model the
// Freshdesk-shaped training artefact.

/** Freshdesk-style lifecycle states offered in the update form. */
export type AcademyTicketStatus =
  | "open"
  | "pending"
  | "waiting_on_customer"
  | "resolved"
  | "closed";

export const ACADEMY_TICKET_STATUSES: AcademyTicketStatus[] = [
  "open",
  "pending",
  "waiting_on_customer",
  "resolved",
  "closed",
];

export type AcademyTicketPriority = "low" | "medium" | "high" | "urgent";

export const ACADEMY_TICKET_PRIORITIES: AcademyTicketPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

/** Tag vocabulary offered on the update form. Free tags are not accepted. */
export const ACADEMY_TICKET_TAGS = [
  "luxury",
  "travel",
  "watches",
  "concierge",
  "shopping",
  "urgent",
] as const;

export type AcademyTicketTag = (typeof ACADEMY_TICKET_TAGS)[number];

/** The five things the AI reviewer scores the written ticket on. */
export type AcademyTicketReviewDimension =
  | "completeness"
  | "professionalism"
  | "accuracy"
  | "client_satisfaction"
  | "documentation";

export const ACADEMY_TICKET_REVIEW_DIMENSIONS: AcademyTicketReviewDimension[] =
  [
    "completeness",
    "professionalism",
    "accuracy",
    "client_satisfaction",
    "documentation",
  ];

export type AcademyTicketReviewScores = Record<
  AcademyTicketReviewDimension,
  AcademyDimensionScore
>;

/**
 * The reviewer's verdict on a submitted ticket update.
 *
 * `passed === false` is a coaching outcome, not an error: the intern revises
 * and resubmits. `quality` is computed in code from `scores`, never asked of
 * the model — same discipline as `computeOverall` for the rubric.
 */
export interface AcademyTicketVerdict {
  /**
   * The ticket was accepted — the request is handled. A trainee gets one
   * submission, so this is true from the moment they submit.
   */
  passed: boolean;
  /**
   * Whether the write-up actually met the quality bar (all dimensions above the
   * hard floor, weighted quality at or above threshold, terminal status).
   *
   * Separate from `passed` on purpose: acceptance is about the request being
   * handled, this is about how well it was documented. It no longer blocks
   * completion, but it still drives `quality` — and therefore the trainee's
   * score — and it decides whether coaching feedback is shown.
   *
   * Optional for rows written before the one-submission change, where `passed`
   * carried both meanings.
   */
  meets_bar?: boolean;
  /** Short, concrete fixes. Empty when the write-up met the bar. */
  feedback: string[];
  scores: AcademyTicketReviewScores;
  /** Weighted 1–5, computed in code. */
  quality: number;
  model_version: string;
}

/** training_ticket_updates row — one per session, revisable until it passes. */
export interface TrainingTicketUpdate {
  id: string;
  session_id: string;
  resolution_summary: string;
  internal_notes: string;
  public_reply: string;
  status: AcademyTicketStatus;
  priority: AcademyTicketPriority;
  tags: AcademyTicketTag[];
  time_spent_minutes: number;
  /** Null until the first submission has been reviewed. */
  verdict: AcademyTicketVerdict | null;
  passed: boolean;
  /** How many times this update has been submitted for review. */
  attempts: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Row interfaces (match tables exactly) ──────────────────────────────────────

/** public.ticket_categories (self-referencing taxonomy). */
export interface TicketCategory {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  /** Retail category → tickets visible to the Shop/Retail team cross-Queendom. Added migration 121. */
  is_retail: boolean;
  created_at: string;
}

/** public.ticket_checklist_templates. */
export interface TicketChecklistTemplate {
  id: string;
  category_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

/** public.sla_policies. Durations are BUSINESS minutes. */
export interface SlaPolicy {
  id: string;
  name: string;
  category_id: string | null;
  priority: ConciergeTicketPriority | null;
  first_response_minutes: number;
  resolution_minutes: number;
  is_default: boolean;
  is_active: boolean;
  escalation_enabled: boolean;
  clock: "business_hours" | "calendar";
  created_at: string;
}

/** public.canned_responses. */
export interface CannedResponse {
  id: string;
  name: string;
  shortcut: string | null;
  body_template: string;
  category_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

/** public.vendors. */
export interface Vendor {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  poc: string | null;
  location: string | null;
  trust_score: number | null;
  created_by: string | null;
  created_at: string;
}

/** Aggregated vendor scorecard (spec: Speed tick/cross, Quality tick/cross, Cost up/down). */
export interface VendorScorecardSummary {
  feedbackCount: number;
  /** Mean quality 1..5, or null when no ratings. */
  avgQuality: number | null;
  /** Speed good (tick) vs poor (cross); null = no data. */
  speedGood: boolean | null;
  /** Quality good (tick) vs poor (cross); null = no data. */
  qualityGood: boolean | null;
  /** true = cost trending down/favourable (down arrow); false = up; null = no data. */
  costDown: boolean | null;
}

/** One row of a vendor's order history (from ticket_invoices). */
export interface VendorOrderInvoice {
  id: string;
  ticket_id: string;
  ref_number: number | null;
  client_name: string;
  description: string;
  selling_price: number;
  created_at: string;
}

/** Full vendor profile for /concierge/vendors/[id]. */
export interface VendorProfile {
  vendor: Vendor;
  scorecard: VendorScorecardSummary;
  orderCount: number;
  invoices: VendorOrderInvoice[]; // last 10, newest first
}

/** public.vendor_feedback. */
export interface VendorFeedback {
  id: string;
  vendor_id: string;
  ticket_id: string;
  quality: number; // 1..5
  promptness: VendorPromptness;
  cost: VendorCostBand;
  delivery: VendorDelivery;
  created_by: string | null;
  created_at: string;
}

/** public.concierge_tickets. NOTE column `org_group` (not `group`). */
export interface ConciergeTicket {
  id: string;
  ref_number: number;
  client_id: string;
  title: string;
  description: string | null;
  category_id: string;
  subcategory_id: string | null;
  org_group: ConciergeGroup;
  status: ConciergeTicketStatus;
  priority: ConciergeTicketPriority;
  assigned_to: string | null;
  created_by: string;
  is_billable: boolean | null;
  invoice_number: string | null;
  primary_vendor_id: string | null;
  status_changed_at: string;
  first_response_at: string | null;
  sla_first_response_due: string | null;
  sla_resolution_due: string | null;
  is_overdue: boolean;
  resolved_at: string | null;
  closed_at: string | null;
  tags: string[];
  escalation_status: ConciergeEscalationStatus;
  /** Date the ticket is scheduled for (YYYY-MM-DD). Nullable. Added migration 120. */
  scheduled_on: string | null;
  created_at: string;
  updated_at: string;
}

/** public.concierge_ticket_updates (append-only). */
export interface ConciergeTicketUpdate {
  id: string;
  ticket_id: string;
  author_id: string | null;
  kind: ConciergeUpdateKind;
  body: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** public.concierge_ticket_attachments. */
export interface ConciergeTicketAttachment {
  id: string;
  ticket_id: string;
  update_id: string | null;
  uploaded_by: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: "image" | "pdf" | "video" | "other";
  is_proof: boolean;
  created_at: string;
}

/** public.concierge_ticket_checklist_items. */
export interface ConciergeTicketChecklistItem {
  id: string;
  ticket_id: string;
  template_id: string | null;
  label: string;
  sort_order: number;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
}

/** public.ticket_invoices. */
export interface TicketInvoice {
  id: string;
  ticket_id: string;
  client_name: string;
  description: string;
  cost_price: number;
  selling_price: number;
  service_charge: number;
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_bill_att_id: string | null;
  payment_method: string;
  invoice_att_id: string | null;
  bill_in_other_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** public.concierge_ticket_notifications. */
export interface ConciergeTicketNotification {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: ConciergeTicketNotificationType;
  ticket_id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

/** public.concierge_watchers — which Queendoms a Watcher oversees (read-only). Added migration 123. */
export interface ConciergeWatcher {
  profile_id: string;
  org_group: ConciergeGroup;
  created_at: string;
}

/** A watcher profile plus the Queendoms they currently oversee (admin management view). */
export interface WatcherAssignment {
  id: string;
  full_name: string;
  email: string;
  groups: ConciergeGroup[];
}

// ── Read models / composite shapes (server actions → UI) ────────────────────────

/** One row in the ticket list. */
export interface TicketListItem {
  id: string;
  ref_number: number;
  title: string;
  status: ConciergeTicketStatus;
  priority: ConciergeTicketPriority;
  org_group: ConciergeGroup;
  is_overdue: boolean;
  is_billable: boolean | null;
  created_at: string;
  status_changed_at: string;
  sla_resolution_due: string | null;
  scheduled_on: string | null;
  category_name: string | null;
  subcategory_name: string | null;
  client: { id: string; name: string; avatar_url: string | null } | null;
  assignee: { id: string; full_name: string } | null;
}

/** Filters for getMyTickets / getTicketQueue. All default to "all"/undefined. */
export interface TicketListFilters {
  scope?: "mine" | "queue";
  status?: ConciergeTicketStatus | "all";
  categoryId?: string | "all";
  subcategoryId?: string | "all";
  priority?: ConciergeTicketPriority | "all";
  billable?: "yes" | "no" | "all";
  createdRange?: "today" | "yesterday" | "this_week" | "this_month" | "all";
  createdFrom?: string; // ISO, when createdRange is custom
  createdTo?: string;
  /** Scheduled-on filter — tickets whose scheduled_on falls in the range. Added migration 120. */
  scheduledRange?: "today" | "yesterday" | "this_week" | "this_month" | "all";
  /** Agent filter: "all" | "unassigned" | "overdue" | <profileId>. */
  agent?: string;
  group?: ConciergeGroup | "all"; // admins only
  /** Sort column (default "created") and direction (default "desc"). */
  sort?: "created" | "updated" | "priority" | "status" | "due";
  sortDir?: "asc" | "desc";
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Full ticket detail assembled for /concierge/tickets/[id]. */
export interface TicketDetail {
  ticket: ConciergeTicket;
  client: { id: string; name: string; phone_number: string; email: string | null; avatar_url: string | null; notes: string | null } | null;
  category: TicketCategory | null;
  subcategory: TicketCategory | null;
  assignee: { id: string; full_name: string } | null;
  primaryVendor: Vendor | null;
  updates: Array<ConciergeTicketUpdate & { author: { id: string; full_name: string } | null }>;
  attachments: ConciergeTicketAttachment[];
  checklist: ConciergeTicketChecklistItem[];
  invoice: TicketInvoice | null;
}

/** Payload for upsertTicketInvoice. */
export interface TicketInvoiceInput {
  clientName: string;
  description: string;
  costPrice: number;
  sellingPrice: number;
  serviceCharge: number;
  vendorId?: string | null;
  vendorName?: string | null;
  vendorBillAttId?: string | null;
  paymentMethod: string;
  invoiceAttId?: string | null;
  billInOtherName?: string | null;
}

/** Payload for findOrCreateVendor. */
export interface VendorInput {
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  poc?: string | null;
  location?: string | null;
}

// ── SLA report (concierge-reports.ts → SlaReportClient) ─────────────────────────

export interface SlaReportFilters {
  /** ISO datetime, inclusive lower bound on created_at. */
  from?: string;
  /** ISO datetime, inclusive upper bound on created_at. */
  to?: string;
  /** Admins only; managers are auto-scoped to their queendom by RLS. */
  group?: ConciergeGroup | "all";
}

/** met / breached / pending counts for one SLA dimension, with % met. */
export interface SlaBucket {
  total: number;
  met: number;
  breached: number;
  pending: number;
  /** met / (met + breached) * 100, rounded to 1dp; 0 when nothing determined. */
  pctMet: number;
}

/** A named breakdown row carrying both SLA buckets. */
export interface SlaBreakdownRow {
  key: string;
  label: string;
  firstResponse: SlaBucket;
  resolution: SlaBucket;
}

/** By-priority row, plus the priority's default policy targets (minutes). */
export interface SlaPriorityRow extends SlaBreakdownRow {
  priority: ConciergeTicketPriority;
  responseTargetMinutes: number | null;
  resolutionTargetMinutes: number | null;
}

export interface ConciergeSlaReport {
  range: { from: string; to: string };
  totals: { created: number; resolved: number; open: number; overdue: number };
  firstResponse: SlaBucket;
  resolution: SlaBucket;
  byPriority: SlaPriorityRow[];
  byQueendom: SlaBreakdownRow[];
  byCategory: SlaBreakdownRow[];
  byAssignee: SlaBreakdownRow[];
  /** Non-null when the caller is a queendom-scoped concierge manager. */
  scopedToQueendom: ConciergeGroup | null;
}

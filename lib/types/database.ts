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
    today: PersonalTask[];
    /** Non-daily active tasks not due today (incl. late), sorted by due date. */
    upcoming: PersonalTask[];
    completedToday: PersonalTask[];
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

/** Agent row for the Individual Tasks tab (modal). */
export interface TaskIntelligenceAgentSummary {
  id: string;
  full_name: string;
  job_title: string | null;
  is_on_leave: boolean;
  personalTaskTotal: number;
  statusCounts: Partial<Record<AtlasTaskStatus, number>>;
  todaySopCompletionPct: number;
  overduePersonalCount: number;
  /** From `profiles.domain` — used for domain chip filters on the Individual tab. */
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
  | "onboarding";

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
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

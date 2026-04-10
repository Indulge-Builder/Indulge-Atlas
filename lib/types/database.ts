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

export type UserRole = "admin" | "founder" | "manager" | "agent" | "guest";

/** Roles that can mutate data (used for UI guardrails) */
export const MUTABLE_ROLES: UserRole[] = ["admin", "founder", "manager", "agent"];

/** Roles with cross-domain visibility */
export const GLOBAL_ROLES: UserRole[] = ["admin", "founder"];

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
  | "indulge_legacy";

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

/** @deprecated Use MANAGER_TASK_TYPES */
export const SCOUT_TASK_TYPES = MANAGER_TASK_TYPES;

export const ALL_TASK_TYPES: TaskType[] = [
  ...AGENT_TASK_TYPES,
  ...SCOUT_TASK_TYPES,
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
      };
      leads: {
        Row: Lead;
        Insert: Omit<
          Lead,
          "id" | "created_at" | "updated_at" | "assigned_agent"
        >;
        Update: Partial<Omit<Lead, "id" | "created_at" | "assigned_agent">>;
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
        Update: never;
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
      };
    };
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
        Args: Record<never, never>;
        Returns: string;
      };
      get_leads_columns: {
        Args: Record<string, never>;
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

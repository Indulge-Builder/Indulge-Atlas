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
  id:        string;
  full_name: string;
  status:    LeadStatus;
  city:      string | null;
}

export interface Message {
  id:              string;
  conversation_id: string;
  sender_id:       string;
  content:         string;
  lead_id:         string | null;
  created_at:      string;
  // Enriched client-side
  sender?: Pick<Profile, "id" | "full_name" | "role">;
  lead?:   MessageLeadPreview | null;
}

// ── Enums — must match the PostgreSQL enum values exactly ──

export type LeadStatus =
  | "new"
  | "attempted"
  | "in_discussion"
  | "won"
  | "lost"
  | "nurturing"
  | "trash";

export type UserRole = "agent" | "scout" | "admin" | "finance";

export type AdPlatform = "meta" | "google" | "website" | "events" | "referral";

export type DraftStatus = "draft" | "approved" | "deployed";

export type TaskStatus = "pending" | "completed" | "overdue";

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
  | "note"
  | "call_attempt"
  | "task_created";

export type IndulgeDomain =
  | "indulge_global"
  | "indulge_shop"
  | "the_indulge_house"
  | "indulge_legacy";

// ── Task type groupings ────────────────────────────────────

export const AGENT_TASK_TYPES: TaskType[] = [
  "call",
  "general_follow_up",
  "whatsapp_message",
  "file_dispatch",
  "email",
];

export const SCOUT_TASK_TYPES: TaskType[] = [
  "campaign_review",
  "strategy_meeting",
  "budget_approval",
  "performance_analysis",
];

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
  dob: string | null;   // ISO date "YYYY-MM-DD"
  role: UserRole;
  domain: IndulgeDomain;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type LostReasonTag =
  | "budget_exceeded"
  | "irrelevant_unqualified"
  | "timing_not_ready"
  | "went_with_competitor"
  | "ghosted_unresponsive";

export interface Lead {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string;
  secondary_phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  // Acquisition channel identifier: website | whatsapp | meta_lead_form | facebook | instagram
  channel: string | null;
  source: string | null;
  campaign_id: string | null;
  // Raw JSONB from the lead capture form
  form_responses: Record<string, unknown> | null;
  // UTM attribution — joined to campaign_metrics.campaign_id via utm_campaign
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  deal_value:    number | null;
  deal_duration: string | null;
  domain: IndulgeDomain;
  status: LeadStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  notes: string | null;
  // Phase 1: Lost lead churn analysis
  lost_reason_tag: LostReasonTag | null;
  lost_reason_notes: string | null;
  // Phase 2: Agent-private scratchpad (never sent to scouts/admins)
  private_scratchpad: string | null;
  // Phase 4: Client persona & lifestyle notes
  personal_details: string | null;
  // Phase 5: Executive Dossier fields
  company: string | null;
  hobbies: string | null;
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
}

export interface CampaignWithStats extends CampaignMetric {
  leads_generated: number;
  revenue_closed: number;
  roi: number;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  performed_by: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  created_at: string;
  // Joined
  agent?: Profile;
}

export interface Task {
  id: string;
  lead_id: string | null;
  assigned_to: string;
  title: string;
  task_type: TaskType;
  status: TaskStatus;
  due_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  lead?: Pick<Lead, "id" | "first_name" | "last_name" | "phone_number" | "email" | "status"> | null;
}

export type TaskWithLead = Task & {
  lead: Pick<Lead, "id" | "first_name" | "last_name" | "phone_number" | "email" | "status"> | null;
};

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
        Insert: Omit<Lead, "id" | "created_at" | "updated_at" | "assigned_agent">;
        Update: Partial<Omit<Lead, "id" | "created_at" | "assigned_agent">>;
      };
      lead_activities: {
        Row: LeadActivity;
        Insert: Omit<LeadActivity, "id" | "created_at" | "agent">;
        Update: never;
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, "id" | "created_at" | "updated_at" | "lead">;
        Update: Partial<Omit<Task, "id" | "created_at" | "lead">>;
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
      assign_next_agent: {
        Args: Record<never, never>;
        Returns: string;
      };
    };
  };
}

// ── Lead status display config ─────────────────────────────

export const LEAD_STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; color: string; bgColor: string; description: string }
> = {
  new: {
    label: "New",
    color: "#2C6FAC",
    bgColor: "#E8F0FA",
    description: "Freshly assigned, not yet contacted",
  },
  attempted: {
    label: "Attempted",
    color: "#C5830A",
    bgColor: "#FEF3D0",
    description: "Contact attempted, awaiting response",
  },
  in_discussion: {
    label: "In Discussion",
    color: "#6B4FBB",
    bgColor: "#F0EBFF",
    description: "Actively engaged in conversation",
  },
  won: {
    label: "Won",
    color: "#4A7C59",
    bgColor: "#EBF4EF",
    description: "Qualified and sent to Finance",
  },
  lost: {
    label: "Lost",
    color: "#C0392B",
    bgColor: "#FAEAE8",
    description: "Lead did not convert",
  },
  nurturing: {
    label: "Nurturing",
    color: "#8A8A6E",
    bgColor: "#F4F4EE",
    description: "Long-term follow-up scheduled",
  },
  trash: {
    label: "Trash",
    color: "#9E9E9E",
    bgColor: "#F5F5F5",
    description: "Invalid or irrelevant contact",
  },
};

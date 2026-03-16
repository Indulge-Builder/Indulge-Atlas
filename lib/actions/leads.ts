"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  LeadStatus,
  LostReason,
  LostReasonTag,
  NurtureReason,
  TrashReason,
} from "@/lib/types/database";
import { addMonths } from "date-fns";
import { z } from "zod";

interface ActionResult {
  success: boolean;
  error?: string;
  attemptCount?: number;
}

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role: string } | null)?.role ?? "agent";
  return { supabase, user, role };
}

function isPrivilegedRole(role: string): boolean {
  return role === "admin" || role === "scout";
}

// ── Update Lead Status ─────────────────────────────────────

export async function updateLeadStatus(
  leadId: string,
  newStatus: LeadStatus,
  note?: string
): Promise<ActionResult> {
  try {
    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("status, assigned_to, attempt_count")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const oldStatus = lead.status;
    const currentAttemptCount = (lead as { attempt_count?: number }).attempt_count ?? 0;

    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (newStatus === "attempted") {
      updatePayload.attempt_count = currentAttemptCount + 1;
    }

    const { error: updateError } = await supabase
      .from("leads")
      .update(updatePayload)
      .eq("id", leadId);

    if (updateError)
      return { success: false, error: "Failed to update lead status" };

    await supabase.from("lead_activities").insert({
      lead_id:      leadId,
      performed_by: user.id,
      type:         "status_change",
      payload: {
        from:           oldStatus,
        to:             newStatus,
        note:           note ?? null,
        attempt_count:  newStatus === "attempted" ? currentAttemptCount + 1 : undefined,
        timestamp:     new Date().toISOString(),
      },
    });

    if (newStatus === "won") {
      await triggerFinanceNotification(leadId, user.id);
    }

    if (newStatus === "nurturing") {
      await createNurturingTask(leadId, user.id);
    }

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/");

    return { success: true, attemptCount: newStatus === "attempted" ? currentAttemptCount + 1 : undefined };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Mark Attempted + Schedule Retry ───────────────────────

export async function markAttemptedAndScheduleRetry(
  leadId: string,
  retryAt: Date
): Promise<ActionResult> {
  try {
    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("assigned_to, attempt_count")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const currentAttemptCount = (lead as { attempt_count?: number }).attempt_count ?? 0;
    const newAttemptCount = currentAttemptCount + 1;

    const { error: updateError } = await supabase
      .from("leads")
      .update({ status: "attempted", attempt_count: newAttemptCount })
      .eq("id", leadId);

    if (updateError) return { success: false, error: "Failed to update lead" };

    await supabase.from("lead_activities").insert({
      lead_id:      leadId,
      performed_by: user.id,
      type:         "call_attempt",
      payload: {
        outcome:             "no_answer",
        retry_scheduled_at: retryAt.toISOString(),
        timestamp:          new Date().toISOString(),
      },
    });

    const { error: taskError } = await supabase.from("tasks").insert({
      lead_id:            leadId,
      assigned_to_users:  [user.id],
      title:              "Follow-up call",
      due_date:           retryAt.toISOString(),
      task_type:          "call",
      status:             "pending",
    });

    if (taskError) return { success: false, error: "Failed to create task" };

    await supabase.from("lead_activities").insert({
      lead_id:      leadId,
      performed_by: user.id,
      type:         "task_created",
      payload: {
        task_type: "call",
        due_date:  retryAt.toISOString(),
      },
    });

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/");

    return { success: true, attemptCount: newAttemptCount };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Add Note ───────────────────────────────────────────────

export async function addLeadNote(
  leadId: string,
  noteText: string
): Promise<ActionResult> {
  try {
    const { supabase, user, role } = await getAuthUser();

    if (!noteText.trim()) return { success: false, error: "Note cannot be empty" };

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    await supabase.from("lead_activities").insert({
      lead_id:      leadId,
      performed_by: user.id,
      type:         "note",
      payload: {
        text:      noteText.trim(),
        timestamp: new Date().toISOString(),
      },
    });

    await supabase
      .from("leads")
      .update({ notes: noteText.trim() })
      .eq("id", leadId);

    revalidatePath(`/leads/${leadId}`);

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Internal: Create Nurturing Task ───────────────────────

async function createNurturingTask(leadId: string, agentId: string) {
  const supabase = await createClient();
  const threeMonthsOut = addMonths(new Date(), 3);

  await supabase.from("tasks").insert({
    lead_id:           leadId,
    assigned_to_users: [agentId],
    title:             "Nurture follow-up",
    due_date:          threeMonthsOut.toISOString(),
    task_type:         "general_follow_up",
    status:            "pending",
  });

  await supabase.from("lead_activities").insert({
    lead_id:      leadId,
    performed_by: agentId,
    type:         "task_created",
    payload: {
      task_type: "general_follow_up",
      due_date:  threeMonthsOut.toISOString(),
      note:      "Automatic 3-month nurture reminder created",
    },
  });
}

// ── Internal: Trigger Finance Notification ─────────────────

async function triggerFinanceNotification(leadId: string, agentId: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const secret = process.env.INTERNAL_API_SECRET ?? "";
    await fetch(`${baseUrl}/api/finance-notify`, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({ leadId, agentId }),
    });
  } catch {
    console.error("[finance-notify] Failed to trigger notification");
  }
}

// ── Update Lead Demographics ──────────────────────────────

export async function updateLeadDemographics(
  leadId: string,
  data: {
    city?:             string | null;
    personal_details?: string | null;
    company?:          string | null;
  }
): Promise<ActionResult> {
  try {
    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const patch: Record<string, string | null> = {};
    if ("city"             in data) patch.city             = data.city?.trim()             || null;
    if ("personal_details" in data) patch.personal_details = data.personal_details?.trim() || null;
    if ("company"          in data) patch.company          = data.company?.trim()          || null;

    if (Object.keys(patch).length === 0) return { success: true };

    const { error } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", leadId);

    if (error) return { success: false, error: "Failed to update demographics" };

    revalidatePath(`/leads/${leadId}`);
    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Update Lead Email ─────────────────────────────────────

const updateEmailSchema = z.object({
  leadId: z.string().uuid(),
  email:  z.string().email("Invalid email address").max(200).or(z.literal("")),
});

export async function updateLeadEmail(
  leadId: string,
  email: string
): Promise<ActionResult> {
  try {
    const parsed = updateEmailSchema.safeParse({ leadId, email });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const { error } = await supabase
      .from("leads")
      .update({ email: email.trim() || null })
      .eq("id", leadId);

    if (error) return { success: false, error: "Failed to update email" };

    revalidatePath(`/leads/${leadId}`);
    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Update Lead Tags ───────────────────────────────────────

const updateTagsSchema = z.object({
  leadId: z.string().uuid(),
  tags:   z.array(z.string().min(1).max(80)).max(50),
});

export async function updateLeadTags(
  leadId: string,
  tags: string[]
): Promise<ActionResult> {
  try {
    const parsed = updateTagsSchema.safeParse({ leadId, tags });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const deduped = [...new Set(parsed.data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];

    const { error } = await supabase
      .from("leads")
      .update({ tags: deduped })
      .eq("id", leadId);

    if (error) return { success: false, error: "Failed to update tags" };

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Mark Lead SLA Alert Sent (for escalation history) ────────────────────────

export async function markLeadSLAAlertSent(
  leadId: string,
  agentLevel: boolean,
  managerLevel: boolean
): Promise<ActionResult> {
  try {
    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const update: Record<string, boolean> = {};
    if (agentLevel) update.agent_alert_sent = true;
    if (managerLevel) update.manager_alert_sent = true;
    if (Object.keys(update).length === 0) return { success: true };

    const { error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", leadId);

    if (error) return { success: false, error: "Failed to update" };

    revalidatePath("/escalations");
    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Disposition actions (Trash, Lost, Nurturing) with required reasons ───────

const VALID_LOST_REASONS: LostReason[] = [
  "Not Interested",
  "Price Objection",
  "Bought Competitor",
  "Other",
];

const VALID_TRASH_REASONS: TrashReason[] = [
  "Incorrect Data",
  "Not our TG",
  "Spam",
];

const VALID_NURTURE_REASONS: NurtureReason[] = [
  "Future Prospect",
  "Cold",
];

// ── Mark Lead as Trash ───────────────────────────────────────────────────────

export async function markLeadTrash(
  leadId: string,
  reason: TrashReason
): Promise<ActionResult> {
  try {
    if (!VALID_TRASH_REASONS.includes(reason)) {
      return { success: false, error: "Invalid trash reason" };
    }

    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("status, assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const oldStatus = lead.status;

    const { error: updateError } = await supabase
      .from("leads")
      .update({ status: "trash", trash_reason: reason })
      .eq("id", leadId);

    if (updateError) return { success: false, error: "Failed to update lead" };

    await supabase.from("lead_activities").insert({
      lead_id:      leadId,
      performed_by: user.id,
      type:         "status_change",
      payload: {
        from:         oldStatus,
        to:           "trash",
        trash_reason: reason,
        timestamp:    new Date().toISOString(),
      },
    });

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Mark Lead as Lost (new disposition flow) ─────────────────────────────────

export async function markLeadLost(
  leadId: string,
  reason: LostReason,
  notes?: string
): Promise<ActionResult> {
  try {
    if (!VALID_LOST_REASONS.includes(reason)) {
      return { success: false, error: "Invalid lost reason" };
    }

    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("status, assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const oldStatus = lead.status;

    const { error: updateError } = await supabase
      .from("leads")
      .update({
        status:       "lost",
        lost_reason:  reason,
        lost_reason_notes: notes?.trim() || null,
      })
      .eq("id", leadId);

    if (updateError) return { success: false, error: "Failed to update lead" };

    await supabase.from("lead_activities").insert({
      lead_id:      leadId,
      performed_by: user.id,
      type:         "status_change",
      payload: {
        from:        oldStatus,
        to:          "lost",
        lost_reason: reason,
        note:        notes?.trim() ?? null,
        timestamp:   new Date().toISOString(),
      },
    });

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Mark Lead as Nurturing (with reason) ────────────────────────────────────

export async function markLeadNurturing(
  leadId: string,
  reason: NurtureReason
): Promise<ActionResult> {
  try {
    if (!VALID_NURTURE_REASONS.includes(reason)) {
      return { success: false, error: "Invalid nurture reason" };
    }

    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("status, assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const oldStatus = lead.status;

    const { error: updateError } = await supabase
      .from("leads")
      .update({ status: "nurturing", nurture_reason: reason })
      .eq("id", leadId);

    if (updateError) return { success: false, error: "Failed to update lead" };

    await supabase.from("lead_activities").insert({
      lead_id:        leadId,
      performed_by:   user.id,
      type:           "status_change",
      payload: {
        from:           oldStatus,
        to:             "nurturing",
        nurture_reason: reason,
        timestamp:      new Date().toISOString(),
      },
    });

    await createNurturingTask(leadId, user.id);

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Legacy: Mark Lead as Lost (old tag-based, kept for backward compat) ──────

const VALID_LOST_TAGS = [
  "budget_exceeded",
  "irrelevant_unqualified",
  "timing_not_ready",
  "went_with_competitor",
  "ghosted_unresponsive",
] as const;

export async function markLeadLostLegacy(
  leadId: string,
  tag: LostReasonTag,
  notes?: string
): Promise<ActionResult> {
  try {
    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("status, assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const oldStatus = lead.status;

    const { error: updateError } = await supabase
      .from("leads")
      .update({
        status:            "lost",
        lost_reason_tag:   tag,
        lost_reason_notes: notes?.trim() || null,
      })
      .eq("id", leadId);

    if (updateError) return { success: false, error: "Failed to update lead" };

    await supabase.from("lead_activities").insert({
      lead_id:      leadId,
      performed_by: user.id,
      type:         "status_change",
      payload: {
        from:            oldStatus,
        to:              "lost",
        lost_reason_tag: tag,
        note:            notes?.trim() ?? null,
        timestamp:       new Date().toISOString(),
      },
    });

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Save Agent Private Scratchpad ─────────────────────────

const scratchpadSchema = z.object({
  leadId: z.string().uuid(),
  text:   z.string().max(10000),
});

export async function saveAgentScratchpad(
  leadId: string,
  text: string
): Promise<ActionResult> {
  try {
    const parsed = scratchpadSchema.safeParse({ leadId, text });
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }

    const { supabase, user, role } = await getAuthUser();

    // Security: only the assigned agent (or privileged roles) can write to the scratchpad
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };
    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const { error } = await supabase
      .from("leads")
      .update({ private_scratchpad: text.trim() || null })
      .eq("id", leadId);

    if (error) return { success: false, error: "Failed to save scratchpad" };

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Reassign Lead ─────────────────────────────────────────

const reassignLeadSchema = z.object({
  leadId:     z.string().uuid(),
  newAgentId: z.string().uuid(),
});

export async function reassignLead(
  leadId: string,
  newAgentId: string
): Promise<ActionResult> {
  try {
    const parsed = reassignLeadSchema.safeParse({ leadId, newAgentId });
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }

    const { supabase, user, role } = await getAuthUser();

    if (!isPrivilegedRole(role)) {
      return { success: false, error: "Only scouts and admins can reassign leads" };
    }

    // Confirm target agent exists and is active
    const { data: agent, error: agentError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", newAgentId)
      .eq("role", "agent")
      .eq("is_active", true)
      .single();

    if (agentError || !agent) {
      return { success: false, error: "Target agent not found or inactive" };
    }

    const { error } = await supabase
      .from("leads")
      .update({ assigned_to: newAgentId })
      .eq("id", leadId);

    if (error) return { success: false, error: "Failed to reassign lead" };

    await supabase.from("lead_activities").insert({
      lead_id:      leadId,
      performed_by: user.id,
      type:         "status_change",
      payload: {
        action:        "reassigned",
        new_agent_id:  newAgentId,
        new_agent_name: agent.full_name,
        timestamp:     new Date().toISOString(),
      },
    });

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Close Won Deal (Revenue Modal) ────────────────────────

const closeWonDealSchema = z.object({
  leadId:       z.string().uuid(),
  dealValue:    z.number().positive("Deal value must be greater than zero"),
  dealDuration: z.string().min(1),
});

export async function closeWonDeal(
  leadId:       string,
  dealValue:    number,
  dealDuration: string,
): Promise<ActionResult> {
  try {
    const parsed = closeWonDealSchema.safeParse({ leadId, dealValue, dealDuration });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const { supabase, user, role } = await getAuthUser();

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("status, assigned_to, first_name, last_name, phone_number, email")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) return { success: false, error: "Lead not found" };

    if (!isPrivilegedRole(role) && lead.assigned_to !== user.id) {
      return { success: false, error: "Unauthorised" };
    }

    const oldStatus = lead.status;

    const { error: updateError } = await supabase
      .from("leads")
      .update({
        status:        "won",
        deal_value:    dealValue,
        deal_duration: dealDuration,
      })
      .eq("id", leadId);

    if (updateError) return { success: false, error: "Failed to close deal" };

    // Promote won lead to clients table
    const { error: clientError } = await supabase.from("clients").insert({
      first_name:         lead.first_name,
      last_name:          lead.last_name ?? null,
      phone_number:       lead.phone_number,
      email:              lead.email ?? null,
      lead_origin_id:     leadId,
      membership_status: "active",
    });

    if (clientError) {
      // Log but don't fail the deal close — client insert is secondary
      console.error("[closeWonDeal] Failed to insert client:", clientError);
    }

    await supabase.from("lead_activities").insert({
      lead_id:      leadId,
      performed_by: user.id,
      type:         "status_change",
      payload: {
        from:          oldStatus,
        to:            "won",
        deal_value:    dealValue,
        deal_duration: dealDuration,
        timestamp:     new Date().toISOString(),
      },
    });

    await triggerFinanceNotification(leadId, user.id);

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    revalidatePath("/");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Fetch Dashboard Data ───────────────────────────────────

export async function getDashboardData() {
  const { supabase, user } = await getAuthUser();

  const [
    { data: unattainedLeads },
    { data: pastLeads },
    { data: upcomingTasks },
    { data: wonLeads },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("*, assigned_agent:profiles!assigned_to(id, full_name)")
      .eq("assigned_to", user.id)
      .eq("status", "new")
      .limit(30),

    supabase
      .from("leads")
      .select("*")
      .eq("assigned_to", user.id)
      .not("status", "eq", "new")
      .order("updated_at", { ascending: false })
      .limit(10),

    supabase
      .from("tasks")
      .select(
        "*, lead:leads!lead_id(id, first_name, last_name, phone_number, status)"
      )
      .eq("assigned_to", user.id)
      .eq("status", "pending")
      .gte("due_date", new Date().toISOString())
      .order("due_date", { ascending: true })
      .limit(10),

    supabase
      .from("leads")
      .select("*")
      .eq("assigned_to", user.id)
      .eq("status", "won")
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  // Speed-to-Lead: On-Duty first (newest first), Off-Duty second (oldest first)
  const raw = (unattainedLeads ?? []) as Array<{ is_off_duty?: boolean; created_at: string }>;
  const onDuty = raw.filter((l) => !l.is_off_duty).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const offDuty = raw.filter((l) => l.is_off_duty).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const unattainedLeadsSorted = [...onDuty, ...offDuty].slice(0, 10);

  return {
    unattainedLeads: unattainedLeadsSorted,
    pastLeads:       pastLeads ?? [],
    upcomingTasks:   upcomingTasks ?? [],
    wonLeads:        wonLeads ?? [],
  };
}

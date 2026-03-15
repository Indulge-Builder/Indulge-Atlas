"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { TaskType, TaskWithLead } from "@/lib/types/database";

const taskTypeSchema = z.enum([
  "call", "whatsapp_message", "email", "file_dispatch", "general_follow_up",
  "campaign_review", "strategy_meeting", "budget_approval", "performance_analysis",
]);

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");
  return { supabase, user };
}

export interface LeadMatch {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string | null;
  city: string | null;
  status: string;
}

// ── Create Smart Task ──────────────────────────────────────

const createSmartTaskSchema = z.object({
  title: z.string().min(1).max(500),
  dueAt: z.string().datetime(),
  type: taskTypeSchema,
});

export async function createSmartTask(params: unknown): Promise<{ success: boolean; taskId?: string; error?: string }> {
  const parsed = createSmartTaskSchema.safeParse(params);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { supabase, user } = await getAuthUser();

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        assigned_to_users: [user.id],
        title: parsed.data.title,
        due_date: parsed.data.dueAt,
        task_type: parsed.data.type,
        lead_id: null,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) return { success: false, error: "Failed to create task" };

    revalidatePath("/calendar");
    revalidatePath("/tasks");
    revalidatePath("/");

    return { success: true, taskId: data.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

// ── Fuzzy Lead Search ──────────────────────────────────────

export async function searchLeadsByName(name: string): Promise<LeadMatch[]> {
  try {
    if (!name.trim()) return [];

    const { supabase, user } = await getAuthUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const searchTerm = name.trim();

    let query = supabase
      .from("leads")
      .select("id, first_name, last_name, phone_number, city, status")
      .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)
      .limit(5);

    if (profile?.role === "agent") {
      query = query.eq("assigned_to", user.id);
    }

    const { data } = await query;
    return (data ?? []) as LeadMatch[];
  } catch {
    return [];
  }
}

// ── Link Task to Lead ──────────────────────────────────────

const linkTaskSchema = z.object({ taskId: z.string().uuid(), leadId: z.string().uuid() });

export async function linkTaskToLead(
  taskId: unknown,
  leadId: unknown,
): Promise<{ success: boolean; error?: string }> {
  const parsed = linkTaskSchema.safeParse({ taskId, leadId });
  if (!parsed.success) return { success: false, error: "Invalid task or lead" };
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .update({ lead_id: parsed.data.leadId })
      .eq("id", parsed.data.taskId)
      .contains("assigned_to_users", [user.id]);

    if (error) return { success: false, error: "Failed to link lead" };

    await supabase.from("lead_activities").insert({
      lead_id: parsed.data.leadId,
      performed_by: user.id,
      type: "task_created",
      payload: { task_id: parsed.data.taskId, linked_from: "smart_calendar" },
    });

    revalidatePath("/calendar");
    revalidatePath("/tasks");
    revalidatePath(`/leads/${parsed.data.leadId}`);

    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

// ── Save Task Notes ────────────────────────────────────────

const saveNotesSchema = z.object({
  taskId: z.string().uuid(),
  notes: z.string().max(5000),
});

export async function saveTaskContextNotes(
  taskId: unknown,
  notes: unknown,
): Promise<{ success: boolean; error?: string }> {
  const parsed = saveNotesSchema.safeParse({ taskId, notes });
  if (!parsed.success) return { success: false, error: "Invalid input" };
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .update({ notes: parsed.data.notes.trim() || null })
      .eq("id", parsed.data.taskId)
      .contains("assigned_to_users", [user.id]);

    if (error) return { success: false, error: "Failed to save notes" };

    revalidatePath("/calendar");
    revalidatePath("/tasks");

    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

// ── Fetch Calendar Tasks ───────────────────────────────────

export async function getCalendarTasks(): Promise<TaskWithLead[]> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data, error } = await supabase
      .from("tasks")
      .select(
        "*, lead:leads!lead_id(id, first_name, last_name, phone_number, email, status)",
      )
      .contains("assigned_to_users", [user.id])
      .order("due_date", { ascending: true });

    if (error) return [];
    return (data ?? []) as TaskWithLead[];
  } catch {
    return [];
  }
}

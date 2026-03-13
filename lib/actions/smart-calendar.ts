"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskType, TaskWithLead } from "@/lib/types/database";

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

export async function createSmartTask(params: {
  title: string;
  dueAt: string;
  type: TaskType;
}): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        assigned_to: user.id,
        title: params.title,
        due_date: params.dueAt,
        task_type: params.type,
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

export async function linkTaskToLead(
  taskId: string,
  leadId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .update({ lead_id: leadId })
      .eq("id", taskId)
      .eq("assigned_to", user.id);

    if (error) return { success: false, error: "Failed to link lead" };

    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      performed_by: user.id,
      type: "task_created",
      payload: { task_id: taskId, linked_from: "smart_calendar" },
    });

    revalidatePath("/calendar");
    revalidatePath("/tasks");
    revalidatePath(`/leads/${leadId}`);

    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

// ── Save Task Notes ────────────────────────────────────────

export async function saveTaskContextNotes(
  taskId: string,
  notes: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .update({ notes: notes.trim() || null })
      .eq("id", taskId)
      .eq("assigned_to", user.id);

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
      .eq("assigned_to", user.id)
      .order("due_date", { ascending: true });

    if (error) return [];
    return (data ?? []) as TaskWithLead[];
  } catch {
    return [];
  }
}

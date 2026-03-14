"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskType, TaskWithLead } from "@/lib/types/database";

interface ActionResult {
  success: boolean;
  error?: string;
}

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");
  return { supabase, user };
}

// ── Fetch Tasks for Reminder Engine ─────────────────────────
// Returns pending tasks due today or in the future, for the current user.
// Called from client components (TaskReminderProvider, NotificationBell) on mount —
// may run before auth cookies are available; return [] instead of throwing.

export async function getTasksForReminders(): Promise<TaskWithLead[]> {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string };
  try {
    const auth = await getAuthUser();
    supabase = auth.supabase;
    user = auth.user;
  } catch {
    return [];
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStartIso = todayStart.toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "*, lead:leads!lead_id(id, first_name, last_name, phone_number, email, status)",
    )
    .eq("assigned_to", user.id)
    .eq("status", "pending")
    .gte("due_date", todayStartIso)
    .order("due_date", { ascending: true });

  if (error) return [];
  return (data ?? []) as TaskWithLead[];
}

// ── Fetch All User Tasks ───────────────────────────────────

export async function getMyTasks(): Promise<TaskWithLead[]> {
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
}

// ── Fetch Tasks for a Specific Lead ───────────────────────

export async function getLeadTasks(leadId: string): Promise<TaskWithLead[]> {
  const { supabase } = await getAuthUser();

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "*, lead:leads!lead_id(id, first_name, last_name, phone_number, email, status)"
    )
    .eq("lead_id", leadId)
    .order("due_date", { ascending: true });

  if (error) return [];
  return (data ?? []) as TaskWithLead[];
}

// ── Fetch Leads for Task Modal ─────────────────────────────

export async function getLeadsForTaskModal(): Promise<
  {
    id: string;
    first_name: string;
    last_name: string | null;
    phone_number: string;
    status: string;
  }[]
> {
  const { supabase, user } = await getAuthUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  let query = supabase
    .from("leads")
    .select("id, first_name, last_name, phone_number, status")
    .not("status", "in", '("won","lost","trash")')
    .order("first_name", { ascending: true })
    .limit(100);

  if (profile?.role === "agent") {
    query = query.eq("assigned_to", user.id);
  }

  const { data } = await query;
  return data ?? [];
}

// ── Complete a Task ────────────────────────────────────────

export async function completeTask(taskId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", taskId)
      .eq("assigned_to", user.id);

    if (error) return { success: false, error: "Failed to complete task" };

    revalidatePath("/");
    revalidatePath("/tasks");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Delete a Task ──────────────────────────────────────────

export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("assigned_to", user.id);

    if (error) return { success: false, error: "Failed to delete task" };

    revalidatePath("/");
    revalidatePath("/tasks");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Update a Task ─────────────────────────────────────────

export async function updateTask(params: {
  taskId: string;
  notes?: string | null;
  dueAt: Date;
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .update({
        notes: params.notes ?? null,
        due_date: params.dueAt.toISOString(),
      })
      .eq("id", params.taskId)
      .eq("assigned_to", user.id);

    if (error) return { success: false, error: "Failed to update task" };

    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath("/leads/[id]", "page");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Create Task ────────────────────────────────────────────
// leadId is optional — scout tasks may not be linked to a lead.

export async function createTask(params: {
  leadId: string | null;
  title: string;
  dueAt: Date;
  type: TaskType;
  notes?: string | null;
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase.from("tasks").insert({
      lead_id: params.leadId ?? null,
      assigned_to: user.id,
      title: params.title,
      due_date: params.dueAt.toISOString(),
      task_type: params.type,
      status: "pending",
      notes: params.notes ?? null,
    });

    if (error) return { success: false, error: "Failed to create task" };

    if (params.leadId) {
      await supabase.from("lead_activities").insert({
        lead_id: params.leadId,
        performed_by: user.id,
        type: "task_created",
        payload: {
          task_type: params.type,
          title: params.title,
          due_date: params.dueAt.toISOString(),
          manual: true,
        },
      });
      revalidatePath(`/leads/${params.leadId}`);
    }

    revalidatePath("/");
    revalidatePath("/tasks");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

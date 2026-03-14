"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { TaskType, TaskWithLead } from "@/lib/types/database";

const uuidSchema = z.string().uuid();
const taskTypeSchema = z.enum([
  "call", "whatsapp_message", "email", "file_dispatch", "general_follow_up",
  "campaign_review", "strategy_meeting", "budget_approval", "performance_analysis",
]);
const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  notes: z.string().max(5000).nullable().optional(),
  dueAt: z.union([z.date(), z.string().datetime()]).transform((v) => (typeof v === "string" ? new Date(v) : v)),
});
const createTaskSchema = z.object({
  leadId: z.string().uuid().nullable(),
  title: z.string().min(1).max(500),
  dueAt: z.union([z.date(), z.string().datetime()]).transform((v) => (typeof v === "string" ? new Date(v) : v)),
  type: taskTypeSchema,
  notes: z.string().max(5000).nullable().optional(),
});

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

export async function completeTask(taskId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task" };
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", parsed.data)
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

export async function deleteTask(taskId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task" };
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", parsed.data)
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

export async function updateTask(params: unknown): Promise<ActionResult> {
  const parsed = updateTaskSchema.safeParse(params);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .update({
        notes: parsed.data.notes ?? null,
        due_date: parsed.data.dueAt.toISOString(),
      })
      .eq("id", parsed.data.taskId)
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

export async function createTask(params: unknown): Promise<ActionResult> {
  const parsed = createTaskSchema.safeParse(params);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase.from("tasks").insert({
      lead_id: parsed.data.leadId ?? null,
      assigned_to: user.id,
      title: parsed.data.title,
      due_date: parsed.data.dueAt.toISOString(),
      task_type: parsed.data.type,
      status: "pending",
      notes: parsed.data.notes ?? null,
    });

    if (error) return { success: false, error: "Failed to create task" };

    if (parsed.data.leadId) {
      await supabase.from("lead_activities").insert({
        lead_id: parsed.data.leadId,
        performed_by: user.id,
        type: "task_created",
        payload: {
          task_type: parsed.data.type,
          title: parsed.data.title,
          due_date: parsed.data.dueAt.toISOString(),
          manual: true,
        },
      });
      revalidatePath(`/leads/${parsed.data.leadId}`);
    }

    revalidatePath("/");
    revalidatePath("/tasks");

    return { success: true };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

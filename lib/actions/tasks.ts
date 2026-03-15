"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type {
  TaskType,
  TaskWithLead,
  TaskProgressUpdate,
  Profile,
} from "@/lib/types/database";

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
  assignedTo: z.string().uuid().optional(),
  assignedToUsers: z.array(z.string().uuid()).min(1).optional(),
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
      "*, lead:leads!lead_id(id, first_name, last_name, phone_number, email, status), created_by_profile:profiles!created_by(id, full_name, role)",
    )
    .contains("assigned_to_users", [user.id])
    .eq("status", "pending")
    .gte("due_date", todayStartIso)
    .order("due_date", { ascending: true });

  if (error) return [];
  return (await enrichTasksWithAssignees(supabase, data ?? [])) as TaskWithLead[];
}

// ── Enrich tasks with assignee profiles (assigned_to_users → assigned_to_profiles) ──
async function enrichTasksWithAssignees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tasks: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const userIds = new Set<string>();
  for (const t of tasks) {
    const arr = (t.assigned_to_users as string[] | null) ?? [];
    for (const id of arr) userIds.add(id);
  }
  if (userIds.size === 0) return tasks.map((t) => ({ ...t, assigned_to_profiles: [], assigned_to_profile: null }));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("id", [...userIds]);

  const profileMap = new Map<string | null, { id: string; full_name: string; role: string }>();
  for (const p of profiles ?? []) profileMap.set(p.id, p);

  return tasks.map((t) => {
    const arr = ((t.assigned_to_users as string[] | null) ?? []) as string[];
    const profilesList = arr.map((id) => profileMap.get(id)).filter(Boolean) as { id: string; full_name: string; role: string }[];
    const first = profilesList[0] ?? null;
    return {
      ...t,
      assigned_to_profiles: profilesList,
      assigned_to_profile: first,
    };
  });
}

// ── Fetch All User Tasks ───────────────────────────────────

export async function getMyTasks(): Promise<TaskWithLead[]> {
  const { supabase, user } = await getAuthUser();

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "*, lead:leads!lead_id(id, first_name, last_name, phone_number, email, status), created_by_profile:profiles!created_by(id, full_name, role)",
    )
    .contains("assigned_to_users", [user.id])
    .order("due_date", { ascending: true });

  if (error) return [];
  return (await enrichTasksWithAssignees(supabase, data ?? [])) as TaskWithLead[];
}

// ── Fetch Tasks for a Specific Lead ───────────────────────

export async function getLeadTasks(leadId: string): Promise<TaskWithLead[]> {
  const { supabase } = await getAuthUser();

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "*, lead:leads!lead_id(id, first_name, last_name, phone_number, email, status), created_by_profile:profiles!created_by(id, full_name, role)",
    )
    .eq("lead_id", leadId)
    .order("due_date", { ascending: true });

  if (error) return [];
  return (await enrichTasksWithAssignees(supabase, data ?? [])) as TaskWithLead[];
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
      .contains("assigned_to_users", [user.id]);

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
      .contains("assigned_to_users", [user.id]);

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
      .contains("assigned_to_users", [user.id]);

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
// When currentUser.role === 'admin', assignedTo may be set to delegate to any team member.

export async function createTask(params: unknown): Promise<ActionResult> {
  const parsed = createTaskSchema.safeParse(params);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { supabase, user } = await getAuthUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin";
    const assignedToUsers =
      isAdmin && parsed.data.assignedToUsers && parsed.data.assignedToUsers.length > 0
        ? parsed.data.assignedToUsers
        : isAdmin && parsed.data.assignedTo
          ? [parsed.data.assignedTo]
          : [user.id];

    const { error } = await supabase.from("tasks").insert({
      lead_id: parsed.data.leadId ?? null,
      assigned_to_users: assignedToUsers,
      created_by: user.id,
      title: parsed.data.title,
      due_date: parsed.data.dueAt.toISOString(),
      task_type: parsed.data.type,
      status: "pending",
      notes: parsed.data.notes ?? null,
      progress_updates: [],
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

// ── Add Task Progress Update ────────────────────────────────
// Appends a new update to progress_updates JSONB. Callable by assignee or admin.

export async function addTaskProgress(
  taskId: unknown,
  message: string,
): Promise<ActionResult & { update?: TaskProgressUpdate }> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task" };
  const trimmed = message?.trim();
  if (!trimmed || trimmed.length > 2000)
    return { success: false, error: "Message must be 1–2000 characters" };

  try {
    const { supabase, user } = await getAuthUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const { data: task } = await supabase
      .from("tasks")
      .select("assigned_to_users, progress_updates")
      .eq("id", parsed.data)
      .single();

    if (!task) return { success: false, error: "Task not found" };

    const assignees = (task.assigned_to_users as string[] | null) ?? [];
    const isAssignee = assignees.includes(user.id);
    const { data: currentUserProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const isAdmin = currentUserProfile?.role === "admin";

    if (!isAssignee && !isAdmin)
      return { success: false, error: "Only the assignee or an admin can add progress" };

    const updates = (task.progress_updates ?? []) as TaskProgressUpdate[];
    const newUpdate: TaskProgressUpdate = {
      timestamp: new Date().toISOString(),
      message: trimmed,
      user_id: user.id,
      user_name: profile?.full_name ?? "Unknown",
    };
    const nextUpdates = [...updates, newUpdate];

    const { error } = await supabase
      .from("tasks")
      .update({ progress_updates: nextUpdates })
      .eq("id", parsed.data);

    if (error) return { success: false, error: "Failed to add progress" };

    revalidatePath("/");
    revalidatePath("/tasks");

    return { success: true, update: newUpdate };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Get Task by ID (for TaskDetailSheet) ────────────────────

export async function getTaskById(
  taskId: string,
): Promise<TaskWithLead | null> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data, error } = await supabase
      .from("tasks")
      .select(
        "*, lead:leads!lead_id(id, first_name, last_name, phone_number, email, status), created_by_profile:profiles!created_by(id, full_name, role)",
      )
      .eq("id", taskId)
      .single();

    if (error || !data) return null;

    const [enriched] = await enrichTasksWithAssignees(supabase, [data]);
    const task = enriched as TaskWithLead & {
      created_by_profile?: Pick<Profile, "id" | "full_name" | "role"> | null;
      assigned_to_profile?: Pick<Profile, "id" | "full_name" | "role"> | null;
    };

    const assignees = (task.assigned_to_users as string[] | null) ?? [];
    const isAssignee = assignees.includes(user.id);
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const isAdmin = profile?.role === "admin";

    if (!isAssignee && !isAdmin) return null;

    return {
      ...task,
      progress_updates: task.progress_updates ?? [],
    } as TaskWithLead;
  } catch {
    return null;
  }
}

// ── Get Team Members for Admin Assignee Picker ──────────────

export interface TeamMemberForPicker {
  id: string;
  full_name: string;
  department: string;
}

const NAME_TO_DEPARTMENT: Record<string, string> = {
  Smruti: "Marketing",
  Manaswini: "Marketing",
  Prajith: "Marketing",
  Pixel: "Marketing",
  Danish: "Marketing",
  Vikram: "Shop",
  Harsh: "Shop",
  Katya: "Shop",
  Nikita: "Shop",
  Samson: "Onboarding",
  Amit: "Onboarding",
  Meghna: "Onboarding",
  Kanika: "Onboarding",
  Kaniisha: "Onboarding",
  Ananishri: "Concierge",
  Anishka: "Concierge",
  Ananyashree: "Concierge",
  Anishqa: "Concierge",
  Shruti: "Concierge",
  Lillian: "Concierge",
  Anil: "Concierge",
  Mallika: "Tech",
  Arfam: "Tech",
  Ethan: "Tech",
  Charan: "Tech",
};

export async function getTeamMembersForAdmin(): Promise<TeamMemberForPicker[]> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") return [];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .in("role", ["agent", "scout", "admin"])
      .order("full_name");

    if (!profiles || profiles.length === 0) return [];

    return profiles.map((p) => {
      const firstName = p.full_name?.split(" ")[0] ?? p.full_name ?? "Unknown";
      const department =
        NAME_TO_DEPARTMENT[firstName] ?? NAME_TO_DEPARTMENT[p.full_name ?? ""] ?? "Other";
      return {
        id: p.id,
        full_name: p.full_name ?? "Unknown",
        department,
      };
    });
  } catch {
    return [];
  }
}

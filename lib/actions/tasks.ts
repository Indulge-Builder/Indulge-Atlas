"use server";

/**
 * lib/actions/tasks.ts
 *
 * Unified Task Management Server Actions — Atlas Tasks System.
 * Single source of truth for all task CRUD operations.
 *
 * Every function:
 *   1. Validates input with Zod (imported from lib/schemas/tasks.ts)
 *   2. Calls getAuthUser() for authentication
 *   3. Checks ownership/role before mutating
 *   4. Sanitizes all user text via sanitizeText()
 *   5. Returns { success, data?, error? }
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { sanitizeText } from "@/lib/utils/sanitize";
import { parse as dateParse } from "date-fns";
import {
  CreateMasterTaskSchema,
  UpdateMasterTaskSchema,
  CreateTaskGroupSchema,
  ReorderTaskGroupsSchema,
  CreateSubTaskSchema,
  UpdateSubTaskSchema,
  UpdateSubTaskStatusSchema,
  UpdateSubTaskProgressSchema,
  ReorderSubTasksSchema,
  CreatePersonalTaskSchema,
  AddMasterTaskMemberSchema,
  CreateImportBatchSchema,
  uuidSchema,
} from "@/lib/schemas/tasks";
import type {
  Database,
  MasterTask,
  MasterTaskMember,
  SubTask,
  TaskGroup,
  PersonalTask,
  TaskRemark,
  ImportBatch,
  MasterTaskAnalytics,
  AtlasTaskStatus,
  Profile,
  ChecklistItem,
  TaskWithLead,
  TaskProgressUpdate,
} from "@/lib/types/database";
import { ATLAS_SYSTEM_AUTHOR_ID } from "@/lib/types/database";

// ── Action result shape ────────────────────────────────────

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Auth helper ────────────────────────────────────────────

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, domain, department")
    .eq("id", user.id)
    .single();
  const role = profile?.role ?? "agent";
  const domain = profile?.domain ?? "indulge_concierge";
  const department = profile?.department ?? null;
  return { supabase, user, role, domain, department, profile };
}

function isPrivilegedRole(role: string): boolean {
  return ["admin", "founder"].includes(role);
}

function isPrivilegedOrManager(role: string): boolean {
  return ["admin", "founder", "manager"].includes(role);
}

/** Invalidates agent dashboard, tasks index, and master detail after Atlas task mutations. */
function revalidateAtlasTaskSurfaces(masterTaskId: string) {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${masterTaskId}`);
}

/**
 * Insert a system-generated timeline event into task_remarks.
 * Uses the service-role client so `author_id = ATLAS_SYSTEM_AUTHOR_ID` can bypass
 * the authenticated-user `author_id = auth.uid()` RLS check (migration 067).
 * Only call after the acting user has passed authorization in the Server Action.
 */
async function insertSystemLog(
  taskId: string,
  content: string,
  opts?: {
    previousStatus?: AtlasTaskStatus;
    newStatus?: AtlasTaskStatus;
    progressAtTime?: number;
  },
): Promise<void> {
  const service = getServiceSupabaseClient();
  const row: Database["public"]["Tables"]["task_remarks"]["Insert"] = {
    task_id:          taskId,
    author_id:        ATLAS_SYSTEM_AUTHOR_ID,
    content:          sanitizeText(content),
    source:           "system",
    state_at_time:    opts?.newStatus ?? "todo",
    previous_status:  opts?.previousStatus ?? null,
    progress_at_time: opts?.progressAtTime ?? null,
  };
  const { error } = await service.from("task_remarks").insert(row);
  if (error) console.error("[insertSystemLog]", error);
}

async function assertMasterTaskAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  masterTaskId: string,
  userId: string,
  userRole: string,
  requiredRoles: string[] = ["owner", "manager", "member"],
): Promise<boolean> {
  if (isPrivilegedRole(userRole)) return true;
  const { data } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", masterTaskId)
    .eq("user_id", userId)
    .single();
  return !!data && requiredRoles.includes(data.role as string);
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER TASKS
// ─────────────────────────────────────────────────────────────────────────────

export async function createMasterTask(
  params: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateMasterTaskSchema.safeParse(params);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { supabase, user, domain, department } = await getAuthUser();
    const d = parsed.data;

    // Insert a tasks row with unified_task_type = 'master'
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .insert({
        title:              sanitizeText(d.title),
        notes:              d.description ? sanitizeText(d.description) : null,
        unified_task_type:  "master",
        atlas_status:       "todo",
        domain:             d.domain ?? domain,
        department:         d.department ?? department,
        cover_color:        d.cover_color ?? null,
        icon_key:           d.icon_key ?? null,
        due_date:           d.due_date ?? null,
        created_by:         user.id,
        status:             "pending",
        task_type:          "general_follow_up",
        progress:           0,
        progress_updates:   [],
        assigned_to_users:  [user.id],
        tags:               [],
        attachments:        [],
      })
      .select("id")
      .single();

    if (taskErr || !task)
      return { success: false, error: "Failed to create master task" };

    // Also create a corresponding projects row so project_members FK works
    await supabase.from("projects").insert({
      id:         task.id,
      title:      sanitizeText(d.title),
      description: d.description ? sanitizeText(d.description) : null,
      owner_id:   user.id,
      domain:     d.domain ?? domain,
      department: d.department ?? department,
      color:      d.cover_color ?? null,
      icon:       d.icon_key ?? null,
      due_date:   d.due_date ?? null,
      status:     "active",
    });

    // Add creator as owner in project_members
    const memberInserts = [
      { project_id: task.id, user_id: user.id, role: "owner", added_by: user.id },
      ...(d.initialMemberIds ?? [])
        .filter((id) => id !== user.id)
        .map((id) => ({
          project_id: task.id,
          user_id: id,
          role: "member" as const,
          added_by: user.id,
        })),
    ];
    await supabase.from("project_members").insert(memberInserts);

    // Seed a simple Kanban: master tasks use task_groups as board columns.
    // Without this, the board starts empty and users only see “Add Group”.
    const { error: defaultGroupsErr } = await supabase.from("task_groups").insert([
      { project_id: task.id, title: "To do", position: 0, created_by: user.id },
      { project_id: task.id, title: "In progress", position: 1, created_by: user.id },
      { project_id: task.id, title: "Done", position: 2, created_by: user.id },
    ]);
    if (defaultGroupsErr)
      console.error("[createMasterTask] default task_groups", defaultGroupsErr);

    // Update the tasks row's project_id to itself (master task is its own project)
    await supabase
      .from("tasks")
      .update({ project_id: task.id, master_task_id: task.id })
      .eq("id", task.id);

    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${task.id}`);
    return { success: true, data: { id: task.id } };
  } catch (err) {
    console.error("[createMasterTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getMasterTasks(filters?: {
  archived?: boolean;
  department?: string;
  domain?: string;
}): Promise<ActionResult<MasterTask[]>> {
  try {
    const { supabase, user, role } = await getAuthUser();

    let query = supabase
      .from("tasks")
      .select(
        "id, title, notes, atlas_status, unified_task_type, domain, department, cover_color, icon_key, due_date, archived_at, created_by, created_at, updated_at",
      )
      .eq("unified_task_type", "master")
      .order("updated_at", { ascending: false });

    if (filters?.archived) {
      // Only archived tasks
      query = query.not("archived_at", "is", null);
    } else {
      // Only active (non-archived) tasks
      query = query.is("archived_at", null);
    }

    if (filters?.department) {
      query = query.eq("department", filters.department);
    }

    if (!isPrivilegedRole(role)) {
      // Non-admins see tasks they're members of
      const { data: memberRows } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id);
      const ids = (memberRows ?? []).map((r) => r.project_id);
      if (ids.length === 0) return { success: true, data: [] };
      query = query.in("id", ids);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: "Failed to fetch tasks" };

    const tasks = (data ?? []) as unknown as MasterTask[];

    // Enrich with subtask counts
    if (tasks.length > 0) {
      const ids = tasks.map((t) => t.id);
      const { data: subtaskCounts } = await supabase
        .from("tasks")
        .select("project_id, atlas_status")
        .in("project_id", ids)
        .eq("unified_task_type", "subtask");

      const countMap = new Map<string, { total: number; done: number }>();
      for (const st of subtaskCounts ?? []) {
        const key = st.project_id as string;
        const cur = countMap.get(key) ?? { total: 0, done: 0 };
        cur.total++;
        if (st.atlas_status === "done") cur.done++;
        countMap.set(key, cur);
      }

      return {
        success: true,
        data: tasks.map((t) => ({
          ...t,
          subtask_count: countMap.get(t.id)?.total ?? 0,
          completed_subtask_count: countMap.get(t.id)?.done ?? 0,
        })),
      };
    }

    return { success: true, data: tasks };
  } catch (err) {
    console.error("[getMasterTasks]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getMasterTaskDetail(
  taskId: string,
): Promise<
  ActionResult<{
    masterTask: MasterTask;
    taskGroups: (TaskGroup & { tasks: SubTask[] })[];
    members: MasterTaskMember[];
  }>
> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase } = await getAuthUser();

    const [
      { data: masterTask, error: taskErr },
      { data: taskGroups },
      { data: subtasks },
      { data: members },
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, title, notes, atlas_status, unified_task_type, domain, department, cover_color, icon_key, due_date, archived_at, created_by, created_at, updated_at",
        )
        .eq("id", parsed.data)
        .eq("unified_task_type", "master")
        .single(),
      supabase
        .from("task_groups")
        .select("id, project_id, title, description, status, position, due_date, created_by, created_at, updated_at")
        .eq("project_id", parsed.data)
        .order("position", { ascending: true }),
      supabase
        .from("tasks")
        .select(
          "id, project_id, group_id, parent_task_id, title, notes, atlas_status, priority, progress, due_date, assigned_to_users, estimated_minutes, actual_minutes, position, tags, created_by, created_at, updated_at, domain, department, master_task_id, imported_from, import_batch_id",
        )
        .eq("project_id", parsed.data)
        .eq("unified_task_type", "subtask")
        .order("position", { ascending: true }),
      supabase
        .from("project_members")
        .select("id, project_id, user_id, role, added_by, added_at, profile:profiles!user_id(id, full_name, role, job_title)")
        .eq("project_id", parsed.data),
    ]);

    if (taskErr || !masterTask)
      return { success: false, error: "Master task not found" };

    // Enrich subtasks with assignee profiles
    const allUserIds = new Set<string>();
    for (const t of subtasks ?? []) {
      for (const id of (t.assigned_to_users as string[] | null) ?? []) {
        allUserIds.add(id);
      }
    }
    let profileMap = new Map<string, { id: string; full_name: string; role: string; job_title: string | null }>();
    if (allUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, role, job_title")
        .in("id", [...allUserIds]);
      for (const p of profiles ?? []) profileMap.set(p.id, p);
    }

    const enrichedSubtasks = (subtasks ?? []).map((t) => {
      const userIds = (t.assigned_to_users as string[] | null) ?? [];
      return {
        ...t,
        unified_task_type: "subtask" as const,
        assigned_to_profiles: userIds.map((id) => profileMap.get(id)).filter(Boolean),
      };
    });

    // Group subtasks by group_id
    const groupedTasks = (taskGroups ?? []).map((g) => ({
      ...g,
      tasks: enrichedSubtasks.filter((t) => t.group_id === g.id) as unknown as SubTask[],
    }));

    return {
      success: true,
      data: {
        masterTask: masterTask as unknown as MasterTask,
        taskGroups: groupedTasks,
        members: (members ?? []) as unknown as MasterTaskMember[],
      },
    };
  } catch (err) {
    console.error("[getMasterTaskDetail]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function updateMasterTask(
  taskId: unknown,
  params: unknown,
): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(taskId);
  const fieldsParsed = UpdateMasterTaskSchema.safeParse(params);
  if (!idParsed.success || !fieldsParsed.success)
    return { success: false, error: "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const hasAccess = await assertMasterTaskAccess(supabase, idParsed.data, user.id, role, ["owner", "manager"]);
    if (!hasAccess) return { success: false, error: "Not authorized" };

    const f = fieldsParsed.data;
    const updateData: Record<string, unknown> = {};
    if (f.title !== undefined)       updateData.title = sanitizeText(f.title);
    if (f.description !== undefined) updateData.notes = f.description ? sanitizeText(f.description) : null;
    if (f.cover_color !== undefined) updateData.cover_color = f.cover_color;
    if (f.icon_key !== undefined)    updateData.icon_key = f.icon_key;
    if (f.due_date !== undefined)    updateData.due_date = f.due_date;
    if (f.domain !== undefined)      updateData.domain = f.domain;
    if (f.department !== undefined)  updateData.department = f.department;
    if (f.atlas_status !== undefined) updateData.atlas_status = f.atlas_status;

    const { error } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("id", idParsed.data)
      .eq("unified_task_type", "master");

    if (error) return { success: false, error: "Failed to update task" };

    // Mirror title/description to projects table
    if (f.title !== undefined || f.description !== undefined) {
      const projUpdate: Record<string, unknown> = {};
      if (f.title !== undefined) projUpdate.title = sanitizeText(f.title!);
      if (f.description !== undefined)
        projUpdate.description = f.description ? sanitizeText(f.description) : null;
      if (f.cover_color !== undefined) projUpdate.color = f.cover_color;
      if (f.icon_key !== undefined)    projUpdate.icon = f.icon_key;
      if (f.due_date !== undefined)    projUpdate.due_date = f.due_date;
      await supabase.from("projects").update(projUpdate).eq("id", idParsed.data);
    }

    revalidateAtlasTaskSurfaces(idParsed.data);
    return { success: true };
  } catch (err) {
    console.error("[updateMasterTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function archiveMasterTask(taskId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const hasAccess = await assertMasterTaskAccess(supabase, parsed.data, user.id, role, ["owner"]);
    if (!hasAccess) return { success: false, error: "Only the task owner can archive" };

    const { data: beforeMaster } = await supabase
      .from("tasks")
      .select("atlas_status")
      .eq("id", parsed.data)
      .single();

    const { error } = await supabase
      .from("tasks")
      .update({ archived_at: new Date().toISOString(), archived_by: user.id })
      .eq("id", parsed.data)
      .eq("unified_task_type", "master");

    if (error) return { success: false, error: "Failed to archive task" };

    await insertSystemLog(parsed.data, "Master task archived.", {
      newStatus: ((beforeMaster?.atlas_status as AtlasTaskStatus) ?? "todo"),
    });

    revalidateAtlasTaskSurfaces(parsed.data);
    return { success: true };
  } catch (err) {
    console.error("[archiveMasterTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function deleteMasterTask(taskId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role))
      return { success: false, error: "Only admins and founders can delete master tasks" };

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", parsed.data)
      .eq("unified_task_type", "master");

    if (error) return { success: false, error: "Failed to delete task" };

    await supabase.from("projects").delete().eq("id", parsed.data);

    revalidatePath("/");
    revalidatePath("/tasks");
    return { success: true };
  } catch (err) {
    console.error("[deleteMasterTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK GROUPS
// ─────────────────────────────────────────────────────────────────────────────

export async function createTaskGroupForMaster(
  masterTaskId: unknown,
  params: unknown,
): Promise<ActionResult<{ id: string }>> {
  const idParsed = uuidSchema.safeParse(masterTaskId);
  const fieldsParsed = CreateTaskGroupSchema.safeParse(params);
  if (!idParsed.success || !fieldsParsed.success)
    return { success: false, error: "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const hasAccess = await assertMasterTaskAccess(supabase, idParsed.data, user.id, role);
    if (!hasAccess) return { success: false, error: "Not a task member" };

    const { data, error } = await supabase
      .from("task_groups")
      .insert({
        project_id: idParsed.data,
        title:      sanitizeText(fieldsParsed.data.title),
        position:   fieldsParsed.data.position ?? 0,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) return { success: false, error: "Failed to create group" };

    revalidateAtlasTaskSurfaces(idParsed.data);
    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error("[createTaskGroupForMaster]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function reorderTaskGroupsForMaster(
  masterTaskId: unknown,
  orderedGroupIds: unknown,
): Promise<ActionResult> {
  const parsed = ReorderTaskGroupsSchema.safeParse({ masterTaskId, orderedGroupIds });
  if (!parsed.success) return { success: false, error: "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const hasAccess = await assertMasterTaskAccess(
      supabase,
      parsed.data.masterTaskId,
      user.id,
      role,
    );
    if (!hasAccess) return { success: false, error: "Not authorized" };

    await Promise.all(
      parsed.data.orderedGroupIds.map((id, index) =>
        supabase
          .from("task_groups")
          .update({ position: index })
          .eq("id", id)
          .eq("project_id", parsed.data.masterTaskId),
      ),
    );

    revalidateAtlasTaskSurfaces(parsed.data.masterTaskId);
    return { success: true };
  } catch (err) {
    console.error("[reorderTaskGroupsForMaster]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function renameTaskGroup(
  groupId: unknown,
  title: unknown,
): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(groupId);
  const titleParsed = CreateTaskGroupSchema.shape.title.safeParse(title);
  if (!idParsed.success || !titleParsed.success)
    return { success: false, error: "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: group } = await supabase
      .from("task_groups")
      .select("project_id")
      .eq("id", idParsed.data)
      .single();

    if (!group) return { success: false, error: "Group not found" };

    const hasAccess = await assertMasterTaskAccess(supabase, group.project_id, user.id, role);
    if (!hasAccess) return { success: false, error: "Not authorized" };

    const { error } = await supabase
      .from("task_groups")
      .update({ title: sanitizeText(titleParsed.data) })
      .eq("id", idParsed.data);

    if (error) return { success: false, error: "Failed to rename group" };

    revalidateAtlasTaskSurfaces(group.project_id as string);
    return { success: true };
  } catch (err) {
    console.error("[renameTaskGroup]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function deleteTaskGroupForMaster(groupId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(groupId);
  if (!parsed.success) return { success: false, error: "Invalid group ID" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: group } = await supabase
      .from("task_groups")
      .select("project_id")
      .eq("id", parsed.data)
      .single();

    if (!group) return { success: false, error: "Group not found" };

    if (!isPrivilegedOrManager(role)) {
      const hasAccess = await assertMasterTaskAccess(
        supabase,
        group.project_id,
        user.id,
        role,
        ["owner", "manager"],
      );
      if (!hasAccess) return { success: false, error: "Not authorized" };
    }

    const { count } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("group_id", parsed.data)
      .eq("unified_task_type", "subtask");

    if ((count ?? 0) > 0)
      return {
        success: false,
        error: `Cannot delete group: it has ${count} task(s). Move or delete tasks first.`,
      };

    const { error } = await supabase
      .from("task_groups")
      .delete()
      .eq("id", parsed.data);

    if (error) return { success: false, error: "Failed to delete group" };

    revalidateAtlasTaskSurfaces(group.project_id as string);
    return { success: true };
  } catch (err) {
    console.error("[deleteTaskGroupForMaster]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-TASKS
// ─────────────────────────────────────────────────────────────────────────────

export async function createSubTask(
  params: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSubTaskSchema.safeParse(params);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { supabase, user, role, domain, department } = await getAuthUser();
    const d = parsed.data;

    const hasAccess = await assertMasterTaskAccess(supabase, d.master_task_id, user.id, role);
    if (!hasAccess) return { success: false, error: "Not a task member" };

    const assigneeIds = d.assigned_to ? [d.assigned_to] : [user.id];

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id:        d.master_task_id,
        master_task_id:    d.master_task_id,
        group_id:          d.group_id,
        title:             sanitizeText(d.title),
        notes:             d.description ? sanitizeText(d.description) : null,
        unified_task_type: "subtask",
        atlas_status:      "todo",
        priority:          d.priority,
        due_date:          d.due_date ?? null,
        assigned_to_users: assigneeIds,
        estimated_minutes: d.estimated_minutes ?? null,
        tags:              d.tags ?? [],
        domain:            domain,
        department:        department,
        created_by:        user.id,
        status:            "pending",
        task_type:         "general_follow_up",
        progress:          0,
        progress_updates:  [],
        attachments:       [],
      })
      .select("id")
      .single();

    if (error || !data) return { success: false, error: "Failed to create task" };

    revalidateAtlasTaskSurfaces(d.master_task_id);
    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error("[createSubTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getSubTaskDetail(taskId: string): Promise<
  ActionResult<{
    task: SubTask;
    masterTaskTitle: string | null;
    masterTaskGroupTitle: string | null;
    remarks: TaskRemark[];
    assigneeProfile: Pick<Profile, "id" | "full_name" | "job_title"> | null;
    checklist: ChecklistItem[];
  }>
> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase } = await getAuthUser();

    // Fetch task + remarks in parallel
    const [
      { data: task, error: taskErr },
      { data: remarks },
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, project_id, group_id, parent_task_id, title, notes, atlas_status, priority, progress, due_date, assigned_to_users, estimated_minutes, actual_minutes, position, tags, attachments, created_by, created_at, updated_at, domain, department, master_task_id, imported_from, import_batch_id",
        )
        .eq("id", parsed.data)
        .single(),
      supabase
        .from("task_remarks")
        .select(
          "id, task_id, author_id, content, state_at_time, previous_status, progress_at_time, source, created_at, author:profiles!author_id(id, full_name, job_title)",
        )
        .eq("task_id", parsed.data)
        .order("created_at", { ascending: false }),
    ]);

    if (taskErr || !task) return { success: false, error: "Task not found" };

    const typedTask = task as Record<string, unknown>;

    // Resolve assignee profile
    const assigneeIds = (typedTask.assigned_to_users as string[] | null) ?? [];
    let assigneeProfile: Pick<Profile, "id" | "full_name" | "job_title"> | null = null;
    if (assigneeIds.length > 0) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id, full_name, job_title")
        .eq("id", assigneeIds[0])
        .single();
      if (profileRow) assigneeProfile = profileRow as Pick<Profile, "id" | "full_name" | "job_title">;
    }

    // Resolve master task title + group title for breadcrumb
    let masterTaskTitle: string | null = null;
    let masterTaskGroupTitle: string | null = null;
    const masterTaskId = typedTask.project_id as string | null;
    const groupId = typedTask.group_id as string | null;
    if (masterTaskId) {
      const [{ data: masterRow }, { data: groupRow }] = await Promise.all([
        supabase.from("tasks").select("title").eq("id", masterTaskId).eq("unified_task_type", "master").single(),
        groupId
          ? supabase.from("task_groups").select("title").eq("id", groupId).single()
          : Promise.resolve({ data: null }),
      ]);
      masterTaskTitle = masterRow?.title ?? null;
      masterTaskGroupTitle = (groupRow as { title?: string } | null)?.title ?? null;
    }

    // Extract checklist from attachments JSONB (stored as array under key 'checklist')
    const attachments = (typedTask.attachments as unknown[] | null) ?? [];
    const checklist: ChecklistItem[] = (attachments as ChecklistItem[]).filter(
      (item): item is ChecklistItem =>
        typeof item === "object" && item !== null && "id" in item && "text" in item && "checked" in item,
    );

    return {
      success: true,
      data: {
        task:                { ...typedTask, unified_task_type: "subtask" } as unknown as SubTask,
        masterTaskTitle,
        masterTaskGroupTitle,
        remarks:             (remarks ?? []) as unknown as TaskRemark[],
        assigneeProfile,
        checklist,
      },
    };
  } catch (err) {
    console.error("[getSubTaskDetail]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Update only the checklist on a subtask (used by optimistic checklist toggles).
 * Checklist items are stored in tasks.attachments as a tagged JSONB array.
 */
export async function updateSubTaskChecklist(
  taskId: unknown,
  checklist: unknown,
): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(taskId);
  const { ChecklistSchema } = await import("@/lib/schemas/tasks");
  const checklistParsed = ChecklistSchema.safeParse(checklist);
  if (!idParsed.success || !checklistParsed.success)
    return { success: false, error: "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: task } = await supabase
      .from("tasks")
      .select("project_id, assigned_to_users, created_by")
      .eq("id", idParsed.data)
      .single();

    if (!task) return { success: false, error: "Task not found" };

    const isAssignee = (task.assigned_to_users as string[] | null)?.includes(user.id);
    const hasAccess =
      isAssignee ||
      task.created_by === user.id ||
      isPrivilegedOrManager(role) ||
      (await assertMasterTaskAccess(supabase, task.project_id, user.id, role));

    if (!hasAccess) return { success: false, error: "Not authorized" };

    const { error } = await supabase
      .from("tasks")
      .update({ attachments: checklistParsed.data })
      .eq("id", idParsed.data);

    if (error) return { success: false, error: "Failed to save checklist" };

    const pid = task.project_id as string;
    if (pid) revalidateAtlasTaskSurfaces(pid);
    return { success: true };
  } catch (err) {
    console.error("[updateSubTaskChecklist]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function updateSubTask(
  taskId: unknown,
  params: unknown,
): Promise<ActionResult> {
  const idParsed = uuidSchema.safeParse(taskId);
  const fieldsParsed = UpdateSubTaskSchema.safeParse(params);
  if (!idParsed.success || !fieldsParsed.success)
    return { success: false, error: "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: task } = await supabase
      .from("tasks")
      .select("project_id, assigned_to_users, created_by")
      .eq("id", idParsed.data)
      .single();

    if (!task) return { success: false, error: "Task not found" };

    const isAssignee = (task.assigned_to_users as string[] | null)?.includes(user.id);
    const isCreator = task.created_by === user.id;
    const hasAccess =
      isAssignee ||
      isCreator ||
      isPrivilegedOrManager(role) ||
      (await assertMasterTaskAccess(supabase, task.project_id, user.id, role, ["owner", "manager"]));

    if (!hasAccess) return { success: false, error: "Not authorized" };

    const f = fieldsParsed.data;
    const updateData: Record<string, unknown> = {};
    if (f.title !== undefined)             updateData.title = sanitizeText(f.title);
    if (f.description !== undefined)       updateData.notes = f.description ? sanitizeText(f.description) : null;
    if (f.priority !== undefined)          updateData.priority = f.priority;
    if (f.due_date !== undefined)          updateData.due_date = f.due_date;
    if (f.atlas_status !== undefined)      updateData.atlas_status = f.atlas_status;
    if (f.estimated_minutes !== undefined) updateData.estimated_minutes = f.estimated_minutes;
    if (f.actual_minutes !== undefined)    updateData.actual_minutes = f.actual_minutes;
    if (f.tags !== undefined)              updateData.tags = f.tags;
    if (f.progress !== undefined)          updateData.progress = f.progress;

    const currentTask = await supabase
      .from("tasks")
      .select("atlas_status, due_date, assigned_to_users, priority")
      .eq("id", idParsed.data)
      .single();

    const { error } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("id", idParsed.data);

    if (error) return { success: false, error: "Failed to update task" };

    // Insert system log for structural field changes
    const prev = currentTask.data as Record<string, unknown> | null;
    if (prev) {
      const currentStatus = (prev.atlas_status as AtlasTaskStatus) ?? "todo";
      const newStatus = (f.atlas_status ?? currentStatus) as AtlasTaskStatus;

      if (f.atlas_status !== undefined && f.atlas_status !== currentStatus) {
        await insertSystemLog(idParsed.data,
          `Status changed from "${currentStatus}" to "${f.atlas_status}" via brief edit.`,
          { previousStatus: currentStatus, newStatus: f.atlas_status },
        );
      }
      if (f.due_date !== undefined && f.due_date !== prev.due_date) {
        await insertSystemLog(idParsed.data,
          `Due date updated${f.due_date ? ` to ${new Date(f.due_date).toLocaleDateString("en-IN")}` : " (cleared)"}.`,
          { newStatus },
        );
      }
      if (f.priority !== undefined && f.priority !== prev.priority) {
        await insertSystemLog(idParsed.data,
          `Priority changed to "${f.priority}".`,
          { newStatus },
        );
      }
    }

    const pid = task.project_id as string;
    if (pid) revalidateAtlasTaskSurfaces(pid);
    return { success: true };
  } catch (err) {
    console.error("[updateSubTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function updateSubTaskStatus(
  params: unknown,
): Promise<ActionResult<{ remarkId?: string }>> {
  const parsed = UpdateSubTaskStatusSchema.safeParse(params);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const { task_id, new_status, remark_content, new_progress, checklist } = parsed.data;

    const { data: task } = await supabase
      .from("tasks")
      .select("project_id, assigned_to_users, created_by, progress, atlas_status")
      .eq("id", task_id)
      .single();

    if (!task) return { success: false, error: "Task not found" };

    const isAssignee = (task.assigned_to_users as string[] | null)?.includes(user.id);
    const isCreator = task.created_by === user.id;
    const hasAccess =
      isAssignee ||
      isCreator ||
      isPrivilegedOrManager(role) ||
      (await assertMasterTaskAccess(supabase, task.project_id, user.id, role, ["owner", "manager"]));

    if (!hasAccess) return { success: false, error: "Not authorized" };

    const previousStatus = (task.atlas_status as AtlasTaskStatus) ?? "todo";
    const currentProgress = (task.progress as number) ?? 0;
    const finalProgress = new_progress ?? (new_status === "done" ? 100 : currentProgress);

    // Build task update — optionally include checklist in attachments
    const taskUpdate: Record<string, unknown> = {
      atlas_status: new_status,
      progress:     finalProgress,
    };
    if (checklist !== undefined) {
      taskUpdate.attachments = checklist;
    }

    const [{ error: taskErr }, { data: remarkRow, error: remarkErr }] = await Promise.all([
      supabase.from("tasks").update(taskUpdate).eq("id", task_id),
      supabase
        .from("task_remarks")
        .insert({
          task_id,
          author_id:        user.id,
          content:          sanitizeText(remark_content),
          state_at_time:    new_status,
          previous_status:  previousStatus !== new_status ? previousStatus : null,
          progress_at_time: finalProgress,
          source:           "agent",
        })
        .select("id")
        .single(),
    ]);

    if (taskErr) return { success: false, error: "Failed to update status" };
    if (remarkErr) console.error("[updateSubTaskStatus] remark insert failed", remarkErr);

    const pid = task.project_id as string;
    if (pid) revalidateAtlasTaskSurfaces(pid);
    return { success: true, data: { remarkId: remarkRow?.id } };
  } catch (err) {
    console.error("[updateSubTaskStatus]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function updateSubTaskProgress(
  params: unknown,
): Promise<ActionResult> {
  const parsed = UpdateSubTaskProgressSchema.safeParse(params);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const { task_id, new_progress, note } = parsed.data;

    const { data: task } = await supabase
      .from("tasks")
      .select("project_id, assigned_to_users, created_by, progress, atlas_status")
      .eq("id", task_id)
      .single();

    if (!task) return { success: false, error: "Task not found" };

    const isAssignee = (task.assigned_to_users as string[] | null)?.includes(user.id);
    const isCreator = task.created_by === user.id;
    const hasAccess =
      isAssignee ||
      isCreator ||
      isPrivilegedOrManager(role) ||
      (await assertMasterTaskAccess(supabase, task.project_id, user.id, role));

    if (!hasAccess) return { success: false, error: "Not authorized" };

    const prevProgress = (task.progress as number) ?? 0;
    const prevStatus = (task.atlas_status as string) ?? "todo";
    const newAtlasStatus: AtlasTaskStatus = new_progress === 100 ? "done" : (task.atlas_status as AtlasTaskStatus) ?? "in_progress";

    const { error: taskErr } = await supabase
      .from("tasks")
      .update({ progress: new_progress, atlas_status: newAtlasStatus })
      .eq("id", task_id);

    if (taskErr) return { success: false, error: "Failed to update progress" };

    await supabase.from("task_progress_updates").insert({
      task_id,
      updated_by:       user.id,
      previous_progress: prevProgress,
      new_progress,
      previous_status:  prevStatus,
      new_status:       newAtlasStatus,
      note:             note ? sanitizeText(note) : null,
    });

    const pid = task.project_id as string;
    if (pid) revalidateAtlasTaskSurfaces(pid);
    return { success: true };
  } catch (err) {
    console.error("[updateSubTaskProgress]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function assignSubTask(
  taskId: unknown,
  assigneeId: unknown,
): Promise<ActionResult> {
  const taskParsed = uuidSchema.safeParse(taskId);
  const assigneeParsed = uuidSchema.safeParse(assigneeId);
  if (!taskParsed.success || !assigneeParsed.success)
    return { success: false, error: "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: task } = await supabase
      .from("tasks")
      .select("project_id, atlas_status")
      .eq("id", taskParsed.data)
      .single();

    if (!task) return { success: false, error: "Task not found" };

    const hasAccess =
      isPrivilegedOrManager(role) ||
      (await assertMasterTaskAccess(supabase, task.project_id, user.id, role, ["owner", "manager"]));

    if (!hasAccess) return { success: false, error: "Not authorized" };

    const { error } = await supabase
      .from("tasks")
      .update({ assigned_to_users: [assigneeParsed.data] })
      .eq("id", taskParsed.data);

    if (error) return { success: false, error: "Failed to assign task" };

    // System log for reassignment
    const { data: assigneeProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", assigneeParsed.data)
      .single();
    const name = (assigneeProfile as { full_name?: string } | null)?.full_name ?? "a team member";
    const st = (task.atlas_status as AtlasTaskStatus) ?? "todo";
    await insertSystemLog(taskParsed.data, `Task reassigned to ${name}.`, { newStatus: st });

    const pid = task.project_id as string;
    if (pid) revalidateAtlasTaskSurfaces(pid);
    return { success: true };
  } catch (err) {
    console.error("[assignSubTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function deleteSubTask(taskId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: task } = await supabase
      .from("tasks")
      .select("project_id, title, atlas_status")
      .eq("id", parsed.data)
      .single();

    if (!task) return { success: false, error: "Task not found" };

    const hasAccess =
      isPrivilegedOrManager(role) ||
      (await assertMasterTaskAccess(supabase, task.project_id, user.id, role, ["owner", "manager"]));

    if (!hasAccess) return { success: false, error: "Not authorized" };

    const pid = task.project_id as string;
    const mtStatus = pid
      ? (
          await supabase
            .from("tasks")
            .select("atlas_status")
            .eq("id", pid)
            .eq("unified_task_type", "master")
            .maybeSingle()
        ).data?.atlas_status
      : null;
    await insertSystemLog(pid || parsed.data,
      `Subtask "${(task.title as string) ?? "Untitled"}" was removed.`,
      { newStatus: ((mtStatus as AtlasTaskStatus) ?? "todo") },
    );

    const { error } = await supabase.from("tasks").delete().eq("id", parsed.data);
    if (error) return { success: false, error: "Failed to delete task" };

    const projectId = task.project_id as string;
    if (projectId) revalidateAtlasTaskSurfaces(projectId);
    return { success: true };
  } catch (err) {
    console.error("[deleteSubTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function reorderSubTasks(
  params: unknown,
): Promise<ActionResult> {
  const parsed = ReorderSubTasksSchema.safeParse(params);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: group } = await supabase
      .from("task_groups")
      .select("project_id")
      .eq("id", parsed.data.groupId)
      .single();

    if (!group) return { success: false, error: "Group not found" };

    const hasAccess = await assertMasterTaskAccess(supabase, group.project_id, user.id, role);
    if (!hasAccess) return { success: false, error: "Not authorized" };

    await Promise.all(
      parsed.data.orderedTaskIds.map((id, index) =>
        supabase.from("tasks").update({ position: index }).eq("id", id),
      ),
    );

    revalidateAtlasTaskSurfaces(group.project_id as string);
    return { success: true };
  } catch (err) {
    console.error("[reorderSubTasks]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL TASKS
// ─────────────────────────────────────────────────────────────────────────────

export async function createPersonalTask(
  params: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreatePersonalTaskSchema.safeParse(params);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { supabase, user, domain, department } = await getAuthUser();
    const d = parsed.data;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title:             sanitizeText(d.title),
        notes:             d.description ? sanitizeText(d.description) : null,
        unified_task_type: "personal",
        atlas_status:      "todo",
        priority:          d.priority,
        due_date:          d.due_date ?? null,
        assigned_to_users: [user.id],
        domain:            domain,
        department:        department,
        created_by:        user.id,
        status:            "pending",
        task_type:         "general_follow_up",
        progress:          0,
        progress_updates:  [],
        tags:              [],
        attachments:       [],
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[createPersonalTask] supabase error:", error);
      return { success: false, error: error?.message ?? "Failed to create task" };
    }

    revalidatePath("/");
    revalidatePath("/tasks");
    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error("[createPersonalTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Fetch all SubTasks assigned to the current user (for the My Tasks tab).
 * Returns subtasks with their master task title for breadcrumb display.
 */
export async function getMySubTasks(): Promise<ActionResult<Array<SubTask & { masterTaskTitle: string | null }>>> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id, project_id, group_id, title, notes, atlas_status, priority, due_date, progress, assigned_to_users, created_by, created_at, updated_at, domain, department, master_task_id, imported_from, import_batch_id, unified_task_type",
      )
      .eq("unified_task_type", "subtask")
      .contains("assigned_to_users", [user.id])
      .not("atlas_status", "in", '("done","cancelled")')
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error) return { success: false, error: "Failed to fetch tasks" };

    const tasks = (data ?? []) as unknown as SubTask[];

    // Enrich with master task titles
    const masterIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean))];
    const masterTitleMap = new Map<string, string>();
    if (masterIds.length > 0) {
      const { data: masterRows } = await supabase
        .from("tasks")
        .select("id, title")
        .in("id", masterIds as string[])
        .eq("unified_task_type", "master");
      for (const r of masterRows ?? []) masterTitleMap.set(r.id, r.title);
    }

    return {
      success: true,
      data: tasks.map((t) => ({
        ...t,
        masterTaskTitle: t.project_id ? (masterTitleMap.get(t.project_id) ?? null) : null,
      })),
    };
  } catch (err) {
    console.error("[getMySubTasks]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getMyTasks(): Promise<ActionResult<PersonalTask[]>> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id, title, notes, unified_task_type, atlas_status, priority, due_date, progress, created_by, assigned_to_users, created_at, updated_at",
      )
      .eq("unified_task_type", "personal")
      .contains("assigned_to_users", [user.id])
      .neq("atlas_status", "cancelled")
      .order("priority", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error) return { success: false, error: "Failed to fetch tasks" };

    return { success: true, data: (data ?? []) as unknown as PersonalTask[] };
  } catch (err) {
    console.error("[getMyTasks]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function completePersonalTask(taskId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .update({ atlas_status: "done", progress: 100 })
      .eq("id", parsed.data)
      .eq("unified_task_type", "personal")
      .contains("assigned_to_users", [user.id]);

    if (error) return { success: false, error: "Failed to complete task" };

    revalidatePath("/");
    revalidatePath("/tasks");
    return { success: true };
  } catch (err) {
    console.error("[completePersonalTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

export async function addMasterTaskMember(
  params: unknown,
): Promise<ActionResult> {
  const parsed = AddMasterTaskMemberSchema.safeParse(params);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const hasAccess =
      isPrivilegedRole(role) ||
      (await assertMasterTaskAccess(supabase, parsed.data.masterTaskId, user.id, role, ["owner", "manager"]));

    if (!hasAccess) return { success: false, error: "Not authorized" };

    const { error } = await supabase.from("project_members").upsert(
      {
        project_id: parsed.data.masterTaskId,
        user_id:    parsed.data.profileId,
        role:       parsed.data.role,
        added_by:   user.id,
      },
      { onConflict: "project_id,user_id" },
    );

    if (error) return { success: false, error: "Failed to add member" };

    revalidateAtlasTaskSurfaces(parsed.data.masterTaskId);
    return { success: true };
  } catch (err) {
    console.error("[addMasterTaskMember]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function removeMasterTaskMember(
  masterTaskId: unknown,
  profileId: unknown,
): Promise<ActionResult> {
  const taskParsed = uuidSchema.safeParse(masterTaskId);
  const profileParsed = uuidSchema.safeParse(profileId);
  if (!taskParsed.success || !profileParsed.success)
    return { success: false, error: "Invalid input" };

  try {
    const { supabase, user, role } = await getAuthUser();
    const hasAccess =
      isPrivilegedRole(role) ||
      (await assertMasterTaskAccess(supabase, taskParsed.data, user.id, role, ["owner", "manager"]));

    if (!hasAccess) return { success: false, error: "Not authorized" };

    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", taskParsed.data)
      .eq("user_id", profileParsed.data);

    if (error) return { success: false, error: "Failed to remove member" };

    revalidateAtlasTaskSurfaces(taskParsed.data);
    return { success: true };
  } catch (err) {
    console.error("[removeMasterTaskMember]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getMasterTaskMembers(
  masterTaskId: string,
): Promise<ActionResult<MasterTaskMember[]>> {
  const parsed = uuidSchema.safeParse(masterTaskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase } = await getAuthUser();
    const { data, error } = await supabase
      .from("project_members")
      .select(
        "id, project_id, user_id, role, added_by, added_at, profile:profiles!user_id(id, full_name, role, job_title)",
      )
      .eq("project_id", parsed.data);

    if (error) return { success: false, error: "Failed to fetch members" };

    return { success: true, data: (data ?? []) as unknown as MasterTaskMember[] };
  } catch (err) {
    console.error("[getMasterTaskMembers]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────────────────────────────────────

export async function createImportBatch(
  params: unknown,
): Promise<ActionResult<{ batchId: string; imported: number; warnings: number }>> {
  const parsed = CreateImportBatchSchema.safeParse(params);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { supabase, user, role, domain, department } = await getAuthUser();
    const { master_task_id, group_id, rows } = parsed.data;

    const hasAccess =
      isPrivilegedOrManager(role) ||
      (await assertMasterTaskAccess(supabase, master_task_id, user.id, role));
    if (!hasAccess) return { success: false, error: "Not authorized" };

    // Create the batch record
    const { data: batch, error: batchErr } = await supabase
      .from("import_batches")
      .insert({
        created_by:     user.id,
        master_task_id,
        source:         "google_sheets",
        status:         "pending",
        row_count:      rows.length,
      })
      .select("id")
      .single();

    if (batchErr || !batch) return { success: false, error: "Failed to create import batch" };

    const batchId = batch.id;
    const warnings: string[] = [];
    let imported = 0;

    // Determine target group_id
    let targetGroupId = group_id;
    const groupNameCache = new Map<string, string>();

    for (const row of rows) {
      try {
        // Resolve assignee email → UUID
        let assigneeId: string | null = null;
        if (row.assigned_to_email) {
          const { data: assigneeProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", row.assigned_to_email.toLowerCase())
            .single();
          if (assigneeProfile) {
            assigneeId = assigneeProfile.id;
          } else {
            warnings.push(`Assignee not found: ${row.assigned_to_email}`);
          }
        }

        // Parse due_date with multiple format attempts
        let parsedDueDate: string | null = null;
        if (row.due_date) {
          const formats = ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "d MMM yyyy"];
          for (const fmt of formats) {
            try {
              const d = dateParse(row.due_date, fmt, new Date());
              if (!isNaN(d.getTime())) {
                parsedDueDate = d.toISOString();
                break;
              }
            } catch {
              // try next format
            }
          }
          if (!parsedDueDate) {
            warnings.push(`Unparseable date for row "${row.title}": ${row.due_date}`);
          }
        }

        // Resolve/create group by name
        if (row.group_name && !targetGroupId) {
          const cacheKey = row.group_name.trim().toLowerCase();
          if (groupNameCache.has(cacheKey)) {
            targetGroupId = groupNameCache.get(cacheKey)!;
          } else {
            const { data: existingGroup } = await supabase
              .from("task_groups")
              .select("id")
              .eq("project_id", master_task_id)
              .ilike("title", row.group_name.trim())
              .single();

            if (existingGroup) {
              targetGroupId = existingGroup.id;
            } else {
              const { data: newGroup } = await supabase
                .from("task_groups")
                .insert({
                  project_id: master_task_id,
                  title:      sanitizeText(row.group_name.trim()),
                  position:   0,
                  created_by: user.id,
                })
                .select("id")
                .single();
              if (newGroup) targetGroupId = newGroup.id;
            }
            if (targetGroupId) groupNameCache.set(cacheKey, targetGroupId);
          }
        }

        // Map status
        const validStatuses: AtlasTaskStatus[] = [
          "todo", "in_progress", "in_review", "done", "blocked", "error", "cancelled",
        ];
        const mappedStatus: AtlasTaskStatus =
          row.status && validStatuses.includes(row.status.toLowerCase() as AtlasTaskStatus)
            ? (row.status.toLowerCase() as AtlasTaskStatus)
            : "todo";

        // Map priority
        const validPriorities = ["critical", "high", "medium", "low"];
        const mappedPriority = row.priority && validPriorities.includes(row.priority.toLowerCase())
          ? row.priority.toLowerCase()
          : "medium";

        await supabase.from("tasks").insert({
          project_id:        master_task_id,
          master_task_id,
          group_id:          targetGroupId ?? null,
          title:             sanitizeText(row.title),
          notes:             row.description ? sanitizeText(row.description) : null,
          unified_task_type: "subtask",
          atlas_status:      mappedStatus,
          priority:          mappedPriority,
          due_date:          parsedDueDate,
          assigned_to_users: assigneeId ? [assigneeId] : [user.id],
          domain:            domain,
          department:        department,
          created_by:        user.id,
          imported_from:     "google_sheets",
          import_batch_id:   batchId,
          status:            "pending",
          task_type:         "general_follow_up",
          progress:          0,
          progress_updates:  [],
          tags:              [],
          attachments:       [],
        });

        imported++;
      } catch (rowErr) {
        console.error("[createImportBatch] row error", rowErr, row.title);
        warnings.push(`Failed to import row: ${row.title}`);
      }
    }

    // Update batch status
    await supabase
      .from("import_batches")
      .update({
        status:       "completed",
        row_count:    imported,
        completed_at: new Date().toISOString(),
        error_log:    warnings.length > 0 ? { warnings } : null,
      })
      .eq("id", batchId);

    const { data: mtRow } = await supabase
      .from("tasks")
      .select("atlas_status")
      .eq("id", master_task_id)
      .maybeSingle();

    await insertSystemLog(master_task_id, `Import completed: ${imported} subtasks added from spreadsheet.`, {
      newStatus: ((mtRow?.atlas_status as AtlasTaskStatus) ?? "todo"),
    });

    revalidateAtlasTaskSurfaces(master_task_id);
    return { success: true, data: { batchId, imported, warnings: warnings.length } };
  } catch (err) {
    console.error("[createImportBatch]", err);
    return { success: false, error: "Import failed due to an unexpected error" };
  }
}

export async function getImportBatches(
  masterTaskId: string,
): Promise<ActionResult<ImportBatch[]>> {
  const parsed = uuidSchema.safeParse(masterTaskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase } = await getAuthUser();
    const { data, error } = await supabase
      .from("import_batches")
      .select("id, created_by, master_task_id, source, row_count, status, error_log, created_at, completed_at")
      .eq("master_task_id", parsed.data)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: "Failed to fetch import batches" };

    return { success: true, data: (data ?? []) as ImportBatch[] };
  } catch (err) {
    console.error("[getImportBatches]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export async function getMasterTaskAnalytics(
  masterTaskId: string,
): Promise<ActionResult<MasterTaskAnalytics>> {
  const parsed = uuidSchema.safeParse(masterTaskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase } = await getAuthUser();

    const { data: subtasks, error } = await supabase
      .from("tasks")
      .select("id, atlas_status, progress, assigned_to_users, due_date, created_at, updated_at")
      .eq("project_id", parsed.data)
      .eq("unified_task_type", "subtask");

    if (error) return { success: false, error: "Failed to fetch analytics" };

    const tasks = subtasks ?? [];
    const total = tasks.length;

    // By-status breakdown
    const byStatus: Record<AtlasTaskStatus, number> = {
      todo: 0, in_progress: 0, in_review: 0, done: 0,
      blocked: 0, error: 0, cancelled: 0,
    };
    for (const t of tasks) {
      const s = (t.atlas_status ?? "todo") as AtlasTaskStatus;
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    }

    const doneCount = byStatus.done;
    const completionPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    const now = new Date();
    const overdueCount = tasks.filter((t) => {
      if (!t.due_date) return false;
      const status = t.atlas_status as AtlasTaskStatus;
      if (status === "done" || status === "cancelled") return false;
      return new Date(t.due_date) < now;
    }).length;

    // By-assignee grouping (compute from assigned_to_users[0])
    const assigneeMap = new Map<string, { count: number; done: number; in_progress: number }>();
    for (const t of tasks) {
      const users = (t.assigned_to_users as string[] | null) ?? [];
      for (const uid of users) {
        const cur = assigneeMap.get(uid) ?? { count: 0, done: 0, in_progress: 0 };
        cur.count++;
        if (t.atlas_status === "done") cur.done++;
        if (t.atlas_status === "in_progress") cur.in_progress++;
        assigneeMap.set(uid, cur);
      }
    }

    const profileIds = [...assigneeMap.keys()];
    let profileData: Pick<Profile, "id" | "full_name">[] = [];
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);
      profileData = (profiles ?? []) as Pick<Profile, "id" | "full_name">[];
    }

    const byAssignee = profileData.map((p) => {
      const stats = assigneeMap.get(p.id) ?? { count: 0, done: 0, in_progress: 0 };
      return { profile: p, ...stats };
    });

    // Velocity: last 30 days, tasks completed by day
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const velocityMap = new Map<string, number>();
    for (const t of tasks) {
      if (t.atlas_status !== "done") continue;
      if (!t.updated_at) continue;
      const d = new Date(t.updated_at);
      if (d < thirtyDaysAgo) continue;
      const dayKey = d.toISOString().slice(0, 10);
      velocityMap.set(dayKey, (velocityMap.get(dayKey) ?? 0) + 1);
    }
    const velocity = [...velocityMap.entries()]
      .map(([date, completed]) => ({ date, completed }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: true,
      data: {
        total_subtasks:   total,
        by_status:        byStatus,
        completion_pct:   completionPct,
        by_assignee:      byAssignee,
        overdue_count:    overdueCount,
        velocity,
      },
    };
  } catch (err) {
    console.error("[getMasterTaskAnalytics]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────────────────────

export async function searchProfilesForTasks(
  query: string,
): Promise<{ id: string; full_name: string; role: string; job_title: string | null }[]> {
  try {
    const { supabase } = await getAuthUser();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role, job_title")
      .eq("is_active", true)
      .ilike("full_name", `%${sanitizeText(query)}%`)
      .limit(20);
    return (data ?? []) as { id: string; full_name: string; role: string; job_title: string | null }[];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKWARD-COMPAT STUBS
// These aliases preserve the old lib/actions/tasks.ts API surface so existing
// components that pre-date the Atlas Tasks migration continue to compile.
// Do NOT use in new code — import the canonical functions directly.
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use completePersonalTask */
export const completeTask = completePersonalTask;

/** @deprecated Use createPersonalTask */
export const createTask = createPersonalTask;

/** @deprecated Use updateSubTask */
export const updateTask = updateSubTask;

/** @deprecated Use deleteSubTask */
export const deleteTask = deleteSubTask;

/** Fetch a task with its lead + assignee profiles (used by the My Tasks detail sheet). */
export async function getTaskById(taskId: string): Promise<TaskWithLead | null> {
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

    const [enriched] = await enrichTasksWithAssignees(supabase, [data as Record<string, unknown>]);

    const assignees = ((enriched as Record<string, unknown>).assigned_to_users as string[] | null) ?? [];
    const isAssignee = assignees.includes(user.id);
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const isAdmin = (profile as { role?: string } | null)?.role === "admin";
    if (!isAssignee && !isAdmin) return null;

    return {
      ...enriched,
      progress_updates: (enriched as Record<string, unknown>).progress_updates ?? [],
    } as unknown as TaskWithLead;
  } catch {
    return null;
  }
}

/** Append a progress message to a task's progress_updates JSONB array (used by the My Tasks detail sheet). */
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
      .from("profiles").select("full_name").eq("id", user.id).single();

    const { data: task } = await supabase
      .from("tasks").select("assigned_to_users, progress_updates").eq("id", parsed.data).single();

    if (!task) return { success: false, error: "Task not found" };

    const assignees = ((task as Record<string, unknown>).assigned_to_users as string[] | null) ?? [];
    const { data: userProfile } = await supabase
      .from("profiles").select("role").eq("id", user.id).single();
    const isAdmin = (userProfile as { role?: string } | null)?.role === "admin";

    if (!assignees.includes(user.id) && !isAdmin)
      return { success: false, error: "Only the assignee or an admin can add progress" };

    const existing = ((task as Record<string, unknown>).progress_updates ?? []) as TaskProgressUpdate[];
    const newUpdate: TaskProgressUpdate = {
      timestamp: new Date().toISOString(),
      message:   sanitizeText(trimmed),
      user_id:   user.id,
      user_name: (profile as { full_name?: string } | null)?.full_name ?? "Unknown",
    };

    const { error } = await supabase
      .from("tasks")
      .update({ progress_updates: [...existing, newUpdate] })
      .eq("id", parsed.data);

    if (error) return { success: false, error: "Failed to add progress" };

    revalidatePath("/");
    revalidatePath("/tasks");
    return { success: true, update: newUpdate };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ── Daily Roster (old delegate-task view) ────────────────────────────────────

export interface DailyRosterTask {
  id: string;
  title: string;
  due_date: string | null;
  lead?: {
    id: string;
    first_name: string;
    last_name: string | null;
    domain?: string;
  } | null;
}

export interface AgentDailyRoster {
  overdue:   DailyRosterTask[];
  today:     DailyRosterTask[];
  upcoming:  DailyRosterTask[];
}

export async function getAgentDailyRoster(
  userId: string,
): Promise<AgentDailyRoster> {
  try {
    const { supabase } = await getAuthUser();
    const nowISO = new Date().toISOString();
    const todayEnd = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      new Date().getDate() + 1,
    ).toISOString();

    const { data } = await supabase
      .from("tasks")
      .select("id, title, due_date, lead_id, leads!tasks_lead_id_fkey(id, first_name, last_name, domain)")
      .eq("assigned_to", userId)
      .neq("status", "completed")
      .order("due_date", { ascending: true });

    const tasks: DailyRosterTask[] = (data ?? []).map((t) => ({
      id:       t.id,
      title:    t.title,
      due_date: t.due_date,
      lead:     Array.isArray(t.leads)
        ? (t.leads[0] ?? null)
        : (t.leads as DailyRosterTask["lead"] | null) ?? null,
    }));

    const overdue:  DailyRosterTask[] = [];
    const today:    DailyRosterTask[] = [];
    const upcoming: DailyRosterTask[] = [];

    for (const task of tasks) {
      if (!task.due_date) {
        upcoming.push(task);
      } else if (task.due_date < nowISO) {
        overdue.push(task);
      } else if (task.due_date < todayEnd) {
        today.push(task);
      } else {
        upcoming.push(task);
      }
    }

    return { overdue, today, upcoming };
  } catch {
    return { overdue: [], today: [], upcoming: [] };
  }
}

// ── Reminder / alert stubs ───────────────────────────────────────────────────

/** @deprecated Not implemented in Atlas Tasks — returns empty array */
export async function getTasksForReminders(): Promise<ActionResult<unknown[]>> {
  return { success: true, data: [] };
}

/** @deprecated Not implemented in Atlas Tasks — returns 0 */
export async function getMyOverdueTaskCount(): Promise<ActionResult<{ count: number }>> {
  return { success: true, data: { count: 0 } };
}

// ── FollowUp stubs (old lead follow-up workflow) ─────────────────────────────

/** @deprecated Not implemented in Atlas Tasks — no-op stub */
export async function processFollowUpAttempted(
  _taskId: string,
  _note?: string,
): Promise<ActionResult<undefined>> {
  return { success: false, error: "processFollowUpAttempted is deprecated. Use updateSubTaskStatus." };
}

/** @deprecated Not implemented in Atlas Tasks — no-op stub */
export async function processFollowUpNext(
  _taskId: string,
  _params: unknown,
): Promise<ActionResult<undefined>> {
  return { success: false, error: "processFollowUpNext is deprecated. Use updateSubTaskStatus." };
}

/** @deprecated Not implemented in Atlas Tasks — no-op stub */
export async function processFollowUpDisposition(
  _taskId: string,
  _params: unknown,
): Promise<ActionResult<undefined>> {
  return { success: false, error: "processFollowUpDisposition is deprecated. Use updateSubTaskStatus." };
}

// ── Admin task management stubs ──────────────────────────────────────────────

export interface TeamMemberForPicker {
  id:         string;
  full_name:  string;
  role:       string;
  domain:     string | null;
  department: string | null;
}

/** @deprecated Use getMasterTaskMembers or searchProfilesForTasks */
export async function getTeamMembersForAdmin(): Promise<
  ActionResult<TeamMemberForPicker[]>
> {
  try {
    const { supabase } = await getAuthUser();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role, domain, department")
      .order("full_name");
    return { success: true, data: (data ?? []) as unknown as TeamMemberForPicker[] };
  } catch (err) {
    console.error("[getTeamMembersForAdmin]", err);
    return { success: false, error: "Failed to fetch team members" };
  }
}

/** @deprecated Not implemented in Atlas Tasks — returns empty array */
export async function getLeadTasks(
  _leadId: string,
): Promise<ActionResult<unknown[]>> {
  return { success: true, data: [] };
}

// ── Legacy helpers (used by the "My Tasks" personal dashboard) ────────────────

async function enrichTasksWithAssignees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tasks: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const userIds = new Set<string>();
  for (const t of tasks) {
    const arr = (t.assigned_to_users as string[] | null) ?? [];
    for (const id of arr) userIds.add(id);
  }
  if (userIds.size === 0)
    return tasks.map((t) => ({ ...t, assigned_to_profiles: [], assigned_to_profile: null }));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("id", [...userIds]);

  const profileMap = new Map<string, { id: string; full_name: string; role: string }>();
  for (const p of profiles ?? []) profileMap.set(p.id, p);

  return tasks.map((t) => {
    const arr = ((t.assigned_to_users as string[] | null) ?? []) as string[];
    const profilesList = arr
      .map((id) => profileMap.get(id))
      .filter(Boolean) as { id: string; full_name: string; role: string }[];
    return {
      ...t,
      assigned_to_profiles: profilesList,
      assigned_to_profile:  profilesList[0] ?? null,
    };
  });
}

export async function getLegacyMyTasks(opts?: {
  domainFilter?: string | null;
}): Promise<unknown[]> {
  try {
    const { supabase, user } = await getAuthUser();

    let query = supabase
      .from("tasks")
      .select(
        "*, lead:leads!lead_id(id, first_name, last_name, phone_number, email, status, domain), created_by_profile:profiles!created_by(id, full_name, role)",
      )
      .contains("assigned_to_users", [user.id])
      .order("due_date", { ascending: true })
      .limit(250);

    if (opts?.domainFilter) {
      query = query.or(`lead_id.is.null,lead.domain.eq.${opts.domainFilter}`);
    }

    const { data, error } = await query;
    if (error) return [];
    return (await enrichTasksWithAssignees(supabase, (data ?? []) as Record<string, unknown>[]));
  } catch {
    return [];
  }
}

export async function getLeadsForTaskModal(opts?: {
  domainFilter?: string | null;
}): Promise<
  { id: string; first_name: string; last_name: string | null; phone_number: string; status: string }[]
> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, domain")
      .eq("id", user.id)
      .single();

    let query = supabase
      .from("leads")
      .select("id, first_name, last_name, phone_number, status")
      .not("status", "in", '("won","lost","trash")')
      .order("first_name", { ascending: true })
      .limit(100);

    if ((profile as { role?: string } | null)?.role === "agent") {
      query = query
        .eq("assigned_to", user.id)
        .eq("domain", (profile as { domain?: string } | null)?.domain ?? "indulge_concierge");
    } else if (opts?.domainFilter) {
      query = query.eq("domain", opts.domainFilter);
    }

    const { data } = await query;
    return (data ?? []) as { id: string; first_name: string; last_name: string | null; phone_number: string; status: string }[];
  } catch {
    return [];
  }
}

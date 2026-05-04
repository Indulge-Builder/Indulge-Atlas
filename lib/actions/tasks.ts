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

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { sanitizeText } from "@/lib/utils/sanitize";
import { PERSONAL_SOP_SELF_TAG } from "@/lib/constants/personalTaskTags";
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
  CreatePersonalSOPTemplateSchema,
  CreateSOPTemplateSchema,
  AddMasterTaskMemberSchema,
  CreateImportBatchSchema,
  uuidSchema,
  createDailyPersonalTaskSchema,
  type CreateDailyPersonalTaskInput,
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
  Project,
  ProjectTask,
  TaskComment,
  ProjectProgressUpdate,
  TaskStatus,
  TaskAttachment,
} from "@/lib/types/database";
import { ATLAS_SYSTEM_AUTHOR_ID, isPrivilegedRole } from "@/lib/types/database";
import type { EmployeeDepartment, IndulgeDomain } from "@/lib/types/database";
import { departmentsVisibleForDomain } from "@/lib/constants/departments";
import { isAfter } from "date-fns";
import { insertTaskNotification } from "@/lib/services/taskNotificationInsert";

/** Never persist whitespace-only department/domain; fall back to profile when submitted value is blank. */
function resolvedDepartment(
  submitted: string | null | undefined,
  profileDepartment: string | null,
): string | null {
  const s = typeof submitted === "string" ? submitted.trim() : "";
  if (s !== "") return s;
  const p = typeof profileDepartment === "string" ? profileDepartment.trim() : "";
  return p !== "" ? p : null;
}

function resolvedDomain(
  submitted: string | null | undefined,
  profileDomain: string,
): string {
  const s = typeof submitted === "string" ? submitted.trim() : "";
  if (s !== "") return s;
  const p = typeof profileDomain === "string" ? profileDomain.trim() : "";
  return p !== "" ? p : "indulge_concierge";
}

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

function isPrivilegedOrManager(role: string): boolean {
  return ["admin", "founder", "manager"].includes(role);
}

/** Invalidates agent dashboard, tasks index, insights, and master detail after Atlas task mutations. */
function revalidateAtlasTaskSurfaces(masterTaskId: string) {
  revalidatePath("/", "page");
  revalidatePath("/tasks", "page");
  revalidatePath("/task-insights", "page");
  revalidatePath(`/tasks/${masterTaskId}`, "page");
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
    const { supabase, user, role, domain, department } = await getAuthUser();
    const d = parsed.data;

    if (role === "agent" || role === "guest") {
      if (!department) {
        return {
          success: false,
          error: "Your profile must include a department to create master tasks.",
        };
      }
      if (d.department !== department) {
        return {
          success: false,
          error: "You can only create tasks in your own department.",
        };
      }
      if (d.domain !== domain) {
        return {
          success: false,
          error: "You can only create tasks in your own domain.",
        };
      }
    }

    if (role === "manager") {
      if (d.domain !== domain) {
        return { success: false, error: "Invalid domain for your account." };
      }
      const allowed = departmentsVisibleForDomain(domain as IndulgeDomain);
      if (!allowed.includes(d.department as EmployeeDepartment)) {
        return {
          success: false,
          error: "That department is not available for your domain.",
        };
      }
    }

    const taskDomain = resolvedDomain(d.domain, domain);
    const taskDepartment = resolvedDepartment(d.department, department);
    if (!taskDepartment) {
      return { success: false, error: "Department and domain are required." };
    }

    // Insert a tasks row with unified_task_type = 'master'
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .insert({
        title:              sanitizeText(d.title),
        notes:              d.description ? sanitizeText(d.description) : null,
        unified_task_type:  "master",
        atlas_status:       "todo",
        domain:             taskDomain,
        department:         taskDepartment,
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
      domain:     taskDomain,
      department: taskDepartment,
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

    revalidateAtlasTaskSurfaces(task.id);
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

    const subtask_count = enrichedSubtasks.length;
    const completed_subtask_count = enrichedSubtasks.filter(
      (t) => (t.atlas_status as string) === "done",
    ).length;

    return {
      success: true,
      data: {
        masterTask: {
          ...(masterTask as Record<string, unknown>),
          subtask_count,
          completed_subtask_count,
        } as unknown as MasterTask,
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
    const { supabase, user, role, domain: profileDomain, department: profileDepartment } =
      await getAuthUser();
    const hasAccess = await assertMasterTaskAccess(supabase, idParsed.data, user.id, role, ["owner", "manager"]);
    if (!hasAccess) return { success: false, error: "Not authorized" };

    const f = fieldsParsed.data;
    const updateData: Record<string, unknown> = {};
    if (f.title !== undefined)       updateData.title = sanitizeText(f.title);
    if (f.description !== undefined) updateData.notes = f.description ? sanitizeText(f.description) : null;
    if (f.cover_color !== undefined) updateData.cover_color = f.cover_color;
    if (f.icon_key !== undefined)    updateData.icon_key = f.icon_key;
    if (f.due_date !== undefined)    updateData.due_date = f.due_date;
    if (f.atlas_status !== undefined) updateData.atlas_status = f.atlas_status;

    if (f.domain !== undefined || f.department !== undefined) {
      const { data: cur } = await supabase
        .from("tasks")
        .select("domain, department")
        .eq("id", idParsed.data)
        .single();

      const mergedDomain =
        f.domain !== undefined
          ? resolvedDomain(
              typeof f.domain === "string"
                ? f.domain
                : f.domain === null
                  ? ""
                  : String(f.domain),
              (cur?.domain as string) ?? profileDomain,
            )
          : ((cur?.domain as string) ?? profileDomain);
      const mergedDept =
        f.department !== undefined
          ? resolvedDepartment(
              typeof f.department === "string"
                ? f.department
                : f.department === null
                  ? ""
                  : String(f.department),
              (cur?.department as string | null) ?? profileDepartment,
            )
          : ((cur?.department as string | null) ?? profileDepartment);

      if (role === "agent" || role === "guest") {
        if (!profileDepartment) {
          return {
            success: false,
            error: "Your profile must include a department to update master tasks.",
          };
        }
        if (mergedDept !== profileDepartment) {
          return {
            success: false,
            error: "You can only keep tasks in your own department.",
          };
        }
        if (mergedDomain !== profileDomain) {
          return {
            success: false,
            error: "You can only keep tasks in your own domain.",
          };
        }
      }

      if (role === "manager") {
        if (mergedDomain !== profileDomain) {
          return { success: false, error: "Invalid domain for your account." };
        }
        if (
          mergedDept &&
          !departmentsVisibleForDomain(profileDomain as IndulgeDomain).includes(
            mergedDept as EmployeeDepartment,
          )
        ) {
          return {
            success: false,
            error: "That department is not available for your domain.",
          };
        }
      }

      if (!mergedDept) {
        return { success: false, error: "Department is required." };
      }

      if (f.domain !== undefined) updateData.domain = mergedDomain;
      if (f.department !== undefined) updateData.department = mergedDept;
    }

    const { error } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("id", idParsed.data)
      .eq("unified_task_type", "master");

    if (error) return { success: false, error: "Failed to update task" };

    // Mirror title/description/colors/domain/department to projects table
    if (
      f.title !== undefined ||
      f.description !== undefined ||
      f.cover_color !== undefined ||
      f.icon_key !== undefined ||
      f.due_date !== undefined ||
      f.domain !== undefined ||
      f.department !== undefined
    ) {
      const projUpdate: Record<string, unknown> = {};
      if (f.title !== undefined) projUpdate.title = sanitizeText(f.title!);
      if (f.description !== undefined)
        projUpdate.description = f.description ? sanitizeText(f.description) : null;
      if (f.cover_color !== undefined) projUpdate.color = f.cover_color;
      if (f.icon_key !== undefined)    projUpdate.icon = f.icon_key;
      if (f.due_date !== undefined)    projUpdate.due_date = f.due_date;
      if (f.domain !== undefined)      projUpdate.domain = updateData.domain;
      if (f.department !== undefined)  projUpdate.department = updateData.department;
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

    revalidateAtlasTaskSurfaces(parsed.data);
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

    const subDomain = resolvedDomain(undefined, domain);
    const subDepartment = resolvedDepartment(undefined, department);

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
        domain:            subDomain,
        department:        subDepartment,
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
    task: SubTask | PersonalTask;
    masterTaskTitle: string | null;
    masterTaskGroupTitle: string | null;
    remarks: TaskRemark[];
    assigneeProfile: Pick<Profile, "id" | "full_name" | "job_title"> | null;
    checklist: ChecklistItem[];
    workspaceMembers: Pick<Profile, "id" | "full_name" | "job_title">[];
    canAssignSubtask: boolean;
  }>
> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase, user, role } = await getAuthUser();

    // Fetch task + remarks in parallel
    const [
      { data: task, error: taskErr },
      { data: remarks },
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, project_id, group_id, parent_task_id, title, notes, atlas_status, priority, progress, due_date, assigned_to_users, estimated_minutes, actual_minutes, position, tags, attachments, created_by, created_at, updated_at, domain, department, master_task_id, imported_from, import_batch_id, unified_task_type",
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

    let assignedToProfiles: Pick<Profile, "id" | "full_name" | "role">[] = [];
    if (assigneeIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", assigneeIds);
      const byId = new Map((profs ?? []).map((p) => [p.id as string, p]));
      assignedToProfiles = assigneeIds
        .map((id) => byId.get(id))
        .filter(Boolean) as Pick<Profile, "id" | "full_name" | "role">[];
    }

    // Resolve master task title + group title for breadcrumb
    let masterTaskTitle: string | null = null;
    let masterTaskGroupTitle: string | null = null;
    let workspaceMembers: Pick<Profile, "id" | "full_name" | "job_title">[] = [];
    let canAssignSubtask = false;
    const masterTaskId = typedTask.project_id as string | null;
    const groupId = typedTask.group_id as string | null;
    if (masterTaskId) {
      canAssignSubtask =
        isPrivilegedOrManager(role) ||
        (await assertMasterTaskAccess(supabase, masterTaskId, user.id, role, ["owner", "manager"]));

      const [{ data: masterRow }, { data: groupRow }, { data: memberRows }] = await Promise.all([
        supabase.from("tasks").select("title").eq("id", masterTaskId).eq("unified_task_type", "master").single(),
        groupId
          ? supabase.from("task_groups").select("title").eq("id", groupId).single()
          : Promise.resolve({ data: null }),
        supabase
          .from("project_members")
          .select("profile:profiles!user_id(id, full_name, job_title)")
          .eq("project_id", masterTaskId),
      ]);
      masterTaskTitle = masterRow?.title ?? null;
      masterTaskGroupTitle = (groupRow as { title?: string } | null)?.title ?? null;

      workspaceMembers = (memberRows ?? [])
        .map((row) => {
          const raw = row.profile as unknown;
          const prof = Array.isArray(raw) ? raw[0] : raw;
          if (!prof || typeof prof !== "object" || !("id" in prof)) return null;
          const p = prof as { id: string; full_name: string; job_title: string | null };
          return { id: p.id, full_name: p.full_name, job_title: p.job_title };
        })
        .filter((x): x is Pick<Profile, "id" | "full_name" | "job_title"> => x !== null);
      workspaceMembers.sort((a, b) =>
        (a.full_name ?? "").localeCompare(b.full_name ?? "", undefined, { sensitivity: "base" }),
      );
    }

    // Extract checklist from attachments JSONB (stored as array under key 'checklist')
    const attachments = (typedTask.attachments as unknown[] | null) ?? [];
    const checklist: ChecklistItem[] = (attachments as ChecklistItem[]).filter(
      (item): item is ChecklistItem =>
        typeof item === "object" && item !== null && "id" in item && "text" in item && "checked" in item,
    );

    const unifiedType =
      typedTask.unified_task_type === "personal" ? "personal" : "subtask";

    return {
      success: true,
      data: {
        task: {
          ...typedTask,
          unified_task_type:      unifiedType,
          assigned_to_profiles: assignedToProfiles,
        } as unknown as SubTask | PersonalTask,
        masterTaskTitle,
        masterTaskGroupTitle,
        remarks:             (remarks ?? []) as unknown as TaskRemark[],
        assigneeProfile,
        checklist,
        workspaceMembers,
        canAssignSubtask,
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

    if (f.assigned_to_users !== undefined) {
      const pid = task.project_id as string;
      const canAssign =
        isPrivilegedOrManager(role) ||
        (await assertMasterTaskAccess(supabase, pid, user.id, role, ["owner", "manager"]));
      if (!canAssign)
        return { success: false, error: "Only workspace owners or managers can assign tasks" };

      const ids = f.assigned_to_users;
      if (ids.length > 0) {
        const { data: memberRows } = await supabase
          .from("project_members")
          .select("user_id")
          .eq("project_id", pid)
          .in("user_id", ids);
        const ok = new Set((memberRows ?? []).map((r) => r.user_id as string));
        if (!ids.every((id) => ok.has(id)))
          return { success: false, error: "Assignees must be workspace members" };
      }
      updateData.assigned_to_users = ids;
    }

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

      if (f.assigned_to_users !== undefined) {
        const prevIds = ((prev.assigned_to_users as string[] | null) ?? []).slice().sort().join(",");
        const nextIds = f.assigned_to_users.slice().sort().join(",");
        if (prevIds !== nextIds) {
          const firstNew = f.assigned_to_users[0];
          if (firstNew) {
            const { data: assigneeProfile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", firstNew)
              .single();
            const name =
              (assigneeProfile as { full_name?: string } | null)?.full_name ?? "a team member";
            await insertSystemLog(idParsed.data, `Task reassigned to ${name}.`, {
              newStatus,
            });
          } else {
            await insertSystemLog(idParsed.data, `Assignment cleared.`, { newStatus });
          }
        }
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
      .select("project_id, assigned_to_users, created_by, progress, atlas_status, attachments")
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
    const previousAttachments = task.attachments;
    const finalProgress = new_progress ?? (new_status === "done" ? 100 : currentProgress);

    // Build task update — optionally include checklist in attachments
    const taskUpdate: Record<string, unknown> = {
      atlas_status: new_status,
      progress:     finalProgress,
    };
    if (checklist !== undefined) {
      taskUpdate.attachments = checklist;
    }

    const { error: taskErr } = await supabase.from("tasks").update(taskUpdate).eq("id", task_id);
    if (taskErr) return { success: false, error: "Failed to update status" };

    const { data: remarkRow, error: remarkErr } = await supabase
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
      .single();

    if (remarkErr) {
      console.error("[updateSubTaskStatus] remark insert failed", remarkErr);
      const revert: Record<string, unknown> = {
        atlas_status: previousStatus,
        progress:     currentProgress,
      };
      if (checklist !== undefined) {
        revert.attachments = previousAttachments ?? null;
      }
      await supabase.from("tasks").update(revert).eq("id", task_id);
      return {
        success: false,
        error:
          remarkErr.message ??
          "Could not save your note (permission or network). Task changes were reverted.",
      };
    }

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

/** Project board / sheet — `(taskId, progress, note?)` for client components. */
export async function updateTaskProgress(
  taskId: string,
  newProgress: number,
  note?: string,
): Promise<ActionResult> {
  return updateSubTaskProgress({ task_id: taskId, new_progress: newProgress, note });
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
    const assigneeId = d.assigned_to ?? user.id;
    const isDelegated = Boolean(d.assigned_to && d.assigned_to !== user.id);
    const tagList = (d.tags ?? []).map((t) => sanitizeText(t)).filter(Boolean);
    if (isDelegated) {
      tagList.push(sanitizeText(`delegated_by:${user.id}`));
    }

    if (d.assigned_to && d.assigned_to !== user.id) {
      const { data: peer, error: peerErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", d.assigned_to)
        .eq("is_active", true)
        .maybeSingle();
      if (peerErr || !peer) return { success: false, error: "Assignee not found or inactive." };
    }

    const persDomain = resolvedDomain(undefined, domain);
    const persDepartment = resolvedDepartment(undefined, department);
    const isDaily = Boolean(d.is_daily);
    const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title:             sanitizeText(d.title),
        notes:             d.description ? sanitizeText(d.description) : null,
        unified_task_type: "personal",
        atlas_status:      "todo",
        priority:          d.priority,
        due_date:          d.due_date ?? null,
        assigned_to_users: [assigneeId],
        domain:            persDomain,
        department:        persDepartment,
        /** Assignee owns the row so “My tasks” / Daily SOP / RLS stay assignee-scoped; delegator in `delegated_by:` tag. */
        created_by:        isDelegated ? assigneeId : user.id,
        status:            "pending",
        task_type:         "general_follow_up",
        progress:          0,
        progress_updates:  [],
        tags:              tagList,
        attachments:       [],
        ...(isDaily
          ? {
              is_daily: true,
              daily_date: todayIST,
              visibility: "personal" as const,
              is_daily_sop_template: false,
            }
          : {}),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[createPersonalTask] supabase error:", error);
      return { success: false, error: error?.message ?? "Failed to create task" };
    }

    revalidatePath("/", "page");
    revalidatePath("/tasks", "page");
    revalidatePath("/task-insights", "page");
    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error("[createPersonalTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

function canManageDailySOPs(role: string): boolean {
  return role === "manager" || isPrivilegedRole(role);
}

/**
 * Idempotent: for each self-tagged personal SOP template, inserts today’s instance
 * if missing (mirrors spawn_daily_sop_instances for a single assignee).
 */
async function ensurePersonalSelfSOPInstancesForToday(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  domain: string,
  department: string | null,
): Promise<void> {
  const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dueDateIso = new Date(`${todayIST}T12:00:00+05:30`).toISOString();

  const { data: templates, error: tErr } = await supabase
    .from("tasks")
    .select("id, title, notes, priority, domain, department, task_type, tags, attachments")
    .eq("unified_task_type", "personal")
    .eq("is_daily_sop_template", true)
    .eq("created_by", userId)
    .contains("tags", [PERSONAL_SOP_SELF_TAG])
    .is("archived_at", null);

  if (tErr || !templates?.length) return;

  const persDomain = resolvedDomain(undefined, domain);

  for (const tmpl of templates) {
    const tplId = tmpl.id as string;
    const marker = `sop_tpl:${tplId}`;

    const { data: existing } = await supabase
      .from("tasks")
      .select("id")
      .eq("unified_task_type", "personal")
      .eq("is_daily_sop_template", false)
      .eq("is_daily", true)
      .eq("daily_date", todayIST)
      .contains("assigned_to_users", [userId])
      .contains("tags", [marker])
      .maybeSingle();

    if (existing) continue;

    const dept =
      typeof tmpl.department === "string" && tmpl.department.trim() !== ""
        ? tmpl.department.trim()
        : resolvedDepartment(undefined, department);
    const dom =
      typeof tmpl.domain === "string" && tmpl.domain.trim() !== ""
        ? tmpl.domain.trim()
        : persDomain;

    const tmplTags = Array.isArray(tmpl.tags) ? (tmpl.tags as string[]) : [];
    const mergedTags = [...tmplTags.filter((t) => !t.startsWith("sop_tpl:")), marker];

    const { error: insErr } = await supabase.from("tasks").insert({
      title:                 sanitizeText(String(tmpl.title ?? "")),
      notes:                 tmpl.notes ? sanitizeText(String(tmpl.notes)) : null,
      unified_task_type:     "personal",
      atlas_status:          "todo",
      status:                "pending",
      priority:              (tmpl.priority as string) ?? "medium",
      due_date:              dueDateIso,
      assigned_to_users:     [userId],
      created_by:            userId,
      domain:                dom,
      department:            dept,
      task_type:             (tmpl.task_type as string) ?? "general_follow_up",
      progress:              0,
      progress_updates:      [],
      tags:                  mergedTags,
      attachments:           Array.isArray(tmpl.attachments) ? tmpl.attachments : [],
      visibility:            "personal",
      is_daily:              true,
      daily_date:            todayIST,
      is_daily_sop_template: false,
    });

    if (insErr) console.error("[ensurePersonalSelfSOPInstancesForToday]", insErr);
  }
}

/** Manager / admin / founder: create a daily SOP template for a department (cron clones to agents). */
export async function createSOPTemplate(
  params: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSOPTemplateSchema.safeParse(params);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { supabase, user, role, domain, department } = await getAuthUser();
    if (!canManageDailySOPs(role))
      return { success: false, error: "Not authorized" };

    const d = parsed.data;
    const persDomain = resolvedDomain(undefined, domain);
    const checklist = d.checklist ?? [];
    const attachments = checklist.map((text) => ({
      id:      randomUUID(),
      text:    sanitizeText(text),
      checked: false,
    }));

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title:                 sanitizeText(d.title),
        notes:                 d.description ? sanitizeText(d.description) : null,
        unified_task_type:     "personal",
        atlas_status:          "todo",
        priority:              d.priority,
        due_date:              null,
        assigned_to_users:     [user.id],
        domain:                persDomain,
        department:            d.department,
        created_by:            user.id,
        status:                "pending",
        task_type:             "general_follow_up",
        progress:              0,
        progress_updates:      [],
        tags:                  [],
        attachments,
        visibility:            "personal",
        is_daily_sop_template: true,
        is_daily:              false,
        daily_date:            null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[createSOPTemplate]", error);
      return { success: false, error: error?.message ?? "Failed to save template" };
    }

    revalidatePath("/tasks", "page");
    return { success: true, data: { id: data.id as string } };
  } catch (err) {
    console.error("[createSOPTemplate]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export type SOPTemplateRow = {
  id: string;
  title: string;
  notes: string | null;
  department: string;
  created_at: string;
  checklistCount: number;
};

export async function listSOPTemplates(): Promise<ActionResult<SOPTemplateRow[]>> {
  try {
    const { supabase, role, department } = await getAuthUser();
    if (!canManageDailySOPs(role)) return { success: true, data: [] };

    let q = supabase
      .from("tasks")
      .select("id, title, notes, department, created_at, attachments")
      .eq("unified_task_type", "personal")
      .eq("is_daily_sop_template", true)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (!isPrivilegedRole(role)) {
      const dept = resolvedDepartment(undefined, department);
      q = q.eq("department", dept);
    }

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((r) => {
      const att = (r.attachments as unknown[] | null) ?? [];
      return {
        id:             r.id as string,
        title:          r.title as string,
        notes:          (r.notes as string | null) ?? null,
        department:     (r.department as string) ?? "",
        created_at:     r.created_at as string,
        checklistCount: Array.isArray(att) ? att.length : 0,
      };
    });

    return { success: true, data: rows };
  } catch (err) {
    console.error("[listSOPTemplates]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function deleteSOPTemplate(taskId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase, user, role } = await getAuthUser();
    if (!canManageDailySOPs(role)) return { success: false, error: "Not authorized" };

    let q = supabase
      .from("tasks")
      .delete()
      .eq("id", parsed.data)
      .eq("is_daily_sop_template", true);

    if (!isPrivilegedRole(role)) {
      q = q.eq("created_by", user.id);
    }

    const { error } = await q;
    if (error) return { success: false, error: error.message };

    revalidatePath("/tasks", "page");
    return { success: true };
  } catch (err) {
    console.error("[deleteSOPTemplate]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export type PersonalSOPTemplateRow = { id: string; title: string; created_at: string };

/** Agent-owned daily SOP line items (templates for self-spawn; tagged personal_sop_self). */
export async function getPersonalSOPTemplates(): Promise<ActionResult<PersonalSOPTemplateRow[]>> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, created_at")
      .eq("unified_task_type", "personal")
      .eq("is_daily_sop_template", true)
      .eq("created_by", user.id)
      .contains("tags", [PERSONAL_SOP_SELF_TAG])
      .is("archived_at", null)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map((r) => ({
        id:         r.id as string,
        title:      r.title as string,
        created_at: r.created_at as string,
      })),
    };
  } catch (err) {
    console.error("[getPersonalSOPTemplates]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function createPersonalSOPTemplate(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = CreatePersonalSOPTemplateSchema.safeParse(
    typeof input === "string" ? { title: input } : input,
  );
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { supabase, user, domain, department } = await getAuthUser();
    const persDomain = resolvedDomain(undefined, domain);
    const persDepartment = resolvedDepartment(undefined, department);

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title:                 sanitizeText(parsed.data.title),
        notes:                 null,
        unified_task_type:     "personal",
        atlas_status:          "todo",
        priority:              "medium",
        due_date:              null,
        assigned_to_users:     [user.id],
        domain:                persDomain,
        department:            persDepartment,
        created_by:            user.id,
        status:                "pending",
        task_type:             "general_follow_up",
        progress:              0,
        progress_updates:      [],
        tags:                  [PERSONAL_SOP_SELF_TAG],
        attachments:           [],
        visibility:            "personal",
        is_daily_sop_template: true,
        is_daily:              false,
        daily_date:            null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[createPersonalSOPTemplate]", error);
      return { success: false, error: error?.message ?? "Failed to save" };
    }

    await ensurePersonalSelfSOPInstancesForToday(supabase, user.id, domain, department);

    revalidatePath("/", "page");
    revalidatePath("/tasks", "page");
    revalidatePath("/task-insights", "page");
    return { success: true, data: { id: data.id as string } };
  } catch (err) {
    console.error("[createPersonalSOPTemplate]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function deletePersonalSOPTemplate(taskId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase, user } = await getAuthUser();
    const templateId = parsed.data;
    const marker = `sop_tpl:${templateId}`;

    // Spawned checklist rows for today (and past days) are separate task rows tagged with
    // `sop_tpl:<templateId>`. Removing only the template leaves those instances visible.
    const { error: instanceErr } = await supabase
      .from("tasks")
      .delete()
      .eq("created_by", user.id)
      .eq("unified_task_type", "personal")
      .eq("is_daily_sop_template", false)
      .eq("is_daily", true)
      .contains("tags", [marker]);

    if (instanceErr) return { success: false, error: instanceErr.message };

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", templateId)
      .eq("created_by", user.id)
      .eq("unified_task_type", "personal")
      .eq("is_daily_sop_template", true)
      .contains("tags", [PERSONAL_SOP_SELF_TAG]);

    if (error) return { success: false, error: error.message };

    revalidatePath("/", "page");
    revalidatePath("/tasks", "page");
    revalidatePath("/task-insights", "page");
    return { success: true };
  } catch (err) {
    console.error("[deletePersonalSOPTemplate]", err);
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
      .is("parent_group_task_id", null)
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

export async function getMyTasks(): Promise<ActionResult<{ personalTasks: PersonalTask[] }>> {
  try {
    const { supabase, user } = await getAuthUser();

    const personalRes = await supabase
      .from("tasks")
      .select(
        "id, title, notes, unified_task_type, atlas_status, priority, due_date, progress, created_by, assigned_to_users, created_at, updated_at, visibility, is_daily, daily_date, is_daily_sop_template, tags",
      )
      .eq("unified_task_type", "personal")
      .eq("is_daily_sop_template", false)
      .eq("is_daily", false)
      // Assignee-only list: delegated rows use assignee as `created_by` + optional `delegated_by:` tag.
      .contains("assigned_to_users", [user.id])
      .neq("atlas_status", "cancelled")
      .order("priority", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });

    if (personalRes.error) return { success: false, error: "Failed to fetch tasks" };

    const personalTasks = ((personalRes.data ?? []) as unknown as PersonalTask[]).filter((t) =>
      ((t.assigned_to_users as string[] | null) ?? []).includes(user.id),
    );

    return {
      success: true,
      data: {
        personalTasks,
      },
    };
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

    revalidatePath("/", "page");
    revalidatePath("/tasks", "page");
    revalidatePath("/task-insights", "page");
    return { success: true };
  } catch (err) {
    console.error("[completePersonalTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/** Restore a completed personal task to the active list (assignee only). */
export async function reopenPersonalTask(taskId: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };

  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("tasks")
      .update({ atlas_status: "todo", progress: 0 })
      .eq("id", parsed.data)
      .eq("unified_task_type", "personal")
      .eq("atlas_status", "done")
      .contains("assigned_to_users", [user.id]);

    if (error) return { success: false, error: "Failed to reopen task" };

    revalidatePath("/", "page");
    revalidatePath("/tasks", "page");
    revalidatePath("/task-insights", "page");
    return { success: true };
  } catch (err) {
    console.error("[reopenPersonalTask]", err);
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

        // Map status — spreadsheet may use legacy labels
        const raw = row.status?.trim().toLowerCase().replace(/\s+/g, "_") ?? "todo";
        const legacyToCanonical: Record<string, AtlasTaskStatus> = {
          in_review: "in_progress",
          blocked: "in_progress",
        };
        const normalized = legacyToCanonical[raw] ?? raw;
        const validStatuses: AtlasTaskStatus[] = [
          "todo",
          "in_progress",
          "done",
          "error",
          "cancelled",
        ];
        const mappedStatus: AtlasTaskStatus = validStatuses.includes(normalized as AtlasTaskStatus)
          ? (normalized as AtlasTaskStatus)
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
      todo: 0,
      in_progress: 0,
      done: 0,
      error: 0,
      cancelled: 0,
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
      .from("tasks")
      .select("assigned_to_users, progress_updates, project_id, unified_task_type")
      .eq("id", parsed.data)
      .single();

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

    const row = task as {
      project_id?: string | null;
      unified_task_type?: string | null;
    };
    const pid = row.project_id;
    const ut = row.unified_task_type;
    if (ut === "master") {
      revalidateAtlasTaskSurfaces(parsed.data);
    } else if (ut === "subtask" && pid) {
      revalidateAtlasTaskSurfaces(pid);
    } else {
      revalidatePath("/", "page");
      revalidatePath("/tasks", "page");
      revalidatePath("/task-insights", "page");
    }
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
export async function getTasksForReminders(): Promise<
  ActionResult<TaskWithLead[]>
> {
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
): Promise<ActionResult<TaskWithLead[]>> {
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

// ─────────────────────────────────────────────────────────────────────────────
// Project board (CRM /projects) — `projects` table + task_comments + children
// ─────────────────────────────────────────────────────────────────────────────

function mapAtlasToProjectStatus(
  atlas: AtlasTaskStatus,
  dueDate: string | null,
): TaskStatus {
  if (atlas === "done" || atlas === "cancelled") return "completed";
  if (dueDate && isAfter(new Date(), new Date(dueDate))) return "overdue";
  return "pending";
}

function rowToProjectTask(
  row: Record<string, unknown>,
  profileMap: Map<string, Pick<Profile, "id" | "full_name" | "role">>,
): ProjectTask {
  const atlas = (row.atlas_status as AtlasTaskStatus) ?? "todo";
  const due = (row.due_date as string | null) ?? null;
  const userIds = (row.assigned_to_users as string[] | null) ?? [];
  return {
    id:                row.id as string,
    project_id:        (row.project_id as string) ?? "",
    group_id:          (row.group_id as string | null) ?? null,
    parent_task_id:    (row.parent_task_id as string | null) ?? null,
    title:             (row.title as string) ?? "",
    notes:             (row.notes as string | null) ?? null,
    status:            mapAtlasToProjectStatus(atlas, due),
    priority:          (row.priority as ProjectTask["priority"]) ?? "medium",
    progress:          (row.progress as number) ?? 0,
    due_date:          due,
    assigned_to_users: userIds,
    estimated_minutes: (row.estimated_minutes as number | null) ?? null,
    actual_minutes:    (row.actual_minutes as number | null) ?? null,
    position:          (row.position as number) ?? 0,
    tags:              (row.tags as string[]) ?? [],
    attachments:       (Array.isArray(row.attachments) ? row.attachments : []) as unknown as TaskAttachment[],
    created_by:        (row.created_by as string | null) ?? null,
    created_at:        (row.created_at as string) ?? "",
    updated_at:        (row.updated_at as string) ?? "",
    assigned_to_profiles: userIds
      .map((id) => profileMap.get(id))
      .filter(Boolean) as Pick<Profile, "id" | "full_name" | "role">[],
  };
}

/** Project header + groups + members (projects table; id matches master task id). */
export async function getProject(
  projectId: string,
): Promise<ActionResult<Project>> {
  const parsed = uuidSchema.safeParse(projectId);
  if (!parsed.success) return { success: false, error: "Invalid project ID" };
  try {
    const { supabase, user, role } = await getAuthUser();
    const canView = await assertMasterTaskAccess(
      supabase,
      parsed.data,
      user.id,
      role,
    );
    if (!canView) return { success: false, error: "Not found" };

    const { data: proj, error: pErr } = await supabase
      .from("projects")
      .select("id, title, description, status, owner_id, department, domain, color, icon, due_date, created_at, updated_at")
      .eq("id", parsed.data)
      .single();

    if (pErr || !proj) return { success: false, error: "Not found" };

    const [{ data: groups }, { data: members }] = await Promise.all([
      supabase
        .from("task_groups")
        .select("id, project_id, title, description, status, position, due_date, created_by, created_at, updated_at")
        .eq("project_id", parsed.data)
        .order("position", { ascending: true }),
      supabase
        .from("project_members")
        .select("id, project_id, user_id, role, added_by, added_at, profile:profiles!user_id(id, full_name, role)")
        .eq("project_id", parsed.data),
    ]);

    return {
      success: true,
      data: {
        ...(proj as unknown as Project),
        task_groups: (groups ?? []) as unknown as TaskGroup[],
        members:     (members ?? []) as unknown as Project["members"],
      },
    };
  } catch (err) {
    console.error("[getProject]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/** Top-level board tasks (subtasks in groups, not nested under another subtask). */
export async function getProjectTasks(
  projectId: string,
): Promise<ActionResult<ProjectTask[]>> {
  const parsed = uuidSchema.safeParse(projectId);
  if (!parsed.success) return { success: false, error: "Invalid project ID" };
  try {
    const { supabase, user, role } = await getAuthUser();
    if (!(await assertMasterTaskAccess(supabase, parsed.data, user.id, role)))
      return { success: false, error: "Not found" };

    const { data: rows, error } = await supabase
      .from("tasks")
      .select(
        "id, project_id, group_id, parent_task_id, title, notes, atlas_status, priority, progress, due_date, assigned_to_users, estimated_minutes, actual_minutes, position, tags, attachments, created_by, created_at, updated_at",
      )
      .eq("project_id", parsed.data)
      .eq("unified_task_type", "subtask")
      .is("parent_task_id", null)
      .order("position", { ascending: true });

    if (error) return { success: false, error: "Failed to load tasks" };

    const allUserIds = new Set<string>();
    for (const r of rows ?? []) {
      for (const id of (r.assigned_to_users as string[] | null) ?? []) {
        allUserIds.add(id);
      }
    }
    let profileMap = new Map<string, Pick<Profile, "id" | "full_name" | "role">>();
    if (allUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", [...allUserIds]);
      for (const p of profiles ?? [])
        profileMap.set(p.id, p as Pick<Profile, "id" | "full_name" | "role">);
    }

    return {
      success: true,
      data:   (rows ?? []).map((r) => rowToProjectTask(r as unknown as Record<string, unknown>, profileMap)),
    };
  } catch (err) {
    console.error("[getProjectTasks]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getTaskDetail(
  taskId: string,
): Promise<
  ActionResult<{
    task: ProjectTask;
    comments: TaskComment[];
    progress_updates: ProjectProgressUpdate[];
    sub_tasks: ProjectTask[];
  }>
> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return { success: false, error: "Invalid task ID" };
  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: topTask, error: tErr } = await supabase
      .from("tasks")
      .select(
        "id, project_id, group_id, parent_task_id, title, notes, atlas_status, priority, progress, due_date, assigned_to_users, estimated_minutes, actual_minutes, position, tags, attachments, created_by, created_at, updated_at",
      )
      .eq("id", parsed.data)
      .single();
    if (tErr || !topTask) return { success: false, error: "Task not found" };
    if (!(await assertMasterTaskAccess(supabase, topTask.project_id as string, user.id, role)))
      return { success: false, error: "Not found" };

    const [
      { data: children },
      { data: commentRows },
      { data: progressRows },
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, project_id, group_id, parent_task_id, title, notes, atlas_status, priority, progress, due_date, assigned_to_users, estimated_minutes, actual_minutes, position, tags, attachments, created_by, created_at, updated_at",
        )
        .eq("parent_task_id", parsed.data)
        .order("position", { ascending: true }),
      supabase
        .from("task_comments")
        .select(
          "id, task_id, author_id, content, edited_at, is_system, created_at, author:profiles!author_id(id, full_name, role)",
        )
        .eq("task_id", parsed.data)
        .order("created_at", { ascending: true }),
      supabase
        .from("task_progress_updates")
        .select(
          "id, task_id, updated_by, previous_progress, new_progress, previous_status, new_status, note, created_at, updater:profiles!updated_by(id, full_name)",
        )
        .eq("task_id", parsed.data)
        .order("created_at", { ascending: true }),
    ]);

    const cids = new Set<string>();
    for (const t of [topTask, ...((children ?? []) as object[])]) {
      for (const id of ((t as { assigned_to_users?: string[] | null })?.assigned_to_users ?? []))
        cids.add(id);
    }
    const profileMap = new Map<string, Pick<Profile, "id" | "full_name" | "role">>();
    if (cids.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", [...cids]);
      for (const p of profiles ?? [])
        profileMap.set(p.id, p as Pick<Profile, "id" | "full_name" | "role">);
    }

    const baseRow = topTask as unknown as Record<string, unknown>;
    const mapComments = (commentRows ?? []) as unknown as TaskComment[];
    const mapProgress = (progressRows ?? []) as unknown as ProjectProgressUpdate[];

    return {
      success: true,
      data: {
        task:             rowToProjectTask(baseRow, profileMap),
        comments:         mapComments,
        progress_updates: mapProgress,
        sub_tasks:        (children ?? []).map((c) => rowToProjectTask(c as unknown as Record<string, unknown>, profileMap)),
      },
    };
  } catch (err) {
    console.error("[getTaskDetail]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function addComment(
  taskId: string,
  content: string,
): Promise<ActionResult<{ id: string }>> {
  const tParsed = uuidSchema.safeParse(taskId);
  if (!tParsed.success) return { success: false, error: "Invalid task" };
  const text = content.trim();
  if (!text) return { success: false, error: "Comment is empty" };
  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: t } = await supabase
      .from("tasks")
      .select("project_id")
      .eq("id", tParsed.data)
      .single();
    if (!t || !t.project_id) return { success: false, error: "Task not found" };
    if (!(await assertMasterTaskAccess(supabase, t.project_id as string, user.id, role)))
      return { success: false, error: "Not authorized" };

    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: tParsed.data, author_id: user.id, content: sanitizeText(text) })
      .select("id")
      .single();
    if (error || !data) return { success: false, error: "Failed to add comment" };
    revalidatePath("/projects", "page");
    revalidatePath(`/projects/${t.project_id as string}`, "page");
    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error("[addComment]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function editComment(
  commentId: string,
  content: string,
): Promise<ActionResult> {
  const cParsed = uuidSchema.safeParse(commentId);
  if (!cParsed.success) return { success: false, error: "Invalid comment" };
  const text = content.trim();
  if (!text) return { success: false, error: "Comment is empty" };
  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: cRow } = await supabase
      .from("task_comments")
      .select("id, task_id, author_id")
      .eq("id", cParsed.data)
      .single();
    if (!cRow) return { success: false, error: "Comment not found" };
    if (cRow.author_id !== user.id && !isPrivilegedOrManager(role)) {
      return { success: false, error: "Not authorized" };
    }
    const { data: tRow } = await supabase
      .from("tasks")
      .select("project_id")
      .eq("id", cRow.task_id)
      .single();
    const pid = tRow?.project_id as string | undefined;
    if (!pid || !(await assertMasterTaskAccess(supabase, pid, user.id, role)))
      return { success: false, error: "Not found" };
    const { error } = await supabase
      .from("task_comments")
      .update({ content: sanitizeText(text), edited_at: new Date().toISOString() })
      .eq("id", cParsed.data);
    if (error) return { success: false, error: "Failed to update" };
    revalidatePath("/projects", "page");
    revalidatePath(`/projects/${pid}`, "page");
    return { success: true };
  } catch (err) {
    console.error("[editComment]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const cParsed = uuidSchema.safeParse(commentId);
  if (!cParsed.success) return { success: false, error: "Invalid comment" };
  try {
    const { supabase, user, role } = await getAuthUser();
    const { data: cRow } = await supabase
      .from("task_comments")
      .select("id, author_id, task_id")
      .eq("id", cParsed.data)
      .single();
    if (!cRow) return { success: false, error: "Comment not found" };
    if (cRow.author_id !== user.id && !isPrivilegedOrManager(role)) {
      return { success: false, error: "Not authorized" };
    }
    const { data: tRow } = await supabase
      .from("tasks")
      .select("project_id")
      .eq("id", cRow.task_id)
      .single();
    const pid = tRow?.project_id as string | undefined;
    if (!pid || !(await assertMasterTaskAccess(supabase, pid, user.id, role))) {
      return { success: false, error: "Not found" };
    }
    const { error } = await supabase.from("task_comments").delete().eq("id", cParsed.data);
    if (error) return { success: false, error: "Failed to delete" };
    revalidatePath("/projects", "page");
    revalidatePath(`/projects/${pid}`, "page");
    return { success: true };
  } catch (err) {
    console.error("[deleteComment]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/** Add a subtask in a master-task column (`task_groups` row) from the board (inline add). */
export async function createSubtaskInBoardGroup(
  groupId: string,
  params: { title: string },
): Promise<ActionResult<{ id: string }>> {
  const gParsed = uuidSchema.safeParse(groupId);
  if (!gParsed.success) return { success: false, error: "Invalid group" };
  if (!params.title?.trim()) return { success: false, error: "Title is required" };
  try {
    const { supabase, user, role, domain, department } = await getAuthUser();
    const { data: group } = await supabase
      .from("task_groups")
      .select("project_id")
      .eq("id", gParsed.data)
      .single();
    if (!group?.project_id) return { success: false, error: "Group not found" };
    if (!(await assertMasterTaskAccess(supabase, group.project_id, user.id, role)))
      return { success: false, error: "Not authorized" };
    return createSubTask({
      master_task_id: group.project_id,
      group_id:       gParsed.data,
      title:          params.title.trim(),
      priority:       "medium",
    });
  } catch (err) {
    console.error("[createSubtaskInBoardGroup]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Nested sub-task in the task detail sheet (parent = another subtask row).
 * Differs from board `createSubtaskInBoardGroup` / `createSubTask` master-task form.
 */
export async function createProjectNestedSubTask(
  parentTaskId: string,
  params: { title: string },
): Promise<ActionResult<{ id: string }>> {
  const pParsed = uuidSchema.safeParse(parentTaskId);
  if (!pParsed.success) return { success: false, error: "Invalid parent task" };
  if (!params.title?.trim()) return { success: false, error: "Title is required" };
  try {
    const { supabase, user, role, domain, department } = await getAuthUser();
    const { data: parent } = await supabase
      .from("tasks")
      .select("project_id, group_id, assigned_to_users, created_by")
      .eq("id", pParsed.data)
      .single();
    if (!parent || !parent.project_id) {
      return { success: false, error: "Parent not found" };
    }
    if (
      !(await assertMasterTaskAccess(
        supabase,
        parent.project_id as string,
        user.id,
        role,
      ))
    ) {
      return { success: false, error: "Not authorized" };
    }
    const assigneeIds = (parent.assigned_to_users as string[] | null) ?? [user.id];
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id:        parent.project_id,
        group_id:          parent.group_id,
        parent_task_id:    pParsed.data,
        title:             sanitizeText(params.title.trim()),
        notes:             null,
        unified_task_type: "subtask",
        atlas_status:      "todo",
        priority:          "medium",
        due_date:          null,
        assigned_to_users: assigneeIds[0] ? [assigneeIds[0]] : [user.id],
        estimated_minutes: null,
        tags:              [],
        domain:            domain,
        department:        department,
        created_by:        user.id,
        status:            "pending",
        task_type:         "general_follow_up",
        progress:          0,
        progress_updates:  [],
        attachments:       [],
        position:          0,
        master_task_id:    parent.project_id as string,
        imported_from:     null,
        import_batch_id:   null,
      } as never)
      .select("id")
      .single();
    if (error || !data) return { success: false, error: "Failed to create sub-task" };
    revalidateAtlasTaskSurfaces(parent.project_id as string);
    revalidatePath(`/projects/${parent.project_id as string}`, "page");
    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error("[createProjectNestedSubTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily personal tasks (IST calendar)
// ─────────────────────────────────────────────────────────────────────────────

/** Daily personal task — IST calendar date on daily_date. */
export async function createDailyPersonalTask(
  rawData: CreateDailyPersonalTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createDailyPersonalTaskSchema.safeParse(rawData);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { supabase, user, domain, department } = await getAuthUser();
    const data = parsed.data;
    const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const persDomain = resolvedDomain(undefined, domain);
    const persDepartment = resolvedDepartment(undefined, department);

    const { data: row, error } = await supabase
      .from("tasks")
      .insert({
        title:             sanitizeText(data.title),
        notes:             data.description ? sanitizeText(data.description) : null,
        unified_task_type: "personal",
        atlas_status:      "todo",
        status:            "pending",
        priority:          data.priority,
        due_date:          data.due_date ?? null,
        is_daily:          true,
        daily_date:        todayIST,
        visibility:        "personal",
        created_by:        user.id,
        assigned_to_users: [user.id],
        progress:          0,
        domain:            persDomain,
        department:        persDepartment,
        task_type:         "general_follow_up",
        progress_updates:  [],
        tags:              [],
        attachments:       [],
        is_daily_sop_template: false,
      })
      .select("id")
      .single();

    if (error || !row) return { success: false, error: error?.message ?? "Failed to create task" };

    revalidatePath("/tasks", "page");
    revalidatePath("/", "page");
    revalidatePath("/task-insights", "page");
    return { success: true, data: { id: row.id as string } };
  } catch (err) {
    console.error("[createDailyPersonalTask]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getDailyPersonalTasks(): Promise<ActionResult<{ items: PersonalTask[] }>> {
  try {
    const { supabase, user, domain, department } = await getAuthUser();
    const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    await ensurePersonalSelfSOPInstancesForToday(supabase, user.id, domain, department);

    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id, title, notes, unified_task_type, atlas_status, priority, due_date, progress, created_by, assigned_to_users, created_at, updated_at, visibility, is_daily, daily_date, is_daily_sop_template, tags",
      )
      .eq("unified_task_type", "personal")
      .eq("is_daily_sop_template", false)
      .eq("is_daily", true)
      .eq("daily_date", todayIST)
      .contains("assigned_to_users", [user.id])
      .neq("atlas_status", "cancelled")
      .is("archived_at", null)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };

    const items = ((data ?? []) as unknown as PersonalTask[]).filter((t) =>
      ((t.assigned_to_users as string[] | null) ?? []).includes(user.id),
    );

    return {
      success: true,
      data: { items },
    };
  } catch (err) {
    console.error("[getDailyPersonalTasks]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}


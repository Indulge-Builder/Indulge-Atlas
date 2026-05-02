"use server";

/**
 * Task Insights — server actions (read model).
 * Admin & founder: all departments and tasks. Manager: only departments mapped from their domain (`departmentsVisibleForDomain`).
 */

import { endOfDay, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import {
  DEPARTMENT_CONFIG,
  ALL_DEPARTMENTS,
  departmentsVisibleForDomain,
  coerceIndulgeDomain,
} from "@/lib/constants/departments";
import {
  GetDepartmentDataSchema,
  GetAgentTasksSchema,
  getEmployeeDossierSchema,
} from "@/lib/schemas/tasks";
import type {
  AtlasTaskStatus,
  DepartmentTaskOverview,
  EmployeeDepartment,
  EmployeeDossierPayload,
  EmployeeHealthSignal,
  WorkspaceSubtaskAssignment,
  IndulgeDomain,
  MasterTask,
  MasterTaskMember,
  OrgTaskSummary,
  PersonalTask,
  Profile,
  SubTask,
  TaskGroup,
  TaskInsightsWorkspaceCard,
  TaskIntelligenceAgentSummary,
  TaskIntelligenceHealthSignal,
  TaskIntelligencePersonalTaskRow,
  TaskPriority,
} from "@/lib/types/database";
import { isPrivilegedRole } from "@/lib/types/database";
import type { ChecklistItem } from "@/lib/types/database";

const IST = "Asia/Kolkata";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
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
    .select("id, full_name, role, domain, department, job_title")
    .eq("id", user.id)
    .single();
  const role = (profile?.role ?? "agent") as string;
  const domain = coerceIndulgeDomain(profile?.domain as string | null);
  return { supabase, user, role, domain, profile };
}

function assertTaskIntelligenceRole(role: string): boolean {
  return role === "manager" || isPrivilegedRole(role);
}

function departmentsForCaller(role: string, domain: IndulgeDomain): EmployeeDepartment[] {
  if (isPrivilegedRole(role)) return [...ALL_DEPARTMENTS];
  if (role === "manager") return departmentsVisibleForDomain(domain);
  return [];
}

/** Never return [] for authorized Task Insights callers — avoids an empty dashboard. */
function resolveVisibleDepartments(
  role: string,
  domain: IndulgeDomain,
  profile: { department?: string | null } | null,
): EmployeeDepartment[] {
  let visibleDepts = departmentsForCaller(role, domain);
  if (visibleDepts.length === 0) {
    if (isPrivilegedRole(role)) {
      visibleDepts = [...ALL_DEPARTMENTS];
    } else if (role === "manager") {
      const pd = profile?.department as EmployeeDepartment | null;
      visibleDepts =
        pd && ALL_DEPARTMENTS.includes(pd) ? [pd] : (["concierge"] as EmployeeDepartment[]);
    }
  }
  return visibleDepts;
}

function computeHealthSignal(
  overdue: number,
  completionPct: number,
  /** When zero, completionPct is vacuously 0 — must not be read as "critical backlog". */
  totalSubtasks: number,
): TaskIntelligenceHealthSignal {
  if (totalSubtasks === 0 && overdue === 0) return "healthy";
  if (overdue === 0 && completionPct > 70) return "healthy";
  if (overdue > 3) return "critical";
  // Low completion alone is not "critical" if nothing is past due (common for new boards / no due dates).
  if (overdue > 0 && completionPct < 40) return "critical";
  return "needs_attention";
}

function healthSortOrder(s: TaskIntelligenceHealthSignal): number {
  if (s === "critical") return 0;
  if (s === "needs_attention") return 1;
  return 2;
}

function istTodayBounds(): { start: Date; end: Date; startIso: string; endIso: string } {
  const now = new Date();
  const zoned = toZonedTime(now, IST);
  const start = fromZonedTime(startOfDay(zoned), IST);
  const end = fromZonedTime(endOfDay(zoned), IST);
  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function isSubtaskActiveOverdue(
  dueDate: string | null,
  status: AtlasTaskStatus,
  nowMs: number,
): boolean {
  if (!dueDate) return false;
  if (status === "done" || status === "cancelled") return false;
  return new Date(dueDate).getTime() < nowMs;
}

function extractChecklist(attachments: unknown): ChecklistItem[] {
  const raw = attachments as unknown[] | null;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ChecklistItem =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      "text" in item &&
      "checked" in item,
  );
}

// ── Public actions ───────────────────────────────────────────────────────────

export async function getDepartmentTaskOverview(): Promise<
  ActionResult<DepartmentTaskOverview[]>
> {
  try {
    const { supabase, role, domain, profile } = await getAuthUser();
    if (!assertTaskIntelligenceRole(role))
      return { success: false, error: "Not authorized" };

    let visibleDepts = resolveVisibleDepartments(role, domain, profile);
    if (visibleDepts.length === 0) {
      return { success: false, error: "Not authorized" };
    }

    const nowMs = Date.now();
    const { startIso, endIso } = istTodayBounds();

    const { data: masters, error: mErr } = await supabase
      .from("tasks")
      .select("id, department")
      .eq("unified_task_type", "master")
      .is("archived_at", null);

    if (mErr) return { success: false, error: "Failed to load master tasks" };

    const masterRows = (masters ?? []).filter((r) => {
      const raw = r.department as string | null;
      const d = (typeof raw === "string" ? raw.trim() : "") as EmployeeDepartment | "";
      if (!d) {
        return isPrivilegedRole(role);
      }
      return visibleDepts.includes(d as EmployeeDepartment);
    });
    const masterIds = masterRows.map((r) => r.id as string);
    const masterDept = new Map<string, EmployeeDepartment>();
    for (const r of masterRows) {
      const raw = r.department as string | null;
      const t = typeof raw === "string" ? raw.trim() : "";
      if (t) masterDept.set(r.id as string, t as EmployeeDepartment);
    }

    let subtaskRows: Array<{
      id: string;
      project_id: string | null;
      atlas_status: AtlasTaskStatus;
      due_date: string | null;
      archived_at: string | null;
    }> = [];

    if (masterIds.length > 0) {
      const { data: subs, error: sErr } = await supabase
        .from("tasks")
        .select("id, project_id, atlas_status, due_date, archived_at")
        .eq("unified_task_type", "subtask")
        .in("project_id", masterIds);
      if (sErr) return { success: false, error: "Failed to load subtasks" };
      subtaskRows = (subs ?? []) as typeof subtaskRows;
    }

    const subtasksByDept = new Map<
      EmployeeDepartment,
      { total: number; done: number; overdue: number }
    >();
    for (const d of visibleDepts) {
      subtasksByDept.set(d, { total: 0, done: 0, overdue: 0 });
    }

    for (const st of subtaskRows) {
      if (st.archived_at) continue;
      const pid = st.project_id;
      if (!pid) continue;
      const dept = masterDept.get(pid);
      if (!dept) continue;
      const bucket = subtasksByDept.get(dept)!;
      bucket.total++;
      if (st.atlas_status === "done") bucket.done++;
      if (isSubtaskActiveOverdue(st.due_date, st.atlas_status, nowMs)) bucket.overdue++;
    }

    /** Only enum values Postgres accepts on `profiles.department` (avoids bad .in() filters). */
    const departmentScope = [...new Set(visibleDepts)].filter((d): d is EmployeeDepartment =>
      ALL_DEPARTMENTS.includes(d),
    );
    if (departmentScope.length === 0) {
      return { success: false, error: "Not authorized" };
    }

    let profiles: Array<{
      id: string;
      department: string | null;
      role: string;
    }> = [];

    const profIn = await supabase
      .from("profiles")
      .select("id, department, role")
      .in("department", departmentScope);

    if (profIn.error) {
      console.error(
        "[getDepartmentTaskOverview] profiles .in(department) failed:",
        profIn.error.message,
        profIn.error,
      );
      const profAll = await supabase
        .from("profiles")
        .select("id, department, role");
      if (profAll.error) {
        console.error(
          "[getDepartmentTaskOverview] profiles fallback select failed:",
          profAll.error.message,
          profAll.error,
        );
        return {
          success: false,
          error: `Failed to load profiles: ${profAll.error.message}`,
        };
      }
      profiles = (profAll.data ?? []).filter(
        (p) =>
          p.department != null &&
          departmentScope.includes(p.department as EmployeeDepartment),
      );
    } else {
      profiles = profIn.data ?? [];
    }

    const activeAgentsByDept = new Map<EmployeeDepartment, number>();
    for (const d of visibleDepts) activeAgentsByDept.set(d, 0);
    for (const p of profiles) {
      const dept = p.department as EmployeeDepartment | null;
      if (!dept || !visibleDepts.includes(dept)) continue;
      const r = p.role as string;
      if (r === "admin" || r === "founder") continue;
      activeAgentsByDept.set(dept, (activeAgentsByDept.get(dept) ?? 0) + 1);
    }

    const { data: personalA } = await supabase
      .from("tasks")
      .select("id, department, atlas_status, created_at, due_date")
      .eq("unified_task_type", "personal")
      .in("department", departmentScope)
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    const { data: personalB } = await supabase
      .from("tasks")
      .select("id, department, atlas_status, created_at, due_date")
      .eq("unified_task_type", "personal")
      .in("department", departmentScope)
      .not("due_date", "is", null)
      .gte("due_date", startIso)
      .lte("due_date", endIso);

    const seenPersonal = new Set<string>();
    const personalTodayByDept = new Map<
      EmployeeDepartment,
      { total: number; done: number }
    >();
    for (const d of visibleDepts) personalTodayByDept.set(d, { total: 0, done: 0 });

    function bucketPersonal(row: {
      id: string;
      department: string | null;
      atlas_status: AtlasTaskStatus;
    }) {
      if (seenPersonal.has(row.id)) return;
      seenPersonal.add(row.id);
      const dept = row.department as EmployeeDepartment | null;
      if (!dept || !visibleDepts.includes(dept)) return;
      const b = personalTodayByDept.get(dept)!;
      b.total++;
      if (row.atlas_status === "done") b.done++;
    }

    for (const row of personalA ?? []) bucketPersonal(row as typeof row & { id: string });
    for (const row of personalB ?? []) bucketPersonal(row as typeof row & { id: string });

    const activeMasterCount = new Map<EmployeeDepartment, number>();
    for (const d of visibleDepts) activeMasterCount.set(d, 0);
    for (const r of masterRows) {
      const raw = r.department as string | null;
      const t = typeof raw === "string" ? raw.trim() : "";
      if (!t || !visibleDepts.includes(t as EmployeeDepartment)) continue;
      activeMasterCount.set(
        t as EmployeeDepartment,
        (activeMasterCount.get(t as EmployeeDepartment) ?? 0) + 1,
      );
    }

    const rows: DepartmentTaskOverview[] = visibleDepts.map((departmentId) => {
      const cfg = DEPARTMENT_CONFIG[departmentId];
      const st = subtasksByDept.get(departmentId)!;
      const groupSubtaskCompletionPct =
        st.total > 0 ? Math.round((st.done / st.total) * 100) : 0;
      const sop = personalTodayByDept.get(departmentId)!;
      const todaySopCompletionPct =
        sop.total > 0 ? Math.round((sop.done / sop.total) * 100) : 0;
      const healthSignal = computeHealthSignal(
        st.overdue,
        groupSubtaskCompletionPct,
        st.total,
      );
      return {
        departmentId,
        label: cfg.label,
        icon: cfg.icon,
        accentColor: cfg.accentColor,
        activeMasterTaskCount: activeMasterCount.get(departmentId) ?? 0,
        groupSubtaskCompletionPct,
        overdueSubtaskCount: st.overdue,
        todaySopCompletionPct,
        activeAgentCount: activeAgentsByDept.get(departmentId) ?? 0,
        healthSignal,
      };
    });

    rows.sort((a, b) => {
      const h = healthSortOrder(a.healthSignal) - healthSortOrder(b.healthSignal);
      if (h !== 0) return h;
      return a.label.localeCompare(b.label);
    });

    return { success: true, data: rows };
  } catch (err) {
    console.error("[getDepartmentTaskOverview]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export type DepartmentGroupTaskBundle = {
  masterTask: MasterTask;
  taskGroups: Array<TaskGroup & { tasks: SubTask[] }>;
  members: MasterTaskMember[];
};

export async function getDepartmentGroupTasks(
  params: unknown,
): Promise<ActionResult<DepartmentGroupTaskBundle[]>> {
  const parsed = GetDepartmentDataSchema.safeParse(params);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const departmentId = parsed.data.departmentId;

  try {
    const { supabase, role, domain, profile } = await getAuthUser();
    if (!assertTaskIntelligenceRole(role))
      return { success: false, error: "Not authorized" };

    const visible = resolveVisibleDepartments(role, domain, profile);
    if (!visible.includes(departmentId)) return { success: false, error: "Not authorized" };

    const { data: masters, error: mErr } = await supabase
      .from("tasks")
      .select(
        "id, title, notes, atlas_status, unified_task_type, domain, department, cover_color, icon_key, due_date, archived_at, created_by, created_at, updated_at",
      )
      .eq("unified_task_type", "master")
      .is("archived_at", null)
      .eq("department", departmentId)
      .order("updated_at", { ascending: false });

    if (mErr) return { success: false, error: "Failed to load master tasks" };

    const masterList = masters ?? [];
    if (masterList.length === 0) return { success: true, data: [] };

    const masterIds = masterList.map((m) => m.id as string);

    const [{ data: taskGroups }, { data: subtasks }, { data: members }] = await Promise.all([
      supabase
        .from("task_groups")
        .select(
          "id, project_id, title, description, status, position, due_date, created_by, created_at, updated_at",
        )
        .in("project_id", masterIds)
        .order("position", { ascending: true }),
      supabase
        .from("tasks")
        .select(
          "id, project_id, group_id, parent_task_id, title, notes, atlas_status, priority, progress, due_date, assigned_to_users, estimated_minutes, actual_minutes, position, tags, created_by, created_at, updated_at, domain, department, master_task_id, imported_from, import_batch_id",
        )
        .in("project_id", masterIds)
        .eq("unified_task_type", "subtask")
        .order("position", { ascending: true }),
      supabase
        .from("project_members")
        .select(
          "id, project_id, user_id, role, added_by, added_at, profile:profiles!user_id(id, full_name, role, job_title)",
        )
        .in("project_id", masterIds),
    ]);

    const allUserIds = new Set<string>();
    for (const t of subtasks ?? []) {
      for (const id of (t.assigned_to_users as string[] | null) ?? []) {
        allUserIds.add(id);
      }
    }

    let profileMap = new Map<
      string,
      { id: string; full_name: string; role: string; job_title: string | null }
    >();
    if (allUserIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, role, job_title")
        .in("id", [...allUserIds]);
      for (const p of profs ?? []) profileMap.set(p.id, p);
    }

    const enrichedSubtasks = (subtasks ?? []).map((t) => {
      const userIds = (t.assigned_to_users as string[] | null) ?? [];
      return {
        ...t,
        unified_task_type: "subtask" as const,
        assigned_to_profiles: userIds.map((id) => profileMap.get(id)).filter(Boolean),
      };
    });

    const groupsByProject = new Map<string, Array<TaskGroup & { tasks: SubTask[] }>>();
    for (const mid of masterIds) {
      const gRows = (taskGroups ?? []).filter((g) => g.project_id === mid);
      const subsForMaster = enrichedSubtasks.filter((t) => t.project_id === mid);
      const grouped = gRows.map((g) => ({
        ...g,
        tasks: subsForMaster.filter((t) => t.group_id === g.id) as unknown as SubTask[],
      }));
      groupsByProject.set(mid, grouped);
    }

    const membersByProject = new Map<string, MasterTaskMember[]>();
    for (const mid of masterIds) {
      membersByProject.set(
        mid,
        ((members ?? []) as unknown as MasterTaskMember[]).filter((m) => m.project_id === mid),
      );
    }

    const bundles: DepartmentGroupTaskBundle[] = masterList.map((m) => {
      const mid = m.id as string;
      const grouped = groupsByProject.get(mid) ?? [];
      const flat = grouped.flatMap((g) => g.tasks);
      const subtask_count = flat.length;
      const completed_subtask_count = flat.filter((t) => t.atlas_status === "done").length;
      const notesVal = (m as { notes?: string | null }).notes ?? null;
      const mems = membersByProject.get(mid) ?? [];
      return {
        masterTask: {
          ...(m as Record<string, unknown>),
          notes: notesVal,
          description: notesVal,
          subtask_count,
          completed_subtask_count,
          members: mems,
        } as unknown as MasterTask,
        taskGroups: grouped,
        members: mems,
      };
    });

    return { success: true, data: bundles };
  } catch (err) {
    console.error("[getDepartmentGroupTasks]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getDepartmentIndividualTasks(
  params: unknown,
): Promise<
  ActionResult<{
    agents: TaskIntelligenceAgentSummary[];
  }>
> {
  const parsed = GetDepartmentDataSchema.safeParse(params);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const departmentId = parsed.data.departmentId;

  try {
    const { supabase, role, domain, profile } = await getAuthUser();
    if (!assertTaskIntelligenceRole(role))
      return { success: false, error: "Not authorized" };

    const visible = resolveVisibleDepartments(role, domain, profile);
    if (!visible.includes(departmentId)) return { success: false, error: "Not authorized" };

    const { data: agents, error: aErr } = await supabase
      .from("profiles")
      .select("id, full_name, job_title, domain, department")
      .eq("department", departmentId)
      .neq("role", "admin")
      .neq("role", "founder");

    if (aErr) return { success: false, error: "Failed to load agents" };

    const agentList = agents ?? [];
    const agentIds = agentList.map((a) => a.id as string);
    if (agentIds.length === 0) return { success: true, data: { agents: [] } };

    const { data: personalRows } = await supabase
      .from("tasks")
      .select(
        "id, atlas_status, due_date, assigned_to_users, created_at, updated_at, created_by",
      )
      .eq("unified_task_type", "personal")
      .eq("department", departmentId)
      .neq("atlas_status", "cancelled");

    const rows = personalRows ?? [];
    const nowMs = Date.now();
    const { startIso, endIso } = istTodayBounds();

    const byAgent = new Map<
      string,
      {
        total: number;
        statusCounts: Partial<Record<AtlasTaskStatus, number>>;
        todayTotal: number;
        todayDone: number;
        overdue: number;
      }
    >();

    for (const id of agentIds) {
      byAgent.set(id, {
        total: 0,
        statusCounts: {},
        todayTotal: 0,
        todayDone: 0,
        overdue: 0,
      });
    }

    for (const row of rows) {
      const assignees = (row.assigned_to_users as string[] | null) ?? [];
      const uid =
        assignees.find(Boolean) ??
        ((row as { created_by?: string | null }).created_by as string | undefined);
      if (!uid || !byAgent.has(uid)) continue;
      const b = byAgent.get(uid)!;
      b.total++;
      const st = row.atlas_status as AtlasTaskStatus;
      b.statusCounts[st] = (b.statusCounts[st] ?? 0) + 1;

      const createdInRange =
        row.created_at &&
        new Date(row.created_at as string).getTime() >= new Date(startIso).getTime() &&
        new Date(row.created_at as string).getTime() <= new Date(endIso).getTime();
      const dueInRange =
        row.due_date &&
        new Date(row.due_date as string).getTime() >= new Date(startIso).getTime() &&
        new Date(row.due_date as string).getTime() <= new Date(endIso).getTime();
      if (createdInRange || dueInRange) {
        b.todayTotal++;
        if (st === "done") b.todayDone++;
      }

      if (
        row.due_date &&
        st !== "done" &&
        st !== "cancelled" &&
        new Date(row.due_date as string).getTime() < nowMs
      ) {
        b.overdue++;
      }
    }

    const summaries: TaskIntelligenceAgentSummary[] = agentList.map((a) => {
      const id = a.id as string;
      const b = byAgent.get(id)!;
      const todaySopCompletionPct =
        b.todayTotal > 0 ? Math.round((b.todayDone / b.todayTotal) * 100) : 0;
      const deptRaw = a.department as string | null | undefined;
      return {
        id,
        full_name: (a.full_name as string) ?? "Member",
        job_title: (a.job_title as string | null) ?? null,
        is_on_leave: false,
        personalTaskTotal: b.total,
        statusCounts: b.statusCounts,
        todaySopCompletionPct,
        overduePersonalCount: b.overdue,
        domain: coerceIndulgeDomain(a.domain as string),
        department:
          deptRaw && ALL_DEPARTMENTS.includes(deptRaw as EmployeeDepartment)
            ? (deptRaw as EmployeeDepartment)
            : departmentId,
      };
    });

    return { success: true, data: { agents: summaries } };
  } catch (err) {
    console.error("[getDepartmentIndividualTasks]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export type AgentPersonalTasksGrouped = {
  overdue: TaskIntelligencePersonalTaskRow[];
  active: TaskIntelligencePersonalTaskRow[];
  completedToday: TaskIntelligencePersonalTaskRow[];
};

export async function getAgentPersonalTasks(
  params: unknown,
): Promise<ActionResult<AgentPersonalTasksGrouped>> {
  const parsed = GetAgentTasksSchema.safeParse(params);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const agentId = parsed.data.agentId;

  try {
    const { supabase, role, domain, profile } = await getAuthUser();
    if (!assertTaskIntelligenceRole(role))
      return { success: false, error: "Not authorized" };

    const visible = resolveVisibleDepartments(role, domain, profile);

    const { data: agentProfile, error: apErr } = await supabase
      .from("profiles")
      .select("id, department")
      .eq("id", agentId)
      .maybeSingle();

    if (apErr || !agentProfile?.department)
      return { success: false, error: "Agent not found" };

    const dept = agentProfile.department as EmployeeDepartment;
    if (!visible.includes(dept)) return { success: false, error: "Not authorized" };

    const { data: tasks, error: tErr } = await supabase
      .from("tasks")
      .select(
        "id, title, notes, atlas_status, priority, due_date, progress, attachments, created_at, updated_at",
      )
      .eq("unified_task_type", "personal")
      .contains("assigned_to_users", [agentId])
      .neq("atlas_status", "cancelled");

    if (tErr) return { success: false, error: "Failed to load tasks" };

    const { startIso, endIso } = istTodayBounds();
    const zStart = new Date(startIso).getTime();
    const zEnd = new Date(endIso).getTime();

    const mapRow = (row: Record<string, unknown>): TaskIntelligencePersonalTaskRow => ({
      id: row.id as string,
      title: row.title as string,
      atlas_status: row.atlas_status as AtlasTaskStatus,
      priority: (row.priority as TaskPriority) ?? "medium",
      due_date: (row.due_date as string | null) ?? null,
      progress: (row.progress as number) ?? 0,
      description: (row.notes as string | null) ?? null,
      checklist: extractChecklist(row.attachments),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    });

    const overdue: TaskIntelligencePersonalTaskRow[] = [];
    const active: TaskIntelligencePersonalTaskRow[] = [];
    const completedToday: TaskIntelligencePersonalTaskRow[] = [];
    const nowMs = Date.now();

    const activeStatuses: AtlasTaskStatus[] = [
      "in_progress",
      "todo",
      "error",
    ];

    for (const row of tasks ?? []) {
      const r = mapRow(row as Record<string, unknown>);
      const st = r.atlas_status;
      const updatedMs = new Date(r.updated_at).getTime();

      if (st === "done" && updatedMs >= zStart && updatedMs <= zEnd) {
        completedToday.push(r);
        continue;
      }
      if (
        r.due_date &&
        st !== "done" &&
        st !== "cancelled" &&
        new Date(r.due_date).getTime() < nowMs
      ) {
        overdue.push(r);
        continue;
      }
      if (activeStatuses.includes(st)) {
        active.push(r);
      }
    }

    return { success: true, data: { overdue, active, completedToday } };
  } catch (err) {
    console.error("[getAgentPersonalTasks]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/** Re-read role from DB before returning sensitive Task Intelligence payloads. */
async function assertTaskIntelligenceRoleForUser(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const role = (profile?.role ?? "agent") as string;
  return assertTaskIntelligenceRole(role);
}

/** Task Insights “workspace” grid — master tasks only (`unified_task_type` master). */
export async function getMasterWorkspacesForDashboard(filters?: {
  department?: string;
  domain?: string;
}): Promise<ActionResult<TaskInsightsWorkspaceCard[]>> {
  try {
    const { supabase, user } = await getAuthUser();
    if (!(await assertTaskIntelligenceRoleForUser(user.id)))
      return { success: false, error: "Not authorized" };

    let query = supabase
      .from("tasks")
      .select(
        "id, title, notes, atlas_status, priority, progress, due_date, domain, department, cover_color, icon_key, created_at, updated_at, archived_at",
      )
      .eq("unified_task_type", "master")
      .is("archived_at", null)
      .order("updated_at", { ascending: false });

    if (filters?.department) query = query.eq("department", filters.department);
    if (filters?.domain) query = query.eq("domain", filters.domain);

    const { data: taskRows, error } = await query;
    if (error) return { success: false, error: error.message };

    const rows = taskRows ?? [];
    if (rows.length === 0) return { success: true, data: [] };

    const taskIds = rows.map((r) => r.id as string);

    const [{ data: memberRows }, { data: subtaskRows }] = await Promise.all([
      supabase.from("project_members").select("project_id, user_id").in("project_id", taskIds),
      supabase
        .from("tasks")
        .select("project_id, atlas_status, due_date, archived_at")
        .in("project_id", taskIds)
        .eq("unified_task_type", "subtask")
        .is("archived_at", null),
    ]);

    const profileIds = new Set<string>();
    for (const m of memberRows ?? []) profileIds.add(m.user_id as string);

    const { data: profiles } =
      profileIds.size > 0
        ? await supabase.from("profiles").select("id, full_name").in("id", [...profileIds])
        : { data: [] as { id: string; full_name: string | null }[] };

    const profById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

    const membersByTask = new Map<string, Pick<Profile, "id" | "full_name">[]>();
    for (const m of memberRows ?? []) {
      const tid = m.project_id as string;
      const uid = m.user_id as string;
      const p = profById.get(uid);
      if (!membersByTask.has(tid)) membersByTask.set(tid, []);
      membersByTask.get(tid)!.push({
        id:        uid,
        full_name: (p?.full_name as string) ?? "",
      });
    }

    const now = new Date();
    const countMap = new Map<string, { total: number; done: number; overdue: number }>();
    for (const tid of taskIds) countMap.set(tid, { total: 0, done: 0, overdue: 0 });

    for (const s of subtaskRows ?? []) {
      const pid = s.project_id as string | null;
      if (!pid || !countMap.has(pid)) continue;
      const st = s.atlas_status as AtlasTaskStatus;
      const c = countMap.get(pid)!;
      c.total++;
      if (st === "done") c.done++;
      const dd = s.due_date as string | null;
      if (
        dd &&
        st !== "done" &&
        st !== "cancelled" &&
        new Date(dd).getTime() < now.getTime()
      ) {
        c.overdue++;
      }
    }

    const enriched: TaskInsightsWorkspaceCard[] = rows.map((t) => {
      const id = t.id as string;
      const counts = countMap.get(id) ?? { total: 0, done: 0, overdue: 0 };
      return {
        id,
        title:                   t.title as string,
        notes:                   (t.notes as string | null) ?? null,
        atlas_status:            t.atlas_status as AtlasTaskStatus,
        priority:                t.priority as TaskPriority,
        progress:                Number((t as { progress?: unknown }).progress ?? 0),
        due_date:                (t.due_date as string | null) ?? null,
        domain:                  (t.domain as string | null) ?? null,
        department:              (t.department as string | null) ?? null,
        cover_color:             (t.cover_color as string | null) ?? null,
        icon_key:                (t.icon_key as string | null) ?? null,
        created_at:              t.created_at as string,
        updated_at:              t.updated_at as string,
        archived_at:             (t.archived_at as string | null) ?? null,
        memberProfiles:          membersByTask.get(id) ?? [],
        subtask_count:           counts.total,
        completed_subtask_count: counts.done,
        overdue_subtask_count:   counts.overdue,
      };
    });

    return { success: true, data: enriched };
  } catch (err) {
    console.error("[getMasterWorkspacesForDashboard]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getEmployeeDossier(
  agentId: string,
): Promise<ActionResult<EmployeeDossierPayload>> {
  const parsed = getEmployeeDossierSchema.safeParse({ agentId });
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const { supabase, user, domain, profile } = await getAuthUser();
    if (!(await assertTaskIntelligenceRoleForUser(user.id)))
      return { success: false, error: "Not authorized" };

    const targetId = parsed.data.agentId;
    const now = new Date();
    const todayIST = now.toLocaleDateString("en-CA", { timeZone: IST });
    const startOfTodayIST = new Date(`${todayIST}T00:00:00+05:30`);
    const endOfTodayIST = new Date(`${todayIST}T23:59:59+05:30`);
    const endOfWeekIST = new Date(startOfTodayIST.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data: agentProfile, error: agentErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();

    if (agentErr || !agentProfile) return { success: false, error: "Employee not found" };

    const visible = resolveVisibleDepartments(
      (profile?.role ?? "agent") as string,
      domain,
      profile,
    );
    const agentDept = agentProfile.department as EmployeeDepartment | null;
    if (
      agentDept &&
      !visible.includes(agentDept) &&
      !isPrivilegedRole((profile?.role ?? "agent") as string)
    ) {
      return { success: false, error: "Not authorized" };
    }

    const [personalTasksResult, workspaceSubtasksResult] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("unified_task_type", "personal")
        .or(`assigned_to_users.cs.{${targetId}},created_by.eq.${targetId}`)
        .neq("atlas_status", "cancelled")
        .is("archived_at", null)
        .order("created_at", { ascending: false }),

      supabase
        .from("tasks")
        .select(
          "id, title, notes, atlas_status, priority, progress, due_date, assigned_to_users, project_id, estimated_minutes, actual_minutes, tags, created_by, created_at, updated_at",
        )
        .eq("unified_task_type", "subtask")
        .contains("assigned_to_users", [targetId])
        .not("project_id", "is", null)
        .is("archived_at", null)
        .order("due_date", { ascending: true }),
    ]);

    const personal = (personalTasksResult.data ?? []) as unknown as PersonalTask[];
    const rawWs = workspaceSubtasksResult.data ?? [];
    const masterIds = [...new Set(rawWs.map((r) => r.project_id as string).filter(Boolean))];
    const { data: masters } =
      masterIds.length > 0
        ? await supabase
            .from("tasks")
            .select("id, title, cover_color")
            .eq("unified_task_type", "master")
            .in("id", masterIds)
        : { data: [] as const };
    const mmap = new Map((masters ?? []).map((m) => [m.id as string, m]));
    const workspaceSubs: WorkspaceSubtaskAssignment[] = rawWs.map((row) => {
      const pid = row.project_id as string | null;
      const master = pid ? mmap.get(pid) : undefined;
      return {
        ...(row as unknown as SubTask),
        masterTaskTitle:       master ? (master.title as string) : null,
        masterCoverColor:      master ? ((master.cover_color as string | null) ?? null) : null,
      };
    });

    const completedLast30 = personal.filter(
      (t) =>
        t.atlas_status === "done" &&
        t.updated_at &&
        new Date(t.updated_at) >= thirtyDaysAgo,
    );
    const allLast30 = personal.filter((t) => new Date(t.created_at) >= thirtyDaysAgo);
    const completionRateLast30Days =
      allLast30.length > 0
        ? Math.round((completedLast30.length / allLast30.length) * 100)
        : 0;

    const overdueCount =
      personal.filter(
        (t) =>
          t.atlas_status !== "done" && t.due_date && new Date(t.due_date) < now,
      ).length +
      workspaceSubs.filter(
        (t) =>
          t.atlas_status !== "done" && t.due_date && new Date(t.due_date as string) < now,
      ).length;

    const totalActive =
      personal.filter((t) => !["done", "cancelled", "archived"].includes(t.atlas_status)).length +
      workspaceSubs.filter((t) => !["done", "cancelled"].includes(t.atlas_status)).length;

    const completionsByDay = new Map<string, number>();
    for (const t of [...personal, ...workspaceSubs]) {
      if (t.atlas_status === "done" && t.updated_at) {
        const day = new Date(t.updated_at).toLocaleDateString("en-CA", { timeZone: IST });
        completionsByDay.set(day, (completionsByDay.get(day) ?? 0) + 1);
      }
    }
    let streakDays = 0;
    const checkDate = new Date(startOfTodayIST);
    for (;;) {
      const key = checkDate.toLocaleDateString("en-CA", { timeZone: IST });
      if (!completionsByDay.has(key)) break;
      streakDays++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    const priorityWeights: Record<string, number> = {
      critical: 5,
      urgent:   4,
      high:     3,
      medium:   2,
      low:      1,
    };
    const activePersonal = personal.filter((t) => !["done", "cancelled"].includes(t.atlas_status));
    const weightedSum = activePersonal.reduce(
      (sum, t) => sum + (priorityWeights[t.priority] ?? 2),
      0,
    );
    const workloadScore = Math.min(100, Math.round((weightedSum / 50) * 100));

    const onTimePersonal = completedLast30.filter(
      (t) =>
        !t.due_date ||
        (t.updated_at && new Date(t.updated_at) <= new Date(t.due_date as string)),
    );
    const onTimeRate =
      completedLast30.length > 0
        ? Math.round((onTimePersonal.length / completedLast30.length) * 100)
        : 0;

    const isOnLeave = agentProfile.is_on_leave === true;
    let healthSignal: EmployeeHealthSignal = "on_track";
    if (isOnLeave) healthSignal = "on_leave";
    else if (overdueCount > 2 || workloadScore > 80) healthSignal = "at_risk";
    else if (totalActive > 10 && completionRateLast30Days < 40) healthSignal = "overloaded";

    const activPersonal = personal.filter((t) => t.atlas_status !== "done");
    const personalBuckets = {
      overdue: activPersonal.filter((t) => t.due_date && new Date(t.due_date) < now),
      today: activPersonal.filter(
        (t) =>
          !!t.due_date &&
          new Date(t.due_date) >= startOfTodayIST &&
          new Date(t.due_date) <= endOfTodayIST,
      ),
      thisWeek: activPersonal.filter(
        (t) =>
          !!t.due_date &&
          new Date(t.due_date) > endOfTodayIST &&
          new Date(t.due_date) <= endOfWeekIST,
      ),
      upcoming: activPersonal.filter(
        (t) => !t.due_date || new Date(t.due_date) > endOfWeekIST,
      ),
      completedToday: personal.filter(
        (t) =>
          t.atlas_status === "done" &&
          t.updated_at &&
          new Date(t.updated_at) >= startOfTodayIST &&
          new Date(t.updated_at) <= endOfTodayIST,
      ),
    };

    if (!(await assertTaskIntelligenceRoleForUser(user.id)))
      return { success: false, error: "Not authorized" };

    return {
      success: true,
      data: {
        profile: agentProfile as Profile,
        metrics: {
          completionRateLast30Days,
          averageTaskDurationDays: 0,
          overdueCount,
          totalActive,
          streakDays,
          workloadScore,
          onTimeRate,
          totalCompletedAllTime: personal.filter((t) => t.atlas_status === "done").length,
          healthSignal,
        },
        personalTasks: personalBuckets,
        workspaceSubtasks: workspaceSubs,
      },
    };
  } catch (err) {
    console.error("[getEmployeeDossier]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getOrgTaskSummary(): Promise<ActionResult<OrgTaskSummary>> {
  try {
    const { user } = await getAuthUser();
    if (!(await assertTaskIntelligenceRoleForUser(user.id)))
      return { success: false, error: "Not authorized" };

    const supabase = await createClient();
    const now = new Date();

    const tasksResult = await supabase
      .from("tasks")
      .select("atlas_status, due_date")
      .in("unified_task_type", ["personal", "subtask", "master"])
      .is("archived_at", null);

    const tasks = tasksResult.data ?? [];
    const totalActive = tasks.filter((t) => !["done", "cancelled"].includes(t.atlas_status as string)).length;
    const totalDone = tasks.filter((t) => t.atlas_status === "done").length;
    const total = tasks.length;
    const orgCompletionPct = total > 0 ? Math.round((totalDone / total) * 100) : 0;
    const overdueCount = tasks.filter(
      (t) =>
        !["done", "cancelled"].includes(t.atlas_status as string) &&
        t.due_date &&
        new Date(t.due_date as string) < now,
    ).length;

    return {
      success: true,
      data: {
        totalActiveTasks: totalActive,
        orgCompletionPct,
        overdueCount,
        onLeaveCount: 0, // needs profiles.is_on_leave (migration 049) for real counts
      },
    };
  } catch (err) {
    console.error("[getOrgTaskSummary]", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * lib/services/taskContext.ts
 *
 * Elia / internal services: full Master Task context.
 * Uses the service-role Supabase client to bypass RLS so read models can cross
 * domain boundaries. This is intentional: only call from server-side code that
 * has already authenticated the operator (e.g. future Elia API with service auth).
 * Never expose this return value unfiltered to browser clients.
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";
import type { AtlasTaskStatus, ChecklistItem, IndulgeDomain } from "@/lib/types/database";

const STALE_DAYS = 7;

export interface TaskContextRemark {
  content: string;
  source: "agent" | "system" | "elia";
  author_name: string;
  created_at: string;
}

export interface TaskContextChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface TaskContextSubTask {
  id: string;
  title: string;
  description: string | null;
  atlas_status: AtlasTaskStatus;
  progress: number;
  priority: string | null;
  due_date: string | null;
  assignee: {
    id: string;
    full_name: string;
    job_title: string | null;
    department: string | null;
  } | null;
  checklist: TaskContextChecklistItem[];
  remarks: TaskContextRemark[];
}

export interface TaskContextGroup {
  title: string;
  position: number;
  subtasks: TaskContextSubTask[];
}

export interface TaskContextOwner {
  id: string;
  full_name: string;
  job_title: string | null;
}

export interface TaskContextMember {
  id: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
}

export interface TaskContextSummary {
  total_subtasks: number;
  by_status: Record<AtlasTaskStatus, number>;
  completion_pct: number;
  overdue_subtasks: number;
  unassigned_subtasks: number;
  stale_subtasks: number;
}

export interface TaskContext {
  masterTask: {
    id: string;
    title: string;
    description: string | null;
    domain: IndulgeDomain | string | null;
    department: string | null;
    atlas_status: AtlasTaskStatus;
    completion_pct: number;
    due_date: string | null;
    owner: TaskContextOwner | null;
    members: TaskContextMember[];
  };
  groups: TaskContextGroup[];
  summary: TaskContextSummary;
}

type SqlRow = Record<string, unknown>;

function extractChecklist(attachments: unknown): TaskContextChecklistItem[] {
  const raw = attachments as unknown[] | null;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is TaskContextChecklistItem =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      "text" in item &&
      "checked" in item,
  );
}

export async function getTaskContext(masterTaskId: string): Promise<TaskContext | null> {
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(masterTaskId)) return null;

  const service = getServiceSupabaseClient();

  const { data: masterRaw } = await service
    .from("tasks")
    .select(
      "id, title, notes, atlas_status, domain, department, due_date, created_at, progress, created_by",
    )
    .eq("id", masterTaskId)
    .eq("unified_task_type", "master")
    .maybeSingle();

  const masterRow = masterRaw as SqlRow | null;
  if (!masterRow) return null;

  const masterCreatedBy = masterRow.created_by as string | null | undefined;

  const [
    { data: taskGroupsRaw },
    { data: subtaskRowsRaw },
    { data: memberRowsRaw },
    ownerResult,
  ] = await Promise.all([
    service
      .from("task_groups")
      .select("id, title, position")
      .eq("project_id", masterTaskId)
      .order("position"),
    service
      .from("tasks")
      .select(
        "id, title, notes, atlas_status, priority, due_date, progress, assigned_to_users, group_id, attachments, updated_at",
      )
      .eq("project_id", masterTaskId)
      .eq("unified_task_type", "subtask"),
    service
      .from("project_members")
      .select("user_id")
      .eq("project_id", masterTaskId),
    masterCreatedBy
      ? service.from("profiles").select("id, full_name, job_title").eq("id", masterCreatedBy).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ownerRow = (ownerResult?.data ?? null) as SqlRow | null;

  const taskGroups = taskGroupsRaw as SqlRow[] | null;
  const subtasks = (subtaskRowsRaw ?? []) as SqlRow[];
  const memberRows = memberRowsRaw as SqlRow[] | null;

  const byStatus: Record<AtlasTaskStatus, number> = {
    todo:         0,
    in_progress:  0,
    in_review:    0,
    done:         0,
    blocked:      0,
    error:        0,
    cancelled:    0,
  };

  const now = Date.now();
  const staleCutoff = now - STALE_DAYS * 24 * 60 * 60 * 1000;

  let overdue = 0;
  let unassigned = 0;
  let stale = 0;

  for (const t of subtasks) {
    const st = (t.atlas_status ?? "todo") as AtlasTaskStatus;
    byStatus[st]++;
    const users = (t.assigned_to_users as string[] | null) ?? [];
    if (users.length === 0) unassigned++;
    if (t.due_date && st !== "done" && st !== "cancelled") {
      if (new Date(t.due_date as string).getTime() < now) overdue++;
    }
    const upd = t.updated_at ? new Date(t.updated_at as string).getTime() : 0;
    if (upd > 0 && upd < staleCutoff && st !== "done" && st !== "cancelled") stale++;
  }

  const total = subtasks.length;
  const doneCount = byStatus.done;
  const completionPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const allAssigneeIds = new Set<string>();
  for (const t of subtasks) {
    const u = (t.assigned_to_users as string[] | null)?.[0];
    if (u) allAssigneeIds.add(u);
  }

  const profileMap = new Map<
    string,
    { full_name: string; job_title: string | null; department: string | null }
  >();

  const memberIds = [...new Set((memberRows ?? []).map((m) => m.user_id as string))];
  const profileIdsToLoad = [...new Set([...memberIds, ...allAssigneeIds])];

  if (profileIdsToLoad.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, full_name, job_title, department")
      .in("id", profileIdsToLoad);
    for (const p of (profiles ?? []) as SqlRow[]) {
      profileMap.set(p.id as string, {
        full_name: p.full_name as string,
        job_title: (p.job_title as string | null) ?? null,
        department: (p.department as string | null) ?? null,
      });
    }
  }

  const taskIds = subtasks.map((t) => t.id as string);
  const remarksByTask = new Map<string, TaskContextRemark[]>();

  if (taskIds.length > 0) {
    const { data: remarkRows } = await service
      .from("task_remarks")
      .select(
        "task_id, content, source, created_at, author:profiles!author_id(full_name)",
      )
      .in("task_id", taskIds)
      .order("created_at", { ascending: false });

    const perTask: Record<string, TaskContextRemark[]> = {};
    for (const r of (remarkRows ?? []) as SqlRow[]) {
      const tid = r.task_id as string;
      const bucket = perTask[tid] ?? [];
      if (bucket.length >= 3) continue;
      bucket.push({
        content: r.content as string,
        source: (r.source as TaskContextRemark["source"]) ?? "agent",
        author_name:
          (r.author as { full_name?: string } | null)?.full_name ?? "Unknown",
        created_at: r.created_at as string,
      });
      perTask[tid] = bucket;
    }
    for (const tid of taskIds) {
      remarksByTask.set(tid, perTask[tid] ?? []);
    }
  }

  function mapSubtaskRow(t: SqlRow): TaskContextSubTask {
    const uid = (t.assigned_to_users as string[] | null)?.[0] ?? null;
    const prof = uid ? profileMap.get(uid) : undefined;
    return {
      id: t.id as string,
      title: t.title as string,
      description: (t.notes as string | null) ?? null,
      atlas_status: (t.atlas_status ?? "todo") as AtlasTaskStatus,
      progress: (t.progress as number) ?? 0,
      priority: (t.priority as string | null) ?? null,
      due_date: (t.due_date as string | null) ?? null,
      assignee:
        uid && prof
          ? {
              id: uid,
              full_name: prof.full_name,
              job_title: prof.job_title,
              department: prof.department,
            }
          : null,
      checklist: extractChecklist(t.attachments),
      remarks: remarksByTask.get(t.id as string) ?? [],
    };
  }

  const groups: TaskContextGroup[] = ((taskGroups ?? []) as SqlRow[]).map((g) => {
    const gid = g.id as string;
    const groupSubs = subtasks.filter((t) => t.group_id === gid);
    return {
      title: g.title as string,
      position: g.position as number,
      subtasks: groupSubs.map(mapSubtaskRow),
    };
  });

  const groupedIds = new Set<string>();
  for (const g of groups) {
    for (const s of g.subtasks) groupedIds.add(s.id);
  }
  const orphanSubs = subtasks.filter((t) => !groupedIds.has(t.id as string));
  if (orphanSubs.length > 0) {
    groups.push({
      title: "Ungrouped",
      position: 999_999,
      subtasks: orphanSubs.map(mapSubtaskRow),
    });
  }

  const owner = ownerRow
    ? {
        id: ownerRow.id as string,
        full_name: ownerRow.full_name as string,
        job_title: (ownerRow.job_title as string | null) ?? null,
      }
    : null;

  const members: TaskContextMember[] = memberIds.map((id) => {
    const p = profileMap.get(id);
    return {
      id,
      full_name: p?.full_name ?? "Unknown",
      job_title: p?.job_title ?? null,
      department: p?.department ?? null,
    };
  });

  return {
    masterTask: {
      id: masterRow.id as string,
      title: masterRow.title as string,
      description: (masterRow.notes as string | null) ?? null,
      domain: (masterRow.domain as IndulgeDomain | string | null) ?? null,
      department: (masterRow.department as string | null) ?? null,
      atlas_status: (masterRow.atlas_status ?? "todo") as AtlasTaskStatus,
      completion_pct: completionPct,
      due_date: (masterRow.due_date as string | null) ?? null,
      owner,
      members,
    },
    groups,
    summary: {
      total_subtasks: total,
      by_status: byStatus,
      completion_pct: completionPct,
      overdue_subtasks: overdue,
      unassigned_subtasks: unassigned,
      stale_subtasks: stale,
    },
  };
}

/**
 * lib/schemas/tasks.ts
 *
 * All Zod schemas for the Atlas Task Management System.
 * Imported by lib/actions/tasks.ts — never inline schemas in action files.
 */

import { z } from "zod";
import type { EmployeeDepartment, IndulgeDomain } from "@/lib/types/database";

/** Empty string from an uncontrolled field → treat as missing before enum parse. */
function emptyStringToUndefined<T extends string>(val: T | ""): T | undefined {
  return val === "" ? undefined : val;
}

const EMPLOYEE_DEPARTMENT_VALUES = [
  "concierge",
  "finance",
  "tech",
  "shop",
  "house",
  "legacy",
  "marketing",
  "onboarding",
] as const satisfies readonly EmployeeDepartment[];

const INDULGE_DOMAIN_VALUES = [
  "indulge_concierge",
  "indulge_shop",
  "indulge_house",
  "indulge_legacy",
  "indulge_global",
] as const satisfies readonly IndulgeDomain[];

// ── Shared primitives ──────────────────────────────────────

export const uuidSchema = z.string().uuid();

export const atlasStatusSchema = z.enum([
  "todo",
  "in_progress",
  "done",
  "error",
  "cancelled",
]);

export const taskPrioritySchema = z.enum(["critical", "urgent", "high", "medium", "low"]);

// ── Master Task ────────────────────────────────────────────

export const CreateMasterTaskSchema = z.object({
  title:       z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  domain: z
    .union([z.enum(INDULGE_DOMAIN_VALUES), z.literal("")])
    .transform(emptyStringToUndefined)
    .pipe(z.enum(INDULGE_DOMAIN_VALUES, { message: "Domain is required" })),
  department: z
    .union([z.enum(EMPLOYEE_DEPARTMENT_VALUES), z.literal("")])
    .transform(emptyStringToUndefined)
    .pipe(z.enum(EMPLOYEE_DEPARTMENT_VALUES, { message: "Department is required" })),
  cover_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon_key:    z.string().max(50).optional(),
  due_date:    z.string().datetime().optional(),
  initialMemberIds: z.array(z.string().uuid()).optional(),
});

export const UpdateMasterTaskSchema = z.object({
  title:       z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  cover_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  icon_key:    z.string().max(50).nullable().optional(),
  due_date:    z.string().datetime().nullable().optional(),
  domain:      z.string().max(50).nullable().optional(),
  department:  z.string().max(50).nullable().optional(),
  atlas_status: atlasStatusSchema.optional(),
});

// ── Task Group ─────────────────────────────────────────────

export const CreateTaskGroupSchema = z.object({
  title:    z.string().min(1).max(200),
  position: z.number().int().min(0).optional(),
});

export const ReorderTaskGroupsSchema = z.object({
  masterTaskId:   z.string().uuid(),
  orderedGroupIds: z.array(z.string().uuid()).min(1),
});

// ── Sub-Task ───────────────────────────────────────────────

export const CreateSubTaskSchema = z.object({
  master_task_id:    z.string().uuid(),
  group_id:          z.string().uuid(),
  title:             z.string().min(1).max(255),
  description:       z.string().max(2000).optional(),
  assigned_to:       z.string().uuid().optional(),
  priority:          taskPrioritySchema.default("medium"),
  due_date:          z.string().datetime().optional(),
  estimated_minutes: z.number().int().min(0).max(999999).optional(),
  tags:              z.array(z.string().max(50)).max(10).optional(),
});

export const UpdateSubTaskSchema = z.object({
  title:               z.string().min(1).max(255).optional(),
  description:         z.string().max(2000).nullable().optional(),
  priority:            taskPrioritySchema.optional(),
  due_date:            z.string().datetime().nullable().optional(),
  atlas_status:        atlasStatusSchema.optional(),
  estimated_minutes:   z.number().int().min(0).max(999999).nullable().optional(),
  actual_minutes:      z.number().int().min(0).max(999999).nullable().optional(),
  tags:                z.array(z.string().max(50)).max(10).optional(),
  progress:            z.number().int().min(0).max(100).optional(),
  /** Replaces assignees; use [] to clear. Requires workspace owner/manager (or privileged) to change. */
  assigned_to_users:   z.array(z.string().uuid()).max(20).optional(),
});

// ── Checklist ──────────────────────────────────────────────

export const ChecklistItemSchema = z.object({
  id:      z.string().min(1).max(100),
  text:    z.string().min(1).max(500),
  checked: z.boolean(),
});

export const ChecklistSchema = z.array(ChecklistItemSchema).max(100);

// ── Sub-Task Status / Progress ─────────────────────────────

export const UpdateSubTaskStatusSchema = z.object({
  task_id:        z.string().uuid(),
  new_status:     atlasStatusSchema,
  remark_content: z.string().min(1).max(1000),
  new_progress:   z.number().int().min(0).max(100).optional(),
  // Optionally save checklist state in the same round-trip
  checklist:      ChecklistSchema.optional(),
});

export const UpdateSubTaskProgressSchema = z.object({
  task_id:     z.string().uuid(),
  new_progress: z.number().int().min(0).max(100),
  note:         z.string().max(500).optional(),
});

export const ReorderSubTasksSchema = z.object({
  groupId:       z.string().uuid(),
  orderedTaskIds: z.array(z.string().uuid()).min(1),
});

// ── Personal Task ──────────────────────────────────────────

export const CreatePersonalTaskSchema = z.object({
  title:       z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  due_date:    z.string().datetime().optional(),
  priority:    taskPrioritySchema.default("medium"),
});

// ── Members ────────────────────────────────────────────────

export const AddMasterTaskMemberSchema = z.object({
  masterTaskId: z.string().uuid(),
  profileId:    z.string().uuid(),
  role:         z.enum(["owner", "member", "viewer"]).default("member"),
});

// ── Import ─────────────────────────────────────────────────

export const ImportBatchRowSchema = z.object({
  title:             z.string().min(1).max(255),
  description:       z.string().max(2000).optional(),
  assigned_to_email: z.string().email().optional(),
  due_date:          z.string().optional(),
  priority:          z.string().optional(),
  status:            z.string().optional(),
  group_name:        z.string().max(100).optional(),
});

export const CreateImportBatchSchema = z.object({
  master_task_id: z.string().uuid(),
  group_id:       z.string().uuid().optional(),
  rows:           z.array(ImportBatchRowSchema).min(1).max(2000),
});

// ── Task Intelligence ─────────────────────────────────────

export const employeeDepartmentIdSchema = z.enum(EMPLOYEE_DEPARTMENT_VALUES);

export const GetDepartmentDataSchema = z.object({
  departmentId: employeeDepartmentIdSchema,
});

export const GetAgentTasksSchema = z.object({
  agentId: uuidSchema,
});

export const createDailyPersonalTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  due_date: z.string().datetime().optional().nullable(),
  priority: taskPrioritySchema.default('medium'),
  is_daily: z.literal(true),
});
export type CreateDailyPersonalTaskInput = z.infer<typeof createDailyPersonalTaskSchema>;

export const getEmployeeDossierSchema = z.object({
  agentId: z.string().uuid(),
});

// ── Inferred types ─────────────────────────────────────────

export type CreateMasterTaskFormValues = z.input<typeof CreateMasterTaskSchema>;
export type CreateMasterTaskInput  = z.infer<typeof CreateMasterTaskSchema>;
export type UpdateMasterTaskInput  = z.infer<typeof UpdateMasterTaskSchema>;
export type CreateSubTaskInput     = z.infer<typeof CreateSubTaskSchema>;
export type UpdateSubTaskInput     = z.infer<typeof UpdateSubTaskSchema>;
export type UpdateSubTaskStatusInput = z.infer<typeof UpdateSubTaskStatusSchema>;
export type CreatePersonalTaskInput = z.infer<typeof CreatePersonalTaskSchema>;
export type ImportBatchRowInput    = z.infer<typeof ImportBatchRowSchema>;
export type CreateImportBatchInput = z.infer<typeof CreateImportBatchSchema>;
export type ChecklistItemInput     = z.infer<typeof ChecklistItemSchema>;

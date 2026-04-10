"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type {
  ShopMasterTargetPriority,
  ShopOperationScope,
  TaskProgressUpdate,
  TaskWithLead,
} from "@/lib/types/database";
import { canAccessShopSurfaces } from "@/lib/shop/access";
import type { Profile } from "@/lib/types/database";

const prioritySchema = z.enum(["super_high", "high", "normal"]);

const createShopTaskSchema = z
  .object({
    title: z.string().min(1).max(500),
    notes: z.string().max(5000).optional().nullable(),
    shop_operation_scope: z.enum(["individual", "group"]),
    assigned_to_users: z.array(z.string().uuid()).min(1),
    dueAt: z
      .union([z.date(), z.string().datetime()])
      .transform((v) => (typeof v === "string" ? new Date(v) : v)),
    shop_task_priority: prioritySchema,
    has_target: z.boolean(),
    target_inventory: z.number().int().nonnegative().optional().nullable(),
    shop_product_name: z.string().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.shop_operation_scope === "individual" && data.assigned_to_users.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Individual tasks have exactly one assignee.",
        path: ["assigned_to_users"],
      });
    }
    if (data.shop_operation_scope === "group" && data.assigned_to_users.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "Group tasks need at least two agents.",
        path: ["assigned_to_users"],
      });
    }
    if (data.has_target) {
      if (data.target_inventory == null || data.target_inventory < 1) {
        ctx.addIssue({
          code: "custom",
          message: "Set a target amount (at least 1).",
          path: ["target_inventory"],
        });
      }
      if (!data.shop_product_name?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Product name is required.",
          path: ["shop_product_name"],
        });
      }
    }
  });

export type CreateShopTaskResult = { success: boolean; error?: string; taskId?: string };

export async function createShopTask(
  _prev: CreateShopTaskResult | undefined,
  raw: unknown,
): Promise<CreateShopTaskResult> {
  const parsed = createShopTaskSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role, domain")
    .eq("id", user.id)
    .single();

  const profile = me as Pick<Profile, "role" | "domain"> | null;
  if (!profile || !canAccessShopSurfaces(profile)) {
    return { success: false, error: "Shop workspace access required." };
  }

  const d = parsed.data;
  const iso = d.dueAt.toISOString();
  const notePayload =
    typeof d.notes === "string" ? d.notes.trim() || null : d.notes ?? null;

  const targetInventory = d.has_target ? d.target_inventory ?? null : null;
  const productName = d.has_target ? (d.shop_product_name?.trim() ?? null) : null;

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      lead_id: null,
      assigned_to_users: d.assigned_to_users,
      created_by: user.id,
      title: d.title,
      due_date: iso,
      deadline: iso,
      task_type: "whatsapp_message",
      status: "pending",
      notes: notePayload,
      progress_updates: [],
      shop_operation_scope: d.shop_operation_scope as ShopOperationScope,
      shop_task_priority: d.shop_task_priority as ShopMasterTargetPriority,
      target_inventory: targetInventory,
      target_sold: 0,
      shop_product_name: productName,
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    return { success: false, error: error?.message ?? "Failed to create task" };
  }

  revalidatePath("/shop/workspace");
  revalidatePath("/tasks");
  return { success: true, taskId: inserted.id as string };
}

export type ShopAssigneeOption = { id: string; full_name: string };

export async function getShopAssigneeProfiles(): Promise<ShopAssigneeOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: me } = await supabase
    .from("profiles")
    .select("role, domain")
    .eq("id", user.id)
    .single();

  const profile = me as Pick<Profile, "role" | "domain"> | null;
  if (!profile || !canAccessShopSurfaces(profile)) return [];

  const { data: rows } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .eq("domain", "indulge_shop")
    .in("role", ["agent", "manager", "founder"])
    .order("full_name");

  return (rows ?? []).map((r) => ({
    id: r.id as string,
    full_name: (r.full_name as string) ?? "Unknown",
  }));
}

export type ShopTaskRow = TaskWithLead;

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
  for (const p of profiles ?? []) {
    if (p?.id) profileMap.set(p.id as string, p as { id: string; full_name: string; role: string });
  }

  return tasks.map((t) => {
    const arr = ((t.assigned_to_users as string[] | null) ?? []) as string[];
    const profilesList = arr
      .map((id) => profileMap.get(id))
      .filter(Boolean) as { id: string; full_name: string; role: string }[];
    return {
      ...t,
      assigned_to_profiles: profilesList,
      assigned_to_profile: profilesList[0] ?? null,
    };
  });
}

export async function getOngoingShopTasks(): Promise<ShopTaskRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: me } = await supabase
    .from("profiles")
    .select("role, domain")
    .eq("id", user.id)
    .single();

  const profile = me as Pick<Profile, "role" | "domain"> | null;
  if (!profile || !canAccessShopSurfaces(profile)) return [];

  // Shop tasks live in the existing tasks table.
  // We treat "ongoing" as pending tasks with shop_operation_scope set,
  // filtered to tasks where the current user is an assignee.
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, status, due_date, deadline, notes, task_type, assigned_to_users, progress_updates, shop_operation_scope, shop_task_priority, target_inventory, target_sold, shop_product_name, created_at, updated_at",
    )
    .eq("status", "pending")
    .not("shop_operation_scope", "is", null)
    .contains("assigned_to_users", [user.id])
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true })
    .limit(80);

  if (error) return [];
  const enriched = await enrichTasksWithAssignees(supabase, (data ?? []) as unknown as Record<string, unknown>[]);
  return enriched as unknown as ShopTaskRow[];
}

const registerSaleSchema = z.object({
  taskId: z.string().uuid(),
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().min(5).max(40),
  dealAmount: z.coerce.number().nonnegative(),
});

export type RegisterTaskSaleResult = { success: boolean; error?: string };

export async function registerTaskSale(
  _prev: RegisterTaskSaleResult | undefined,
  raw: unknown,
): Promise<RegisterTaskSaleResult> {
  const parsed = registerSaleSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const agentName = profile?.full_name ?? "Agent";

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select(
      "id, assigned_to_users, shop_product_name, title, progress_updates, target_inventory",
    )
    .eq("id", parsed.data.taskId)
    .single();

  if (taskErr || !task) return { success: false, error: "Task not found" };

  const assignees = (task.assigned_to_users as string[] | null) ?? [];
  const { data: roleRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = roleRow?.role as string | undefined;
  const isElevated = ["admin", "founder", "manager"].includes(role ?? "");
  if (!isElevated && !assignees.includes(user.id)) {
    return { success: false, error: "You are not assigned to this task." };
  }

  const productName =
    (task.shop_product_name as string | null)?.trim() ||
    (task.title as string) ||
    "Product";

  const { error: orderErr } = await supabase.from("shop_orders").insert({
    lead_id: null,
    task_id: parsed.data.taskId,
    assigned_to: user.id,
    product_name: productName,
    amount: parsed.data.dealAmount,
    status: "pending",
    customer_name: parsed.data.customerName.trim(),
    customer_phone: parsed.data.customerPhone.trim(),
  });

  if (orderErr) {
    return { success: false, error: orderErr.message };
  }

  const { error: rpcErr } = await supabase.rpc("increment_shop_task_target_sold", {
    p_task_id: parsed.data.taskId,
  });

  if (rpcErr) {
    return { success: false, error: rpcErr.message };
  }

  const updates = (task.progress_updates ?? []) as TaskProgressUpdate[];
  const saleLine = `🎉 ${agentName} sold 1 unit to ${parsed.data.customerName.trim()}`;
  const newUpdate: TaskProgressUpdate = {
    timestamp: new Date().toISOString(),
    message: saleLine,
    user_id: user.id,
    user_name: agentName,
  };

  const { error: upErr } = await supabase
    .from("tasks")
    .update({ progress_updates: [...updates, newUpdate] })
    .eq("id", parsed.data.taskId);

  if (upErr) {
    return { success: false, error: upErr.message };
  }

  revalidatePath("/shop/workspace");
  revalidatePath(`/shop/workspace/tasks/${parsed.data.taskId}`);
  revalidatePath("/tasks");
  return { success: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeTargetSlaBreached } from "@/lib/shop/sla";
import type {
  ShopMasterTargetPriority,
  ShopMasterTargetStatus,
  ShopOrderStatus,
} from "@/lib/types/database";

function revalidateShopWorkspacePages() {
  revalidatePath("/shop/workspace");
  revalidatePath("/admin/shop/workspace");
}

export type ShopOrderRow = {
  id: string;
  lead_id: string | null;
  task_id?: string | null;
  assigned_to: string | null;
  product_name: string;
  amount: number;
  status: ShopOrderStatus;
  created_at: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  leads: { first_name: string; last_name: string | null } | null;
};

export async function getShopOrders(): Promise<ShopOrderRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("shop_orders")
    .select(
      `
      id,
      lead_id,
      task_id,
      assigned_to,
      product_name,
      amount,
      status,
      created_at,
      customer_name,
      customer_phone,
      leads:lead_id (first_name, last_name)
    `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getShopOrders", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as {
      id: string;
      lead_id: string | null;
      task_id?: string | null;
      assigned_to: string | null;
      product_name: string;
      amount: number;
      status: string;
      created_at: string;
      customer_name?: string | null;
      customer_phone?: string | null;
      leads:
        | { first_name: string; last_name: string | null }
        | { first_name: string; last_name: string | null }[]
        | null;
    };
    const leadRaw = r.leads;
    const leads = Array.isArray(leadRaw) ? leadRaw[0] ?? null : leadRaw;

    return {
      id: r.id,
      lead_id: r.lead_id,
      task_id: r.task_id ?? null,
      assigned_to: r.assigned_to,
      product_name: r.product_name,
      amount: Number(r.amount),
      status: r.status as ShopOrderStatus,
      created_at: r.created_at,
      customer_name: r.customer_name ?? null,
      customer_phone: r.customer_phone ?? null,
      leads,
    };
  });
}

export type MasterTargetWithSla = {
  id: string;
  title: string;
  inventory_total: number;
  inventory_sold: number;
  priority: ShopMasterTargetPriority;
  status: ShopMasterTargetStatus;
  created_at: string;
  last_activity_at: string;
  is_breached: boolean;
};

export async function getActiveMasterTargets(): Promise<MasterTargetWithSla[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: targets, error: tErr } = await supabase
    .from("shop_master_targets")
    .select(
      "id, title, inventory_total, inventory_sold, priority, status, created_at",
    )
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (tErr || !targets?.length) {
    if (tErr) console.error("getActiveMasterTargets", tErr.message);
    return [];
  }

  const ids = targets.map((t) => t.id);
  const { data: updates, error: uErr } = await supabase
    .from("shop_target_updates")
    .select("target_id, created_at")
    .in("target_id", ids);

  if (uErr) {
    console.error("getActiveMasterTargets updates", uErr.message);
    return [];
  }

  const latestByTarget = new Map<string, string>();
  for (const row of updates ?? []) {
    const tid = row.target_id as string;
    const cur = latestByTarget.get(tid);
    const iso = row.created_at as string;
    if (!cur || new Date(iso) > new Date(cur)) latestByTarget.set(tid, iso);
  }

  return targets.map((t) => {
    const priority = t.priority as ShopMasterTargetPriority;
    const lastUpdate = latestByTarget.get(t.id);
    const lastActivityAt = lastUpdate ?? t.created_at;
    const is_breached = computeTargetSlaBreached(priority, lastActivityAt);

    return {
      id: t.id,
      title: t.title,
      inventory_total: t.inventory_total,
      inventory_sold: t.inventory_sold,
      priority,
      status: t.status as ShopMasterTargetStatus,
      created_at: t.created_at,
      last_activity_at: lastActivityAt,
      is_breached,
    };
  });
}

export type TargetUpdateResult = { success: boolean; error?: string };

export async function createTargetUpdate(
  _prev: TargetUpdateResult | undefined,
  formData: FormData,
): Promise<TargetUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }

  const targetId = formData.get("targetId")?.toString()?.trim();
  const notes = formData.get("notes")?.toString() ?? "";
  const unitsRaw = formData.get("unitsSold")?.toString()?.trim();

  if (!targetId) {
    return { success: false, error: "Missing target." };
  }

  const unitsSold = unitsRaw === "" || unitsRaw === undefined ? 0 : Number(unitsRaw);
  if (!Number.isFinite(unitsSold) || unitsSold < 0 || !Number.isInteger(unitsSold)) {
    return { success: false, error: "Units sold must be a non-negative whole number." };
  }

  const { error } = await supabase.from("shop_target_updates").insert({
    target_id: targetId,
    agent_id: user.id,
    notes,
    units_sold_in_update: unitsSold,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateShopWorkspacePages();
  return { success: true };
}

export type ShopOrderMutationResult = { success: boolean; error?: string };

export async function createShopOrder(
  _prev: ShopOrderMutationResult | undefined,
  formData: FormData,
): Promise<ShopOrderMutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }

  const leadId = formData.get("leadId")?.toString()?.trim();
  const productName = formData.get("productName")?.toString()?.trim();
  const amountRaw = formData.get("amount")?.toString()?.trim();
  const assignedTo = formData.get("assignedTo")?.toString()?.trim() || user.id;

  if (!leadId || !productName) {
    return { success: false, error: "Lead and product are required." };
  }

  const amount = amountRaw ? Number(amountRaw) : 0;
  if (!Number.isFinite(amount) || amount < 0) {
    return { success: false, error: "Invalid amount." };
  }

  const { error } = await supabase.from("shop_orders").insert({
    lead_id: leadId,
    assigned_to: assignedTo,
    product_name: productName,
    amount,
    status: "pending",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateShopWorkspacePages();
  return { success: true };
}

export async function updateShopOrder(
  orderId: string,
  patch: { status?: ShopOrderStatus; product_name?: string; amount?: number },
): Promise<ShopOrderMutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }

  const { error } = await supabase.from("shop_orders").update(patch).eq("id", orderId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateShopWorkspacePages();
  return { success: true };
}

export async function deleteShopOrder(orderId: string): Promise<ShopOrderMutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }

  const { error } = await supabase.from("shop_orders").delete().eq("id", orderId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateShopWorkspacePages();
  return { success: true };
}

export type MasterTargetMutationResult = { success: boolean; error?: string };

export async function createMasterTarget(
  _prev: MasterTargetMutationResult | undefined,
  formData: FormData,
): Promise<MasterTargetMutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "founder", "manager"].includes(profile.role)) {
    return { success: false, error: "Only managers, founders and admins can create targets." };
  }

  const title = formData.get("title")?.toString()?.trim();
  const inventoryTotal = Number(formData.get("inventoryTotal")?.toString());
  const priority = formData.get("priority")?.toString() as ShopMasterTargetPriority | undefined;

  if (!title) {
    return { success: false, error: "Title is required." };
  }
  if (!Number.isFinite(inventoryTotal) || inventoryTotal < 0 || !Number.isInteger(inventoryTotal)) {
    return { success: false, error: "Inventory total must be a non-negative integer." };
  }

  const p =
    priority && ["super_high", "high", "normal"].includes(priority)
      ? priority
      : "normal";

  const { error } = await supabase.from("shop_master_targets").insert({
    title,
    inventory_total: inventoryTotal,
    inventory_sold: 0,
    priority: p,
    status: "active",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateShopWorkspacePages();
  return { success: true };
}

export async function updateMasterTarget(
  targetId: string,
  patch: {
    title?: string;
    inventory_total?: number;
    priority?: ShopMasterTargetPriority;
    status?: ShopMasterTargetStatus;
  },
): Promise<MasterTargetMutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You must be signed in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "founder", "manager"].includes(profile.role)) {
    return { success: false, error: "Only managers, founders and admins can update targets." };
  }

  const { error } = await supabase
    .from("shop_master_targets")
    .update(patch)
    .eq("id", targetId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateShopWorkspacePages();
  return { success: true };
}

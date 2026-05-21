"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  BudgetDomain,
  BudgetTransaction,
  BudgetDeliverable,
} from "@/lib/types/database";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as string) ?? "agent";
  return { supabase, user, role };
}

function isPrivileged(role: string) {
  return ["founder", "admin", "super_admin"].includes(role);
}

// ── READ ──────────────────────────────────────────────────────────────────────

export async function getBudgetData(domain: BudgetDomain): Promise<{
  transactions: BudgetTransaction[];
  deliverables: BudgetDeliverable[];
}> {
  const { supabase } = await getAuthUser();

  const [txResult, dlResult] = await Promise.all([
    supabase
      .from("budget_transactions")
      .select("*")
      .eq("domain", domain)
      .order("created_at", { ascending: true }),
    supabase
      .from("budget_deliverables")
      .select("*")
      .eq("domain", domain)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  return {
    transactions: (txResult.data ?? []) as BudgetTransaction[],
    deliverables: (dlResult.data ?? []) as BudgetDeliverable[],
  };
}

export async function getAllBudgetData(): Promise<{
  meta: { transactions: BudgetTransaction[]; deliverables: BudgetDeliverable[] };
  elia: { transactions: BudgetTransaction[]; deliverables: BudgetDeliverable[] };
  zoho: { transactions: BudgetTransaction[]; deliverables: BudgetDeliverable[] };
}> {
  const { supabase } = await getAuthUser();

  const [txResult, dlResult] = await Promise.all([
    supabase
      .from("budget_transactions")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("budget_deliverables")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const txs = (txResult.data ?? []) as BudgetTransaction[];
  const dls = (dlResult.data ?? []) as BudgetDeliverable[];

  const group = (d: BudgetDomain) => ({
    transactions: txs.filter((t) => t.domain === d),
    deliverables: dls.filter((dl) => dl.domain === d),
  });

  return { meta: group("meta"), elia: group("elia"), zoho: group("zoho") };
}

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────

const AddTransactionSchema = z.object({
  domain: z.enum(["meta", "elia", "zoho"]),
  date: z.string().min(1),
  item: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.enum(["INR", "USD"]),
  paid_by: z.string().max(200).optional().nullable(),
});

export async function addBudgetTransaction(
  input: z.infer<typeof AddTransactionSchema>,
): Promise<{ success: boolean; data?: BudgetTransaction; error?: string }> {
  const { supabase, user, role } = await getAuthUser();
  if (!isPrivileged(role)) return { success: false, error: "Insufficient permissions." };

  const parsed = AddTransactionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { data, error } = await supabase
    .from("budget_transactions")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/budget");
  return { success: true, data: data as BudgetTransaction };
}

export async function removeBudgetTransaction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, role } = await getAuthUser();
  if (!isPrivileged(role)) return { success: false, error: "Insufficient permissions." };

  const { error } = await supabase
    .from("budget_transactions")
    .delete()
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  revalidatePath("/budget");
  return { success: true };
}

// ── DELIVERABLES ──────────────────────────────────────────────────────────────

const AddDeliverableSchema = z.object({
  domain: z.enum(["meta", "elia", "zoho"]),
  text: z.string().min(1).max(500),
  sort_order: z.number().int().optional(),
});

export async function addBudgetDeliverable(
  input: z.infer<typeof AddDeliverableSchema>,
): Promise<{ success: boolean; data?: BudgetDeliverable; error?: string }> {
  const { supabase, user, role } = await getAuthUser();
  if (!isPrivileged(role)) return { success: false, error: "Insufficient permissions." };

  const parsed = AddDeliverableSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { data, error } = await supabase
    .from("budget_deliverables")
    .insert({ ...parsed.data, done: false, created_by: user.id })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/budget");
  return { success: true, data: data as BudgetDeliverable };
}

export async function toggleBudgetDeliverable(
  id: string,
  done: boolean,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, role } = await getAuthUser();
  if (!isPrivileged(role)) return { success: false, error: "Insufficient permissions." };

  const { error } = await supabase
    .from("budget_deliverables")
    .update({ done })
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  revalidatePath("/budget");
  return { success: true };
}

export async function removeBudgetDeliverable(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, role } = await getAuthUser();
  if (!isPrivileged(role)) return { success: false, error: "Insufficient permissions." };

  const { error } = await supabase
    .from("budget_deliverables")
    .delete()
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  revalidatePath("/budget");
  return { success: true };
}

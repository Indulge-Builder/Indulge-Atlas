"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { sanitizeText } from "@/lib/utils/sanitize";
import { isPrivilegedRole } from "@/lib/types/database";
import type { SlaPolicy } from "@/lib/types/database";
import { slaPolicySchema, type SlaPolicyInput } from "@/lib/schemas/concierge";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

const REVALIDATE = "/concierge/tickets/sla-policies";

/** Live rows from public.sla_policies (RLS select = any authenticated). */
export async function listSlaPolicies(): Promise<SlaPolicy[]> {
  try {
    const { supabase } = await getAuthUser();
    const { data } = await supabase
      .from("sla_policies")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    return (data as SlaPolicy[]) ?? [];
  } catch (err) {
    console.error("[listSlaPolicies]", err);
    return [];
  }
}

export async function getSlaPolicy(id: string): Promise<SlaPolicy | null> {
  try {
    const { supabase } = await getAuthUser();
    const { data } = await supabase.from("sla_policies").select("*").eq("id", id).maybeSingle();
    return (data as SlaPolicy) ?? null;
  } catch (err) {
    console.error("[getSlaPolicy]", err);
    return null;
  }
}

function toRow(d: SlaPolicyInput) {
  return {
    name: sanitizeText(d.name),
    category_id: d.categoryId ?? null,
    priority: d.priority ?? null,
    first_response_minutes: d.firstResponseMinutes,
    resolution_minutes: d.resolutionMinutes,
    is_default: d.isDefault,
    is_active: d.isActive,
    escalation_enabled: d.escalationEnabled,
    clock: d.clock,
  };
}

/** Map DB errors to friendly copy (esp. the one-active-default-per-priority index). */
function friendlyError(error: { code?: string; message?: string } | null): string {
  if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message ?? ""))) {
    return "There's already an active default policy for that priority. Deactivate it or clear 'Default policy' first.";
  }
  if (error && /row-level security|permission|denied/i.test(error.message ?? "")) {
    return "You don't have permission to change SLA policies.";
  }
  return "Could not save the policy.";
}

export async function createSlaPolicy(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = slaPolicySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can manage SLA policies." };
    const { data, error } = await supabase.from("sla_policies").insert(toRow(parsed.data)).select("id").single();
    if (error || !data) {
      console.error("[createSlaPolicy]", error);
      return { success: false, error: friendlyError(error) };
    }
    revalidatePath(REVALIDATE);
    return { success: true, data: { id: data.id as string } };
  } catch (err) {
    console.error("[createSlaPolicy]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function updateSlaPolicy(id: string, input: unknown): Promise<ActionResult> {
  const parsed = slaPolicySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can manage SLA policies." };
    const { error } = await supabase.from("sla_policies").update(toRow(parsed.data)).eq("id", id);
    if (error) {
      console.error("[updateSlaPolicy]", error);
      return { success: false, error: friendlyError(error) };
    }
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[updateSlaPolicy]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function toggleSlaPolicyActive(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can manage SLA policies." };
    const { error } = await supabase.from("sla_policies").update({ is_active: isActive }).eq("id", id);
    if (error) {
      console.error("[toggleSlaPolicyActive]", error);
      return { success: false, error: friendlyError(error) };
    }
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[toggleSlaPolicyActive]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function deleteSlaPolicy(id: string): Promise<ActionResult> {
  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can manage SLA policies." };
    const { error } = await supabase.from("sla_policies").delete().eq("id", id);
    if (error) {
      console.error("[deleteSlaPolicy]", error);
      return { success: false, error: "Could not delete the policy." };
    }
    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[deleteSlaPolicy]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

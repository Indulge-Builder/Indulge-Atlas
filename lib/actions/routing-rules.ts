"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  LeadRoutingActionType,
  LeadRoutingRuleWithAgent,
  Profile,
} from "@/lib/types/database";
import { z } from "zod";

async function requireAdminOrScout() {
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

  const role = (profile as { role: string } | null)?.role;
  if (role !== "admin" && role !== "scout") {
    throw new Error("Unauthorized: admin or scout required");
  }

  return { supabase, user };
}

const conditionOperatorSchema = z.enum(["equals", "contains", "starts_with"]);
const actionTypeSchema = z.enum(["assign_to_agent", "route_to_domain_pool"]);
const routingDomainSchema = z.enum([
  "indulge_global",
  "indulge_house",
  "indulge_shop",
  "indulge_legacy",
]);

const createRoutingRuleSchema = z
  .object({
    rule_name: z.string().trim().min(1, "Rule name is required"),
    condition_field: z.string().trim().min(1),
    condition_operator: conditionOperatorSchema,
    condition_value: z.string().min(1, "Match value is required"),
    action_type: actionTypeSchema,
    action_target_uuid: z.string().uuid().nullable(),
    action_target_domain: routingDomainSchema.nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.action_type === "assign_to_agent") {
      if (!data.action_target_uuid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select an agent",
          path: ["action_target_uuid"],
        });
      }
    } else if (data.action_type === "route_to_domain_pool") {
      if (!data.action_target_domain) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select a domain",
          path: ["action_target_domain"],
        });
      }
    }
  });

export type CreateRoutingRuleInput = z.infer<typeof createRoutingRuleSchema>;

export async function getRoutingRules(): Promise<LeadRoutingRuleWithAgent[]> {
  const { supabase } = await requireAdminOrScout();

  const { data, error } = await supabase
    .from("lead_routing_rules")
    .select(
      `
      *,
      target_profile:profiles!action_target_uuid (
        id,
        full_name,
        email
      )
    `,
    )
    .order("priority", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as LeadRoutingRuleWithAgent[];
}

/** Active sales agents for routing-rule targets. (Does not filter `is_on_leave` so this works before migration 049; assignment RPC still skips on-leave agents.) */
export async function getActiveAgentsForRouting(): Promise<
  Pick<Profile, "id" | "full_name" | "email" | "domain">[]
> {
  const { supabase } = await requireAdminOrScout();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, domain")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<Profile, "id" | "full_name" | "email" | "domain">[];
}

export async function createRoutingRule(
  raw: CreateRoutingRuleInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = createRoutingRuleSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const { supabase } = await requireAdminOrScout();
    const d = parsed.data;

    const { data: maxRow } = await supabase
      .from("lead_routing_rules")
      .select("priority")
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPriority = (maxRow?.priority ?? 0) + 1;

    const insert = {
      priority: nextPriority,
      rule_name: d.rule_name,
      is_active: true,
      condition_field: d.condition_field,
      condition_operator: d.condition_operator,
      condition_value: d.condition_value,
      action_type: d.action_type as LeadRoutingActionType,
      action_target_uuid:
        d.action_type === "assign_to_agent" ? d.action_target_uuid : null,
      action_target_domain:
        d.action_type === "route_to_domain_pool" ? d.action_target_domain : null,
    };

    const { error } = await supabase.from("lead_routing_rules").insert(insert);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/routing");
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create rule";
    return { success: false, error: msg };
  }
}

export async function toggleRuleStatus(
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) return { success: false, error: "Invalid rule id" };

    const { supabase } = await requireAdminOrScout();

    const { error } = await supabase
      .from("lead_routing_rules")
      .update({ is_active: isActive })
      .eq("id", parsed.data);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/routing");
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update rule";
    return { success: false, error: msg };
  }
}

export async function deleteRoutingRule(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) return { success: false, error: "Invalid rule id" };

    const { supabase } = await requireAdminOrScout();

    const { error } = await supabase
      .from("lead_routing_rules")
      .delete()
      .eq("id", parsed.data);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/routing");
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete rule";
    return { success: false, error: msg };
  }
}

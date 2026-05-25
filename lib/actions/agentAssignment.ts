"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { IndulgeDomain } from "@/lib/types/database";
import type { AgentWithRoutingStatus } from "@/lib/types/agentAssignment";
import { LEAD_DOMAINS } from "@/lib/types/agentAssignment";

// ── Auth guard ────────────────────────────────────────────────────────────────

async function requireAdminOrManager() {
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
  if (!["admin", "founder", "manager", "super_admin"].includes(role ?? "")) {
    throw new Error("Unauthorized");
  }
  return { supabase, user };
}

// ── Validation schemas ────────────────────────────────────────────────────────

const domainSchema = z.enum([
  "indulge_concierge",
  "indulge_shop",
  "indulge_house",
  "indulge_legacy",
]);

const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Must be HH:MM")
  .nullable();

// ── Data fetch ────────────────────────────────────────────────────────────────

/**
 * Returns all lead-eligible agents (role=agent, is_active=true) merged with
 * their agent_routing_config row if one exists. Used by both Assignment and
 * Shifts pages.
 */
export async function getAgentsWithRoutingStatus(
  domain: IndulgeDomain | "all",
): Promise<AgentWithRoutingStatus[]> {
  const { supabase } = await requireAdminOrManager();

  // Fetch all active agents in lead-eligible domains
  let profilesQuery = supabase
    .from("profiles")
    .select("id, full_name, email, domain")
    .eq("role", "agent")
    .eq("is_active", true)
    .in("domain", LEAD_DOMAINS)
    .order("full_name");

  if (domain !== "all") {
    profilesQuery = profilesQuery.eq("domain", domain);
  }

  const { data: profiles, error: profilesErr } = await profilesQuery;
  if (profilesErr) throw new Error(profilesErr.message);

  // Fetch all routing config rows for lead domains
  const { data: configs, error: configsErr } = await supabase
    .from("agent_routing_config")
    .select(
      "id, user_id, email, is_active, daily_cap, priority, shift_start, shift_end, notes",
    )
    .in("domain", LEAD_DOMAINS);

  if (configsErr) throw new Error(configsErr.message);

  // Merge by user_id
  const configMap = new Map(
    (configs ?? []).map((c) => [c.user_id as string, c]),
  );

  return (profiles ?? []).map((p) => {
    const cfg = configMap.get(p.id as string) ?? null;
    const poolStatus = cfg === null
      ? "unmanaged"
      : cfg.is_active
        ? "receiving"
        : "paused";

    return {
      id: p.id as string,
      full_name: (p.full_name as string) ?? "",
      email: p.email as string,
      domain: p.domain as IndulgeDomain,
      config_id: cfg?.id ?? null,
      is_active: cfg?.is_active ?? null,
      daily_cap: cfg?.daily_cap ?? null,
      priority: cfg?.priority ?? 100,
      shift_start: cfg?.shift_start ?? null,
      shift_end: cfg?.shift_end ?? null,
      notes: cfg?.notes ?? null,
      pool_status: poolStatus as AgentWithRoutingStatus["pool_status"],
    };
  });
}

// ── Pool management ───────────────────────────────────────────────────────────

/** Add an agent to the lead pool (upserts with is_active=true). */
export async function addAgentToPool(
  userId: string,
  domain: IndulgeDomain,
): Promise<{ success: boolean; error?: string }> {
  try {
    domainSchema.parse(domain);
    const { supabase } = await requireAdminOrManager();

    // Fetch agent profile for email + name
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return { success: false, error: "Agent not found" };
    }

    // Compute next priority (max + 10, or 10 if table empty for domain)
    const { data: maxRow } = await supabase
      .from("agent_routing_config")
      .select("priority")
      .eq("domain", domain)
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPriority = maxRow ? (maxRow.priority as number) + 10 : 10;

    const { error } = await supabase.from("agent_routing_config").upsert(
      {
        user_id: userId,
        email: profile.email as string,
        domain,
        is_active: true,
        priority: nextPriority,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/assignment");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/** Pause an agent — keeps them in the config but is_active=false. */
export async function pauseAgent(
  userId: string,
  domain: IndulgeDomain,
): Promise<{ success: boolean; error?: string }> {
  try {
    domainSchema.parse(domain);
    const { supabase } = await requireAdminOrManager();

    const { error } = await supabase
      .from("agent_routing_config")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("domain", domain);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/assignment");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/** Remove an agent from the config entirely (they become "unmanaged"). */
export async function removeAgentFromPool(
  userId: string,
  domain: IndulgeDomain,
): Promise<{ success: boolean; error?: string }> {
  try {
    domainSchema.parse(domain);
    const { supabase } = await requireAdminOrManager();

    const { error } = await supabase
      .from("agent_routing_config")
      .delete()
      .eq("user_id", userId)
      .eq("domain", domain);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/assignment");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Shift management ──────────────────────────────────────────────────────────

export interface UpsertShiftParams {
  userId: string;
  domain: IndulgeDomain;
  shift_start: string | null; // "HH:MM"
  shift_end: string | null;   // "HH:MM"
  daily_cap: number | null;
}

/** Upsert shift window and daily cap for an agent. */
export async function upsertAgentShift(
  params: UpsertShiftParams,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId, domain, daily_cap } = params;
    domainSchema.parse(domain);

    // Validate shift times — both present or both absent
    const shift_start = timeSchema.parse(params.shift_start);
    const shift_end = timeSchema.parse(params.shift_end);

    if ((shift_start == null) !== (shift_end == null)) {
      return {
        success: false,
        error: "Shift start and end must both be set or both be empty",
      };
    }

    if (daily_cap !== null && daily_cap < 1) {
      return { success: false, error: "Daily cap must be at least 1" };
    }

    const { supabase } = await requireAdminOrManager();

    // Check if row exists
    const { data: existing } = await supabase
      .from("agent_routing_config")
      .select("id, is_active, priority")
      .eq("user_id", userId)
      .eq("domain", domain)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("agent_routing_config")
        .update({
          shift_start: shift_start ? `${shift_start}:00` : null,
          shift_end: shift_end ? `${shift_end}:00` : null,
          daily_cap,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("domain", domain);

      if (error) return { success: false, error: error.message };
    } else {
      // No existing row — fetch email and insert
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .single();

      if (profileErr || !profile) {
        return { success: false, error: "Agent not found" };
      }

      const { data: maxRow } = await supabase
        .from("agent_routing_config")
        .select("priority")
        .eq("domain", domain)
        .order("priority", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPriority = maxRow ? (maxRow.priority as number) + 10 : 10;

      const { error } = await supabase.from("agent_routing_config").insert({
        user_id: userId,
        email: profile.email as string,
        domain,
        is_active: true,
        priority: nextPriority,
        shift_start: shift_start ? `${shift_start}:00` : null,
        shift_end: shift_end ? `${shift_end}:00` : null,
        daily_cap,
      });

      if (error) return { success: false, error: error.message };
    }

    revalidatePath("/admin/shifts");
    revalidatePath("/admin/assignment");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/** Clear shift window for an agent (sets both to null, preserves is_active + daily_cap). */
export async function clearAgentShift(
  userId: string,
  domain: IndulgeDomain,
): Promise<{ success: boolean; error?: string }> {
  try {
    domainSchema.parse(domain);
    const { supabase } = await requireAdminOrManager();

    const { error } = await supabase
      .from("agent_routing_config")
      .update({
        shift_start: null,
        shift_end: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("domain", domain);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/shifts");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

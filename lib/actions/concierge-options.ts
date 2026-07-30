"use server";

import { getAuthUser } from "@/lib/auth/getAuthUser";
import type { AgentOption, CategoryOption, ClientOption, CannedOption } from "@/components/concierge/tickets/panelTypes";
import type { ConciergeGroup } from "@/lib/types/database";

/** Active category taxonomy for filters + the create form. */
export async function getConciergeCategories(): Promise<CategoryOption[]> {
  try {
    const { supabase } = await getAuthUser();
    const { data } = await supabase
      .from("ticket_categories")
      .select("id, name, parent_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return (data as CategoryOption[]) ?? [];
  } catch (err) {
    console.error("[getConciergeCategories]", err);
    return [];
  }
}

/**
 * Active agents/managers assignable to concierge tickets, sourced from the
 * concierge_agent_groups membership table — an agent may belong to MANY groups.
 * Each returned agent carries its full `groups[]`. Pass { group } to keep only
 * agents who are members of that group (e.g. a ticket's org_group); omit it to
 * list every tagged agent (the create form filters client-side by group).
 * Agents with no group membership are excluded. RLS still governs edit rights.
 */
export async function getAssignableAgents(opts?: { group?: ConciergeGroup }): Promise<AgentOption[]> {
  try {
    const { supabase } = await getAuthUser();

    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("role", ["agent", "manager"])
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    const rows = (profs as { id: string; full_name: string | null }[] | null) ?? [];
    if (rows.length === 0) return [];

    const byId = new Map<string, AgentOption>();
    for (const p of rows) byId.set(p.id, { id: p.id, full_name: p.full_name ?? "—", groups: [] });

    const { data: mems } = await supabase
      .from("concierge_agent_groups")
      .select("profile_id, org_group")
      .in("profile_id", [...byId.keys()]);

    for (const m of (mems as { profile_id: string; org_group: ConciergeGroup }[] | null) ?? []) {
      byId.get(m.profile_id)?.groups.push(m.org_group);
    }

    let agents = [...byId.values()].filter((a) => a.groups.length > 0);
    if (opts?.group) agents = agents.filter((a) => a.groups.includes(opts.group!));
    return agents;
  } catch (err) {
    console.error("[getAssignableAgents]", err);
    return [];
  }
}

/** Active canned responses for the composer picker. */
export async function getCannedResponses(): Promise<CannedOption[]> {
  try {
    const { supabase } = await getAuthUser();
    const { data } = await supabase
      .from("canned_responses")
      .select("id, name, shortcut")
      .eq("is_active", true)
      .order("name", { ascending: true });
    return (data as CannedOption[]) ?? [];
  } catch (err) {
    console.error("[getCannedResponses]", err);
    return [];
  }
}

/** Clients the caller can create a ticket for (RLS-scoped). Matches first/last name,
 *  full name ("First Last"), or phone. */
export async function getClientOptions(search?: string): Promise<ClientOption[]> {
  try {
    const { supabase } = await getAuthUser();
    let q = supabase
      .from("clients")
      .select("id, first_name, last_name, phone_number, concierge_group")
      .order("first_name", { ascending: true })
      .limit(50);
    if (search && search.trim()) {
      // Strip PostgREST filter-breaking chars before building the OR string.
      const s = search.trim().replace(/[%,()]/g, "");
      if (s) {
        const parts = s.split(/\s+/);
        if (parts.length > 1) {
          // "First Last" → match first name AND last name.
          q = q.ilike("first_name", `%${parts[0]}%`).ilike("last_name", `%${parts.slice(1).join(" ")}%`);
        } else {
          q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone_number.ilike.%${s}%`);
        }
      }
    }
    const { data } = await q;
     
    return ((data as any[]) ?? []).map((c) => ({
      id: c.id as string,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown",
      group: (c.concierge_group as ConciergeGroup | null) ?? null,
      phone: (c.phone_number as string | null) ?? null,
    }));
  } catch (err) {
    console.error("[getClientOptions]", err);
    return [];
  }
}

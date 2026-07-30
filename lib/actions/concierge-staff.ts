"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole, CONCIERGE_GROUPS } from "@/lib/types/database";
import type { ConciergeGroup } from "@/lib/types/database";
import { conciergeGroupSchema } from "@/lib/schemas/concierge";
import { createUser } from "@/lib/actions/admin";
import { userRoleSchema } from "@/lib/validations/user";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface ConciergeStaffRow {
  id: string;
  full_name: string;
  role: string;
  /** Every concierge group this agent belongs to (one agent → many groups). */
  groups: ConciergeGroup[];
}

export interface ConciergeStaffList {
  staff: ConciergeStaffRow[];
  /** Per-group tally (each membership counted) keyed by ConciergeGroup value, plus "unassigned". */
  counts: Record<string, number>;
}

const REVALIDATE = "/admin";

const QUEENDOM_GROUP_TO_SLUG: Record<ConciergeGroup, string> = {
  anishqa: "anishqa-queendom",
  ananyshree: "ananyshree-queendom",
};

function isActiveConciergeGroup(g: string): g is ConciergeGroup {
  return (CONCIERGE_GROUPS as readonly string[]).includes(g);
}

function tallyCounts(staff: ConciergeStaffRow[]): Record<string, number> {
  const counts: Record<string, number> = { unassigned: 0 };
  for (const g of CONCIERGE_GROUPS) counts[g] = 0;
  for (const s of staff) {
    if (s.groups.length === 0) counts.unassigned += 1;
    else for (const g of s.groups) counts[g] = (counts[g] ?? 0) + 1;
  }
  return counts;
}

const EMPTY: ConciergeStaffList = { staff: [], counts: { unassigned: 0 } };

/**
 * Concierge-facing staff candidates for group tagging: active agents/managers whose
 * department is 'concierge' or unset, each with the full set of concierge groups they
 * belong to (concierge_agent_groups). Admin/founder only. Data straight from the DB.
 */
export async function listConciergeStaff(): Promise<ConciergeStaffList> {
  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return EMPTY;

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("is_active", true)
      .in("role", ["agent", "manager"])
      .or("department.eq.concierge,department.is.null")
      .order("full_name", { ascending: true });

    const rows = (data as { id: string; full_name: string | null; role: string }[] | null) ?? [];
    const byId = new Map<string, ConciergeStaffRow>();
    for (const p of rows) {
      byId.set(p.id, { id: p.id, full_name: p.full_name ?? "—", role: p.role, groups: [] });
    }

    if (byId.size > 0) {
      const { data: mems } = await supabase
        .from("concierge_agent_groups")
        .select("profile_id, org_group")
        .in("profile_id", [...byId.keys()]);
      for (const m of (mems as { profile_id: string; org_group: string }[] | null) ?? []) {
        if (!isActiveConciergeGroup(m.org_group)) continue;
        byId.get(m.profile_id)?.groups.push(m.org_group);
      }
    }

    const staff = [...byId.values()];
    return { staff, counts: tallyCounts(staff) };
  } catch (err) {
    console.error("[listConciergeStaff]", err);
    return EMPTY;
  }
}

const setAgentGroupsSchema = z.object({
  profileId: z.string().uuid(),
  groups: z.array(conciergeGroupSchema).max(20),
});

/**
 * Replace a staff member's set of concierge groups (one agent → many groups).
 * Admin/founder only; uses the request-scoped client so the concierge_agent_groups +
 * profiles RLS policies (admin/founder) govern it — NOT the service role.
 * Keeps profiles.concierge_group as a "primary" that is one of the memberships.
 */
export async function setAgentGroups(input: unknown): Promise<ActionResult> {
  const parsed = setAgentGroupsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { profileId } = parsed.data;
  const groups = [...new Set(parsed.data.groups)];

  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can assign groups." };

    // Diff against current membership so a partial failure never nukes everything.
    const { data: curRows } = await supabase
      .from("concierge_agent_groups")
      .select("org_group")
      .eq("profile_id", profileId);
    const current = new Set(
      ((curRows as { org_group: string }[] | null) ?? [])
        .map((r) => r.org_group)
        .filter(isActiveConciergeGroup),
    );
    const next = new Set(groups);
    const toRemove = [...current].filter((g) => !next.has(g));
    const toAdd = [...next].filter((g) => !current.has(g));

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("concierge_agent_groups")
        .delete()
        .eq("profile_id", profileId)
        .in("org_group", toRemove);
      if (error) {
        console.error("[setAgentGroups] delete", error);
        return { success: false, error: "Could not update the agent's groups." };
      }
    }
    if (toAdd.length > 0) {
      const { error } = await supabase
        .from("concierge_agent_groups")
        .insert(toAdd.map((g) => ({ profile_id: profileId, org_group: g })));
      if (error) {
        console.error("[setAgentGroups] insert", error);
        return { success: false, error: "Could not update the agent's groups." };
      }
    }

    // Keep the primary group in sync: preserve it if still a member, else pick the first.
    const { data: cur } = await supabase.from("profiles").select("concierge_group").eq("id", profileId).single();
    const curPrimaryRaw = (cur?.concierge_group as string | null) ?? null;
    const curPrimary = curPrimaryRaw && isActiveConciergeGroup(curPrimaryRaw) ? curPrimaryRaw : null;
    const nextPrimary: ConciergeGroup | null =
      curPrimary && next.has(curPrimary) ? curPrimary : (groups[0] ?? null);
    if (nextPrimary !== curPrimary) {
      const { error } = await supabase.from("profiles").update({ concierge_group: nextPrimary }).eq("id", profileId);
      if (error) {
        console.error("[setAgentGroups] primary", error);
        return { success: false, error: "Groups saved, but updating the primary group failed." };
      }
    }

    // Mirror Queendom membership into agent_group_members (org directory).
    const { data: qGroups } = await supabase
      .from("agent_groups")
      .select("id, slug")
      .in("slug", Object.values(QUEENDOM_GROUP_TO_SLUG));
    for (const g of (qGroups as { id: string; slug: string }[] | null) ?? []) {
      const queendom = (Object.entries(QUEENDOM_GROUP_TO_SLUG).find(([, s]) => s === g.slug)?.[0] ??
        null) as ConciergeGroup | null;
      if (!queendom) continue;
      if (next.has(queendom)) {
        await supabase
          .from("agent_group_members")
          .upsert({ group_id: g.id, profile_id: profileId }, { onConflict: "group_id,profile_id" });
      } else {
        await supabase
          .from("agent_group_members")
          .delete()
          .eq("group_id", g.id)
          .eq("profile_id", profileId);
      }
    }

    revalidatePath(REVALIDATE);
    revalidatePath("/admin/groups");
    return { success: true };
  } catch (err) {
    console.error("[setAgentGroups]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

const createConciergeAgentSchema = z
  .object({
    email: z
      .string()
      .email("Invalid email address")
      .transform((v) => v.trim().toLowerCase()),
    full_name: z
      .string()
      .min(1, "Full name is required")
      .max(120)
      .transform((v) => v.trim()),
    job_title: z
      .string()
      .min(1, "Job title is required")
      .max(120)
      .transform((v) => v.trim()),
    role: userRoleSchema,
    groups: z.array(conciergeGroupSchema).min(1, "Select at least one Queendom").max(2),
    reports_to: z.string().uuid().nullable().optional(),
    send_invite: z.boolean().optional(),
    password: z.preprocess(
      (val) => (val === "" || val === null || val === undefined ? undefined : val),
      z.string().min(12, "Password must be at least 12 characters").optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.send_invite === false && (!data.password || data.password.length < 12)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password must be at least 12 characters when not sending an invite",
      });
    }
  });

export type CreateConciergeAgentInput = z.infer<typeof createConciergeAgentSchema>;

/**
 * Create a concierge user (dept + domain locked) and assign Queendom ticket scope.
 * Used from User Management when department = concierge.
 */
export async function createConciergeAgent(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createConciergeAgentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { role } = await getAuthUser();
    if (!isPrivilegedRole(role)) {
      return { success: false, error: "Only admins can create concierge agents." };
    }

    const { groups, ...userFields } = parsed.data;
    const created = await createUser({
      email: userFields.email,
      full_name: userFields.full_name,
      job_title: userFields.job_title,
      role: userFields.role,
      domain: "indulge_concierge",
      department: "concierge",
      reports_to: userFields.reports_to ?? null,
      send_invite: userFields.send_invite,
      password: userFields.password,
    });

    if (!created.success || !created.data?.id) {
      return {
        success: false,
        error: created.error ?? "Could not create the agent.",
        ...(created.code ? { code: created.code } : {}),
      };
    }

    const groupsRes = await setAgentGroups({
      profileId: created.data.id,
      groups,
    });
    if (!groupsRes.success) {
      return {
        success: false,
        error: `Agent created, but group assignment failed: ${groupsRes.error ?? "unknown error"}. Assign groups in Edit User.`,
        data: created.data,
      };
    }

    revalidatePath(REVALIDATE);
    return { success: true, data: created.data };
  } catch (err) {
    console.error("[createConciergeAgent]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

/**
 * Queendom memberships for a set of profiles (User Management chips / edit form).
 * Admin/manager only. Keys missing from the map have no groups.
 */
export async function getConciergeGroupsByProfileIds(
  profileIds: string[],
): Promise<Record<string, ConciergeGroup[]>> {
  const out: Record<string, ConciergeGroup[]> = {};
  if (profileIds.length === 0) return out;

  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role) && role !== "manager") return out;

    const { data } = await supabase
      .from("concierge_agent_groups")
      .select("profile_id, org_group")
      .in("profile_id", profileIds);

    for (const row of (data as { profile_id: string; org_group: string }[] | null) ?? []) {
      if (!isActiveConciergeGroup(row.org_group)) continue;
      const list = out[row.profile_id] ?? (out[row.profile_id] = []);
      list.push(row.org_group);
    }
    return out;
  } catch (err) {
    console.error("[getConciergeGroupsByProfileIds]", err);
    return out;
  }
}

/** Single-profile Queendom memberships for Edit User. */
export async function getConciergeGroupsForProfile(
  profileId: string,
): Promise<ConciergeGroup[]> {
  const map = await getConciergeGroupsByProfileIds([profileId]);
  return map[profileId] ?? [];
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import { sanitizeText } from "@/lib/utils/sanitize";
import type {
  AgentGroupWithMembers,
  ConciergeGroup,
  UserRole,
} from "@/lib/types/database";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

const REVALIDATE = "/admin/groups";

/** Queendom group slugs → concierge_group, so membership also scopes tickets. */
const QUEENDOM_SLUG_TO_GROUP: Record<string, ConciergeGroup> = {
  "anishqa-queendom": "anishqa",
  "ananyshree-queendom": "ananyshree",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ActiveProfileOption {
  id: string;
  full_name: string;
  email: string;
  /**
   * `UserRole`, not `string` — this value is assigned straight into
   * `GroupMember.role` (which is `Pick<Profile, "role">`), so widening it here
   * only moved the mismatch into the client component.
   */
  role: UserRole;
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** All groups with their members joined. Admin/founder/super_admin only. */
export async function listGroups(): Promise<AgentGroupWithMembers[]> {
  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return [];

    const { data, error } = await supabase
      .from("agent_groups")
      .select(
        "id, name, slug, source, fd_group_id, is_active, created_at, agent_group_members(role_in_group, profile:profiles(id, full_name, email, role))",
      )
      .eq("is_active", true)
      .in("slug", ["anishqa-queendom", "ananyshree-queendom"])
      .order("name", { ascending: true });

    if (error) {
      console.error("[listGroups]", error);
      return [];
    }


    return ((data as any[]) ?? []).map((g) => {

      const members = ((g.agent_group_members as any[]) ?? [])
        .map((m) => {
          const p = m.profile;
          if (!p) return null;
          return {
            id: p.id as string,
            full_name: (p.full_name as string | null) ?? "—",
            email: (p.email as string | null) ?? "",
            role: p.role as UserRole,
            role_in_group: (m.role_in_group as string | null) ?? null,
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .sort((a, b) => a.full_name.localeCompare(b.full_name));

      return {
        id: g.id as string,
        name: g.name as string,
        slug: (g.slug as string | null) ?? null,
        source: g.source as string,
        fd_group_id: (g.fd_group_id as number | null) ?? null,
        is_active: g.is_active as boolean,
        created_at: g.created_at as string,
        members,
        member_count: members.length,
      };
    });
  } catch (err) {
    console.error("[listGroups]", err);
    return [];
  }
}

/** Active profiles for the member picker. Admin/founder/super_admin only. */
export async function listActiveProfiles(): Promise<ActiveProfileOption[]> {
  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return [];

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (error) {
      console.error("[listActiveProfiles]", error);
      return [];
    }

    return ((data as any[]) ?? []).map((p) => ({
      id: p.id as string,
      full_name: (p.full_name as string | null) ?? "—",
      email: (p.email as string | null) ?? "",
      role: p.role as UserRole,
    }));
  } catch (err) {
    console.error("[listActiveProfiles]", err);
    return [];
  }
}

// ── Mutations (admin-gated; RLS is second-layer protection) ─────────────────

const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(80, "Name too long"),
});

export async function createGroup(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const name = sanitizeText(parsed.data.name).trim();
  if (!name) return { success: false, error: "Group name is required" };

  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can create groups." };

    const { data, error } = await supabase
      .from("agent_groups")
      .insert({ name, slug: slugify(name), source: "atlas" })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return { success: false, error: "A group with that name already exists." };
      console.error("[createGroup]", error);
      return { success: false, error: "Could not create the group." };
    }

    revalidatePath(REVALIDATE);
    return { success: true, data: { id: (data as { id: string }).id } };
  } catch (err) {
    console.error("[createGroup]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

const renameGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Group name is required").max(80, "Name too long"),
});

export async function renameGroup(input: unknown): Promise<ActionResult> {
  const parsed = renameGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const name = sanitizeText(parsed.data.name).trim();
  if (!name) return { success: false, error: "Group name is required" };

  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can rename groups." };

    const { error } = await supabase
      .from("agent_groups")
      .update({ name, slug: slugify(name) })
      .eq("id", parsed.data.id);

    if (error) {
      if (error.code === "23505") return { success: false, error: "A group with that name already exists." };
      console.error("[renameGroup]", error);
      return { success: false, error: "Could not rename the group." };
    }

    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[renameGroup]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

const setActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export async function setGroupActive(input: unknown): Promise<ActionResult> {
  const parsed = setActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can change groups." };

    const { error } = await supabase
      .from("agent_groups")
      .update({ is_active: parsed.data.isActive })
      .eq("id", parsed.data.id);

    if (error) {
      console.error("[setGroupActive]", error);
      return { success: false, error: "Could not update the group." };
    }

    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[setGroupActive]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

const memberSchema = z.object({
  groupId: z.string().uuid(),
  profileId: z.string().uuid(),
});

export async function addMember(input: unknown): Promise<ActionResult> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { groupId, profileId } = parsed.data;

  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can manage members." };

    const { data: group } = await supabase
      .from("agent_groups")
      .select("slug")
      .eq("id", groupId)
      .single();

    const { error } = await supabase
      .from("agent_group_members")
      .upsert({ group_id: groupId, profile_id: profileId }, { onConflict: "group_id,profile_id" });

    if (error) {
      console.error("[addMember]", error);
      return { success: false, error: "Could not add the member." };
    }

    // Adding to a Queendom group also scopes the profile for concierge tickets.
    const slug = (group as { slug: string | null } | null)?.slug ?? "";
    const queendom = QUEENDOM_SLUG_TO_GROUP[slug];
    if (queendom) {
      await supabase.from("profiles").update({ concierge_group: queendom }).eq("id", profileId);
      await supabase
        .from("concierge_agent_groups")
        .upsert({ profile_id: profileId, org_group: queendom }, { onConflict: "profile_id,org_group" });
    }

    revalidatePath(REVALIDATE);
    revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    console.error("[addMember]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function removeMember(input: unknown): Promise<ActionResult> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { groupId, profileId } = parsed.data;

  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can manage members." };

    const { error } = await supabase
      .from("agent_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("profile_id", profileId);

    if (error) {
      console.error("[removeMember]", error);
      return { success: false, error: "Could not remove the member." };
    }

    const { data: group } = await supabase
      .from("agent_groups")
      .select("slug")
      .eq("id", groupId)
      .single();
    const slug = (group as { slug: string | null } | null)?.slug ?? "";
    const queendom = QUEENDOM_SLUG_TO_GROUP[slug];
    if (queendom) {
      await supabase
        .from("concierge_agent_groups")
        .delete()
        .eq("profile_id", profileId)
        .eq("org_group", queendom);

      const { data: still } = await supabase
        .from("concierge_agent_groups")
        .select("org_group")
        .eq("profile_id", profileId)
        .limit(1);
      const nextPrimary =
        ((still as { org_group: ConciergeGroup }[] | null) ?? [])[0]?.org_group ?? null;
      const { data: cur } = await supabase
        .from("profiles")
        .select("concierge_group")
        .eq("id", profileId)
        .single();
      if ((cur?.concierge_group as string | null) === queendom) {
        await supabase.from("profiles").update({ concierge_group: nextPrimary }).eq("id", profileId);
      }
    }

    revalidatePath(REVALIDATE);
    revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    console.error("[removeMember]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

"use server";

/**
 * Watcher → Queendom assignments (admin only). A Watcher (profiles.department =
 * 'watcher') gets READ-ONLY visibility of every ticket in the Queendom(s) listed in
 * concierge_watchers — enforced at the RLS layer (migration 123). These actions just
 * manage that mapping; they grant no edit rights.
 */
import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole, CONCIERGE_GROUPS } from "@/lib/types/database";
import type { ConciergeGroup, WatcherAssignment } from "@/lib/types/database";

interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

const REVALIDATE = "/admin/concierge-settings";

function sanitizeGroups(groups: unknown): ConciergeGroup[] {
  if (!Array.isArray(groups)) return [];
  const valid = new Set<string>(CONCIERGE_GROUPS);
  const out: ConciergeGroup[] = [];
  for (const g of groups) {
    if (typeof g === "string" && valid.has(g) && !out.includes(g as ConciergeGroup)) {
      out.push(g as ConciergeGroup);
    }
  }
  return out;
}

/** All watcher-department profiles + the Queendoms each currently oversees. Admin only. */
export async function listWatchers(): Promise<WatcherAssignment[]> {
  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return [];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("department", "watcher")
      .eq("is_active", true)
      .order("full_name", { ascending: true });
    const rows = (profiles as { id: string; full_name: string | null; email: string }[] | null) ?? [];
    if (rows.length === 0) return [];

    const { data: mappings } = await supabase
      .from("concierge_watchers")
      .select("profile_id, org_group")
      .in("profile_id", rows.map((r) => r.id));
    const byProfile = new Map<string, ConciergeGroup[]>();
    for (const m of (mappings as { profile_id: string; org_group: ConciergeGroup }[] | null) ?? []) {
      const list = byProfile.get(m.profile_id) ?? [];
      list.push(m.org_group);
      byProfile.set(m.profile_id, list);
    }

    return rows.map((r) => ({
      id: r.id,
      full_name: r.full_name ?? "—",
      email: r.email,
      groups: byProfile.get(r.id) ?? [],
    }));
  } catch (err) {
    console.error("[listWatchers]", err);
    return [];
  }
}

/** Replace a watcher's Queendom set with `groups`. Admin only. */
export async function setWatcherQueendoms(profileId: string, groups: unknown): Promise<ActionResult> {
  try {
    const { supabase, role } = await getAuthUser();
    if (!isPrivilegedRole(role)) return { success: false, error: "Only admins can manage watchers." };
    if (!profileId) return { success: false, error: "Missing watcher." };

    const clean = sanitizeGroups(groups);

    // Replace the set: drop existing rows, then insert the new selection.
    const { error: delErr } = await supabase.from("concierge_watchers").delete().eq("profile_id", profileId);
    if (delErr) {
      console.error("[setWatcherQueendoms] delete", delErr);
      return { success: false, error: "Could not update the watcher's Queendoms." };
    }
    if (clean.length > 0) {
      const { error: insErr } = await supabase
        .from("concierge_watchers")
        .insert(clean.map((org_group) => ({ profile_id: profileId, org_group })));
      if (insErr) {
        console.error("[setWatcherQueendoms] insert", insErr);
        return { success: false, error: "Could not update the watcher's Queendoms." };
      }
    }

    revalidatePath(REVALIDATE);
    return { success: true };
  } catch (err) {
    console.error("[setWatcherQueendoms]", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

import type { Profile } from "@/lib/types/database";

/**
 * Shop CRM surfaces (workspace, etc.): admin/founder retain full cross-domain access;
 * everyone else must belong to the indulge_shop domain.
 * guest is read-only but still allowed to access shop surfaces.
 */
export function canAccessShopSurfaces(
  profile: Pick<Profile, "role" | "domain">,
): boolean {
  if (profile.role === "admin" || profile.role === "founder") return true;
  if (profile.domain !== "indulge_shop") return false;
  return ["manager", "agent", "guest"].includes(profile.role);
}

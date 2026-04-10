"use client";

import { useSearchParams } from "next/navigation";
import { useProfile } from "@/components/sla/ProfileProvider";
import type { IndulgeDomain } from "@/lib/types/database";

const VALID_DOMAINS: IndulgeDomain[] = [
  "indulge_concierge",
  "indulge_house",
  "indulge_shop",
  "indulge_legacy",
];

/**
 * Returns the effective domain for the current user.
 * - Agents/guests: always their profile domain (no override).
 * - Admin/founder/manager: viewing domain from ?domain= URL param, or profile domain if none set.
 */
export function useUserDomain(): IndulgeDomain | null {
  const profile = useProfile();
  const searchParams = useSearchParams();

  if (!profile?.domain) return null;

  // Admin/founder/manager can filter by domain via URL; agents/guests use their own
  const isPrivileged = profile.role === "admin" || profile.role === "founder" || profile.role === "manager";
  if (isPrivileged) {
    const param = searchParams.get("domain");
    if (param && VALID_DOMAINS.includes(param as IndulgeDomain)) {
      return param as IndulgeDomain;
    }
  }

  return profile.domain;
}

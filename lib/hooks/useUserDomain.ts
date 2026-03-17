"use client";

import { useSearchParams } from "next/navigation";
import { useProfile } from "@/components/sla/ProfileProvider";
import type { IndulgeDomain } from "@/lib/types/database";

const VALID_DOMAINS: IndulgeDomain[] = [
  "indulge_global",
  "indulge_house",
  "indulge_shop",
  "indulge_legacy",
];

/**
 * Returns the effective domain for the current user.
 * - Agents: always their profile domain (no override).
 * - Scouts/Admins: viewing domain from ?domain= URL param, or profile domain if none set.
 */
export function useUserDomain(): IndulgeDomain | null {
  const profile = useProfile();
  const searchParams = useSearchParams();

  if (!profile?.domain) return null;

  // Scouts/Admins can filter by domain via URL; agents use their own
  const isPrivileged = profile.role === "scout" || profile.role === "admin";
  if (isPrivileged) {
    const param = searchParams.get("domain");
    if (param && VALID_DOMAINS.includes(param as IndulgeDomain)) {
      return param as IndulgeDomain;
    }
  }

  return profile.domain;
}

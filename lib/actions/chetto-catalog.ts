"use server";

import {
  getChettoGroupCatalog,
  getQueendomOrgRegistry,
  type ChettoGroupCatalogEntry,
  type ChettoQueendomOrg,
} from "@/lib/actions/chetto";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { canManageAnyClient } from "@/lib/types/database";

export type ChettoMappingCatalog = {
  groups: ChettoGroupCatalogEntry[];
  queendomOrgs: ChettoQueendomOrg[];
  nameByGroupId: Record<string, string>;
};

/** Live Chetto group id ↔ name catalog for admin mapping UI. */
export async function getChettoMappingCatalog(): Promise<{
  success: boolean;
  catalog?: ChettoMappingCatalog;
  error?: string;
}> {
  try {
    const { role } = await getAuthUser();
    if (!canManageAnyClient(role)) {
      return { success: false, error: "Unauthorised" };
    }

    const [groups, queendomOrgs] = await Promise.all([
      getChettoGroupCatalog(),
      getQueendomOrgRegistry(),
    ]);

    const nameByGroupId: Record<string, string> = {};
    for (const g of groups) {
      if (g.group_name?.trim()) {
        nameByGroupId[g.group_id] = g.group_name.trim();
      }
    }

    return {
      success: true,
      catalog: { groups, queendomOrgs, nameByGroupId },
    };
  } catch (e) {
    console.error("getChettoMappingCatalog", e);
    return { success: false, error: "Failed to load Chetto catalog" };
  }
}

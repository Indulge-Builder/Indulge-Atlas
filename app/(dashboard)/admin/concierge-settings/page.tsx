import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import {
  listAllTicketCategories,
  listAllChecklistTemplates,
  listAllCannedResponses,
} from "@/lib/actions/concierge-settings";
import { listWatchers } from "@/lib/actions/concierge-watchers";
import { ConciergeSettingsClient } from "@/components/admin/ConciergeSettingsClient";

export const dynamic = "force-dynamic";

export default async function ConciergeSettingsPage() {
  const { role } = await getAuthUser();
  // Config-table writes require admin/founder/super_admin (migration 107 RLS) — gate the page too.
  if (!isPrivilegedRole(role)) redirect("/concierge/tickets");

  const [categories, checklists, canned, watchers] = await Promise.all([
    listAllTicketCategories(),
    listAllChecklistTemplates(),
    listAllCannedResponses(),
    listWatchers(),
  ]);

  return (
    <ConciergeSettingsClient
      initialCategories={categories}
      initialChecklists={checklists}
      initialCanned={canned}
      initialWatchers={watchers}
    />
  );
}

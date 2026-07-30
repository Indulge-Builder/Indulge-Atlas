import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import { listGroups, listActiveProfiles } from "@/lib/actions/agent-groups";
import { AgentGroupsClient } from "@/components/admin/AgentGroupsClient";

export const dynamic = "force-dynamic";

export default async function AgentGroupsPage() {
  const { role } = await getAuthUser();
  if (!isPrivilegedRole(role)) redirect("/");

  const [groups, profiles] = await Promise.all([listGroups(), listActiveProfiles()]);

  return <AgentGroupsClient initialGroups={groups} allProfiles={profiles} />;
}

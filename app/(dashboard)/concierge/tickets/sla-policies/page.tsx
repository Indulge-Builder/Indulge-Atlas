import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import { listSlaPolicies } from "@/lib/actions/concierge-sla-policies";
import { getConciergeCategories } from "@/lib/actions/concierge-options";
import { SlaPoliciesClient } from "@/components/concierge/tickets/SlaPoliciesClient";

export const dynamic = "force-dynamic";

export default async function SlaPoliciesPage() {
  const { role } = await getAuthUser();
  // Writes require sla_policies_write RLS (admin/founder/super_admin); gate the page too.
  if (!isPrivilegedRole(role)) redirect("/concierge/tickets");

  const [policies, categories] = await Promise.all([listSlaPolicies(), getConciergeCategories()]);

  return <SlaPoliciesClient initialPolicies={policies} categories={categories} />;
}

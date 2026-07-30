import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import { getVendors } from "@/lib/actions/concierge-vendors";
import { VendorsClient } from "@/components/concierge/vendors/VendorsClient";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const { role, department } = await getAuthUser();
  // Vendor data is shared across Queendoms; gate to concierge/finance staff + admins.
  const allowed = isPrivilegedRole(role) || department === "concierge" || department === "finance";
  if (!allowed) redirect("/concierge/tickets");

  const vendors = await getVendors();
  return <VendorsClient initialVendors={vendors} />;
}

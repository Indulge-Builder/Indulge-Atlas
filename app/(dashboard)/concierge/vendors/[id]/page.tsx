import { notFound, redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import { getVendorProfile } from "@/lib/actions/concierge-vendors";
import { VendorProfileView } from "@/components/concierge/vendors/VendorProfileView";

export const dynamic = "force-dynamic";

export default async function VendorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { role, department } = await getAuthUser();
  const allowed = isPrivilegedRole(role) || department === "concierge" || department === "finance";
  if (!allowed) redirect("/concierge/tickets");

  const { id } = await params;
  const profile = await getVendorProfile(id);
  if (!profile) notFound();

  return <VendorProfileView profile={profile} />;
}

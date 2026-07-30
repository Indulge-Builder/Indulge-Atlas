import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isPrivilegedRole } from "@/lib/types/database";
import { getConciergeSlaReport } from "@/lib/actions/concierge-reports";
import { SlaReportClient } from "@/components/concierge/tickets/SlaReportClient";

export const dynamic = "force-dynamic";

export default async function ConciergeSlaReportsPage() {
  const { role, department } = await getAuthUser();
  const isAdmin = isPrivilegedRole(role);
  const allowed =
    isAdmin || (role === "manager" && department === "concierge") || department === "finance";
  if (!allowed) redirect("/concierge/tickets");

  const res = await getConciergeSlaReport({});

  return (
    <SlaReportClient
      initialReport={res.success ? res.data ?? null : null}
      error={res.success ? null : res.error ?? "Could not load the report."}
      isAdmin={isAdmin}
    />
  );
}

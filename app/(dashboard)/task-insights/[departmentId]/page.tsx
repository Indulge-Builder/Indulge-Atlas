import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDepartmentTaskOverview } from "@/lib/actions/task-intelligence";
import { DepartmentDetailView } from "@/components/task-intelligence/DepartmentDetailView";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ departmentId: string }>;
}

export default async function TaskInsightsDepartmentPage({ params }: PageProps) {
  const { departmentId } = await params;
  const slug = departmentId.trim().toLowerCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, domain, department, job_title")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const role = (profile.role as string) ?? "agent";
  if (!["manager", "founder", "admin", "super_admin"].includes(role)) redirect("/");

  const currentUser = {
    id: profile.id as string,
    full_name: (profile.full_name as string) ?? "User",
    job_title: (profile.job_title as string | null) ?? null,
    role,
  };

  const overview = await getDepartmentTaskOverview();
  if (!overview.success || !overview.data) notFound();

  const row = overview.data.find((r) => r.departmentId === slug);
  if (!row) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DepartmentDetailView overview={row} currentUser={currentUser} />
    </div>
  );
}

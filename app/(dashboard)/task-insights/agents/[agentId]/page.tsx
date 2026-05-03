import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmployeeDossierView } from "@/components/task-intelligence/EmployeeDossierView";

export const dynamic = "force-dynamic";

function safeTaskInsightsBackPath(raw: string | undefined): string {
  if (raw == null || typeof raw !== "string") return "/task-insights";
  let t = raw.trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    return "/task-insights";
  }
  if (!t.startsWith("/task-insights")) return "/task-insights";
  if (t.includes("//") || t.includes("..")) return "/task-insights";
  return t || "/task-insights";
}

interface PageProps {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function TaskInsightsAgentDossierPage({
  params,
  searchParams,
}: PageProps) {
  const { agentId } = await params;
  const id = agentId.trim();
  if (!id) notFound();

  const sp = await searchParams;
  const backHref = safeTaskInsightsBackPath(sp.from);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EmployeeDossierView agentId={id} backHref={backHref} currentUser={currentUser} />
    </div>
  );
}

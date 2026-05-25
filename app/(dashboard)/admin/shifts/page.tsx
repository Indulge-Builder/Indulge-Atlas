import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ShiftsClient } from "@/components/admin/shifts/ShiftsClient";
import { getAgentsWithRoutingStatus } from "@/lib/actions/agentAssignment";

export const dynamic = "force-dynamic";

export default async function AdminShiftsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (rawProfile as { role: string } | null)?.role;
  if (!role || !["admin", "founder", "manager", "super_admin"].includes(role)) {
    redirect("/");
  }

  const agents = await getAgentsWithRoutingStatus("all");

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Shift Schedule"
        subtitle="Set shift windows and daily lead caps per agent."
      />
      <div className="px-4 md:px-6 lg:px-8 py-4 md:py-8 max-w-5xl mx-auto">
        <ShiftsClient initialAgents={agents} />
      </div>
    </div>
  );
}

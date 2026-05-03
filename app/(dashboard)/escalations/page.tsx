import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { LeaderPerspectiveNotice } from "@/components/layout/LeaderPerspectiveNotice";
import { EscalationsTable } from "@/components/escalations/EscalationsTable";

export const dynamic = "force-dynamic";

async function getEscalationsForAgent(userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, status, assigned_at, agent_alert_sent, manager_alert_sent")
    .eq("assigned_to", userId)
    .eq("agent_alert_sent", true)
    .order("assigned_at", { ascending: false });

  if (error) {
    console.error("[EscalationsPage] fetch error:", error.message);
    return [];
  }

  return (data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string | null;
    status: string;
    assigned_at: string | null;
    agent_alert_sent: boolean;
    manager_alert_sent: boolean;
  }>;
}

export default async function EscalationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  if (profile.role !== "agent") {
    return (
      <LeaderPerspectiveNotice
        title="Escalations"
        subtitle="Agent perspective"
        body="This log is filtered to leads assigned to the signed-in agent that triggered an SLA alert. For team-wide escalation and routing oversight, use Task Insights or the Command Center."
        ctaHref="/manager/dashboard"
        ctaLabel="Open Command Center"
      />
    );
  }

  const escalations = await getEscalationsForAgent(user.id);

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Escalation History."
        subtitle="A historical log of leads that breached the initial contact SLA."
      />

      <div className="px-8 py-8 max-w-[1100px] mx-auto">
        <div className="rounded-2xl overflow-hidden bg-[#0D0C0A] border border-white/[0.06] shadow-xl">
          <EscalationsTable rows={escalations} />
        </div>
      </div>
    </div>
  );
}

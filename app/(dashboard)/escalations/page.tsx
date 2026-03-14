import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { EscalationsTable } from "@/components/escalations/EscalationsTable";

export const dynamic = "force-dynamic";

async function getEscalations() {
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

  if (profile.role !== "agent") redirect("/");

  const { data, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, status, assigned_at, agent_alert_sent, manager_alert_sent")
    .eq("assigned_to", user.id)
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
  const escalations = await getEscalations();

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

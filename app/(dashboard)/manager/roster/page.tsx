import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/server";
import { AgentRosterManager } from "@/components/manager/AgentRosterManager";

type AgentRosterRow = {
  id: string;
  full_name: string;
  email: string;
  is_on_leave: boolean;
};

async function getAuthorisedProfile() {
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

  if (
    !profile ||
    !["admin", "founder", "manager"].includes(profile.role)
  ) {
    redirect("/");
  }
}

async function getRosterAgents(): Promise<AgentRosterRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_on_leave")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error || !data) return [];
  return (data as AgentRosterRow[]).map((row) => ({
    ...row,
    is_on_leave: !!row.is_on_leave,
  }));
}

export default async function ManagerRosterPage() {
  await getAuthorisedProfile();
  const agents = await getRosterAgents();

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar title="Agent Roster." subtitle="Keep holiday coverage aligned with waterfall routing." />

      <div className="px-8 py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h2
              className="text-2xl font-semibold tracking-tight text-[#1A1A1A]"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Holiday & Coverage
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Toggle each agent between active and on-holiday. On-holiday agents are excluded from
              lead assignment at the database layer.
            </p>
          </div>

          <AgentRosterManager agents={agents} />
        </div>
      </div>
    </div>
  );
}

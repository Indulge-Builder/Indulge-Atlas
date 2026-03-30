import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { RoutingRulesClient } from "@/components/admin/routing/RoutingRulesClient";
import {
  getActiveAgentsForRouting,
  getRoutingRules,
} from "@/lib/actions/routing-rules";

export const dynamic = "force-dynamic";

export default async function AdminRoutingPage() {
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
  if (role !== "admin" && role !== "scout") {
    redirect("/");
  }

  const [rules, agents] = await Promise.all([
    getRoutingRules(),
    getActiveAgentsForRouting(),
  ]);

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Lead Routing Engine"
        subtitle="Define conditions to automatically assign incoming leads."
      />

      <div className="px-4 md:px-6 lg:px-8 py-4 md:py-8 max-w-5xl mx-auto">
        <RoutingRulesClient initialRules={rules} agents={agents} />
      </div>
    </div>
  );
}

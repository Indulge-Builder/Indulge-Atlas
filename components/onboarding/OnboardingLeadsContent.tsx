import { createClient } from "@/lib/supabase/server";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { LEADS_TABLE_SELECT } from "@/lib/leads/leadsTableSelect";
import { getDistinctUtmCampaigns } from "@/lib/actions/campaigns";
import type { Lead, LeadStatus, UserRole } from "@/lib/types/database";

export interface NextTask {
  id: string;
  lead_id: string;
  title: string;
  due_date: string;
  task_type: string;
}

const PAGE_SIZE = 20;

interface OnboardingLeadsContentProps {
  searchParams: {
    q?: string;
    status?: string;
    agent?: string;
    campaign?: string;
    page?: string;
    tab?: string;
  };
  /** Role pre-fetched by the page — avoids a redundant auth + profiles round-trip */
  role?: UserRole;
}

export async function OnboardingLeadsContent({
  searchParams: params,
  role,
}: OnboardingLeadsContentProps) {
  const supabase = await createClient();

  // If role wasn't passed down, fall back to fetching it (defensive)
  if (!role) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: rawProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = (rawProfile as { role: UserRole } | null)?.role ?? "manager";
  }

  // Onboarding oversight: always manager-level view (full leads table)
  const effectiveRole: UserRole = "manager";

  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  let query = supabase
    .from("leads")
    .select(LEADS_TABLE_SELECT, { count: "exact" })
    .eq("domain", "indulge_concierge");

  if (params.status && params.status !== "ALL") {
    query = query.eq("status", params.status as LeadStatus);
  }

  if (params.agent && params.agent !== "ALL") {
    query = query.eq("assigned_to", params.agent);
  }

  if (params.q) {
    const sanitized = params.q.replace(/[(),'"]/g, "").trim();
    const q = `%${sanitized}%`;
    const baseFilters = `first_name.ilike.${q},last_name.ilike.${q},phone_number.ilike.${q},email.ilike.${q},city.ilike.${q}`;
    query = query.or(baseFilters);
  }

  if (params.campaign && params.campaign !== "ALL") {
    query = query.eq("utm_campaign", params.campaign);
  }

  const [{ data: rawLeads, count }, { data: agentsData }, campaigns] =
    await Promise.all([
      query.order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "agent")
        .eq("is_active", true),
      getDistinctUtmCampaigns(),
    ]);

  const leads = (rawLeads ?? []) as unknown as Lead[];
  const agents = (agentsData ?? []) as { id: string; full_name: string }[];

  const leadIds = leads.map((l) => l.id);
  let nextTaskMap: Record<string, NextTask> = {};
  if (leadIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, lead_id, title, due_date, task_type")
      .in("lead_id", leadIds)
      .neq("status", "completed")
      .order("due_date", { ascending: true });

    (taskRows ?? []).forEach((t) => {
      if (t.lead_id && !nextTaskMap[t.lead_id]) {
        nextTaskMap[t.lead_id] = t as NextTask;
      }
    });
  }

  return (
    <LeadsTable
      leads={leads}
      totalCount={count ?? 0}
      currentPage={currentPage}
      role={effectiveRole}
      agents={agents}
      campaigns={campaigns}
      nextTaskMap={nextTaskMap}
    />
  );
}

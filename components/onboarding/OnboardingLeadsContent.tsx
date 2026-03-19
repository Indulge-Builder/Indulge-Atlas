import { createClient } from "@/lib/supabase/server";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { LEADS_TABLE_SELECT } from "@/lib/leads/leadsTableSelect";
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
}

export async function OnboardingLeadsContent({
  searchParams: params,
}: OnboardingLeadsContentProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profile = rawProfile as { role: UserRole } | null;
  const userRole: UserRole = profile?.role ?? "scout";
  // Onboarding oversight: always scout-level view (full leads table)
  const effectiveRole: UserRole = "scout";

  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  let query = supabase
    .from("leads")
    .select(LEADS_TABLE_SELECT, { count: "exact" });

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

  const { data: rawLeads, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const leads = (rawLeads ?? []) as unknown as Lead[];

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

  const { data: agentsData } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "agent")
    .eq("is_active", true);
  const agents = (agentsData ?? []) as { id: string; full_name: string }[];

  const { data: campaignRows } = await supabase
    .from("leads")
    .select("utm_campaign")
    .not("utm_campaign", "is", null)
    .limit(500);

  const campaigns = [
    ...new Set(
      (campaignRows ?? []).map((r) => r.utm_campaign).filter(Boolean) as string[]
    ),
  ].sort();

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

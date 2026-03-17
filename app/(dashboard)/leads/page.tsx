import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { LeadsTable, LeadsTableSkeleton } from "@/components/leads/LeadsTable";
import { AddLeadModal } from "@/components/leads/AddLeadModal";
import type { Lead, LeadStatus, UserRole } from "@/lib/types/database";

export interface NextTask {
  id:        string;
  lead_id:   string;
  title:     string;
  due_date:  string;
  task_type: string;
}

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    agent?: string;
    campaign?: string;
    source?: string;
    page?: string;
  }>;
}

async function LeadsContent({ searchParams }: PageProps) {
  const params = await searchParams;
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
  const userRole: UserRole = profile?.role ?? "agent";
  const isAdmin = userRole === "admin" || userRole === "scout" || userRole === "finance";

  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  let query = supabase
    .from("leads")
    .select(
      "*, assigned_agent:profiles!assigned_to(id, full_name, email)",
      { count: "exact" },
    );

  // Agents only see their own leads
  if (!isAdmin) {
    query = query.eq("assigned_to", user.id);
  }

  if (params.status && params.status !== "ALL") {
    query = query.eq("status", params.status as LeadStatus);
  }

  if (isAdmin && params.agent && params.agent !== "ALL") {
    query = query.eq("assigned_to", params.agent);
  }

  if (params.q) {
    // Strip PostgREST filter special characters to prevent filter injection
    const sanitized = params.q.replace(/[(),'"]/g, "").trim();
    const q = `%${sanitized}%`;
    // Search: name, phone, email, city, utm_source, utm_medium, utm_campaign, platform
    const baseFilters = `first_name.ilike.${q},last_name.ilike.${q},phone_number.ilike.${q},email.ilike.${q},city.ilike.${q},utm_source.ilike.${q},utm_medium.ilike.${q},utm_campaign.ilike.${q},platform.ilike.${q}`;
    query = query.or(baseFilters);
  }

  if (params.campaign && params.campaign !== "ALL") {
    query = query.eq("utm_campaign", params.campaign);
  }

  // Source filter: meta, google, website, events, referral — matches platform column
  if (params.source && params.source !== "ALL") {
    query = query.eq("platform", params.source);
  }

  const { data: rawLeads, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const leads = (rawLeads ?? []) as Lead[];

  // Optimized: single join query for nearest pending task per lead (no N+1)
  const leadIds = leads.map((l) => l.id);
  let nextTaskMap: Record<string, NextTask> = {};
  if (leadIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, lead_id, title, due_date, task_type")
      .in("lead_id", leadIds)
      .neq("status", "completed")
      .order("due_date", { ascending: true });

    // Keep only the earliest task per lead (rows already sorted asc by due_date)
    (taskRows ?? []).forEach((t) => {
      if (t.lead_id && !nextTaskMap[t.lead_id]) {
        nextTaskMap[t.lead_id] = t as NextTask;
      }
    });
  }

  // Fetch agents list for admin filter
  let agents: { id: string; full_name: string }[] = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "agent")
      .eq("is_active", true);
    agents = (data ?? []) as { id: string; full_name: string }[];
  }

  // Distinct UTM campaigns for the campaign filter dropdown
  // Uses a limited query with JS dedup to avoid a full table scan
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
      role={userRole}
      agents={agents}
      campaigns={campaigns}
      nextTaskMap={nextTaskMap}
    />
  );
}

export default function LeadsPage(props: PageProps) {
  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="All Leads"
        subtitle="Complete lead directory across your pipeline"
        actions={<AddLeadModal />}
      />
      <div className="px-8 py-6">
        <Suspense fallback={<LeadsTableSkeleton />}>
          <LeadsContent {...props} />
        </Suspense>
      </div>
    </div>
  );
}

import { Suspense } from "react";
import { isValid, parseISO, subDays } from "date-fns";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import { TopBar } from "@/components/layout/TopBar";
import { LeadsTable, LeadsTableSkeleton } from "@/components/leads/LeadsTable";
import { AddLeadModal } from "@/components/leads/AddLeadModal";
import type { Lead, LeadStatus, UserRole } from "@/lib/types/database";
import { LEADS_TABLE_SELECT } from "@/lib/leads/leadsTableSelect";
import {
  formatIST,
  getEndOfTodayIST,
  getIstDayUtcBoundsIso,
  getStartOfTodayIST,
} from "@/lib/utils/time";

// Campaigns change infrequently — cache for 1 hour to avoid 500-row fetch on every page load
const getCachedCampaigns = unstable_cache(
  async () => {
    const sb = getServiceSupabaseClient();
    const { data } = await sb
      .from("leads")
      .select("utm_campaign")
      .not("utm_campaign", "is", null)
      .limit(500);
    return [...new Set((data ?? []).map((r) => r.utm_campaign).filter(Boolean) as string[])].sort();
  },
  ["leads-campaigns"],
  { revalidate: 3600 },
);

export interface NextTask {
  id:        string;
  lead_id:   string;
  title:     string;
  due_date:  string;
  task_type: string;
}

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const VALID_DOMAINS = ["indulge_global", "indulge_house", "indulge_shop", "indulge_legacy", "the_indulge_house"];

type LeadsSearchParams = {
  q?: string;
  status?: string;
  agent?: string;
  campaign?: string;
  source?: string;
  dateFilter?: string;
  page?: string;
  domain?: string;
};

interface PageProps {
  searchParams: Promise<LeadsSearchParams>;
}

async function LeadsContent({ params }: { params: LeadsSearchParams }) {
  const supabase = await createClient();

  // Auth + profile in one query — avoids two sequential round-trips
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch profile + campaigns in parallel (campaigns are cached, profile is user-specific)
  const [profileResult, campaigns] = await Promise.all([
    supabase.from("profiles").select("role, domain").eq("id", user.id).single(),
    getCachedCampaigns(),
  ]);

  const profile = profileResult.data as { role: UserRole; domain?: string } | null;
  const userRole: UserRole = profile?.role ?? "agent";
  const isAdmin =
    userRole === "admin" ||
    userRole === "founder" ||
    userRole === "manager" ||
    userRole === "guest";

  // Manager/Admin domain filter from URL
  const domainFilter =
    isAdmin && params.domain && VALID_DOMAINS.includes(params.domain) ? params.domain : null;

  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  // For agents: fetch collaborator lead IDs in parallel with profile (already done above).
  // We need collabs before we can build the leads query filter.
  let collabIds: string[] = [];
  if (!isAdmin) {
    const { data: myCollabs } = await supabase
      .from("lead_collaborators")
      .select("lead_id")
      .eq("user_id", user.id);
    collabIds = [...new Set((myCollabs ?? []).map((r) => r.lead_id).filter(Boolean))];
  }

  // Build leads query with all filters applied
  let query = supabase
    .from("leads")
    .select(LEADS_TABLE_SELECT, { count: "exact" });

  // Agents: primary pipeline (assigned + domain) OR any lead where they are an explicit collaborator.
  if (!isAdmin) {
    const myDomain = profile?.domain ?? "indulge_global";
    if (collabIds.length > 0) {
      query = query.or(
        `and(assigned_to.eq.${user.id},domain.eq.${myDomain}),id.in.(${collabIds.join(",")})`,
      );
    } else {
      query = query.eq("assigned_to", user.id).eq("domain", myDomain);
    }
  } else if (domainFilter) {
    query = query.eq("domain", domainFilter);
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

  if (params.dateFilter === "today") {
    query = query
      .gte("created_at", getStartOfTodayIST().toISOString())
      .lte("created_at", getEndOfTodayIST().toISOString());
  } else if (params.dateFilter === "yesterday") {
    const yesterdayYmd = formatIST(subDays(new Date(), 1), "yyyy-MM-dd");
    const { startIso, endIso } = getIstDayUtcBoundsIso(yesterdayYmd);
    query = query.gte("created_at", startIso).lte("created_at", endIso);
  } else if (params.dateFilter) {
    const customDate = parseISO(params.dateFilter);
    if (isValid(customDate)) {
      const ymd = formatIST(customDate, "yyyy-MM-dd");
      const { startIso, endIso } = getIstDayUtcBoundsIso(ymd);
      query = query.gte("created_at", startIso).lte("created_at", endIso);
    }
  }

  // Fetch leads + agents in parallel (agents don't depend on lead results)
  const agentQueryPromise = isAdmin
    ? (() => {
        let agentQuery = supabase
          .from("profiles")
          .select("id, full_name")
          .eq("role", "agent")
          .eq("is_active", true);
        if (domainFilter) agentQuery = agentQuery.eq("domain", domainFilter);
        return agentQuery;
      })()
    : Promise.resolve({ data: [] as { id: string; full_name: string }[] });

  const [{ data: rawLeads, count }, agentRowsResult] = await Promise.all([
    query.order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1),
    agentQueryPromise,
  ]);

  const leads = (rawLeads ?? []) as unknown as Lead[];
  const agents = (agentRowsResult.data ?? []) as { id: string; full_name: string }[];

  // Tasks need leadIds — fetch after leads resolve (unavoidable dependency)
  const leadIds = leads.map((l) => l.id);
  const taskRows =
    leadIds.length > 0
      ? (
          await supabase
            .from("tasks")
            .select("id, lead_id, title, due_date, task_type")
            .in("lead_id", leadIds)
            .neq("status", "completed")
            .order("due_date", { ascending: true })
        ).data ?? []
      : [];

  const nextTaskMap: Record<string, NextTask> = {};
  (taskRows ?? []).forEach((t) => {
    const row = t as { lead_id?: string };
    if (row.lead_id && !nextTaskMap[row.lead_id]) {
      nextTaskMap[row.lead_id] = t as NextTask;
    }
  });

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

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="All Leads"
        subtitle="Complete lead directory across your pipeline"
        actions={<AddLeadModal />}
      />
      <div className="px-8 py-6">
        <Suspense fallback={<LeadsTableSkeleton />}>
          <LeadsContent params={params} />
        </Suspense>
      </div>
    </div>
  );
}

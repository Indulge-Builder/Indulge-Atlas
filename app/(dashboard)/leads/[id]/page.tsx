import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { StatusActionPanel, type NextLeadTask } from "@/components/leads/StatusActionPanel";
import { AgentScratchpad } from "@/components/leads/AgentScratchpad";
import { LeadInfoCard } from "@/components/leads/LeadInfoCard";
import { LeadNotesSection } from "@/components/leads/LeadNotesSection";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { formatLeadCreatedAt } from "@/lib/utils/date-format";
import {
  isPrivilegedRole,
  LEAD_STATUS_CONFIG,
  type Lead,
  type LeadCollaborator,
  type Profile,
  type UserRole,
} from "@/lib/types/database";
import {
  LeadActivityTimelineSkeleton,
  LeadDossierJourneyAsync,
  LeadDossierTasksAsync,
  LeadDossierTimelineAsync,
  LeadJourneySkeleton,
  LeadTasksWidgetSkeleton,
} from "./LeadDossierAsync";
import { getLeadTasksForDossier } from "@/lib/leads/leadDetailRequestCache";
import { getOffDutyAnchor } from "@/lib/utils/sla";
import { getLeadNotes } from "@/lib/actions/leads";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ── SLA helpers ───────────────────────────────────────────────────────────────

function getSLAInfo(
  assignedAt: string | null,
  createdAt: string | null,
  isOffDuty: boolean,
): {
  label: string;
  sublabel: string;
  color: string;
  bgColor: string;
  showAlert: boolean;
} {
  if (!assignedAt) {
    return { label: "Not set", sublabel: "", color: "#9E9E9E", bgColor: "#F5F5F5", showAlert: false };
  }

  const now = Date.now();
  let diffMins: number;
  if (isOffDuty && createdAt) {
    const anchor = getOffDutyAnchor(createdAt);
    diffMins = Math.max(0, Math.floor((now - anchor.getTime()) / 60_000));
  } else {
    diffMins = Math.floor((now - new Date(assignedAt).getTime()) / 60_000);
  }

  const diffHours = Math.floor(diffMins / 60);
  const diffDays  = Math.floor(diffHours / 24);

  let label: string;
  if (diffMins < 60)       label = `${diffMins}m ago`;
  else if (diffHours < 24) label = `${diffHours}h ${diffMins % 60}m ago`;
  else                     label = `${diffDays}d ago`;

  const threshold = isOffDuty ? 120 : 15;
  if (diffMins >= threshold) {
    return { label, sublabel: "ESCALATED",         color: "#C0392B", bgColor: "#FAEAE8", showAlert: true };
  }
  if (diffMins >= (isOffDuty ? 90 : 10)) {
    return { label, sublabel: "SLA breaching soon", color: "#C0392B", bgColor: "#FAEAE8", showAlert: true };
  }
  if (diffMins >= (isOffDuty ? 60 : 5)) {
    return { label, sublabel: "Lead waiting",       color: "#C5830A", bgColor: "#FEF3D0", showAlert: false };
  }
  return {   label, sublabel: "Within SLA",         color: "#4A7C59", bgColor: "#EBF4EF", showAlert: false };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role, domain")
    .eq("id", user.id)
    .single();

  const userRole: UserRole = (rawProfile?.role as UserRole) ?? "agent";
  const userDomain = (rawProfile as { domain?: string } | null)?.domain ?? "indulge_concierge";

  const canReassign =
    userRole === "manager" || userRole === "founder" || userRole === "admin";

  const LEAD_COLS =
    "id, first_name, last_name, phone_number, secondary_phone, email, city, address, " +
    "campaign_id, campaign_name, ad_name, platform, form_data, utm_source, utm_medium, utm_campaign, " +
    "deal_value, deal_duration, domain, status, assigned_to, assigned_at, is_off_duty, " +
    "agent_alert_sent, manager_alert_sent, notes, lost_reason_tag, lost_reason_notes, " +
    "lost_reason, trash_reason, nurture_reason, attempt_count, personal_details, company, tags, " +
    "private_scratchpad, created_at, updated_at, call_count, last_call_outcome, sla_breach_count, lead_intent";

  const [leadResult, collabResult, agentResult, notesResult, tasksResult] = await Promise.all([
    supabase
      .from("leads")
      .select(`${LEAD_COLS}, assigned_agent:profiles!assigned_to(id, full_name, email, role)`)
      .eq("id", id)
      .single(),
    supabase
      .from("lead_collaborators")
      .select(
        "id, lead_id, user_id, added_by, created_at, profile:profiles!lead_collaborators_user_id_fkey(id, full_name, email, department, domain, job_title)",
      )
      .eq("lead_id", id),
    canReassign
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .eq("role", "agent")
          .eq("is_active", true)
          .order("full_name", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    getLeadNotes(id),
    getLeadTasksForDossier(id),
  ]);

  if (leadResult.error || !leadResult.data) notFound();
  const rawLead = leadResult.data;

  const leadDomain    = (rawLead as { domain: Lead["domain"] }).domain;
  const leadAssignedTo = (rawLead as { assigned_to: string | null }).assigned_to;

  const canViewScratchpad = user.id === leadAssignedTo || isPrivilegedRole(userRole);
  const scratchpadValue   = canViewScratchpad
    ? ((rawLead as { private_scratchpad?: string | null }).private_scratchpad ?? null)
    : null;

  const lead = {
    ...rawLead,
    private_scratchpad: scratchpadValue,
  } as unknown as Lead & { assigned_agent?: Profile };

  const leadCollaborators = (collabResult.data ?? []) as unknown as LeadCollaborator[];
  const agents            = (agentResult.data ?? []) as { id: string; full_name: string }[];
  const leadNotes         = notesResult;

  const allTasks = tasksResult.success && tasksResult.data ? tasksResult.data : [];
  const nextTask: NextLeadTask | null = (() => {
    const pending = allTasks
      .filter((t) => t.status === "pending")
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    if (!pending[0]) return null;
    return { title: pending[0].title, task_type: pending[0].task_type, due_date: pending[0].due_date };
  })();

  const canManageCollaborators =
    userRole === "admin" ||
    userRole === "founder" ||
    (userRole === "manager" && leadDomain === userDomain) ||
    (userRole === "agent" && leadAssignedTo === user.id && leadDomain === userDomain);

  const canViewCampaignData =
    userRole === "manager" || userRole === "founder" ||
    userRole === "admin"   || userRole === "guest";

  const statusConfig = LEAD_STATUS_CONFIG[lead.status];

  const sla = getSLAInfo(
    lead.assigned_at,
    lead.created_at,
    lead.is_off_duty ?? false,
  );

  const journeyAsOf = new Date().toISOString();

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      <TopBar
        title={[lead.first_name, lead.last_name].filter(Boolean).join(" ")}
        subtitle={`Lead · ${lead.utm_campaign ?? lead.utm_source ?? "Direct"}`}
        actions={
          <Link href="/leads">
            <Button variant="ghost" size="sm" className="gap-1.5 text-[#9E9E9E]">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </Button>
          </Link>
        }
      />

      <main className="grid grid-cols-5 gap-5 px-6 py-5">
        {/* ══ LEFT column: info card + tasks + timeline (3/5 width) ══ */}
        <section className="col-span-3 space-y-4">
          {/* Lead info card — all signals + dossier */}
          <LeadInfoCard
            lead={lead}
            userRole={userRole}
            canReassign={canReassign}
            canViewCampaignData={canViewCampaignData}
            canManageCollaborators={canManageCollaborators}
            agents={agents}
            collaborators={leadCollaborators}
            sla={sla}
            journeyBar={
              <Suspense fallback={<LeadJourneySkeleton />}>
                <LeadDossierJourneyAsync
                  leadId={lead.id}
                  currentStatus={lead.status}
                  leadCreatedAt={lead.created_at}
                  asOf={journeyAsOf}
                />
              </Suspense>
            }
          />

          {/* Scheduled tasks */}
          <Suspense fallback={<LeadTasksWidgetSkeleton />}>
            <LeadDossierTasksAsync leadId={lead.id} role={userRole} />
          </Suspense>

          {/* Activity timeline */}
          <Suspense fallback={<LeadActivityTimelineSkeleton />}>
            <LeadDossierTimelineAsync leadId={lead.id} />
          </Suspense>
        </section>

        {/* ══ RIGHT column: actions + scratchpad + notes (2/5 width) ══ */}
        <aside className="col-span-2 space-y-4">
          {/* Status action panel */}
          <StatusActionPanel
            leadId={lead.id}
            leadName={`${lead.first_name} ${lead.last_name ?? ""}`.trim()}
            currentStatus={lead.status}
            attemptCount={(lead as unknown as { call_count?: number }).call_count ?? 0}
            viewerRole={userRole}
            nextTask={nextTask}
          />

          {/* Private scratchpad */}
          {canViewScratchpad && (
            <AgentScratchpad leadId={lead.id} initialValue={scratchpadValue} />
          )}

          {/* Notes section */}
          <LeadNotesSection leadId={lead.id} initialNotes={leadNotes} />
        </aside>
      </main>
    </div>
  );
}

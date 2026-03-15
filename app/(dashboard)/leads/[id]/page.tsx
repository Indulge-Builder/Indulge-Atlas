import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { LeadJourneyTimeline } from "@/components/leads/LeadJourneyTimeline";
import { StatusActionPanel } from "@/components/leads/StatusActionPanel";
import { InlineAgentSelect } from "@/components/leads/InlineAgentSelect";
import { InlineEmailEdit } from "@/components/leads/InlineEmailEdit";
import { InlineCityEdit } from "@/components/leads/InlineCityEdit";
import { InlinePersonaEdit } from "@/components/leads/InlinePersonaEdit";
import { InlineCompanyEdit } from "@/components/leads/InlineDossierFields";
import { InlineTagsEdit } from "@/components/leads/InlineTagsEdit";
import { AgentScratchpad } from "@/components/leads/AgentScratchpad";
import { LeadTaskWidget } from "@/components/tasks/LeadTaskWidget";
import { LeadContextChat } from "@/components/chat/LeadContextChat";
import { getOrCreateLeadConversation } from "@/lib/actions/messages";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate, getInitials } from "@/lib/utils";
import { LEAD_STATUS_CONFIG } from "@/lib/types/database";
import {
  ArrowLeft,
  Phone,
  Mail,
  Megaphone,
  Calendar,
  User,
  GitBranch,
  Clock,
  AlertTriangle,
  Share2,
} from "lucide-react";
import { LeadSourceBadge } from "@/components/ui/LeadSourceBadge";
import { DynamicFormResponses } from "@/components/leads/DynamicFormResponses";
import { getLeadTasks } from "@/lib/actions/tasks";
import type { Lead, LeadActivity, Profile, UserRole } from "@/lib/types/database";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ── SLA helpers (Speed-to-Lead: On-Duty 5/10/15m, Off-Duty 60/90/120m from 9 AM IST) ─

const IST = "Asia/Kolkata";

function getOffDutyAnchor(createdAt: string): Date {
  const created = new Date(createdAt);
  const h = parseInt(formatInTimeZone(created, IST, "H"), 10);
  const y = parseInt(formatInTimeZone(created, IST, "yyyy"), 10);
  const m = parseInt(formatInTimeZone(created, IST, "M"), 10);
  const d = parseInt(formatInTimeZone(created, IST, "d"), 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  const midnightIST = fromZonedTime(`${y}-${pad(m)}-${pad(d)}T00:00:00`, IST);
  const anchorDate = addDays(midnightIST, h >= 18 ? 1 : 0);
  const y2 = parseInt(formatInTimeZone(anchorDate, IST, "yyyy"), 10);
  const m2 = parseInt(formatInTimeZone(anchorDate, IST, "M"), 10);
  const d2 = parseInt(formatInTimeZone(anchorDate, IST, "d"), 10);
  return fromZonedTime(`${y2}-${pad(m2)}-${pad(d2)}T09:00:00`, IST);
}

function getSLAInfo(
  assignedAt: string | null,
  createdAt: string | null,
  isOffDuty: boolean
): {
  label:     string;
  sublabel:  string;
  color:     string;
  bgColor:   string;
  showAlert: boolean;
} {
  if (!assignedAt) {
    return {
      label:     "Not set",
      sublabel:  "",
      color:     "#9E9E9E",
      bgColor:   "#F5F5F5",
      showAlert: false,
    };
  }

  const now = Date.now();
  let diffMins: number;
  if (isOffDuty && createdAt) {
    const anchor = getOffDutyAnchor(createdAt);
    const elapsed = now - anchor.getTime();
    diffMins = Math.max(0, Math.floor(elapsed / 60_000));
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
    return { label, sublabel: "ESCALATED", color: "#C0392B", bgColor: "#FAEAE8", showAlert: true };
  }
  if (diffMins >= (isOffDuty ? 90 : 10)) {
    return { label, sublabel: "SLA breaching soon", color: "#C0392B", bgColor: "#FAEAE8", showAlert: true };
  }
  if (diffMins >= (isOffDuty ? 60 : 5)) {
    return { label, sublabel: "Lead waiting", color: "#C5830A", bgColor: "#FEF3D0", showAlert: false };
  }
  return { label, sublabel: "Within SLA", color: "#4A7C59", bgColor: "#EBF4EF", showAlert: false };
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch current user's full profile (role + id)
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const userRole: UserRole = (rawProfile?.role as UserRole) ?? "agent";

  // Fetch lead with agent — exclude private_scratchpad until we verify viewer is assigned agent
  const LEAD_COLS =
    "id, first_name, last_name, phone_number, secondary_phone, email, city, address, campaign_id, form_data, utm_source, utm_medium, utm_campaign, deal_value, deal_duration, domain, status, assigned_to, assigned_at, is_off_duty, agent_alert_sent, manager_alert_sent, notes, lost_reason_tag, lost_reason_notes, lost_reason, trash_reason, nurture_reason, attempt_count, personal_details, company, tags, created_at, updated_at";
  const { data: rawLead, error } = await supabase
    .from("leads")
    .select(
      `${LEAD_COLS}, assigned_agent:profiles!assigned_to(id, full_name, email, role)`
    )
    .eq("id", id)
    .single();

  if (error || !rawLead) notFound();

  const canViewScratchpad = user.id === (rawLead as { assigned_to: string | null }).assigned_to;
  let scratchpadValue: string | null = null;
  if (canViewScratchpad) {
    const { data: scratch } = await supabase
      .from("leads")
      .select("private_scratchpad")
      .eq("id", id)
      .single();
    scratchpadValue = scratch?.private_scratchpad ?? null;
  }

  const lead = {
    ...rawLead,
    private_scratchpad: scratchpadValue,
  } as unknown as Lead & { assigned_agent?: Profile };

  // Scouts / admins can reassign — pre-fetch active agents
  const canReassign = userRole === "scout" || userRole === "admin";
  let agents: Array<{ id: string; full_name: string }> = [];
  if (canReassign) {
    const { data: agentRows } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "agent")
      .eq("is_active", true)
      .order("full_name", { ascending: true });
    agents = agentRows ?? [];
  }

  // Fetch activity timeline, tasks, and lead conversation in parallel
  const [{ data: rawActivities }, leadTasks, { conversationId }] = await Promise.all([
    supabase
      .from("lead_activities")
      .select("*, agent:profiles!performed_by(id, full_name)")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    getLeadTasks(id),
    getOrCreateLeadConversation(id),
  ]);

  const activities = (rawActivities ?? []) as LeadActivity[];

  const statusConfig = LEAD_STATUS_CONFIG[lead.status];

  // Roles that can see campaign/attribution/source blocks
  const canViewCampaignData =
    userRole === "scout" || userRole === "admin" || userRole === "finance";

  const sla = getSLAInfo(lead.assigned_at, lead.created_at, lead.is_off_duty ?? false);

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
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

      <div className="px-8 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* ══ LEFT: Lead information + timeline ══════════════════════════════ */}
          <div className="col-span-2 space-y-5">

            {/* ── Lead info card ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-[#E5E4DF] overflow-hidden shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
              {/* Status accent strip */}
              <div className="h-1.5 w-full" style={{ backgroundColor: statusConfig.color }} />

              <div className="p-6">
                {/* Identity header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-semibold border-2 border-white shadow-sm"
                      style={{
                        backgroundColor: statusConfig.bgColor,
                        color:           statusConfig.color,
                      }}
                    >
                      {getInitials([lead.first_name, lead.last_name].filter(Boolean).join(" "))}
                    </div>
                    <div>
                      <h2
                        className="text-xl font-semibold text-[#1A1A1A]"
                        style={{ fontFamily: "var(--font-playfair), serif" }}
                      >
                        {lead.first_name} {lead.last_name ?? ""}
                      </h2>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <LeadStatusBadge status={lead.status} />
                        <LeadSourceBadge
                          utmSource={lead.utm_source}
                          utmMedium={lead.utm_medium}
                          utmCampaign={lead.utm_campaign}
                        />
                        <span className="text-xs text-[#B5A99A]">
                          Added {formatDate(lead.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator className="my-5" />

                {/* ── Core contact fields ─────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow
                    icon={Phone}
                    label="Primary Phone"
                    value={lead.phone_number}
                  />

                  {/* Email — inline-editable */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#F2F2EE] flex items-center justify-center shrink-0 mt-0.5">
                      <Mail className="w-3.5 h-3.5 text-[#8A8A6E]" />
                    </div>
                    <div>
                      <p className="text-[10px] text-[#B5A99A] uppercase tracking-wider font-medium">
                        Email
                      </p>
                      <InlineEmailEdit leadId={lead.id} currentEmail={lead.email} />
                    </div>
                  </div>

                  {/* Campaign / Attribution / Source — scout & admin only */}
                  {canViewCampaignData && (
                    <>
                      <InfoRow
                        icon={Megaphone}
                        label="Campaign"
                        value={lead.utm_campaign ?? lead.utm_source ?? "—"}
                      />
                      {lead.utm_source && (
                        <InfoRow
                          icon={GitBranch}
                          label="Attribution"
                          value={[lead.utm_source, lead.utm_medium]
                            .filter(Boolean)
                            .join(" / ")}
                        />
                      )}
                    </>
                  )}

                  <InfoRow
                    icon={Calendar}
                    label="Last Updated"
                    value={formatDate(lead.updated_at)}
                  />

                  {/* Assigned Agent — interactive for scout/admin */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#F2F2EE] flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-[#8A8A6E]" />
                    </div>
                    <div>
                      <p className="text-[10px] text-[#B5A99A] uppercase tracking-wider font-medium">
                        Assigned Agent
                      </p>
                      {canReassign ? (
                        <InlineAgentSelect
                          leadId={lead.id}
                          currentAgentId={lead.assigned_to}
                          currentAgentName={lead.assigned_agent?.full_name ?? "Unassigned"}
                          agents={agents}
                        />
                      ) : (
                        <p className="text-sm text-[#1A1A1A] font-medium mt-0.5">
                          {lead.assigned_agent?.full_name ?? "Unassigned"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* SLA Clock — assigned_at with elapsed time */}
                  <div className="flex items-start gap-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: sla.bgColor }}
                    >
                      {sla.showAlert
                        ? <AlertTriangle className="w-3.5 h-3.5" style={{ color: sla.color }} />
                        : <Clock className="w-3.5 h-3.5" style={{ color: sla.color }} />
                      }
                    </div>
                    <div>
                      <p className="text-[10px] text-[#B5A99A] uppercase tracking-wider font-medium">
                        SLA · Assigned
                      </p>
                      {lead.assigned_at ? (
                        <div className="mt-0.5">
                          <p className="text-sm font-semibold" style={{ color: sla.color }}>
                            {sla.label}
                          </p>
                          {sla.sublabel && (
                            <p className="text-[11px]" style={{ color: sla.color }}>
                              {sla.sublabel}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-[#9E9E9E] mt-0.5">—</p>
                      )}
                    </div>
                  </div>
                </div>

                <Separator className="my-5" />

                {/* ── Executive Dossier ────────────────────────────────── */}
                <p className="text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider mb-3">
                  Executive Dossier
                </p>

                <div className="grid grid-cols-2 gap-4">
                  {/* City — double-click inline edit */}
                  <InlineCityEdit leadId={lead.id} currentCity={lead.city} />
                  {/* Company — double-click inline edit */}
                  <InlineCompanyEdit leadId={lead.id} currentCompany={lead.company ?? null} />
                </div>

                {/* Tags — multi-input badge component */}
                <InlineTagsEdit leadId={lead.id} initialTags={lead.tags ?? []} />

                {/* Client Persona & Interests — always-active auto-save textarea */}
                <InlinePersonaEdit
                  leadId={lead.id}
                  initialValue={lead.personal_details}
                />

                {/* Lost Reason — display if lead is lost */}
                {lead.status === "lost" && (lead.lost_reason || lead.lost_reason_tag) && (
                  <>
                    <Separator className="my-4" />
                    <div>
                      <p className="text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider mb-2">
                        Loss Analysis
                      </p>
                      <div className="bg-[#FAEAE8] border border-[#C0392B]/15 rounded-lg p-3">
                        <p className="text-xs font-semibold text-[#8B1A1A] uppercase tracking-wider">
                          {lead.lost_reason ?? LOST_REASON_LABELS[lead.lost_reason_tag!] ?? lead.lost_reason_tag}
                        </p>
                        {lead.lost_reason_notes && (
                          <p className="text-sm text-[#4A1A1A] mt-1.5 leading-relaxed">
                            {lead.lost_reason_notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Marketing Notes — Public shared space with amber luxury wash */}
            {lead.notes && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: "#1A1814" }}
              >
                {/* Delicate gold top-border accent */}
                <div className="border-t-2 border-[#D4AF37]/30" />
                <div className="px-6 pt-5 pb-4 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <Share2 className="w-3.5 h-3.5 text-[#D4AF37]/60" />
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#D4AF37]/70">
                      Marketing Notes
                    </p>
                    <span className="text-[9px] text-white/30 uppercase tracking-wider border border-white/10 rounded px-1.5 py-0.5 ml-1">
                      Public
                    </span>
                  </div>
                </div>
                <div className="px-6 py-4">
                  <p className="text-sm text-white/75 leading-relaxed">{lead.notes}</p>
                </div>
              </div>
            )}

            {/* Intake Questionnaire */}
            {lead.form_data && Object.keys(lead.form_data).length > 0 && (
              <DynamicFormResponses responses={lead.form_data} />
            )}

            {/* Scheduled Tasks — upcoming actions take priority over history */}
            <LeadTaskWidget
              leadId={lead.id}
              role={userRole}
              initialTasks={leadTasks}
            />

            {/* Activity Timeline */}
            <div className="bg-white rounded-xl border border-[#E5E4DF] p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
              <p className="text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider mb-4">
                Activity Timeline
              </p>
              <ScrollArea className="max-h-[500px] pr-3">
                <LeadJourneyTimeline activities={activities} />
              </ScrollArea>
            </div>
          </div>

          {/* ══ RIGHT: Status panel + scratchpad ═══════════════════════════════ */}
          <div className="space-y-4">
            {/* Pipeline stage summary */}
            <div className="bg-white rounded-xl border border-[#E5E4DF] p-4 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
              <p className="text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider mb-3">
                Pipeline Stage
              </p>
              <div
                className="flex items-center gap-2.5 p-3 rounded-lg"
                style={{ backgroundColor: statusConfig.bgColor }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: statusConfig.color }}
                />
                <div>
                  <p className="text-sm font-semibold" style={{ color: statusConfig.color }}>
                    {statusConfig.label}
                  </p>
                  <p className="text-xs text-[#9E9E9E] mt-0.5">
                    {statusConfig.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Status actions */}
            <StatusActionPanel
              leadId={lead.id}
              leadName={`${lead.first_name} ${lead.last_name ?? ""}`.trim()}
              currentStatus={lead.status}
              attemptCount={lead.attempt_count ?? 0}
            />

            {/* Agent private scratchpad — only for the assigned agent */}
            {canViewScratchpad && (
              <AgentScratchpad
                leadId={lead.id}
                initialValue={scratchpadValue}
              />
            )}

            {/* Internal Discussion thread — team-visible, anchored to this lead */}
            {conversationId && (
              <LeadContextChat
                conversationId={conversationId}
                currentUserId={user.id}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Lost reason display labels ───────────────────────────────────────────────

const LOST_REASON_LABELS: Record<string, string> = {
  budget_exceeded:        "Budget Exceeded",
  irrelevant_unqualified: "Irrelevant / Unqualified",
  timing_not_ready:       "Timing / Not Ready",
  went_with_competitor:   "Went with Competitor",
  ghosted_unresponsive:   "Ghosted / Unresponsive",
};

// ── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-[#F2F2EE] flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-[#8A8A6E]" />
      </div>
      <div>
        <p className="text-[10px] text-[#B5A99A] uppercase tracking-wider font-medium">
          {label}
        </p>
        <p className="text-sm text-[#1A1A1A] font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

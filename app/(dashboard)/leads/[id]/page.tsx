import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { StatusActionPanel } from "@/components/leads/StatusActionPanel";
import { InlineAgentSelect } from "@/components/leads/InlineAgentSelect";
import { InlineEmailEdit } from "@/components/leads/InlineEmailEdit";
import { InlineCityEdit } from "@/components/leads/InlineCityEdit";
import { InlinePersonaEdit } from "@/components/leads/InlinePersonaEdit";
import { InlineCompanyEdit } from "@/components/leads/InlineDossierFields";
import { InlineTagsEdit } from "@/components/leads/InlineTagsEdit";
import { AgentScratchpad } from "@/components/leads/AgentScratchpad";
import { Button } from "@/components/ui/button";
import { Card, surfaceCardVariants } from "@/components/ui/card";
import { InfoRow } from "@/components/ui/info-row";
import { Separator } from "@/components/ui/separator";
import { formatDateTime, getInitials } from "@/lib/utils";
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
import { MarketingIntakeCard } from "@/components/leads/MarketingIntakeCard";
import {
  LeadActivityTimelineSkeleton,
  LeadContextChatSkeleton,
  LeadDossierContextChatAsync,
  LeadDossierJourneyAsync,
  LeadDossierTasksAsync,
  LeadDossierTimelineAsync,
  LeadDossierWhatsAppAsync,
  LeadJourneySkeleton,
  LeadTasksWidgetSkeleton,
  LeadWhatsAppSkeleton,
} from "./LeadDossierAsync";
import type {
  Lead,
  Profile,
  UserRole,
} from "@/lib/types/database";
import { getOffDutyAnchor } from "@/lib/utils/sla";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ── SLA helpers (Speed-to-Lead: On-Duty 5/10/15m, Off-Duty 60/90/120m from 9 AM IST) ─

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
    return {
      label: "Not set",
      sublabel: "",
      color: "#9E9E9E",
      bgColor: "#F5F5F5",
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
  const diffDays = Math.floor(diffHours / 24);

  let label: string;
  if (diffMins < 60) label = `${diffMins}m ago`;
  else if (diffHours < 24) label = `${diffHours}h ${diffMins % 60}m ago`;
  else label = `${diffDays}d ago`;

  const threshold = isOffDuty ? 120 : 15;
  if (diffMins >= threshold) {
    return {
      label,
      sublabel: "ESCALATED",
      color: "#C0392B",
      bgColor: "#FAEAE8",
      showAlert: true,
    };
  }
  if (diffMins >= (isOffDuty ? 90 : 10)) {
    return {
      label,
      sublabel: "SLA breaching soon",
      color: "#C0392B",
      bgColor: "#FAEAE8",
      showAlert: true,
    };
  }
  if (diffMins >= (isOffDuty ? 60 : 5)) {
    return {
      label,
      sublabel: "Lead waiting",
      color: "#C5830A",
      bgColor: "#FEF3D0",
      showAlert: false,
    };
  }
  return {
    label,
    sublabel: "Within SLA",
    color: "#4A7C59",
    bgColor: "#EBF4EF",
    showAlert: false,
  };
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
    "id, first_name, last_name, phone_number, secondary_phone, email, city, address, campaign_id, campaign_name, ad_name, platform, form_data, utm_source, utm_medium, utm_campaign, deal_value, deal_duration, domain, status, assigned_to, assigned_at, is_off_duty, agent_alert_sent, manager_alert_sent, notes, lost_reason_tag, lost_reason_notes, lost_reason, trash_reason, nurture_reason, attempt_count, personal_details, company, tags, follow_up_drafts, created_at, updated_at";
  const { data: rawLead, error } = await supabase
    .from("leads")
    .select(
      `${LEAD_COLS}, assigned_agent:profiles!assigned_to(id, full_name, email, role)`,
    )
    .eq("id", id)
    .single();

  if (error || !rawLead) notFound();

  const canViewScratchpad =
    user.id === (rawLead as { assigned_to: string | null }).assigned_to;
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

  // Managers / founders / admins can reassign — pre-fetch active agents
  const canReassign =
    userRole === "manager" ||
    userRole === "founder" ||
    userRole === "admin";
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

  const statusConfig = LEAD_STATUS_CONFIG[lead.status];

  // Roles that can see campaign/attribution/source blocks
  const canViewCampaignData =
    userRole === "manager" ||
    userRole === "founder" ||
    userRole === "admin" ||
    userRole === "guest";

  const sla = getSLAInfo(
    lead.assigned_at,
    lead.created_at,
    lead.is_off_duty ?? false,
  );

  const initialFollowUpDrafts = parseFollowUpDrafts(
    (lead as { follow_up_drafts?: unknown }).follow_up_drafts,
  );

  const journeyAsOf = new Date().toISOString();

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title={[lead.first_name, lead.last_name].filter(Boolean).join(" ")}
        subtitle={`Lead · ${lead.utm_campaign ?? lead.utm_source ?? "Direct"}`}
        actions={
          <Link href="/leads">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-[#9E9E9E]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </Button>
          </Link>
        }
      />

      <main className="grid grid-cols-3 gap-6 px-8 py-6">
        {/* ══ LEFT: Lead information + timeline ══════════════════════════════ */}
        <section className="col-span-2 space-y-5">
          {/* ── Lead info card ─────────────────────────────────────────────── */}
          <Card className="overflow-hidden">
              {/* Status accent strip */}
              <div
                className="h-1.5 w-full"
                style={{ backgroundColor: statusConfig.color }}
              />

            <div className="p-6">
                {/* Identity header */}
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-white text-xl font-semibold shadow-sm"
                    style={{
                      backgroundColor: statusConfig.bgColor,
                      color: statusConfig.color,
                    }}
                  >
                    {getInitials(
                      [lead.first_name, lead.last_name]
                        .filter(Boolean)
                        .join(" "),
                    )}
                  </div>
                  <div>
                    <h2
                      className="text-xl font-semibold text-[#1A1A1A]"
                      style={{ fontFamily: "var(--font-playfair), serif" }}
                    >
                      {lead.first_name} {lead.last_name ?? ""}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <LeadStatusBadge status={lead.status} />
                      <LeadSourceBadge
                        utmSource={lead.utm_source}
                        utmMedium={lead.utm_medium}
                        utmCampaign={lead.utm_campaign}
                      />
                      <span className="text-xs text-[#B5A99A]">
                        Added {formatDateTime(lead.created_at)}
                      </span>
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
                  <InfoRow
                    icon={Mail}
                    label="Email"
                    value={
                      <InlineEmailEdit
                        leadId={lead.id}
                        currentEmail={lead.email}
                      />
                    }
                  />

                  {/* Campaign / Attribution / Source — manager, founder, admin, guest */}
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
                    value={formatDateTime(lead.updated_at)}
                  />

                  {/* Assigned Agent — interactive for manager/founder/admin */}
                  <InfoRow
                    icon={User}
                    label="Assigned Agent"
                    value={
                      canReassign ? (
                        <InlineAgentSelect
                          leadId={lead.id}
                          currentAgentId={lead.assigned_to}
                          currentAgentName={
                            lead.assigned_agent?.full_name ?? "Unassigned"
                          }
                          agents={agents}
                        />
                      ) : (
                        <p className="mt-0.5 text-sm font-medium text-[#1A1A1A]">
                          {lead.assigned_agent?.full_name ?? "Unassigned"}
                        </p>
                      )
                    }
                  />

                  {/* SLA Clock — assigned_at with elapsed time */}
                  <InfoRow
                    icon={sla.showAlert ? AlertTriangle : Clock}
                    label="SLA · Assigned"
                    iconBg={sla.bgColor}
                    iconColor={sla.color}
                    value={
                      lead.assigned_at ? (
                        <div className="mt-0.5">
                          <p
                            className="text-sm font-semibold"
                            style={{ color: sla.color }}
                          >
                            {sla.label}
                          </p>
                          {sla.sublabel && (
                            <p
                              className="text-[11px]"
                              style={{ color: sla.color }}
                            >
                              {sla.sublabel}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-0.5 text-sm text-[#9E9E9E]">—</p>
                      )
                    }
                  />
                </div>

                <div className="mt-5">
                  <Suspense fallback={<LeadJourneySkeleton />}>
                    <LeadDossierJourneyAsync
                      leadId={lead.id}
                      currentStatus={lead.status}
                      leadCreatedAt={lead.created_at}
                      asOf={journeyAsOf}
                    />
                  </Suspense>
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
                  <InlineCompanyEdit
                    leadId={lead.id}
                    currentCompany={lead.company ?? null}
                  />
                </div>

                {/* Tags — multi-input badge component */}
                <InlineTagsEdit
                  leadId={lead.id}
                  initialTags={lead.tags ?? []}
                />

                {/* Client Persona & Interests — always-active auto-save textarea */}
                <InlinePersonaEdit
                  leadId={lead.id}
                  initialValue={lead.personal_details}
                />

                {/* Lost Reason — display if lead is lost */}
                {lead.status === "lost" &&
                  (lead.lost_reason || lead.lost_reason_tag) && (
                    <>
                      <Separator className="my-4" />
                      <div>
                        <p className="text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider mb-2">
                          Loss Analysis
                        </p>
                        <div className="bg-[#FAEAE8] border border-[#C0392B]/15 rounded-lg p-3">
                          <p className="text-xs font-semibold text-[#8B1A1A] uppercase tracking-wider">
                            {lead.lost_reason ??
                              LOST_REASON_LABELS[lead.lost_reason_tag!] ??
                              lead.lost_reason_tag}
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
          </Card>

            {/* Marketing Notes — Public shared space with amber luxury wash */}
            {lead.notes && (
              <article
                className={surfaceCardVariants({ tone: "dark", elevation: "none", overflow: "hidden" })}
              >
                <div className="border-t-2 border-[#D4AF37]/30" />
                <header className="flex items-center gap-2 border-b border-white/5 px-6 pb-4 pt-5">
                  <Share2 className="w-3.5 h-3.5 text-[#D4AF37]/60" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#D4AF37]/70">
                    Marketing Notes
                  </p>
                  <span className="ml-1 rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/30">
                    Public
                  </span>
                </header>
                <div className="px-6 py-4">
                  <p className="text-sm leading-relaxed text-white/75">
                    {lead.notes}
                  </p>
                </div>
              </article>
            )}

            {/* Marketing Intake & Profiling — attribution + form_data */}
            <MarketingIntakeCard
              campaignName={lead.campaign_name}
              adName={lead.ad_name}
              platform={lead.platform}
              formData={lead.form_data}
            />

            {/* Scheduled Tasks — upcoming actions take priority over history */}
            <Suspense fallback={<LeadTasksWidgetSkeleton />}>
              <LeadDossierTasksAsync leadId={lead.id} role={userRole} />
            </Suspense>

            <Suspense fallback={<LeadActivityTimelineSkeleton />}>
              <LeadDossierTimelineAsync leadId={lead.id} />
            </Suspense>
        </section>

        {/* ══ RIGHT: Status panel + discussion + scratchpad ═════════════════ */}
        <aside className="space-y-4">
            <StatusActionPanel
              leadId={lead.id}
              leadName={`${lead.first_name} ${lead.last_name ?? ""}`.trim()}
              currentStatus={lead.status}
              attemptCount={lead.attempt_count ?? 0}
              viewerRole={userRole}
              initialFollowUpDrafts={initialFollowUpDrafts}
            />

            <Suspense fallback={<LeadWhatsAppSkeleton />}>
              <LeadDossierWhatsAppAsync leadId={lead.id} />
            </Suspense>

            <Suspense fallback={<LeadContextChatSkeleton />}>
              <LeadDossierContextChatAsync
                leadId={lead.id}
                currentUserId={user.id}
              />
            </Suspense>

            {canViewScratchpad && (
              <>
                <hr className="border-stone-100" />
                <AgentScratchpad
                  leadId={lead.id}
                  initialValue={scratchpadValue}
                />
              </>
            )}
        </aside>
      </main>
    </div>
  );
}

// ── Follow-up draft JSON from leads.follow_up_drafts ─────────────────────────

function parseFollowUpDrafts(raw: unknown): Record<1 | 2 | 3, string> {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const slot = (k: string) => (o && typeof o[k] === "string" ? o[k] : "");
  return { 1: slot("1"), 2: slot("2"), 3: slot("3") };
}

// ── Lost reason display labels ───────────────────────────────────────────────

const LOST_REASON_LABELS: Record<string, string> = {
  budget_exceeded: "Budget Exceeded",
  irrelevant_unqualified: "Irrelevant / Unqualified",
  timing_not_ready: "Timing / Not Ready",
  went_with_competitor: "Went with Competitor",
  ghosted_unresponsive: "Ghosted / Unresponsive",
};


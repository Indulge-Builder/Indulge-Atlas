"use client";

import { useState, useTransition } from "react";
import {
  Phone,
  Mail,
  PhoneCall,
  MessageSquare,
  ShieldAlert,
  Flame,
  User,
  Megaphone,
} from "lucide-react";
import { InlineEmailEdit } from "@/components/leads/InlineEmailEdit";
import { InlineAgentSelect } from "@/components/leads/InlineAgentSelect";
import { InlineCityEdit } from "@/components/leads/InlineCityEdit";
import { InlineCompanyEdit } from "@/components/leads/InlineDossierFields";
import { InlineTagsEdit } from "@/components/leads/InlineTagsEdit";
import { InlinePersonaEdit } from "@/components/leads/InlinePersonaEdit";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { LeadSourceBadge } from "@/components/ui/LeadSourceBadge";
import { LeadCollaboratorsDock } from "@/components/leads/LeadCollaboratorsDock";
import { updateLeadIntent } from "@/lib/actions/leads";
import { toast } from "sonner";
import { formatLeadCreatedAt } from "@/lib/utils/date-format";
import { getInitials } from "@/lib/utils";
import { LEAD_STATUS_CONFIG } from "@/lib/types/database";
import type { Lead, LeadCollaborator, Profile, UserRole } from "@/lib/types/database";

const OUTCOME_DISPLAY: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  rnr:          { label: "RNR",          color: "#92400E", bg: "#FEF3C7", dot: "#F59E0B" },
  switched_off: { label: "Switched Off", color: "#374151", bg: "#F3F4F6", dot: "#9CA3AF" },
  wrong_number: { label: "Wrong Number", color: "#9F1239", bg: "#FFF1F2", dot: "#FB7185" },
  conversing:   { label: "Conversing",   color: "#065F46", bg: "#ECFDF5", dot: "#10B981" },
  other:        { label: "Other",        color: "#44403C", bg: "#F5F5F4", dot: "#A8A29E" },
};

const LOST_REASON_LABELS: Record<string, string> = {
  budget_exceeded:        "Budget Exceeded",
  irrelevant_unqualified: "Irrelevant / Unqualified",
  timing_not_ready:       "Timing / Not Ready",
  went_with_competitor:   "Went with Competitor",
  ghosted_unresponsive:   "Ghosted / Unresponsive",
};

interface LeadInfoCardProps {
  lead: Lead & { assigned_agent?: Profile };
  userRole: UserRole;
  canReassign: boolean;
  canViewCampaignData: boolean;
  canManageCollaborators: boolean;
  agents: { id: string; full_name: string }[];
  collaborators: LeadCollaborator[];
  sla: { label: string; sublabel: string; color: string; bgColor: string; showAlert: boolean };
  journeyBar: React.ReactNode;
}

export function LeadInfoCard({
  lead,
  canReassign,
  canViewCampaignData,
  canManageCollaborators,
  agents,
  collaborators,
  sla,
  journeyBar,
}: LeadInfoCardProps) {
  const statusConfig = LEAD_STATUS_CONFIG[lead.status];
  const callCount    = (lead as { call_count?: number }).call_count ?? 0;
  const lastOutcome  = (lead as { last_call_outcome?: string }).last_call_outcome ?? null;
  const slaBreaches  = (lead as { sla_breach_count?: number }).sla_breach_count ?? 0;
  const leadIntent   = (lead as { lead_intent?: "hot" | "cold" | null }).lead_intent ?? null;

  return (
    <div className="rounded-2xl border border-[#E5E4DF] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
      {/* Status accent strip */}
      <div className="h-1 w-full" style={{ backgroundColor: statusConfig.color }} />

      <div className="px-6 py-5 space-y-5">

        {/* ── Identity header ────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-semibold shadow-sm"
              style={{ backgroundColor: statusConfig.bgColor, color: statusConfig.color }}
            >
              {getInitials([lead.first_name, lead.last_name].filter(Boolean).join(" "))}
            </div>
            <div className="min-w-0">
              <h2
                className="text-[18px] font-semibold text-[#1A1A1A] leading-tight"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                {lead.first_name} {lead.last_name ?? ""}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <LeadStatusBadge status={lead.status} />
                <LeadSourceBadge
                  utmSource={lead.utm_source}
                  utmMedium={lead.utm_medium}
                  utmCampaign={lead.utm_campaign}
                />
              </div>
              <p className="mt-1 text-[11px] text-[#B5A99A]">
                Added {formatLeadCreatedAt(lead.created_at)}
              </p>
            </div>
          </div>
          <div className="shrink-0 pt-0.5">
            <LeadCollaboratorsDock
              leadId={lead.id}
              canManage={canManageCollaborators}
              initialRows={collaborators}
            />
          </div>
        </div>

        <div className="h-px bg-[#F0EFE9]" />

        {/* ── Contact & Signal Fields — 2-column grid ──────────── */}
        {/*
          Layout logic:
          - Each cell = icon + label (muted, small) on one line, value on next line
          - 2 cells per row → naturally pairs related fields
          - Grid auto-flow handles odd fields gracefully (spans full width where needed)
        */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">

          {/* Phone */}
          <Cell icon={<Phone className="h-3.5 w-3.5" />} label="Phone">
            <span className="text-[13px] font-medium text-[#1A1A1A] tabular-nums">
              {lead.phone_number}
            </span>
          </Cell>

          {/* Email */}
          <Cell icon={<Mail className="h-3.5 w-3.5" />} label="Email">
            <InlineEmailEdit leadId={lead.id} currentEmail={lead.email} />
          </Cell>

          {/* Calls Made */}
          <Cell icon={<PhoneCall className="h-3.5 w-3.5" />} label="Calls Made">
            <span className="text-[13px] font-semibold text-[#1A1A1A] tabular-nums">
              {callCount}
            </span>
          </Cell>

          {/* Last Outcome */}
          <Cell icon={<MessageSquare className="h-3.5 w-3.5" />} label="Last Outcome">
            {lastOutcome && OUTCOME_DISPLAY[lastOutcome] ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                style={{ color: OUTCOME_DISPLAY[lastOutcome].color, background: OUTCOME_DISPLAY[lastOutcome].bg }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: OUTCOME_DISPLAY[lastOutcome].dot }}
                />
                {OUTCOME_DISPLAY[lastOutcome].label}
              </span>
            ) : (
              <span className="text-[13px] text-[#C4BDBB]">—</span>
            )}
          </Cell>

          {/* SLA Breaches */}
          <Cell
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
            label="SLA Breaches"
            iconColor={slaBreaches > 0 ? "#C0392B" : undefined}
          >
            <div className="flex items-center gap-2">
              <span className={`text-[13px] font-semibold tabular-nums ${slaBreaches > 0 ? "text-[#C0392B]" : "text-[#1A1A1A]"}`}>
                {slaBreaches}
              </span>
              {sla.sublabel && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ color: sla.color, background: sla.bgColor }}
                >
                  {sla.sublabel}
                </span>
              )}
            </div>
          </Cell>

          {/* Lead Intent — rendered directly so pill bg hugs content only */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className="h-3.5 w-3.5 shrink-0 text-[#9E9E9E]" />
              <span className="text-[10px] font-medium uppercase tracking-wide text-[#9E9E9E]">Intent</span>
            </div>
            <div className="pl-5">
              <LeadIntentSelect leadId={lead.id} currentIntent={leadIntent} />
            </div>
          </div>

          {/* Assigned Agent — managers / admins / founders only */}
          {canReassign && (
            <Cell icon={<User className="h-3.5 w-3.5" />} label="Assigned To" fullWidth>
              <InlineAgentSelect
                leadId={lead.id}
                currentAgentId={lead.assigned_to}
                currentAgentName={lead.assigned_agent?.full_name ?? "Unassigned"}
                agents={agents}
              />
            </Cell>
          )}

          {/* Campaign — only for privileged roles */}
          {canViewCampaignData && lead.utm_campaign && (
            <Cell icon={<Megaphone className="h-3.5 w-3.5" />} label="Campaign">
              <span className="text-[13px] text-[#1A1A1A] truncate block">
                {lead.utm_campaign}
              </span>
            </Cell>
          )}

        </div>

        <div className="h-px bg-[#F0EFE9]" />

        {/* ── Pipeline Journey ──────────────────────────────────── */}
        <div>
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
            Pipeline Journey
          </p>
          {journeyBar}
        </div>

        <div className="h-px bg-[#F0EFE9]" />

        {/* ── Client Details ────────────────────────────────────── */}
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
            Client Details
          </p>

          {/* City + Company side by side — components render their own icons/labels */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4">
            <InlineCityEdit leadId={lead.id} currentCity={lead.city} />
            <InlineCompanyEdit leadId={lead.id} currentCompany={lead.company ?? null} />
          </div>

          {/* Tags — full width, component renders its own icon/label */}
          <div className="mb-4">
            <InlineTagsEdit leadId={lead.id} initialTags={lead.tags ?? []} />
          </div>

          {/* Persona — full width */}
          <InlinePersonaEdit leadId={lead.id} initialValue={lead.personal_details} />
        </div>

        {/* Loss analysis */}
        {lead.status === "lost" && (lead.lost_reason || lead.lost_reason_tag) && (
          <>
            <div className="h-px bg-[#F0EFE9]" />
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
                Loss Analysis
              </p>
              <div className="rounded-xl bg-[#FAEAE8] border border-[#C0392B]/15 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8B1A1A]">
                  {lead.lost_reason ??
                    LOST_REASON_LABELS[lead.lost_reason_tag!] ??
                    lead.lost_reason_tag}
                </p>
                {lead.lost_reason_notes && (
                  <p className="mt-1.5 text-sm leading-relaxed text-[#4A1A1A]">
                    {lead.lost_reason_notes}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ── Cell — label + value stacked, sits in a 2-col grid ───────────────────────

function Cell({
  icon,
  label,
  children,
  iconColor,
  fullWidth,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  iconColor?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : undefined}>
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="shrink-0 text-[#9E9E9E]"
          style={iconColor ? { color: iconColor } : undefined}
        >
          {icon}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-[#9E9E9E]">
          {label}
        </span>
      </div>
      <div className="pl-5">{children}</div>
    </div>
  );
}

// ── Intent dropdown ───────────────────────────────────────────────────────────

function LeadIntentSelect({
  leadId,
  currentIntent,
}: {
  leadId: string;
  currentIntent: "hot" | "cold" | null;
}) {
  const [value, setValue] = useState<"hot" | "cold" | "none">(currentIntent ?? "none");
  const [isPending, startTransition] = useTransition();

  function handleChange(v: string) {
    const intent = v === "none" ? null : (v as "hot" | "cold");
    setValue(v as "hot" | "cold" | "none");
    startTransition(async () => {
      const result = await updateLeadIntent(leadId, intent);
      if (!result.success) {
        toast.error(result.error ?? "Failed to update intent");
        setValue(currentIntent ?? "none");
      }
    });
  }

  const options: { v: "hot" | "cold" | "none"; label: string; icon: string }[] = [
    { v: "hot",  label: "Hot",  icon: "🔥" },
    { v: "cold", label: "Cold", icon: "❄️" },
    { v: "none", label: "—",    icon: ""   },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-[#F5F4F0] p-0.5">
      {options.map(({ v, label, icon }) => {
        const isActive = value === v;
        const activeStyle =
          v === "hot"
            ? "bg-white text-orange-600 shadow-sm border border-orange-200/60"
            : v === "cold"
            ? "bg-white text-blue-500 shadow-sm border border-blue-200/60"
            : "bg-white text-[#9E9E9E] shadow-sm border border-[#E5E4DF]";

        return (
          <button
            key={v}
            onClick={() => handleChange(v)}
            disabled={isPending}
            className={`
              flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium
              transition-all duration-150 disabled:opacity-50
              ${isActive ? activeStyle : "text-[#B5A99A] hover:text-[#7A6A55]"}
            `}
          >
            {icon && <span className="text-[12px] leading-none">{icon}</span>}
            {label}
          </button>
        );
      })}
    </div>
  );
}

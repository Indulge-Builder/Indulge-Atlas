"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Video,
  ExternalLink,
  User,
  Phone,
  Mail,
  Tag,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { surfaceCardVariants } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoRow } from "@/components/ui/info-row";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { getAttachmentSignedUrl, updateTicketEscalationStatus } from "@/lib/actions/concierge-tickets";
import {
  CONCIERGE_ESCALATION_STATUSES,
  CONCIERGE_ESCALATION_STATUS_LABELS,
  type ConciergeEscalationStatus,
} from "@/lib/types/database";
import type { ConciergeTicketAttachment } from "@/lib/types/database";
import type { TicketDetailViewProps } from "./panelTypes";
import { StatusBadge, PriorityDot, OverdueBadge, SlaCountdown, groupLabel, updateKindLabel } from "./ticketPresentation";
import { StatusControl } from "./StatusControl";
import { TicketComposer } from "./TicketComposer";
import { ChecklistPanel } from "./ChecklistPanel";
import { BillablePanel } from "./BillablePanel";
import { VendorFeedbackModal } from "./VendorFeedbackModal";
import { TransferModal } from "./TransferModal";

function AttachmentChip({ att }: { att: ConciergeTicketAttachment }) {
  const [loading, setLoading] = useState(false);
  const Icon = att.kind === "image" ? ImageIcon : att.kind === "video" ? Video : FileText;
  async function open() {
    setLoading(true);
    const res = await getAttachmentSignedUrl(att.id);
    setLoading(false);
    if (res.success && res.data) window.open(res.data.url, "_blank", "noopener,noreferrer");
    else toast.error(res.error ?? "Could not open attachment");
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5 text-neutral-500" />
      <span className="max-w-[180px] truncate">{att.file_name}</span>
      {att.is_proof && <span className="rounded bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-600">PROOF</span>}
      <ExternalLink className="h-3 w-3 text-neutral-400" />
    </button>
  );
}

/** FD-style Escalation Status — separate from the workflow status machine. */
function EscalationControl({
  ticketId,
  value,
  canEdit,
}: {
  ticketId: string;
  value: ConciergeEscalationStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(next: string) {
    if (next === value) return;
    startTransition(async () => {
      const res = await updateTicketEscalationStatus({ ticketId, escalationStatus: next });
      if (res.success) {
        toast.success("Escalation updated");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not update escalation");
      }
    });
  }

  return (
    <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
      <h2 className="mb-2 text-sm font-semibold text-neutral-800">Escalation Status</h2>
      {canEdit ? (
        <Select value={value} onValueChange={onChange} disabled={isPending}>
          <SelectTrigger aria-label="Escalation status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONCIERGE_ESCALATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CONCIERGE_ESCALATION_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm text-neutral-700">{CONCIERGE_ESCALATION_STATUS_LABELS[value]}</p>
      )}
    </div>
  );
}

export function TicketDetailView({ detail, canEdit, isAdmin, agents, vendors, canned }: TicketDetailViewProps) {
  const router = useRouter();
  const { ticket, client, category, subcategory, assignee, updates, attachments, checklist, invoice, primaryVendor } = detail;

  const [transferOpen, setTransferOpen] = useState(false);
  const [feedbackVendor, setFeedbackVendor] = useState<string | null>(null);

  // Realtime: refresh the RSC when a new timeline entry lands.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`concierge-ticket-${ticket.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "concierge_ticket_updates", filter: `ticket_id=eq.${ticket.id}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "concierge_tickets", filter: `id=eq.${ticket.id}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ticket.id, router]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-5")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <span className="font-mono">#{ticket.ref_number}</span>
              <span>·</span>
              <span>
                {category?.name}
                {subcategory ? ` / ${subcategory.name}` : ""}
              </span>
              <span>·</span>
              <span>{groupLabel(ticket.org_group)}</span>
            </div>
            <h1 className="mt-1 font-serif text-2xl text-neutral-900">{ticket.title}</h1>
            {ticket.description && <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600">{ticket.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={ticket.status} />
              <PriorityDot priority={ticket.priority} withLabel />
              {ticket.is_overdue && <OverdueBadge />}
              {ticket.escalation_status !== "not_escalated" && (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {CONCIERGE_ESCALATION_STATUS_LABELS[ticket.escalation_status]}
                </span>
              )}
              <span className="text-xs text-neutral-400">Created {formatDateTime(ticket.created_at)}</span>
            </div>
            {ticket.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Tag className="h-3 w-3 text-neutral-400" aria-hidden />
                {ticket.tags.map((t) => (
                  <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)} className="shrink-0">
              <ArrowLeftRight className="mr-1.5 h-4 w-4" />
              Transfer
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Main column: timeline + composer */}
        <div className="space-y-4">
          <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-5")}>
            <h2 className="mb-3 text-sm font-semibold text-neutral-800">Timeline</h2>
            {canEdit && <TicketComposer ticketId={ticket.id} canned={canned} canEdit={canEdit} />}
            <ol className="mt-4 space-y-4">
              {updates.length === 0 && <li className="text-sm text-neutral-400">No activity yet.</li>}
              {updates.map((u) => (
                <li key={u.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neutral-300" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
                      <span className="font-medium text-neutral-700">{u.author?.full_name ?? "System"}</span>
                      <span>{updateKindLabel(u.kind)}</span>
                      <span>·</span>
                      <span>{formatDateTime(u.created_at)}</span>
                    </div>
                    {u.kind === "status_change" && (() => {
                      const md = (u.metadata ?? {}) as Record<string, unknown>;
                      const isEsc = md.field === "escalation_status";
                      const label = (v: string) =>
                        isEsc
                          ? CONCIERGE_ESCALATION_STATUS_LABELS[v as ConciergeEscalationStatus] ?? v
                          : v.replace(/_/g, " ");
                      return (
                        <div className="mt-1 text-sm text-neutral-700">
                          {isEsc ? "Escalation: " : ""}
                          {label(String(md.old_status ?? ""))} →{" "}
                          <span className="font-medium">{label(String(md.new_status ?? ""))}</span>
                        </div>
                      );
                    })()}
                    {u.body && <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{u.body}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Side column: properties + client + attachments */}
        <div className="space-y-4">
          <StatusControl
            ticketId={ticket.id}
            status={ticket.status}
            statusChangedAt={ticket.status_changed_at}
            isOverdue={ticket.is_overdue}
            primaryVendorId={ticket.primary_vendor_id}
            canEdit={canEdit}
            isAdmin={isAdmin}
            onRequireVendorFeedback={(vendorId) => setFeedbackVendor(vendorId)}
          />

          <EscalationControl ticketId={ticket.id} value={ticket.escalation_status} canEdit={canEdit} />

          {/* SLA */}
          <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
            <h2 className="mb-3 text-sm font-semibold text-neutral-800">SLA</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-neutral-500">First response</dt>
                <dd className="text-right">
                  {ticket.first_response_at ? (
                    <span className="text-emerald-600">Met · {formatDateTime(ticket.first_response_at)}</span>
                  ) : (
                    <SlaCountdown dueIso={ticket.sla_first_response_due} withIcon />
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-neutral-500">Resolution</dt>
                <dd className="text-right">
                  {ticket.resolved_at ? (
                    <span className="text-emerald-600">Resolved · {formatDateTime(ticket.resolved_at)}</span>
                  ) : (
                    <SlaCountdown dueIso={ticket.sla_resolution_due} isOverdue={ticket.is_overdue} withIcon />
                  )}
                </dd>
              </div>
              {ticket.is_overdue ? (
                <div className="pt-1">
                  <OverdueBadge />
                </div>
              ) : null}
            </dl>
          </div>

          <BillablePanel
            ticketId={ticket.id}
            isBillable={ticket.is_billable}
            invoiceNumber={ticket.invoice_number}
            invoice={invoice}
            attachments={attachments}
            vendors={vendors}
            canEdit={canEdit}
          />

          <ChecklistPanel items={checklist} canEdit={canEdit} />

          {/* Client drawer */}
          {client && (
            <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
              <h2 className="mb-2 text-sm font-semibold text-neutral-800">Client</h2>
              <InfoRow icon={User} label="Name" value={client.name} />
              <InfoRow icon={Phone} label="Phone" value={client.phone_number} />
              {client.email && <InfoRow icon={Mail} label="Email" value={client.email} />}
              {client.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-neutral-500">{client.notes}</p>}
            </div>
          )}

          {primaryVendor && (
            <div className={cn(surfaceCardVariants({ tone: "subtle", elevation: "xs" }), "p-4")}>
              <h2 className="mb-1 text-sm font-semibold text-neutral-800">Primary vendor</h2>
              <p className="text-sm text-neutral-700">{primaryVendor.name}</p>
              {primaryVendor.trust_score != null && (
                <p className="text-xs text-neutral-500">Trust {primaryVendor.trust_score}%</p>
              )}
            </div>
          )}

          {attachments.length > 0 && (
            <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-4")}>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
                <Paperclip className="h-3.5 w-3.5" /> Attachments
              </h2>
              <div className="flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <AttachmentChip key={a.id} att={a} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <VendorFeedbackModal
        ticketId={ticket.id}
        vendorId={feedbackVendor}
        open={feedbackVendor !== null}
        onOpenChange={(o) => !o && setFeedbackVendor(null)}
      />
      <TransferModal ticketId={ticket.id} agents={agents} open={transferOpen} onOpenChange={setTransferOpen} />
    </div>
  );
}

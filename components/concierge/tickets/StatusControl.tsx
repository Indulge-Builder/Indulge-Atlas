"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRightLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import {
  StatusBadge,
  OverdueBadge,
  statusLabel,
  timeInStatus,
} from "@/components/concierge/tickets/ticketPresentation";
import type { StatusControlProps } from "@/components/concierge/tickets/panelTypes";

import { allowedTransitionsFrom } from "@/lib/concierge/ticketStateMachine";
import { changeTicketStatus } from "@/lib/actions/concierge-tickets";
import {
  CONCIERGE_STATUS_LABELS,
  type ConciergeTicketStatus,
} from "@/lib/types/database";

export function StatusControl({
  ticketId,
  status,
  statusChangedAt,
  isOverdue,
  canEdit,
  isAdmin,
  onRequireVendorFeedback,
}: StatusControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [override, setOverride] = useState(false);
  const [target, setTarget] = useState<ConciergeTicketStatus | null>(null);
  const [note, setNote] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const noteRequired = target === "nudge_client" || target === "nudge_vendor";

  function openTarget(next: ConciergeTicketStatus) {
    setTarget(next);
    setNote("");
    setTrackingId("");
    setReason("");
    setError(null);
  }

  function closeDialog() {
    setTarget(null);
    setError(null);
  }

  function handleConfirm() {
    if (!target) return;
    if (noteRequired && !note.trim()) {
      setError("Add a note describing what you are nudging about.");
      return;
    }
    setError(null);
    const to = target;

    startTransition(async () => {
      const res = await changeTicketStatus({
        ticketId,
        to,
        note: note.trim() || undefined,
        trackingId: trackingId.trim() || undefined,
        reason: reason.trim() || undefined,
        override,
      });

      if (res.success) {
        toast.success(`Status updated to ${CONCIERGE_STATUS_LABELS[to]}.`);
        if (res.data?.requiresVendorFeedback && res.data.vendorId) {
          onRequireVendorFeedback(res.data.vendorId);
        }
        router.refresh();
        closeDialog();
        return;
      }

      const message = res.error ?? "Something went wrong";
      toast.error(message);
      // Keep the dialog open so the operator can fix the missing requirement
      // (proof_required, invoice_incomplete, billable_required, …).
      setError(message);
    });
  }

  const nextStatuses = allowedTransitionsFrom(status, override && isAdmin);

  return (
    <section className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-5")}>
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#6B6B6B]">
        Status
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        {isOverdue && <OverdueBadge />}
      </div>
      <p className="mt-2 text-sm text-neutral-600">
        In {statusLabel(status)} for {timeInStatus(statusChangedAt)}
      </p>

      {canEdit && (
        <div className="mt-4 space-y-3 border-t border-neutral-200 pt-4">
          {isAdmin && (
            <label className="flex items-center gap-2 text-xs text-neutral-700">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-300 accent-brand-gold"
              />
              Force (admin override)
            </label>
          )}

          <Select
            value=""
            onValueChange={(value) => openTarget(value as ConciergeTicketStatus)}
          >
            <SelectTrigger aria-label="Change status">
              <SelectValue placeholder="Change status…" />
            </SelectTrigger>
            <SelectContent>
              {nextStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {CONCIERGE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : closeDialog())}>
        <DialogContent>
          {target && (
            <>
              <DialogHeader>
                <DialogTitle>Move to {CONCIERGE_STATUS_LABELS[target]}</DialogTitle>
                <DialogDescription>
                  Moving from {statusLabel(status)} to {CONCIERGE_STATUS_LABELS[target]}
                  {override && isAdmin ? " (admin override)" : ""}.
                </DialogDescription>
              </DialogHeader>

              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4">
                {noteRequired && (
                  <IndulgeField label="Note" htmlFor="status-note" required>
                    <Textarea
                      id="status-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What are you nudging about?"
                      rows={3}
                    />
                  </IndulgeField>
                )}

                {target === "ongoing_delivery" && (
                  <IndulgeField
                    label="Tracking ID"
                    htmlFor="status-tracking"
                    hint="or attach proof via the composer"
                  >
                    <Input
                      id="status-tracking"
                      value={trackingId}
                      onChange={(e) => setTrackingId(e.target.value)}
                      placeholder="Tracking or confirmation reference"
                    />
                  </IndulgeField>
                )}

                <IndulgeField label="Reason" htmlFor="status-reason" hint="Optional — recorded on the timeline">
                  <Input
                    id="status-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is this changing?"
                  />
                </IndulgeField>
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={closeDialog} disabled={isPending}>
                  Cancel
                </Button>
                <IndulgeButton
                  type="button"
                  variant="gold"
                  loading={isPending}
                  leftIcon={<ArrowRightLeft className="h-4 w-4" />}
                  onClick={handleConfirm}
                >
                  Confirm change
                </IndulgeButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

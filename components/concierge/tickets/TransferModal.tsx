"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { transferTicket } from "@/lib/actions/concierge-tickets";
import type { TransferModalProps } from "@/components/concierge/tickets/panelTypes";

export function TransferModal({
  ticketId,
  agents,
  open,
  onOpenChange,
}: TransferModalProps) {
  const router = useRouter();
  const [toAssigneeId, setToAssigneeId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setToAssigneeId("");
    setReason("");
  }

  async function handleSubmit() {
    if (!toAssigneeId) {
      toast.error("Select an agent to transfer to.");
      return;
    }

    setSubmitting(true);
    try {
      const trimmedReason = reason.trim();
      const res = await transferTicket({
        ticketId,
        toAssigneeId,
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      });

      if (res.success) {
        toast.success("Ticket transferred.");
        resetForm();
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer ticket</DialogTitle>
          <DialogDescription>
            Reassign this ticket to another concierge agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <IndulgeField label="Transfer to" htmlFor="transfer-agent" required>
            {agents.length === 0 ? (
              <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
                No agents available to transfer to.
              </p>
            ) : (
              <Select value={toAssigneeId} onValueChange={setToAssigneeId}>
                <SelectTrigger id="transfer-agent">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </IndulgeField>

          <IndulgeField
            label="Reason"
            htmlFor="transfer-reason"
            hint="Optional — shared on the ticket timeline."
          >
            <Textarea
              id="transfer-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being transferred?"
              rows={3}
            />
          </IndulgeField>
        </div>

        <DialogFooter>
          <IndulgeButton
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </IndulgeButton>
          <IndulgeButton
            variant="gold"
            type="button"
            loading={submitting}
            disabled={agents.length === 0}
            leftIcon={<ArrowRightLeft className="h-4 w-4" />}
            onClick={handleSubmit}
          >
            Transfer ticket
          </IndulgeButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

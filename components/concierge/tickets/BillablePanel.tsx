"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, FileText, IndianRupee, Receipt, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Input } from "@/components/ui/input";
import { InfoRow } from "@/components/ui/info-row";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { setBillable } from "@/lib/actions/concierge-tickets";
import type { BillablePanelProps } from "@/components/concierge/tickets/panelTypes";
import { InvoiceModal } from "./InvoiceModal";

function formatMoney(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}

export function BillablePanel({
  ticketId,
  isBillable,
  invoiceNumber,
  invoice,
  attachments,
  vendors,
  canEdit,
}: BillablePanelProps) {
  const router = useRouter();
  const [localBillable, setLocalBillable] = React.useState<boolean | null>(isBillable);
  const [invoiceNo, setInvoiceNo] = React.useState(invoiceNumber ?? "");
  const [saving, setSaving] = React.useState(false);
  const [invoiceOpen, setInvoiceOpen] = React.useState(false);

  const dirty =
    localBillable !== isBillable ||
    (localBillable === true && invoiceNo.trim() !== (invoiceNumber ?? "").trim());

  async function handleSave() {
    if (localBillable === null) return;
    setSaving(true);
    try {
      const trimmed = invoiceNo.trim();
      const res = await setBillable({
        ticketId,
        isBillable: localBillable,
        invoiceNumber: localBillable && trimmed ? trimmed : undefined,
      });
      if (res.success) {
        toast.success("Billing updated");
        router.refresh();
      } else {
        toast.error(res.error ?? "Something went wrong");
      }
    } finally {
      setSaving(false);
    }
  }

  const readOnlyLabel =
    isBillable === null ? "Not set" : isBillable ? "Billable" : "Non-billable";

  return (
    <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-5")}>
      <div className="mb-4 flex items-center gap-2">
        <Receipt className="h-4 w-4 text-[#8A8A6E]" aria-hidden />
        <h3 className="text-base font-semibold tracking-tight text-[#1A1A1A]">
          Billing
        </h3>
      </div>

      {/* Billable control */}
      <div className="space-y-3">
        {canEdit ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={localBillable === true ? "gold" : "outline"}
                onClick={() => setLocalBillable(true)}
              >
                Billable
              </Button>
              <Button
                type="button"
                size="sm"
                variant={localBillable === false ? "gold" : "outline"}
                onClick={() => setLocalBillable(false)}
              >
                Non-billable
              </Button>
            </div>

            {localBillable === true && (
              <IndulgeField label="Invoice number" htmlFor="billable-invoice-number">
                <Input
                  id="billable-invoice-number"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-1042"
                />
              </IndulgeField>
            )}

            <IndulgeButton
              variant="gold"
              size="sm"
              loading={saving}
              disabled={localBillable === null || !dirty}
              onClick={handleSave}
            >
              Save
            </IndulgeButton>
          </>
        ) : (
          <div className="space-y-3">
            <InfoRow icon={Receipt} label="Billable" value={readOnlyLabel} />
            {isBillable && invoiceNumber && (
              <InfoRow icon={FileText} label="Invoice number" value={invoiceNumber} />
            )}
          </div>
        )}
      </div>

      {/* Invoice */}
      <div className="mt-5 border-t border-[#E5E4DF] pt-4">
        {invoice ? (
          <div className="space-y-3">
            <InfoRow icon={User} label="Client" value={invoice.client_name} />
            <InfoRow
              icon={IndianRupee}
              label="Selling price"
              value={formatMoney(invoice.selling_price)}
            />
            <InfoRow
              icon={CreditCard}
              label="Payment method"
              value={invoice.payment_method}
            />
          </div>
        ) : (
          <p className="text-sm text-[#6B6B6B]">No invoice created yet.</p>
        )}

        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => setInvoiceOpen(true)}
          >
            {invoice ? "Edit invoice" : "Create invoice"}
          </Button>
        )}
      </div>

      {canEdit && (
        <InvoiceModal
          ticketId={ticketId}
          open={invoiceOpen}
          onOpenChange={setInvoiceOpen}
          existing={invoice}
          attachments={attachments}
          vendors={vendors}
        />
      )}
    </div>
  );
}

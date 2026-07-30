"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { IndulgeField } from "@/components/ui/indulge-field";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { upsertTicketInvoice } from "@/lib/actions/concierge-tickets";
import type { InvoiceModalProps } from "@/components/concierge/tickets/panelTypes";
import type { TicketInvoice } from "@/lib/types/database";

/** Sentinel select value representing "no selection" (Radix items need a non-empty value). */
const NONE = "__none";

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "razorpay", label: "Razorpay" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

interface FormState {
  clientName: string;
  description: string;
  costPrice: string;
  sellingPrice: string;
  serviceCharge: string;
  paymentMethod: string;
  vendorId: string;
  vendorName: string;
  invoiceAttId: string;
  vendorBillAttId: string;
  billInOtherName: string;
}

type FieldErrors = Partial<
  Record<
    | "clientName"
    | "description"
    | "costPrice"
    | "sellingPrice"
    | "serviceCharge"
    | "paymentMethod",
    string
  >
>;

function buildInitial(existing: TicketInvoice | null): FormState {
  return {
    clientName: existing?.client_name ?? "",
    description: existing?.description ?? "",
    costPrice: existing ? String(existing.cost_price) : "",
    sellingPrice: existing ? String(existing.selling_price) : "",
    serviceCharge: existing ? String(existing.service_charge) : "",
    paymentMethod: existing?.payment_method ?? "",
    vendorId: existing?.vendor_id ?? NONE,
    vendorName: existing?.vendor_name ?? "",
    invoiceAttId: existing?.invoice_att_id ?? NONE,
    vendorBillAttId: existing?.vendor_bill_att_id ?? NONE,
    billInOtherName: existing?.bill_in_other_name ?? "",
  };
}

function parseAmount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

export function InvoiceModal({
  ticketId,
  open,
  onOpenChange,
  existing,
  attachments,
  vendors,
}: InvoiceModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => buildInitial(existing));
  const [errors, setErrors] = useState<FieldErrors>({});

  // Re-seed the form whenever the modal (re)opens or the existing invoice changes.
  useEffect(() => {
    if (open) {
      setForm(buildInitial(existing));
      setErrors({});
    }
  }, [open, existing]);

  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const cost = parseAmount(form.costPrice);
    const selling = parseAmount(form.sellingPrice);
    const service = parseAmount(form.serviceCharge);

    const nextErrors: FieldErrors = {};
    if (!form.clientName.trim()) nextErrors.clientName = "Client name is required";
    if (!form.description.trim()) nextErrors.description = "Description is required";
    if (cost === null) nextErrors.costPrice = "Enter a valid amount (0 or more)";
    if (selling === null) nextErrors.sellingPrice = "Enter a valid amount (0 or more)";
    if (service === null) nextErrors.serviceCharge = "Enter a valid amount (0 or more)";
    if (!form.paymentMethod) nextErrors.paymentMethod = "Select a payment method";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    startTransition(async () => {
      const res = await upsertTicketInvoice(ticketId, {
        clientName: form.clientName.trim(),
        description: form.description.trim(),
        costPrice: cost as number,
        sellingPrice: selling as number,
        serviceCharge: service as number,
        paymentMethod: form.paymentMethod,
        vendorId: form.vendorId === NONE ? null : form.vendorId,
        vendorName: form.vendorName.trim() || null,
        invoiceAttId: form.invoiceAttId === NONE ? null : form.invoiceAttId,
        vendorBillAttId: form.vendorBillAttId === NONE ? null : form.vendorBillAttId,
        billInOtherName: form.billInOtherName.trim() || null,
      });

      if (res.success) {
        toast.success(existing ? "Invoice updated" : "Invoice saved");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-[#D4AF37]" aria-hidden />
            {existing ? "Edit invoice" : "Invoice due"}
          </DialogTitle>
          <DialogDescription>
            Finance payload for this ticket — pricing, payment method and supporting documents.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <IndulgeField label="Client name" required error={errors.clientName} htmlFor="inv-client">
            <Input
              id="inv-client"
              value={form.clientName}
              onChange={(e) => set("clientName", e.target.value)}
              error={!!errors.clientName}
              placeholder="Name to bill"
            />
          </IndulgeField>

          <IndulgeField label="Description" required error={errors.description} htmlFor="inv-desc">
            <Textarea
              id="inv-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What is being invoiced"
              rows={3}
            />
          </IndulgeField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <IndulgeField label="Cost price" required error={errors.costPrice} htmlFor="inv-cost">
              <Input
                id="inv-cost"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.costPrice}
                onChange={(e) => set("costPrice", e.target.value)}
                error={!!errors.costPrice}
                placeholder="0"
              />
            </IndulgeField>

            <IndulgeField label="Selling price" required error={errors.sellingPrice} htmlFor="inv-selling">
              <Input
                id="inv-selling"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) => set("sellingPrice", e.target.value)}
                error={!!errors.sellingPrice}
                placeholder="0"
              />
            </IndulgeField>

            <IndulgeField label="Service charge" required error={errors.serviceCharge} htmlFor="inv-service">
              <Input
                id="inv-service"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.serviceCharge}
                onChange={(e) => set("serviceCharge", e.target.value)}
                error={!!errors.serviceCharge}
                placeholder="0"
              />
            </IndulgeField>
          </div>

          <IndulgeField label="Payment method" required error={errors.paymentMethod}>
            <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </IndulgeField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <IndulgeField label="Vendor" hint="Optional">
              <Select value={form.vendorId} onValueChange={(v) => set("vendorId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No vendor</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </IndulgeField>

            <IndulgeField label="Vendor name" hint="Free-text override (optional)" htmlFor="inv-vendor-name">
              <Input
                id="inv-vendor-name"
                value={form.vendorName}
                onChange={(e) => set("vendorName", e.target.value)}
                placeholder="e.g. external supplier"
              />
            </IndulgeField>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <IndulgeField label="Invoice document" hint="Optional">
              <Select value={form.invoiceAttId} onValueChange={(v) => set("invoiceAttId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No document" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No document</SelectItem>
                  {attachments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.file_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </IndulgeField>

            <IndulgeField label="Vendor bill" hint="Optional">
              <Select value={form.vendorBillAttId} onValueChange={(v) => set("vendorBillAttId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No bill" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No bill</SelectItem>
                  {attachments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.file_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </IndulgeField>
          </div>

          <IndulgeField label="Bill in other name" hint="Optional" htmlFor="inv-other-name">
            <Input
              id="inv-other-name"
              value={form.billInOtherName}
              onChange={(e) => set("billInOtherName", e.target.value)}
              placeholder="Alternate billing name"
            />
          </IndulgeField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <IndulgeButton type="submit" variant="gold" loading={isPending}>
              {existing ? "Save changes" : "Save invoice"}
            </IndulgeButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { cn } from "@/lib/utils";
import { submitVendorFeedback } from "@/lib/actions/concierge-vendors";
import type {
  VendorPromptness,
  VendorCostBand,
  VendorDelivery,
} from "@/lib/types/database";
import type { VendorFeedbackModalProps } from "@/components/concierge/tickets/panelTypes";

const PROMPTNESS_OPTIONS: { value: VendorPromptness; label: string }[] = [
  { value: "within_1h", label: "Within 1 hour" },
  { value: "within_24h", label: "Within 24 hours" },
  { value: "2_3_days", label: "2–3 days" },
];

const COST_OPTIONS: { value: VendorCostBand; label: string }[] = [
  { value: "lowest", label: "Lowest" },
  { value: "moderate", label: "Moderate" },
  { value: "high_premium", label: "High / premium" },
];

const DELIVERY_OPTIONS: { value: VendorDelivery; label: string }[] = [
  { value: "on_time", label: "On time" },
  { value: "delay", label: "Delay" },
  { value: "poor_communication", label: "Poor communication" },
];

const QUALITY_VALUES = [1, 2, 3, 4, 5] as const;

export function VendorFeedbackModal({
  ticketId,
  vendorId,
  open,
  onOpenChange,
}: VendorFeedbackModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const [quality, setQuality] = React.useState<number>(5);
  const [promptness, setPromptness] =
    React.useState<VendorPromptness>("within_24h");
  const [cost, setCost] = React.useState<VendorCostBand>("moderate");
  const [delivery, setDelivery] = React.useState<VendorDelivery>("on_time");

  function handleSubmit() {
    if (!vendorId) return;
    startTransition(async () => {
      const res = await submitVendorFeedback({
        ticketId,
        vendorId,
        quality,
        promptness,
        cost,
        delivery,
      });
      if (res.success) {
        toast.success(`Trust ${res.data?.trustScore}%`);
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vendor feedback</DialogTitle>
          <DialogDescription>
            Rate how the vendor handled this ticket. Your input recalculates
            their trust score.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <IndulgeField label="Quality">
            <div className="flex items-center gap-2">
              {QUALITY_VALUES.map((v) => {
                const selected = v <= quality;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setQuality(v)}
                    aria-label={`${v} star${v > 1 ? "s" : ""}`}
                    aria-pressed={v === quality}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                      selected
                        ? "border-brand-gold bg-brand-gold/10 text-brand-gold"
                        : "border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300",
                    )}
                  >
                    <Star
                      className={cn("h-4 w-4", selected && "fill-current")}
                    />
                  </button>
                );
              })}
              <span className="ml-1 text-sm text-neutral-500">
                {quality}/5
              </span>
            </div>
          </IndulgeField>

          <IndulgeField label="Promptness">
            <Select
              value={promptness}
              onValueChange={(val) => setPromptness(val as VendorPromptness)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select promptness" />
              </SelectTrigger>
              <SelectContent>
                {PROMPTNESS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </IndulgeField>

          <IndulgeField label="Cost">
            <Select
              value={cost}
              onValueChange={(val) => setCost(val as VendorCostBand)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select cost band" />
              </SelectTrigger>
              <SelectContent>
                {COST_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </IndulgeField>

          <IndulgeField label="Delivery">
            <Select
              value={delivery}
              onValueChange={(val) => setDelivery(val as VendorDelivery)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select delivery" />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </IndulgeField>
        </div>

        <DialogFooter>
          <IndulgeButton
            variant="gold"
            loading={isPending}
            disabled={!vendorId}
            onClick={handleSubmit}
          >
            Submit feedback
          </IndulgeButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

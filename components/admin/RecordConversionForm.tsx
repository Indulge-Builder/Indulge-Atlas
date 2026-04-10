"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordOnboardingConversionFromAdmin } from "@/lib/actions/onboarding-conversions";
import { ONBOARDING_ASSIGNED_TO_VALUES } from "@/lib/onboarding/onboardingConversion";
import { cn } from "@/lib/utils";

export function RecordConversionForm() {
  const [state, formAction, isPending] = useActionState(
    recordOnboardingConversionFromAdmin,
    undefined as { success: boolean; error?: string } | undefined,
  );

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success(
        "Conversion saved. It appears in the table below and on the TV within a few seconds.",
      );
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form
      action={formAction}
      className="rounded-xl border border-[#E5E4DF] bg-white p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]"
    >
      <div className="mb-4 flex items-center gap-2">
        <PlusCircle className="h-4 w-4 text-[#4A7C59]" aria-hidden />
        <h2 className="text-sm font-semibold text-[#1A1A1A]">
          Log a new sale (onboarding conversion)
        </h2>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-[#6B6B6B]">
        Same data is stored as the webhook and shown on{" "}
        <span className="font-medium text-[#3D3D3D]">Admin → Conversions</span>{" "}
        and your live TV URL (with the display token).
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="clientName">Client name</Label>
          <Input
            id="clientName"
            name="clientName"
            required
            placeholder="e.g. Acme Corp"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (₹)</Label>
          <Input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            placeholder="e.g. 50000"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agentName">Agent name</Label>
          <Input
            id="agentName"
            name="agentName"
            required
            placeholder="Who closed it"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assignedTo">Assigned to</Label>
          <select
            id="assignedTo"
            name="assignedTo"
            required
            defaultValue=""
            className={cn(
              "flex h-9 w-full rounded-md border border-[#E5E4DF] bg-white px-3 py-1 text-sm text-[#1A1A1A]",
              "focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37]",
            )}
          >
            <option value="" disabled>
              Select owner
            </option>
            {ONBOARDING_ASSIGNED_TO_VALUES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button type="submit" disabled={isPending} className="min-w-[140px]">
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save conversion"
          )}
        </Button>
      </div>
    </form>
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";

export const ONBOARDING_ASSIGNED_TO_VALUES = ["Ananyshree", "Anishqa"] as const;

export type OnboardingAssignedTo =
  (typeof ONBOARDING_ASSIGNED_TO_VALUES)[number];

export interface OnboardingConversionInput {
  clientName: string;
  amount: number;
  agentName: string;
  assignedTo: OnboardingAssignedTo;
}

function isAssignedTo(v: string): v is OnboardingAssignedTo {
  return (ONBOARDING_ASSIGNED_TO_VALUES as readonly string[]).includes(v);
}

/** Parse JSON webhook-style body (camelCase). */
export function parseOnboardingConversionJson(
  body: Record<string, unknown>,
):
  | { ok: true; data: OnboardingConversionInput }
  | { ok: false; error: string; status: number } {
  const clientName =
    typeof body.clientName === "string" ? body.clientName.trim() : "";
  const agentName =
    typeof body.agentName === "string" ? body.agentName.trim() : "";
  const assignedToRaw =
    typeof body.assignedTo === "string" ? body.assignedTo.trim() : "";

  let amount: number;
  if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    amount = body.amount;
  } else if (typeof body.amount === "string") {
    const parsed = parseFloat(body.amount.trim());
    if (!Number.isFinite(parsed)) {
      return {
        ok: false,
        error: "amount must be a valid number.",
        status: 400,
      };
    }
    amount = parsed;
  } else {
    return {
      ok: false,
      error: "amount is required and must be a number.",
      status: 400,
    };
  }

  if (!clientName) {
    return { ok: false, error: "clientName is required.", status: 400 };
  }
  if (!agentName) {
    return { ok: false, error: "agentName is required.", status: 400 };
  }
  if (!isAssignedTo(assignedToRaw)) {
    return {
      ok: false,
      error: `assignedTo must be one of: ${ONBOARDING_ASSIGNED_TO_VALUES.join(", ")}.`,
      status: 400,
    };
  }

  return {
    ok: true,
    data: {
      clientName,
      amount,
      agentName,
      assignedTo: assignedToRaw,
    },
  };
}

/** Parse admin form (same fields, snake_case optional — we use camelCase names in form). */
export function parseOnboardingConversionForm(
  formData: FormData,
):
  | { ok: true; data: OnboardingConversionInput }
  | { ok: false; error: string } {
  const clientName = String(formData.get("clientName") ?? "").trim();
  const agentName = String(formData.get("agentName") ?? "").trim();
  const assignedToRaw = String(formData.get("assignedTo") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const parsed = parseFloat(amountRaw);

  if (!clientName) {
    return { ok: false, error: "Client name is required." };
  }
  if (!agentName) {
    return { ok: false, error: "Agent name is required." };
  }
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: "Amount must be a valid number." };
  }
  if (!isAssignedTo(assignedToRaw)) {
    return {
      ok: false,
      error: `Assigned to must be one of: ${ONBOARDING_ASSIGNED_TO_VALUES.join(", ")}.`,
    };
  }

  return {
    ok: true,
    data: {
      clientName,
      amount: parsed,
      agentName,
      assignedTo: assignedToRaw,
    },
  };
}

export async function insertOnboardingConversion(
  supabase: SupabaseClient,
  input: OnboardingConversionInput,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from("onboarding_leads").insert({
    client_name: input.clientName,
    amount: input.amount,
    agent_name: input.agentName,
    assigned_to: input.assignedTo,
  });

  return { error: error ? { message: error.message } : null };
}

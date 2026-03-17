/**
 * INDULGE ATLAS — Lead Ingestion Core Engine
 *
 * Shared service for Meta, Google, and Website webhook adapters.
 * Validates, assigns agent, inserts lead, and logs activity.
 */

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { toZonedTime } from "date-fns-tz";
import { getHours } from "date-fns";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const IST = "Asia/Kolkata";

function isOffDutyInsertion(): boolean {
  const now = new Date();
  const istNow = toZonedTime(now, IST);
  const h = getHours(istNow);
  return h >= 18 || h < 9;
}

const emptyStringToNull = z
  .string()
  .trim()
  .transform((val) => (val === "" ? null : val))
  .nullable()
  .optional();

const leadPayloadSchema = z.object({
  domain: z.string().default("indulge_global"),
  first_name: z.string().trim().optional(),
  last_name: emptyStringToNull,
  full_name: emptyStringToNull,
  phone_number: z.coerce
    .string()
    .trim()
    .transform((val) => (val === "" ? null : val))
    .nullable()
    .optional(),
  email: z
    .string()
    .trim()
    .transform((val) => (val === "" ? null : val))
    .nullable()
    .optional(),
  city: emptyStringToNull,
  address: emptyStringToNull,
  secondary_phone: emptyStringToNull,
  campaign_id: z
    .union([z.string(), z.number(), z.null()])
    .transform((v) => (v == null || v === "" ? null : String(v)))
    .optional(),
  campaign_name: emptyStringToNull,
  ad_name: emptyStringToNull,
  platform: emptyStringToNull,
  utm_source: z
    .string()
    .trim()
    .transform((val) => (val === "" ? "organic" : val))
    .nullable()
    .optional()
    .default("organic"),
  utm_medium: z
    .string()
    .trim()
    .transform((val) => (val === "" ? "organic" : val))
    .nullable()
    .optional()
    .default("organic"),
  utm_campaign: z
    .string()
    .trim()
    .transform((val) => (val === "" ? null : val))
    .nullable()
    .optional(),
  message: emptyStringToNull,
  form_data: z.record(z.string(), z.any()).nullable().optional(),
});

type LeadPayload = z.infer<typeof leadPayloadSchema>;

const VALID_DOMAINS = [
  "indulge_global",
  "indulge_house",
  "indulge_shop",
  "indulge_legacy",
] as const;

async function pickNextAgentForDomain(domain: string): Promise<string | null> {
  const safeDomain = VALID_DOMAINS.includes(
    domain as (typeof VALID_DOMAINS)[number],
  )
    ? domain
    : "indulge_global";

  const { data, error } = await supabase.rpc("pick_next_agent_for_domain", {
    p_domain: safeDomain,
  });

  if (error) {
    console.error(
      "[leadIngestion] pick_next_agent_for_domain failed:",
      error.message,
    );
    return null;
  }

  if (!data) {
    console.warn(
      `[leadIngestion] CRITICAL: No agent found for domain "${safeDomain}". Lead will be unassigned.`,
    );
  }

  return data as string | null;
}

function splitFullName(fullName: string | null | undefined): {
  first_name: string;
  last_name: string | null;
} {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return { first_name: "Unknown Lead", last_name: null };
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { first_name: trimmed, last_name: null };
  return {
    first_name: trimmed.slice(0, spaceIdx),
    last_name: trimmed.slice(spaceIdx + 1).trim() || null,
  };
}

export type ProcessLeadResult = {
  success: true;
  lead_id: string;
  assigned_to: string | null;
  utm_campaign: string | null;
};

export type ProcessLeadError = {
  success: false;
  error: string;
  status: 400 | 500;
};

/**
 * Validates payload, assigns agent via round-robin, inserts lead, logs activity.
 * Adapters must pass a pre-formatted object (no raw_meta_fields / raw_google_fields).
 */
export async function processAndInsertLead(
  payload: Record<string, unknown>,
  sourceTag: "meta" | "google" | "website",
): Promise<ProcessLeadResult | ProcessLeadError> {
  const parsed = leadPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("[leadIngestion] Validation failed:", parsed.error.format());
    return { success: false, error: "Payload validation failed", status: 400 };
  }

  const data = parsed.data as LeadPayload;

  // Name resolution: first_name, full_name split, or fallback
  let first_name = data.first_name?.trim() ?? "";
  let last_name = data.last_name ?? null;

  if (!first_name && data.full_name?.trim()) {
    const split = splitFullName(data.full_name);
    first_name = split.first_name;
    last_name = split.last_name;
  }

  if (!first_name) {
    first_name =
      sourceTag === "meta"
        ? "Unknown Meta Lead"
        : sourceTag === "google"
          ? "Unknown Google Lead"
          : "Unknown Lead";
  }

  const assignedAgentId = await pickNextAgentForDomain(
    data.domain ?? "indulge_global",
  );
  const isOffDuty = isOffDutyInsertion();

  const formData =
    data.form_data && typeof data.form_data === "object"
      ? {
          ...data.form_data,
          ...(data.message?.trim() ? { message: data.message.trim() } : {}),
        }
      : data.message?.trim()
        ? { message: data.message.trim() }
        : null;

  const dbPayload = {
    first_name,
    last_name: last_name ?? null,
    phone_number: data.phone_number?.trim() || "",
    email: data.email ?? null,
    city: data.city ?? null,
    address: data.address ?? null,
    secondary_phone: data.secondary_phone ?? null,
    domain: data.domain,
    status: "new" as const,
    utm_source: data.utm_source ?? null,
    utm_medium: data.utm_medium ?? null,
    utm_campaign: data.utm_campaign ?? null,
    campaign_id: data.campaign_id ?? null,
    campaign_name: data.campaign_name ?? null,
    ad_name: data.ad_name ?? null,
    platform: data.platform ?? null,
    form_data: formData && Object.keys(formData).length > 0 ? formData : null,
    assigned_to: assignedAgentId,
    assigned_at: assignedAgentId ? new Date().toISOString() : null,
    is_off_duty: isOffDuty,
  };

  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert([dbPayload])
    .select("id")
    .single();

  if (insertError || !lead) {
    console.error("[leadIngestion] Insert failed:", insertError?.message);
    return {
      success: false,
      error: "Lead could not be saved. Retry queued.",
      status: 500,
    };
  }

  if (assignedAgentId) {
    const { error: activityErr } = await supabase
      .from("lead_activities")
      .insert({
        lead_id: lead.id,
        performed_by: assignedAgentId,
        type: "status_change",
        payload: {
          from: null,
          to: "new",
          note: `Lead ingested via ${sourceTag}. UTM campaign: ${data.utm_campaign ?? "none"}. Assigned via round-robin.`,
          timestamp: new Date().toISOString(),
        },
      });
    if (activityErr) {
      console.error(
        "[leadIngestion] Activity log failed (non-fatal):",
        activityErr.message,
      );
    }
  }

  console.info(
    `[leadIngestion] Lead ${lead.id} created. Source: ${sourceTag}. Agent: ${assignedAgentId ?? "unassigned"}`,
  );

  return {
    success: true,
    lead_id: lead.id,
    assigned_to: assignedAgentId,
    utm_campaign: data.utm_campaign ?? null,
  };
}

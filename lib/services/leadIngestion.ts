/**
 * INDULGE ATLAS — Lead Ingestion Core Engine
 *
 * Shared service for Meta, Google, and Website webhook adapters.
 * Validates, assigns agent, inserts lead, and logs activity.
 */

import { z } from "zod";
import { toZonedTime } from "date-fns-tz";
import { getHours, startOfDay } from "date-fns";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

const supabase = getServiceSupabaseClient();

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

/** Key agent emails for Waterfall Routing Engine */
const WATERFALL_AGENT_EMAILS = [
  "katya@indulge.global",
  "meghana@indulge.global",
  "amit@indulge.global",
  "samson@indulge.global",
  "kaniisha@indulge.global",
] as const;

type AgentIds = {
  katya: string | null;
  meghana: string | null;
  amit: string | null;
  samson: string | null;
  kaniisha: string | null;
};

let cachedAgentIds: AgentIds | null = null;

/**
 * Phase 2: Resolve agent emails to UUIDs from profiles.
 * Caches result for the process lifetime. Falls back to null for missing emails.
 */
async function resolveWaterfallAgentIds(): Promise<AgentIds> {
  if (cachedAgentIds) return cachedAgentIds;

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email")
    .in("email", [...WATERFALL_AGENT_EMAILS]);

  if (error) {
    console.error(
      "[leadIngestion] CRITICAL: Failed to resolve waterfall agent IDs:",
      error.message,
    );
    cachedAgentIds = {
      katya: null,
      meghana: null,
      amit: null,
      samson: null,
      kaniisha: null,
    };
    return cachedAgentIds;
  }

  const rows = (profiles ?? []) as Array<{ id: string; email: string }>;
  const byEmail = new Map(rows.map((p) => [p.email.toLowerCase(), p.id]));

  const get = (email: string) => byEmail.get(email.toLowerCase()) ?? null;

  cachedAgentIds = {
    katya: get("katya@indulge.global"),
    meghana: get("meghana@indulge.global"),
    amit: get("amit@indulge.global"),
    samson: get("samson@indulge.global"),
    kaniisha: get("kaniisha@indulge.global"),
  };

  const emailToKey: Record<(typeof WATERFALL_AGENT_EMAILS)[number], keyof AgentIds> = {
    "katya@indulge.global": "katya",
    "meghana@indulge.global": "meghana",
    "amit@indulge.global": "amit",
    "samson@indulge.global": "samson",
    "kaniisha@indulge.global": "kaniisha",
  };
  const missing = WATERFALL_AGENT_EMAILS.filter(
    (e) => !cachedAgentIds![emailToKey[e]],
  );
  if (missing.length > 0) {
    console.error(
      "[leadIngestion] CRITICAL: Waterfall agents not found in profiles:",
      missing.join(", "),
      "- Will fall back to unfiltered domain pool when required.",
    );
  }

  return cachedAgentIds;
}

/**
 * Get current hour in IST (Asia/Kolkata).
 */
function getCurrentHourIST(): number {
  const now = new Date();
  const istNow = toZonedTime(now, IST);
  return getHours(istNow);
}

/**
 * Get start of today in IST as ISO string for DB queries.
 */
function getStartOfTodayIST(): string {
  const now = new Date();
  const istNow = toZonedTime(now, IST);
  const startOfTodayIST = startOfDay(istNow);
  return startOfTodayIST.toISOString();
}

/**
 * Pick next agent via round-robin. When allowedUuids is provided, only those
 * agents are eligible. When null, uses full domain pool (backward compatible).
 */
async function pickNextAgentForDomain(
  domain: string,
  allowedUuids: string[] | null = null,
): Promise<string | null> {
  const safeDomain = VALID_DOMAINS.includes(
    domain as (typeof VALID_DOMAINS)[number],
  )
    ? domain
    : "indulge_global";

  const rpcParams: { p_domain: string; p_allowed_uuids?: string[] } = {
    p_domain: safeDomain,
  };
  if (allowedUuids != null && allowedUuids.length > 0) {
    rpcParams.p_allowed_uuids = allowedUuids;
  }

  const { data, error } = await supabase.rpc(
    "pick_next_agent_for_domain",
    rpcParams as never,
  );

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

/**
 * Phase 3 & 4: Waterfall Routing Engine.
 * Returns the assigned agent UUID or null. Applies rules in strict order.
 */
async function resolveAssignedAgent(lead: LeadPayload): Promise<string | null> {
  const ids = await resolveWaterfallAgentIds();

  // Rule 1: Domain Override — non-indulge_global -> Katya
  if (lead.domain !== "indulge_global") {
    if (ids.katya) {
      return ids.katya;
    }
    console.error(
      "[leadIngestion] CRITICAL: Katya not found. Domain override failed. Falling back to unfiltered pool.",
    );
    return pickNextAgentForDomain(lead.domain ?? "indulge_global", null);
  }

  // Rule 2: Campaign Override — TG_Global_Dubai- 18 March -> Kaniisha
  if (lead.utm_campaign === "TG_Global_Dubai- 18 March") {
    if (ids.kaniisha) {
      return ids.kaniisha;
    }
    console.error(
      "[leadIngestion] CRITICAL: Kaniisha not found. Campaign override failed. Falling back to unfiltered pool.",
    );
    return pickNextAgentForDomain(lead.domain ?? "indulge_global", null);
  }

  // Rule 3 & 4: Dynamic pool based on time and Samson daily cap
  const currentHourIST = getCurrentHourIST();

  if (currentHourIST >= 20) {
    // 8 PM IST or later: Meghana + Amit only
    const pool = [ids.meghana, ids.amit].filter(Boolean) as string[];
    if (pool.length === 0) {
      console.error(
        "[leadIngestion] CRITICAL: Meghana/Amit not found for evening pool. Falling back to unfiltered pool.",
      );
      return pickNextAgentForDomain(lead.domain ?? "indulge_global", null);
    }
    return pickNextAgentForDomain(lead.domain ?? "indulge_global", pool);
  }

  // Standard hours: check Samson's daily lead cap
  const startOfTodayIST = getStartOfTodayIST();
  let samsonDailyCount = 0;

  if (ids.samson) {
    const { count, error: countErr } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", ids.samson)
      .gte("created_at", startOfTodayIST);

    if (!countErr) {
      samsonDailyCount = count ?? 0;
    }
  }

  const samsonAtCap = samsonDailyCount >= 15;
  const pool = samsonAtCap
    ? [ids.meghana, ids.amit, ids.kaniisha].filter(Boolean) as string[]
    : [ids.samson, ids.meghana, ids.amit, ids.kaniisha].filter(Boolean) as string[];

  if (pool.length === 0) {
    console.error(
      "[leadIngestion] CRITICAL: No agents in dynamic pool. Falling back to unfiltered pool.",
    );
    return pickNextAgentForDomain(lead.domain ?? "indulge_global", null);
  }

  return pickNextAgentForDomain(lead.domain ?? "indulge_global", pool);
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
 * Validates payload, assigns agent via Waterfall Routing Engine, inserts lead, logs activity.
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

  const assignedAgentId = await resolveAssignedAgent(data);
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
    .insert([dbPayload] as never)
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

  const leadId = (lead as { id: string }).id;

  const { error: activityErr } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: null,
    action_type: "lead_created",
    details: {
      source: data.utm_campaign ?? sourceTag,
    },
  } as never);

  if (activityErr) {
    console.error(
      "[leadIngestion] Activity log failed (non-fatal):",
      activityErr.message,
    );
  }

  console.info(
    `[leadIngestion] Lead ${leadId} created. Source: ${sourceTag}. Agent: ${assignedAgentId ?? "unassigned"}`,
  );

  return {
    success: true,
    lead_id: leadId,
    assigned_to: assignedAgentId,
    utm_campaign: data.utm_campaign ?? null,
  };
}

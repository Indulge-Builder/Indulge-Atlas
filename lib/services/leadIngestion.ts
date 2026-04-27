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
import type { LeadRoutingRule } from "@/lib/types/database";
import { evaluateRulesAgainstLead } from "@/lib/services/evaluateRoutingRules";
import { getActiveAgentConfig } from "@/lib/services/agentRoutingConfig";
import { normalizeToE164 } from "@/lib/utils/phone";
import { sanitizeFormData, sanitizeText } from "@/lib/utils/sanitize";

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
  domain: z.string().default("indulge_concierge"),
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
  /** Acquisition / Pabbly passthrough (distinct from utm_source) */
  source: emptyStringToNull,
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
  notes: emptyStringToNull,
  personal_details: emptyStringToNull,
  company: emptyStringToNull,
  form_data: z.record(z.string(), z.any()).nullable().optional(),
}).passthrough();

type LeadPayload = z.infer<typeof leadPayloadSchema>;

const PAYLOAD_TEXT_KEYS = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "city",
  "address",
  "secondary_phone",
  "campaign_name",
  "ad_name",
  "platform",
  "source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "message",
  "notes",
  "personal_details",
  "company",
] as const;

function sanitizePayloadStringFields(payload: Record<string, unknown>): void {
  for (const key of PAYLOAD_TEXT_KEYS) {
    const v = payload[key];
    if (typeof v === "string") payload[key] = sanitizeText(v);
  }
}

const VALID_DOMAINS = [
  "indulge_concierge",
  "indulge_house",
  "indulge_shop",
  "indulge_legacy",
] as const;

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
    : "indulge_concierge";

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
 * Active rules from DB, ordered for evaluation. Fail-open: empty array on error.
 */
async function fetchActiveRoutingRules(): Promise<LeadRoutingRule[]> {
  const { data, error } = await supabase
    .from("lead_routing_rules")
    .select(
      "id, priority, rule_name, is_active, condition_field, condition_operator, condition_value, action_type, action_target_uuid, action_target_domain",
    )
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) {
    console.error(
      "[leadIngestion] fetchActiveRoutingRules failed (non-fatal):",
      error.message,
    );
    return [];
  }

  return (data ?? []) as LeadRoutingRule[];
}

/**
 * Resolves assigned agent: dynamic DB rules first, then DB-driven shift + cap pooling.
 *
 * Step 1 — Dynamic Routing Engine: evaluate admin-configured routing rules.
 * Step 2 — DB Agent Config waterfall: fetch agent_routing_config, filter by shift window
 *   and daily cap, pass eligible UUIDs to the Postgres round-robin function.
 */
async function resolveAssignedAgent(
  lead: LeadPayload,
  /** Original adapter payload — merged under parsed `lead` so extra keys (e.g. `source`) still match rules. */
  rawPayload?: Record<string, unknown>,
): Promise<string | null> {
  let workingDomain = lead.domain ?? "indulge_concierge";

  const evaluationPayload: Record<string, unknown> =
    rawPayload != null ? { ...rawPayload, ...lead } : { ...lead };

  // Step 1: Dynamic Routing Engine (unchanged)
  try {
    const routingRules = await fetchActiveRoutingRules();
    const dynamicHit = evaluateRulesAgainstLead(
      routingRules,
      evaluationPayload,
    );

    if (dynamicHit?.action_type === "assign_to_agent") {
      return dynamicHit.action_target_uuid;
    }

    if (dynamicHit?.action_type === "route_to_domain_pool") {
      const d = dynamicHit.action_target_domain;
      if (VALID_DOMAINS.includes(d as (typeof VALID_DOMAINS)[number])) {
        workingDomain = d;
      } else {
        console.warn(
          `[leadIngestion] Dynamic rule requested unknown domain "${d}"; ignoring override.`,
        );
      }
    }
  } catch (e) {
    console.error(
      "[leadIngestion] Dynamic routing engine error (non-fatal):",
      e,
    );
  }

  // Step 2: Build eligible pool from DB agent routing config
  const agentConfigs = await getActiveAgentConfig(workingDomain);

  if (agentConfigs.length === 0) {
    console.warn(
      `[leadIngestion] No agent routing config for domain "${workingDomain}". Falling back to unfiltered domain pool.`,
    );
    return pickNextAgentForDomain(workingDomain, null);
  }

  const currentHour = getCurrentHourIST();
  const startOfTodayIST = getStartOfTodayIST();

  // Filter to agents whose shift window covers the current IST hour.
  // NULL shift_start / shift_end means always available (eligible day + night).
  const shiftAvailable = agentConfigs.filter((agent) => {
    if (!agent.shift_start || !agent.shift_end) return true;
    const startHour = parseInt(agent.shift_start.slice(0, 2), 10);
    const endHour = parseInt(agent.shift_end.slice(0, 2), 10);
    return currentHour >= startHour && currentHour <= endHour;
  });

  if (shiftAvailable.length === 0) {
    console.warn(
      `[leadIngestion] No shift-available agents for domain "${workingDomain}" at IST hour ${currentHour}. Falling back to unfiltered pool.`,
    );
    return pickNextAgentForDomain(workingDomain, null);
  }

  // Apply daily cap: exclude agents who have hit their cap today (IST calendar day).
  const eligibleUuids: string[] = [];

  for (const agent of shiftAvailable) {
    if (agent.daily_cap === null) {
      // No cap configured — always eligible.
      eligibleUuids.push(agent.user_id);
      continue;
    }

    const { count, error: countErr } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", agent.user_id)
      .gte("created_at", startOfTodayIST);

    if (countErr) {
      // Fail-open: include the agent if the count query errors; log for alerting.
      console.error(
        `[leadIngestion] Daily cap count failed for ${agent.email} (including in pool):`,
        countErr.message,
      );
      eligibleUuids.push(agent.user_id);
      continue;
    }

    const todayCount = count ?? 0;
    if (todayCount < agent.daily_cap) {
      eligibleUuids.push(agent.user_id);
    } else {
      console.info(
        `[leadIngestion] ${agent.email} at daily cap (${todayCount}/${agent.daily_cap}); excluded from pool.`,
      );
    }
  }

  if (eligibleUuids.length === 0) {
    console.warn(
      `[leadIngestion] All configured agents at daily cap for domain "${workingDomain}". Falling back to unfiltered pool.`,
    );
    return pickNextAgentForDomain(workingDomain, null);
  }

  return pickNextAgentForDomain(workingDomain, eligibleUuids);
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
 * Validates payload, assigns agent (dynamic rules → DB-configured shift/cap pools), inserts lead.
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

  const data = parsed.data as LeadPayload & Record<string, unknown>;

  sanitizePayloadStringFields(data);

  // Name resolution: first_name, full_name split, or fallback (full_name already sanitized)
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

  first_name = sanitizeText(first_name);
  last_name = last_name != null ? sanitizeText(last_name) : null;

  data.first_name = first_name;
  data.last_name = last_name;

  const phoneRaw =
    typeof data.phone_number === "string" ? data.phone_number.trim() : "";
  const phone_number = normalizeToE164(phoneRaw);

  const assignedAgentId = await resolveAssignedAgent(data, payload);
  const isOffDuty = isOffDutyInsertion();

  const formDataRaw =
    data.form_data && typeof data.form_data === "object"
      ? {
          ...(data.form_data as Record<string, unknown>),
          ...(typeof data.message === "string" && data.message.trim()
            ? { message: data.message.trim() }
            : {}),
        }
      : typeof data.message === "string" && data.message.trim()
        ? { message: data.message.trim() }
        : null;

  const formData =
    formDataRaw && Object.keys(formDataRaw).length > 0
      ? sanitizeFormData(formDataRaw)
      : null;

  let secondary_phone: string | null = null;
  if (typeof data.secondary_phone === "string" && data.secondary_phone.trim()) {
    const sec = normalizeToE164(data.secondary_phone.trim());
    secondary_phone = sec || null;
  }

  const dbPayload = {
    first_name,
    last_name: last_name ?? null,
    phone_number: phone_number || "",
    email: data.email ?? null,
    city: data.city ?? null,
    address: data.address ?? null,
    secondary_phone,
    domain: data.domain,
    status: "new" as const,
    utm_source: data.utm_source ?? null,
    utm_medium: data.utm_medium ?? null,
    utm_campaign: data.utm_campaign ?? null,
    campaign_id: data.campaign_id ?? null,
    campaign_name: data.campaign_name ?? null,
    ad_name: data.ad_name ?? null,
    platform: data.platform ?? null,
    source: data.source ?? null,
    form_data: formData && Object.keys(formData).length > 0 ? formData : null,
    notes: typeof data.notes === "string" ? data.notes : null,
    personal_details:
      typeof data.personal_details === "string" ? data.personal_details : null,
    company: typeof data.company === "string" ? data.company : null,
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

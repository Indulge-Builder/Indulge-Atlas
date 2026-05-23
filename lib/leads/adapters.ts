/**
 * Lead payload normalizers — one pure function per source.
 *
 * Each function takes the raw JSON body sent by Pabbly and returns a flat
 * object ready for processAndInsertLead(). No DB calls, no side effects.
 *
 * USAGE IN PABBLY
 * ---------------
 * Recommended: use Pabbly's built-in field mapper to send a clean flat JSON
 * so these functions receive already-named keys. The fallback parsing below
 * handles the legacy "raw_*_fields" array format just in case.
 *
 * Expected flat payload from Pabbly (all optional):
 * {
 *   first_name, last_name, full_name, phone_number, email, city,
 *   campaign_id, campaign_name, ad_name, platform, source, domain,
 *   utm_source, utm_medium, utm_campaign, message
 * }
 */

export type NormalizedLeadPayload = Record<string, unknown>;

// ── Meta ──────────────────────────────────────────────────────────────────────

export function normalizeMeta(body: Record<string, unknown>): NormalizedLeadPayload {
  let first_name = str(body.first_name);
  let last_name = str(body.last_name) ?? null;
  let full_name = str(body.full_name);
  let phone_number = str(body.phone_number) ?? str(body.phone);
  let email = str(body.email);
  const extra: Record<string, unknown> = {};

  // Legacy: Pabbly used to forward the raw Meta fields array unchanged.
  // If Pabbly is now set to map fields before sending, raw_meta_fields won't appear.
  const rawMeta = body.raw_meta_fields;
  if (rawMeta != null) {
    try {
      const arr: Array<{ name: string; values: string[] }> =
        typeof rawMeta === "string" ? JSON.parse(rawMeta) : (rawMeta as never);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (!item?.name) continue;
          const key = String(item.name).toLowerCase();
          const val = Array.isArray(item.values) ? String(item.values[0] ?? "").trim() : "";
          if (!val) continue;
          if (key.includes("full_name") || key === "name") full_name = full_name || val;
          else if (key.includes("first_name")) first_name = first_name || val;
          else if (key.includes("last_name")) last_name = last_name || val;
          else if (key.includes("phone")) phone_number = phone_number || val;
          else if (key.includes("email")) email = email || val;
          else extra[item.name] = Array.isArray(item.values) && item.values.length > 1 ? item.values.join(", ") : val;
        }
      }
    } catch {
      // malformed — ignore, proceed with top-level keys
    }
  }

  const platform = str(body.utm_medium) || str(body.platform) || undefined;

  return {
    first_name: first_name || undefined,
    last_name: last_name || undefined,
    full_name: full_name || undefined,
    phone_number: phone_number || undefined,
    email: email || undefined,
    domain: str(body.domain) || undefined,
    source: str(body.source) || undefined,
    campaign_id: str(body.campaign_id) || undefined,
    campaign_name: str(body.campaign_name) || undefined,
    ad_name: str(body.ad_name) || undefined,
    platform,
    utm_source: str(body.utm_source) || "meta",
    utm_medium: platform,
    utm_campaign: str(body.campaign_name) || str(body.utm_campaign) || undefined,
    message: str(body.message) || undefined,
    form_data: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

// ── Google ────────────────────────────────────────────────────────────────────

export function normalizeGoogle(body: Record<string, unknown>): NormalizedLeadPayload {
  let full_name = str(body.full_name) || str(body.first_name);
  let phone_number = str(body.phone_number) ?? str(body.phone) ?? str(body.phoneNumber);
  let email = str(body.email);
  const extra: Record<string, unknown> = {};

  // Legacy: raw_google_fields array from Pabbly passthrough
  const rawGoogle = body.raw_google_fields;
  if (rawGoogle != null) {
    try {
      const arr: Array<Record<string, unknown>> =
        typeof rawGoogle === "string" ? JSON.parse(rawGoogle) : (rawGoogle as never);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (!item || typeof item !== "object") continue;
          const colId = str(item.column_id ?? item.column_name ?? item.question ?? item.name ?? item.field_name);
          const rawVal = item.string_value ?? item.value ?? item.answer ?? (Array.isArray(item.values) ? item.values[0] : null);
          const val = rawVal != null ? String(rawVal).trim() : "";
          if (!colId) continue;
          const colUpper = colId.toUpperCase();
          if (colUpper === "FULL_NAME") full_name = full_name || val;
          else if (colUpper === "PHONE_NUMBER" || colId === "phoneNumber" || colId === "phone") phone_number = phone_number || val;
          else if (colUpper === "EMAIL") email = email || val;
          else extra[colId] = val;
        }
      }
    } catch {
      // malformed — ignore
    }
  }

  const platform = str(body.utm_medium) || str(body.platform) || undefined;

  return {
    full_name: full_name || undefined,
    phone_number: phone_number || undefined,
    email: email || undefined,
    domain: str(body.domain) || undefined,
    source: str(body.source) || undefined,
    campaign_id: str(body.campaign_id) || undefined,
    campaign_name: str(body.campaign_name) || undefined,
    ad_name: str(body.ad_name) || undefined,
    platform: "google",
    utm_source: str(body.utm_source) || "google",
    utm_medium: platform,
    utm_campaign: str(body.campaign_name) || str(body.utm_campaign) || undefined,
    form_data: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

// ── Website ───────────────────────────────────────────────────────────────────

const WEBSITE_STANDARD_KEYS = new Set([
  "first_name", "firstName", "last_name", "lastName",
  "full_name", "fullName", "name",
  "phone_number", "phone", "phoneNumber",
  "email", "mail",
  "utm_source", "utm_medium", "utm_campaign",
  "campaign_id", "campaign_name", "ad_name", "platform",
  "domain", "source", "message",
]);

export function normalizeWebsite(body: Record<string, unknown>): NormalizedLeadPayload {
  const first_name = str(body.first_name ?? body.firstName);
  const last_name = str(body.last_name ?? body.lastName);
  const full_name = str(body.full_name ?? body.fullName ?? body.name);
  const phone_number = str(body.phone_number ?? body.phone ?? body.phoneNumber);
  const email = str(body.email ?? body.mail);

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!WEBSITE_STANDARD_KEYS.has(key) && value != null && value !== "") {
      extra[key] = value;
    }
  }

  const platform = str(body.utm_medium) || str(body.platform) || "website";

  return {
    first_name: first_name || undefined,
    last_name: last_name || undefined,
    full_name: full_name || undefined,
    phone_number: phone_number || undefined,
    email: email || undefined,
    domain: str(body.domain) || undefined,
    source: str(body.source) || undefined,
    campaign_id: str(body.campaign_id) || undefined,
    campaign_name: str(body.campaign_name) || undefined,
    ad_name: str(body.ad_name) || undefined,
    platform: "website",
    utm_source: str(body.utm_source) || "website",
    utm_medium: platform,
    utm_campaign: str(body.campaign_name) || str(body.utm_campaign) || undefined,
    message: str(body.message) || undefined,
    form_data: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

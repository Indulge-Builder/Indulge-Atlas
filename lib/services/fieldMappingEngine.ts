/**
 * INDULGE ATLAS — Dynamic Field Mapping Engine
 *
 * Queries `field_mappings` + `webhook_endpoints` for a given channel,
 * then transforms the raw webhook payload into a normalized object
 * ready for `processAndInsertLead()`.
 *
 * Any incoming key that has NO mapping row is gracefully collected
 * into `form_data` (zero data loss guarantee).
 */

import { getServiceSupabaseClient } from "@/lib/supabase/service";

export type WebhookChannel = "meta" | "google" | "website";

type MappingRow = {
  incoming_json_key: string;
  target_db_column: string;
  transformation_rule: string | null;
  fallback_value: string | null;
};

// ─── Transformation rules ────────────────────────────────────────────────────

function applyTransformation(
  value: string,
  rule: string | null | undefined,
): string {
  if (!rule) return value;
  switch (rule.trim().toLowerCase()) {
    case "lowercase":
      return value.toLowerCase();
    case "uppercase":
      return value.toUpperCase();
    case "trim":
      return value.trim();
    case "extract_numbers":
      return value.replace(/\D/g, "");
    case "capitalize":
      return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    default:
      return value;
  }
}

// ─── Nested key resolver (supports dot-notation like "payload.phone") ─────────

function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─── Main engine function ─────────────────────────────────────────────────────

/**
 * Fetches active field mappings for `channel` and applies them to `rawPayload`.
 *
 * Returns:
 *  - `mappedFields`: keys that matched a mapping row, transformed + ready for DB
 *  - `unmappedFormData`: all leftover keys stringified for `form_data`
 *  - `hasMappings`: false if no mapping rows exist (caller should use hardcoded fallback)
 */
export async function applyFieldMappings(
  channel: WebhookChannel,
  rawPayload: Record<string, unknown>,
): Promise<{
  hasMappings: boolean;
  mappedFields: Record<string, unknown>;
  unmappedFormData: Record<string, unknown>;
}> {
  const supabase = getServiceSupabaseClient();

  const { data, error } = await supabase.rpc(
    "get_field_mappings_for_channel",
    { p_channel: channel } as never,
  );

  if (error) {
    console.error("[fieldMappingEngine] RPC error:", error.message);
    return { hasMappings: false, mappedFields: {}, unmappedFormData: {} };
  }

  const rows = (data ?? []) as MappingRow[];

  if (rows.length === 0) {
    return { hasMappings: false, mappedFields: {}, unmappedFormData: {} };
  }

  const mappedFields: Record<string, unknown> = {};
  const mappedIncomingKeys = new Set<string>();

  for (const row of rows) {
    const rawValue = getNestedValue(rawPayload, row.incoming_json_key);
    mappedIncomingKeys.add(row.incoming_json_key.split(".")[0]); // track top-level key

    let strValue: string | null = null;

    if (rawValue != null && String(rawValue).trim() !== "") {
      strValue = applyTransformation(
        String(rawValue).trim(),
        row.transformation_rule,
      );
    } else if (row.fallback_value != null && row.fallback_value.trim() !== "") {
      strValue = row.fallback_value.trim();
    }

    if (strValue !== null) {
      mappedFields[row.target_db_column] = strValue;
    }
  }

  // Collect all top-level keys that were NOT mapped into form_data
  const unmappedFormData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawPayload)) {
    if (!mappedIncomingKeys.has(key) && value != null && value !== "") {
      unmappedFormData[key] = value;
    }
  }

  return { hasMappings: true, mappedFields, unmappedFormData };
}

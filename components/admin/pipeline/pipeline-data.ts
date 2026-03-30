/**
 * Documents the live ingestion path: webhook adapters → processAndInsertLead → leads table.
 * Keep in sync with app/api/webhooks/leads (meta, google, website) route handlers and
 * lib/services/leadIngestion.ts.
 */

export type PipelineColumnType =
  | "string"
  | "text"
  | "jsonb"
  | "uuid"
  | "boolean"
  | "timestamptz";

/** How the middle transformation step should be styled in the UI */
export type PipelineTransformKind = "direct" | "alias" | "parse" | "merge" | "derive";

export interface PipelineMappingRow {
  /** Incoming JSON key or human label (e.g. raw_meta_fields) */
  sourceKey: string;
  /** Short description of what the adapter / Zod does */
  transform: string;
  /** Supabase leads column */
  targetColumn: string;
  type: PipelineColumnType;
  kind: PipelineTransformKind;
}

export type PipelineChannel = "meta" | "google" | "website";

export const PIPELINE_MAPPINGS: Record<PipelineChannel, PipelineMappingRow[]> = {
  meta: [
    {
      sourceKey: "raw_meta_fields[].name / values",
      transform: "Parsed (full_name, phone, email…)",
      targetColumn: "first_name, last_name, phone_number, email",
      type: "string",
      kind: "parse",
    },
    {
      sourceKey: "full_name",
      transform: "Direct + Meta array merge",
      targetColumn: "first_name / last_name (via ingestion split)",
      type: "string",
      kind: "derive",
    },
    {
      sourceKey: "phone",
      transform: "Aliased if phone_number empty",
      targetColumn: "phone_number",
      type: "string",
      kind: "alias",
    },
    {
      sourceKey: "phone_number",
      transform: "Direct",
      targetColumn: "phone_number",
      type: "string",
      kind: "direct",
    },
    {
      sourceKey: "email",
      transform: "Direct",
      targetColumn: "email",
      type: "string",
      kind: "direct",
    },
    {
      sourceKey: "domain",
      transform: "Extracted (excluded from form_data)",
      targetColumn: "domain",
      type: "string",
      kind: "direct",
    },
    {
      sourceKey: "source",
      transform: "Extracted (excluded from form_data)",
      targetColumn: "source",
      type: "text",
      kind: "direct",
    },
    {
      sourceKey: "campaign_name, ad_name",
      transform: "Direct",
      targetColumn: "campaign_name, ad_name",
      type: "string",
      kind: "direct",
    },
    {
      sourceKey: "campaign_id",
      transform: "Coerced to string in Zod",
      targetColumn: "campaign_id",
      type: "string",
      kind: "derive",
    },
    {
      sourceKey: "utm_source / utm_medium / utm_campaign",
      transform: "Defaults + campaign_name fallback",
      targetColumn: "utm_source, utm_medium, utm_campaign",
      type: "string",
      kind: "derive",
    },
    {
      sourceKey: "platform",
      transform: "Canonical sub-platform (medium)",
      targetColumn: "platform",
      type: "string",
      kind: "derive",
    },
    {
      sourceKey: "message",
      transform: "Merged into JSONB in ingestion",
      targetColumn: "form_data",
      type: "jsonb",
      kind: "merge",
    },
    {
      sourceKey: "Unmapped top-level keys",
      transform: "JSONB merge (excl. reserved keys)",
      targetColumn: "form_data",
      type: "jsonb",
      kind: "merge",
    },
    {
      sourceKey: "—",
      transform: "Assigned agent RPC + rules engine",
      targetColumn: "assigned_to, assigned_at",
      type: "uuid",
      kind: "derive",
    },
    {
      sourceKey: "—",
      transform: "IST business-hours window",
      targetColumn: "is_off_duty",
      type: "boolean",
      kind: "derive",
    },
  ],

  google: [
    {
      sourceKey: "raw_google_fields (FULL_NAME, PHONE_NUMBER, EMAIL)",
      transform: "Column-id parse",
      targetColumn: "full_name → name split; phone_number; email",
      type: "string",
      kind: "parse",
    },
    {
      sourceKey: "raw_google_fields (phone, phoneNumber)",
      transform: "Alternate column ids",
      targetColumn: "phone_number",
      type: "string",
      kind: "alias",
    },
    {
      sourceKey: "phone / phoneNumber (top-level)",
      transform: "Aliased if phone_number empty",
      targetColumn: "phone_number",
      type: "string",
      kind: "alias",
    },
    {
      sourceKey: "phone_number",
      transform: "Direct",
      targetColumn: "phone_number",
      type: "string",
      kind: "direct",
    },
    {
      sourceKey: "domain",
      transform: "Extracted (excluded from form_data)",
      targetColumn: "domain",
      type: "string",
      kind: "direct",
    },
    {
      sourceKey: "source",
      transform: "Extracted (excluded from form_data)",
      targetColumn: "source",
      type: "text",
      kind: "direct",
    },
    {
      sourceKey: "campaign_name, ad_name, campaign_id",
      transform: "Direct",
      targetColumn: "campaign_name, ad_name, campaign_id",
      type: "string",
      kind: "direct",
    },
    {
      sourceKey: "utm_*",
      transform: "Defaults; utm_campaign from campaign_name",
      targetColumn: "utm_source, utm_medium, utm_campaign",
      type: "string",
      kind: "derive",
    },
    {
      sourceKey: "—",
      transform: "Forced to “google”",
      targetColumn: "platform",
      type: "string",
      kind: "derive",
    },
    {
      sourceKey: "Custom Google questions",
      transform: "JSONB per column id",
      targetColumn: "form_data",
      type: "jsonb",
      kind: "merge",
    },
    {
      sourceKey: "Unmapped top-level keys",
      transform: "JSONB merge",
      targetColumn: "form_data",
      type: "jsonb",
      kind: "merge",
    },
    {
      sourceKey: "—",
      transform: "Routing + IST pools",
      targetColumn: "assigned_to, assigned_at, is_off_duty",
      type: "uuid",
      kind: "derive",
    },
  ],

  website: [
    {
      sourceKey: "first_name / firstName",
      transform: "Aliased",
      targetColumn: "first_name",
      type: "string",
      kind: "alias",
    },
    {
      sourceKey: "last_name / lastName",
      transform: "Aliased",
      targetColumn: "last_name",
      type: "string",
      kind: "alias",
    },
    {
      sourceKey: "full_name / fullName / name",
      transform: "Aliased → split in ingestion",
      targetColumn: "first_name, last_name",
      type: "string",
      kind: "alias",
    },
    {
      sourceKey: "phone_number / phone / phoneNumber",
      transform: "Aliased",
      targetColumn: "phone_number",
      type: "string",
      kind: "alias",
    },
    {
      sourceKey: "email / mail",
      transform: "Aliased",
      targetColumn: "email",
      type: "string",
      kind: "alias",
    },
    {
      sourceKey: "utm_*, campaign_*, ad_name, platform",
      transform: "Direct + website defaults",
      targetColumn: "utm_*, campaign_name, ad_name, platform",
      type: "string",
      kind: "derive",
    },
    {
      sourceKey: "message",
      transform: "Merged in ingestion",
      targetColumn: "form_data",
      type: "jsonb",
      kind: "merge",
    },
    {
      sourceKey: "Non-standard keys (incl. domain)",
      transform: "JSONB merge",
      targetColumn: "form_data",
      type: "jsonb",
      kind: "merge",
    },
    {
      sourceKey: "—",
      transform: "Zod default when omitted",
      targetColumn: "domain (indulge_global)",
      type: "string",
      kind: "derive",
    },
    {
      sourceKey: "—",
      transform: "Routing + IST pools",
      targetColumn: "assigned_to, assigned_at, is_off_duty",
      type: "uuid",
      kind: "derive",
    },
  ],
};

export const PIPELINE_TAB_LABELS: Record<
  PipelineChannel,
  { title: string; description: string }
> = {
  meta: {
    title: "Meta Lead Ads",
    description: "Pabbly → /api/webhooks/leads/meta — raw_meta_fields array + top-level passthrough.",
  },
  google: {
    title: "Google Lead Forms",
    description: "Pabbly → /api/webhooks/leads/google — raw_google_fields + column ids.",
  },
  website: {
    title: "Website Integrations",
    description: "Pabbly → /api/webhooks/leads/website — flat JSON with common key aliases.",
  },
};

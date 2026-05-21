# Atlas Lead Data Audit Report

> Generated from codebase scan (migrations `001`–`091`, `lib/types/database.ts`, ingestion webhooks, manual create flow).  
> **No live database queries were run.** Verify column presence in Supabase before bulk import.

---

## 2A. `leads` table — full column inventory

| Column | PG type | Nullable | Default | Origin | Lead types |
|--------|---------|----------|---------|--------|------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | System | All |
| `first_name` | `text` | NO | — | Webhook / manual UI / ingestion split | All |
| `last_name` | `text` | YES | — | Webhook / manual UI | All |
| `phone_number` | `text` | NO | — | Webhook / manual UI (E.164 via `normalizeToE164`) | All |
| `secondary_phone` | `text` | YES | — | Webhook / dossier edits | All |
| `email` | `text` | YES | — | Webhook / manual UI | All |
| `city` | `text` | YES | — | Webhook / manual UI | All |
| `address` | `text` | YES | — | Webhook / dossier (migration 013) | All |
| `campaign_id` | `text` | YES | — | Webhook; manual maps `campaign_name` → `campaign_id` | Ads + manual |
| `campaign_name` | `text` | YES | — | Meta/Google webhook (migration 037) | Meta, Google |
| `ad_name` | `text` | YES | — | Meta/Google webhook (037) | Meta, Google |
| `platform` | `text` | YES | — | Webhook canonical sub-platform (037) | Meta, Google, Website |
| `form_data` | `jsonb` | YES | — | Webhook unmapped keys + `message` merge (JSONB vault) | Meta, Google, Website, WhatsApp |
| `utm_source` | `text` | YES | — | Webhook defaults (`meta`/`google`/`website`/`whatsapp`); manual `SOURCE_TO_UTM` | All |
| `utm_medium` | `text` | YES | — | Webhook platform/sub-platform; manual mapping | All |
| `utm_campaign` | `text` | YES | — | Webhook `campaign_name` fallback | Ads + manual |
| `deal_value` | `numeric(14,2)` | YES | — | Won-deal modal / dossier | Pipeline (won) |
| `deal_duration` | `text` | YES | — | Won-deal modal (017) | Pipeline (won) |
| `domain` | `indulge_domain` | NO | `indulge_concierge` | Webhook optional; manual `DOMAIN_MAP`; Zod default `indulge_concierge` | All (tenant key) |
| `status` | `lead_status` | NO | `new` | Webhook always `new`; manual selectable subset | All |
| `assigned_to` | `uuid` → `profiles` | YES | — | Routing engine / manual assignment | All |
| `assigned_at` | `timestamptz` | YES | — | Set on assign (trigger + ingestion) | All |
| `notes` | `text` | YES | — | Manual `initial_notes`; dossier | Manual + ops |
| `lost_reason_tag` | `text` | YES | — | Legacy lost modal tags (015) | Lost |
| `lost_reason_notes` | `text` | YES | — | Legacy lost modal (015) | Lost |
| `lost_reason` | `text` | YES | — | Lost modal dropdown (029) | Lost |
| `trash_reason` | `text` | YES | — | Trash modal (029) | Trash |
| `nurture_reason` | `text` | YES | — | Nurture modal (029) | Nurturing |
| `attempt_count` | `integer` | NO | `0` | Status workflow increments | Attempted+ |
| `private_scratchpad` | `text` | YES | — | Agent-only dossier (015) | Ops |
| `personal_details` | `text` | YES | — | Dossier persona (015); webhook optional | Ops |
| `company` | `text` | YES | — | Executive dossier (016) | Ops |
| `tags` | `text[]` | NO | `'{}'` | Event tagging (032), e.g. `griffin_event` | Ops |
| `is_off_duty` | `boolean` | NO | `false` | Ingestion IST window (028) | Webhook |
| `agent_alert_sent` | `boolean` | NO | `false` | SLA monitor (030) | System |
| `manager_alert_sent` | `boolean` | NO | `false` | SLA escalation (030) | System |
| `follow_up_drafts` | `jsonb` | NO | `'{}'` | Dossier sidebar keys `"1"`,`"2"`,`"3"` (045) | Ops |
| `created_at` | `timestamptz` | NO | `now()` | System | All |
| `updated_at` | `timestamptz` | NO | `now()` | Trigger `update_modified_column` | All |

### Enum: `lead_status`

`new` | `attempted` | `connected` | `in_discussion` | `won` | `nurturing` | `lost` | `trash`

(`connected` added in migration 029.)

### Enum: `indulge_domain` (current)

`indulge_concierge` | `indulge_shop` | `indulge_house` | `indulge_legacy` | `indulge_global`

- Migration **056** renamed legacy `indulge_global` rows → `indulge_concierge` and rebuilt enum **without** global.
- Migration **066** re-added `indulge_global` for cross-BU profiles (Finance/Tech/Marketing). Lead assignment still normalizes `indulge_global` → `indulge_concierge` in `pick_next_agent_for_domain()`.
- `leadIngestion.ts` `VALID_DOMAINS` lists only concierge/shop/house/legacy (not `indulge_global`).

### Dropped columns (do not import)

| Column | Dropped in |
|--------|------------|
| `channel` | 025 |
| `source` (acquisition text) | 025 — **TypeScript `Lead.source` and webhook inserts still reference it; likely schema drift — verify live DB** |
| `message` | 027 (merged into `form_data` at ingestion) |
| `hobbies` | 027 (use `personal_details`) |

### Related tables (not in `leads` CSV)

| Table | Purpose |
|-------|---------|
| `lead_activities` | Immutable timeline (`actor_id`, `action_type`, `details` + legacy `performed_by`, `type`, `payload`) |
| `lead_collaborators` | Cross-domain dossier grants (080) |
| `whatsapp_messages` | WA Cloud API thread per lead (055) |
| `webhook_logs` | Raw webhook payloads for mapping debug (051) |

**No `UNIQUE (phone_number, domain)`** constraint exists in migrations. Upsert by phone+domain requires adding that constraint or matching by query first.

---

## 2B. `form_data` JSONB — key inventory

`DynamicFormResponses.tsx` renders **any** keys dynamically (no fixed schema). `sanitizeFormData()` caps depth 2 and 10KB UTF-8.

### Confirmed keys (code paths)

| Key | Source | Notes |
|-----|--------|-------|
| `message` | Meta / Website / WhatsApp ingestion | Top-level `message` merged into `form_data` by `processAndInsertLead` |
| `whatsapp_wa_id` | WhatsApp webhook | New-lead path |
| `whatsapp_message_id` | WhatsApp webhook | New-lead path |
| Meta custom question names | `raw_meta_fields[]` | Field `name` as key (e.g. `what_is_your_budget`) — **ad-specific, unconfirmed** |
| Google column ids | `raw_google_fields[]` | Keys = `column_id` / `column_name` (e.g. `FULL_NAME` excluded; custom cols stay in JSONB) — **form-specific, unconfirmed** |
| Website passthrough | Non-standard top-level keys | Any key not in adapter `standardKeys` set |
| Unmapped top-level (dynamic engine) | `field_mappings` leftovers | Per admin mapping UI |
| `utm_*`, `campaign_name`, `ad_name`, `platform` | Sometimes bleed in | UI filters these in `MarketingIntakeCard` |

### Reserved top-level keys (excluded from `form_data` merge)

**Meta:** `full_name`, `first_name`, `last_name`, `phone_number`, `phone`, `email`, `domain`, `source`, `raw_meta_fields`, plus attribution keys.

**Google:** `full_name`, `phone_number`, `phone`, `phoneNumber`, `email`, `domain`, `source`, `raw_google_fields`, `campaign_*`, `utm_*`, `ad_name`, `platform`.

**Website:** `first_name`, `firstName`, `last_name`, `lastName`, `full_name`, `fullName`, `name`, `phone_*`, `email`, `mail`, `utm_*`, `campaign_*`, `ad_name`, `platform`.

### Per-source summary

| Source | Typical `form_data` |
|--------|---------------------|
| **Meta** | Custom Lead Ad questions + `message` + Pabbly passthrough |
| **Google** | Custom form questions keyed by column id/name |
| **Website** | Typeform/Webflow extra fields + `message` |
| **Manual** | Usually empty (no `form_data` in `createLead`) |
| **WhatsApp** | `whatsapp_wa_id`, `whatsapp_message_id`, optional `message` |

**Unconfirmed keys:** Inspect `webhook_logs.raw_payload` for your 2-week gap period.

---

## 2C. Lead types

| Lead Type | Domain value | Source / attribution | Primary entry point | Unique fields |
|-----------|-------------|----------------------|---------------------|---------------|
| **Concierge CRM (default)** | `indulge_concierge` | `utm_source` varies | Manual `createLead`, most webhooks default | Standard pipeline columns |
| **Indulge Shop** | `indulge_shop` | Manual / routing rules | Manual form domain picker; routing rules | Same table; shop agent pool |
| **Indulge House** | `indulge_house` | Manual / routing | Manual form | Same |
| **Indulge Legacy** | `indulge_legacy` | Manual / routing | Manual form | Same |
| **Cross-BU (Global)** | `indulge_global` | Rare on leads; profiles use global | Migration 066 concept; manual label "Indulge Global" maps to **`indulge_concierge`** in `createLead` | Assignment pool still concierge |
| **Meta Lead Ads** | Usually `indulge_concierge` | `utm_source=meta`, `platform`≈medium | `POST /api/webhooks/leads/meta` | `campaign_name`, `ad_name`, `raw_meta_fields` → `form_data` |
| **Google Lead Forms** | Usually `indulge_concierge` | `utm_source=google`, `platform=google` | `POST /api/webhooks/leads/google` | `raw_google_fields` → `form_data` |
| **Website / Typeform** | Default `indulge_concierge` (Zod) | `utm_source=website` | `POST /api/webhooks/leads/website` | Flat JSON aliases |
| **WhatsApp Cloud (new lead)** | `indulge_concierge` | `utm_source=whatsapp` | `POST /api/webhooks/whatsapp` | `form_data` WA ids; separate `whatsapp_messages` rows |
| **Onboarding conversion** | N/A (separate table) | Internal webhook | `onboarding_leads` via `insertOnboardingConversion` | `client_name`, `amount`, `agent_name`, `assigned_to` enum |

Manual form `source` enum (`Meta Ads`, `Google Ads`, …) maps to **`utm_source` / `utm_medium`**, not a `leads.source` column.

---

## 2D. `onboarding_leads` table — full column inventory

| Column | PG type | Nullable | Default | Origin |
|--------|---------|----------|---------|--------|
| `id` | `uuid` | NO | `gen_random_uuid()` | System |
| `client_name` | `text` | NO | — | Webhook / admin form |
| `amount` | `numeric` | NO | — | Webhook / admin form |
| `agent_name` | `text` | NO | — | Webhook / admin form |
| `assigned_to` | `text` | NO | CHECK `IN ('Ananyshree','Anishqa')` | Webhook / admin form |
| `created_at` | `timestamptz` | NO | `now()` | System |

**Not** part of `leads`. No `OnboardingLead` TypeScript interface in `lib/types/database.ts` (logic in `lib/onboarding/onboardingConversion.ts` only).

---

## 2E. Required vs optional columns

### `leads` — NOT NULL without usable default on INSERT

| Column | Notes |
|--------|-------|
| `first_name` | Ingestion fallbacks: "Unknown Meta/Google Lead" |
| `phone_number` | Ingestion may insert `""` if missing — **invalid for revival; always supply E.164** |

### `leads` — NOT NULL with defaults (optional in CSV)

`domain`, `status`, `attempt_count`, `is_off_duty`, `agent_alert_sent`, `manager_alert_sent`, `tags`, `follow_up_drafts`, `created_at`, `updated_at`, `id`

### `onboarding_leads` — all business columns required

`client_name`, `amount`, `agent_name`, `assigned_to`

---

## 2F. System-generated columns (SKIP in CSV)

| Column | Reason |
|--------|--------|
| `id` | UUID default |
| `created_at` | `now()` default |
| `updated_at` | Maintained by trigger |
| `assigned_at` | Set by assignment trigger / ingestion when `assigned_to` set |
| `agent_alert_sent` | SLA system (default `false` OK to omit) |
| `manager_alert_sent` | SLA system |
| `is_off_duty` | Derived at webhook insert (default `false` for manual revival) |

**Import separately:** `lead_activities`, `lead_collaborators`, `whatsapp_messages`, `webhook_logs`

---

## Ingestion write set (`processAndInsertLead`)

Columns written on webhook insert:

`first_name`, `last_name`, `phone_number`, `email`, `city`, `address`, `secondary_phone`, `domain`, `status` (= `new`), `utm_source`, `utm_medium`, `utm_campaign`, `campaign_id`, `campaign_name`, `ad_name`, `platform`, `source` ⚠️, `form_data`, `notes`, `personal_details`, `company`, `assigned_to`, `assigned_at`, `is_off_duty`

Plus `lead_activities`: `action_type: lead_created`, `details.source` = utm_campaign or channel tag.

Manual `createLead` writes: `first_name`, `last_name`, `phone_number`, `email`, `city`, `utm_source`, `utm_medium`, `utm_campaign`, `campaign_id`, `domain`, `status` (`new`), `assigned_to`, `notes` — no `form_data`.

---

## `LEADS_TABLE_SELECT` (pipeline list view)

`id`, `first_name`, `last_name`, `phone_number`, `email`, `status`, `utm_source`, `utm_medium`, `utm_campaign`, `notes`, `created_at`, `assigned_agent` join — **excludes** `form_data`, disposition fields, tags, etc.

---

## `lead_activities` (for post-import notes)

| Column | Type | Required on insert |
|--------|------|-------------------|
| `lead_id` | uuid | YES |
| `actor_id` | uuid | nullable (webhook uses null) |
| `action_type` | text | YES — use `note_added` (modern) |
| `details` | jsonb | default `{}` |
| `performed_by` | uuid | legacy nullable (048) |
| `type` | activity_type enum | legacy — dual-write `note` |
| `payload` | jsonb | legacy dual-write |

Recommended revival row: `action_type = 'note_added'`, `details = {"text":"Imported via CSV revival batch – YYYY-MM-DD"}`.

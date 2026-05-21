# Atlas Lead Import Guide

Bulk revival playbook for overwriting stale CRM data after an offline period (~2 weeks).  
Full schema audit: [LEAD_DATA_AUDIT_REPORT.md](./LEAD_DATA_AUDIT_REPORT.md)

---

## Table of contents

1. [CSV templates](#csv-templates)
2. [What each table stores](#what-each-table-stores)
3. [Enum reference](#enum-reference)
4. [`form_data` JSON keys by template](#form_data-json-keys-by-template)
5. [Import methods](#import-methods)
6. [Upsert / overwrite strategy](#upsert--overwrite-strategy)
7. [Post-import checklist](#post-import-checklist)

---

## CSV templates

| File | Use when |
|------|----------|
| [leads_concierge.csv](./leads_concierge.csv) | Default concierge pipeline — manual referrals, WhatsApp, mixed revival |
| [leads_global.csv](./leads_global.csv) | Rows with `domain = indulge_global` (cross-BU; rare on leads) |
| [leads_meta_webhook.csv](./leads_meta_webhook.csv) | Meta / Facebook Lead Ad shaped data (`utm_source=meta`) |
| [leads_google_webhook.csv](./leads_google_webhook.csv) | Google Lead Form shaped data (`utm_source=google`) |
| [leads_website_webhook.csv](./leads_website_webhook.csv) | Website / Typeform flat payloads (`utm_source=website`) |
| [onboarding_leads.csv](./onboarding_leads.csv) | **Separate** onboarding conversion table |

**Header convention:** `*` suffix = strongly required for a valid revival row (e.g. `phone_number*`).  
**Comment rows:** Lines starting with `#` are documentation (strip before Table Editor upload or use SQL import that skips them).

---

## What each table stores

### `public.leads`

| Aspect | Detail |
|--------|--------|
| **Stores** | CRM pipeline leads — contact, attribution, status, assignment, JSONB intake |
| **Who fills** | Webhooks (Pabbly → Meta/Google/Website), WhatsApp adapter, manual Add Lead form, CSV revival |
| **Pipeline stage** | `status` enum from `new` through `won` / `lost` / `trash` / `nurturing` |
| **Tenant key** | `domain` (`indulge_domain`) — isolates agent pools and RLS |

### `public.onboarding_leads`

| Aspect | Detail |
|--------|--------|
| **Stores** | Post-sale onboarding conversion events (client name, amount, agent, assignee) |
| **Who fills** | Onboarding webhook / admin form only |
| **Pipeline** | Not the CRM lead pipeline — reporting / onboarding queue |

### `public.lead_activities` (import separately)

| Aspect | Detail |
|--------|--------|
| **Stores** | Immutable audit timeline |
| **Who fills** | System on create/status change; **you** add revival `note_added` rows post-CSV |

### `public.lead_collaborators` / `public.whatsapp_messages`

Not covered by these CSVs. Restore only if you have explicit export data.

### `public.webhook_logs`

Read-only debug capture during webhook replay — use to discover real `form_data` keys for gap period.

---

## Enum reference

### `status` (`lead_status`)

| Value | Typical meaning |
|-------|-----------------|
| `new` | Uncontacted / just assigned |
| `attempted` | Outreach started |
| `connected` | Reached prospect |
| `in_discussion` | Active sales conversation |
| `won` | Closed deal |
| `nurturing` | Parked for follow-up |
| `lost` | Closed lost |
| `trash` | Disqualified |

### `domain` (`indulge_domain`)

| Value | Notes |
|-------|-------|
| `indulge_concierge` | Default for ads + manual "Indulge Global" label in UI |
| `indulge_shop` | Shop vertical |
| `indulge_house` | House vertical |
| `indulge_legacy` | Legacy vertical |
| `indulge_global` | Cross-BU (066); assignment RPC may still route to concierge pool |

### Attribution (`utm_source` / manual source labels)

Webhook defaults:

| Channel | Typical `utm_source` | Typical `utm_medium` |
|---------|---------------------|----------------------|
| Meta | `meta` | `facebook`, `instagram`, … |
| Google | `google` | `search`, `youtube`, `display`, … |
| Website | `website` | `website`, `organic`, … |
| WhatsApp | `whatsapp` | `whatsapp_cloud` |
| Manual form | `meta`, `google`, `website`, `referral`, `whatsapp` | per `createLead` mapping |

Manual form labels (`lib/schemas/lead.ts`): `Meta Ads`, `Google Ads`, `Website Form`, `Referral`, `Direct/WhatsApp` → stored as **utm_***, not a `source` column.

### `lost_reason` (modal text)

`Not Interested` | `Price Objection` | `Bought Competitor` | `Other`

### `trash_reason`

`Incorrect Data` | `Not our TG` | `Spam`

### `nurture_reason`

`Future Prospect` | `Cold`

### `lost_reason_tag` (legacy)

`budget_exceeded` | `irrelevant_unqualified` | `timing_not_ready` | `went_with_competitor` | `ghosted_unresponsive`

### `onboarding_leads.assigned_to`

`Ananyshree` | `Anishqa` (CHECK constraint)

---

## `form_data` JSON keys by template

Single CSV column `form_data` = one JSON object (escape quotes for CSV).

### Concierge / global

Any keys valid; UI renders all non-empty entries. Examples:

```json
{"interest":"membership","budget_range":"10-15L","message":"free text"}
```

### Meta (`leads_meta_webhook.csv`)

| Key | Provenance |
|-----|------------|
| `message` | Top-level message merged at ingestion |
| Custom ad question names | From `raw_meta_fields[].name` — **verify in webhook_logs** |
| Passthrough Pabbly keys | Unmapped top-level → JSONB |

### Google (`leads_google_webhook.csv`)

| Key | Provenance |
|-----|------------|
| Custom column ids / names | From `raw_google_fields` — **verify in webhook_logs** |
| Empty-string answers | Stored as `""` per adapter |

### Website (`leads_website_webhook.csv`)

| Key | Provenance |
|-----|------------|
| `message` | Common |
| `company`, `how_did_you_hear`, Typeform field refs | Passthrough |
| `domain` | If sent only at top-level in webhook, may appear in JSONB on website path |

---

## Import methods

### A. Supabase Table Editor (small batches)

1. Open **Table Editor** → `leads` (or `onboarding_leads`).
2. **Insert** → **Import data from CSV**.
3. Remove all `#` comment lines from the CSV (or copy data rows only).
4. Map columns by name (headers must match DB exactly).
5. For `tags`, use PostgreSQL array syntax: `{}` or `{griffin_event}`.
6. For `form_data`, paste valid JSON in the cell or import as text and cast in SQL.

**Limitations:** No conditional upsert; duplicates create new rows unless you delete stale data first.

### B. SQL upsert (recommended for overwrite)

**Prerequisite:** Add a unique constraint if you want phone+domain dedup:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_domain_unique
  ON public.leads (phone_number, domain);
```

Example upsert (adjust column list to match your CSV):

```sql
-- Run in Supabase SQL Editor after loading staging table or using COPY
INSERT INTO public.leads (
  first_name, last_name, phone_number, email, city, domain, status,
  utm_source, utm_medium, utm_campaign, form_data, notes
) VALUES (
  'Priya', 'Sharma', '+919876543210', 'priya@example.com', 'Mumbai',
  'indulge_concierge', 'new', 'referral', NULL, 'Q1-Concierge-2026',
  '{"interest":"membership"}'::jsonb, 'Revival batch'
)
ON CONFLICT (phone_number, domain) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  email = EXCLUDED.email,
  city = EXCLUDED.city,
  utm_source = EXCLUDED.utm_source,
  utm_campaign = EXCLUDED.utm_campaign,
  form_data = COALESCE(EXCLUDED.form_data, public.leads.form_data),
  updated_at = now()
WHERE public.leads.status = 'new';  -- optional: only refresh stale new leads
```

Use `psql` `\copy` or Supabase **Storage** + `COPY FROM` for large files.

### C. Re-play webhooks (gap period only)

If Pabbly retained events, replay to `/api/webhooks/leads/{meta|google|website}` instead of CSV — recreates ingestion side effects (`lead_created` activity, assignment, `is_off_duty`). Compare against `webhook_logs`.

---

## Upsert / overwrite strategy

| Topic | Guidance |
|-------|----------|
| **Natural key** | `phone_number` + `domain` (application-level; not enforced in migrations today) |
| **Normalize phones** | Run through same E.164 rules as `normalizeToE164()` (`+91…` for India) before import |
| **Do not overwrite** | `assigned_to` if agent already working the lead; `status` if not `new`; `attempt_count` if higher in DB; `private_scratchpad` / `follow_up_drafts` |
| **Safe to overwrite** | Attribution (`utm_*`, `campaign_*`), `form_data`, `notes` (if document merge policy), contact fields with verified truth |
| **Activities** | Never in leads CSV — insert into `lead_activities` separately |
| **Schema drift** | `leads.source` column was **dropped** in migration 025; app types still mention it — use `utm_source` / `notes` instead |

---

## Post-import checklist

- [ ] **Phone format:** All `phone_number` values E.164 (`+91XXXXXXXXXX` for India).
- [ ] **Domain vs pool:** `domain` matches intended agent assignment pool (`pick_next_agent_for_domain`).
- [ ] **Unassigned leads:** For rows with empty `assigned_to`, run assignment RPC or manual assign:
  ```sql
  SELECT public.pick_next_agent_for_domain('indulge_concierge'::public.indulge_domain);
  ```
- [ ] **Activity audit:** One row per imported lead:
  ```sql
  INSERT INTO public.lead_activities (lead_id, actor_id, action_type, details, performed_by, type, payload)
  SELECT l.id, NULL, 'note_added',
    jsonb_build_object('text', 'Imported via CSV revival batch – 2026-05-21'),
    NULL, 'note',
    jsonb_build_object('text', 'Imported via CSV revival batch – 2026-05-21')
  FROM public.leads l
  WHERE l.notes LIKE '%Revival batch%';  -- adjust filter to your import marker
  ```
- [ ] **SLA fields:** Review `is_off_duty`, `assigned_at`, `agent_alert_sent` for `status = 'new'` leads.
- [ ] **Duplicates:** Query `phone_number, domain, count(*)` — resolve before go-live.
- [ ] **Onboarding:** Import [onboarding_leads.csv](./onboarding_leads.csv) separately if needed.
- [ ] **Verify live schema:** Run `SELECT * FROM get_leads_columns();` in Supabase — confirm no drift (esp. `source` column).

---

## Related code references

| Area | Path |
|------|------|
| Ingestion | `lib/services/leadIngestion.ts` |
| Manual create | `lib/actions/createLead.ts`, `lib/schemas/lead.ts` |
| Webhooks | `app/api/webhooks/leads/{meta,google,website}/route.ts` |
| Types | `lib/types/database.ts` (`Lead`, `LeadStatus`, …) |
| Pipeline docs | `components/admin/pipeline/pipeline-data.ts` |
| Onboarding | `lib/onboarding/onboardingConversion.ts` |

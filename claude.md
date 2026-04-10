# Indulge Atlas — System Architecture & Knowledge Base

> **Canonical Reference** — Generated 2026-04-09 via exhaustive static analysis of all 57 SQL migrations, full TypeScript type layer, all service/action files, and all route/component pages.
> Any AI assistant working in this repo must treat this file as the authoritative source of truth for schema, business logic, security model, and integration architecture.

---

## 1. System Overview & Core Philosophy

### What Is Indulge Atlas?

Indulge Atlas is a **bespoke Enterprise CRM** purpose-built for the **Indulge Group** — a high-ticket lifestyle-brand ecosystem operating across four distinct business units (domains). It is not a generic CRM. Every design and engineering decision is optimized for:

- **Speed-to-Lead** in a high-volume inbound sales environment
- **Multi-tenant data isolation** with zero cross-contamination between business units at the Postgres row level
- **Gamified SLA compliance** for sales agents with real-time breach detection
- **WhatsApp-first communication** — outbound via Meta Cloud API, inbound via webhook two-way sync
- **Zero-waterfall UI** built on Next.js 14 App Router Server Actions with optimistic updates

### "Light Quiet Luxury" UI/UX Design Philosophy

The frontend design language is explicitly described as "Light Quiet Luxury." Key characteristics:

- **Color palette**: Off-white base `#F9F9F6`, warm stone tones, gold accent `#D4AF37`, muted indigo/emerald for status pills
- **Surface cards**: Consistent usage of `surfaceCardVariants` (defined in component library). Cards use `bg-white rounded-2xl border border-[#E5E4DF] shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]`
- **Layout canvas**: The `layout-canvas` CSS class renders a textured dark shell. The sidebar is transparent, painting directly onto this canvas. The main content area (`bg-[#F9F9F6] rounded-2xl paper-shadow`) floats 12px above the canvas on three sides, flush with the sidebar on the left.
- **Skeleton loaders**: Every async Suspense boundary has a purpose-built skeleton that matches the exact height/shape of the loaded content (no generic spinners).
- **Zero-waterfall Server Actions**: Data fetching happens at the RSC layer. Client components receive pre-fetched initial data as props; mutations happen via Next.js Server Actions with `revalidatePath` for cache invalidation.
- **Optimistic UI**: Status changes (lead status, task completion) are applied locally before the server action resolves.
- **Domain-color-coded pills**: Each of the 4 business units has a distinct pill color defined in `DOMAIN_DISPLAY_CONFIG` in `lib/types/database.ts`.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router (React 18 RSC + Server Actions) |
| Auth + Database | Supabase (PostgreSQL 15 + Auth + Realtime) |
| ORM Layer | Supabase JS client with hand-written typed queries |
| Type Safety | TypeScript strict mode; all DB types in `lib/types/database.ts` |
| Validation | Zod (all Server Actions + webhook inputs) |
| Date handling | `date-fns` + `date-fns-tz` (IST timezone = `Asia/Kolkata`) |
| Styling | Tailwind CSS + shadcn/ui component primitives |
| External APIs | Meta WhatsApp Cloud API (Graph API v19.0), Meta Lead Ads, Google Ads |
| Webhook Orchestration | Pabbly Connect (acts as middleware between ad platforms and the CRM ingestion endpoints) |

---

## 2. Multi-Tenant Architecture & Security Vault (RLS)

### Migration History (Role & Domain Evolution)

The system went through a canonical rename in migration **`056_strict_tenant_isolation.sql`**:

| Legacy Value | Canonical Value (post-056) |
|---|---|
| `scout` (role) | `manager` |
| `finance` (role) | `guest` |
| `indulge_global` (domain) | `indulge_concierge` |

All code, policies, and data now use the canonical values. Legacy aliases (`get_my_role()`, `get_role_from_jwt()`) are backward-compatible wrappers around `get_user_role()`.

### The 4 Business Unit Domains (`indulge_domain` enum)

```sql
CREATE TYPE public.indulge_domain AS ENUM (
  'indulge_concierge',  -- Primary luxury concierge / onboarding sales arm
  'indulge_shop',       -- E-commerce / product sales war room
  'indulge_house',      -- Property / lifestyle experiences
  'indulge_legacy'      -- Long-term membership & legacy clients
);
```

**Display config** (from `lib/types/database.ts` `DOMAIN_DISPLAY_CONFIG`):

| Domain Key | Label | Ring Color | Pill BG | Pill Text |
|---|---|---|---|---|
| `indulge_concierge` | Indulge Concierge | `rgba(99,102,241,0.5)` | `#EEF2FF` | `#4F46E5` (indigo) |
| `indulge_house` | Indulge House | `rgba(212,175,55,0.4)` | `#FEF3C7` | `#A88B25` (gold) |
| `indulge_shop` | Indulge Shop | `rgba(16,185,129,0.45)` | `#D1FAE5` | `#0D9488` (teal) |
| `indulge_legacy` | Indulge Legacy | `rgba(107,114,128,0.4)` | `#F4F4F5` | `#6B7280` (gray) |

### The 5 User Roles (`user_role` enum, post-056)

```sql
CREATE TYPE public.user_role AS ENUM (
  'admin',    -- Full system access, all domains, all mutations, user management
  'founder',  -- Same as admin for data access; conceptually the business owner
  'manager',  -- Full CRUD within own domain; was 'scout' pre-056
  'agent',    -- SELECT/INSERT/UPDATE own assigned leads/tasks in own domain; no DELETE
  'guest'     -- SELECT only, own domain; no mutations; was 'finance' pre-056
);
```

### Role Permission Matrix (enforced at RLS level)

| Operation | admin | founder | manager | agent | guest |
|---|---|---|---|---|---|
| **Profiles: SELECT** | All domains | All domains | Own domain only | Own row only | Own domain |
| **Profiles: INSERT** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Profiles: UPDATE** | Any row | Any row | Own row only | Own row only | ❌ |
| **Profiles: DELETE** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Leads: SELECT** | All domains | All domains | Own domain | Own assigned + own domain | Own domain |
| **Leads: INSERT** | ✅ | ✅ | Own domain | Own domain + self as assignee | ❌ |
| **Leads: UPDATE** | Any | Any | Own domain | Own assigned + own domain | ❌ |
| **Leads: DELETE** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Tasks: SELECT** | All | All | Own domain leads + assigned | Own assigned_to_users | Own domain leads |
| **Tasks: INSERT/UPDATE** | ✅ | ✅ | ✅ | Self in assigned_to_users | ❌ |
| **Tasks: DELETE** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Lead Activities: SELECT** | All | All | Own domain | Own leads + own domain | Own domain |
| **Lead Activities: INSERT** | ✅ | ✅ | ✅ | Own assigned leads | ❌ |
| **Campaign Metrics: SELECT** | ✅ | ✅ | ✅ (any domain) | ❌ | ✅ (any domain) |
| **Campaign Metrics: WRITE** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Shop Orders: SELECT** | All | All | Domain-scoped | Own assigned | ❌ |
| **Shop Orders: WRITE** | ✅ | ✅ | ✅ | Own assigned | ❌ |
| **WhatsApp Messages: SELECT** | All | All | Own domain | Own leads + own domain | Own domain |
| **WhatsApp Messages: INSERT** | ✅ | ✅ | ✅ | Own leads | ❌ |
| **Field Mappings / Webhook Endpoints** | Full CRUD | ❌ | ❌ | ❌ | ❌ |

### RLS Helper Functions (Post-056 Canonical)

All RLS policies call these `SECURITY DEFINER` functions to avoid JWT parsing overhead in each policy clause:

```sql
-- Primary: reads from JWT user_metadata first, falls back to profiles table
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS TEXT
  → COALESCE(jwt.user_metadata.role, profiles.role, 'agent')

CREATE OR REPLACE FUNCTION public.get_user_domain() RETURNS TEXT
  → COALESCE(jwt.user_metadata.domain, profiles.domain, 'indulge_concierge')

-- Backward-compatible aliases (all point to the same logic):
public.get_my_role()       → public.get_user_role()
public.get_my_domain()     → public.get_user_domain()
public.get_role_from_jwt() → public.get_user_role()
```

**Important**: `get_user_role()` reads the JWT `user_metadata` field first. After migration 056, active sessions must be force-refreshed so the JWT reflects the new role/domain values. The fallback reads from `profiles` for stale sessions.

### Admin Profile Creation Trigger

When a new Supabase auth user is created (`on_auth_user_created` trigger on `auth.users`), `handle_new_user()` SECURITY DEFINER inserts a `profiles` row, reading `raw_user_meta_data.role` and `raw_user_meta_data.domain` from the signup metadata. Defaults: `role='agent'`, `domain='indulge_concierge'`.

---

## 3. Database Schema Map

### Core Tables

#### `public.profiles`
One row per `auth.users` entry. Auto-created by `on_auth_user_created` trigger.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | PK → `auth.users(id)` | CASCADE delete |
| `full_name` | `text` | NOT NULL | |
| `email` | `text` | NOT NULL | |
| `phone` | `text` | NULL | Optional |
| `dob` | `date` | NULL | Optional |
| `role` | `user_role` enum | `'agent'` | Canonical post-056: admin/founder/manager/agent/guest |
| `domain` | `indulge_domain` enum | `'indulge_concierge'` | Business unit assignment |
| `is_active` | `boolean` | `true` | Set false to deactivate without deleting |
| `is_on_leave` | `boolean` | NULL | Agent leave status (added in 049); prevents lead assignment |
| `created_at` | `timestamptz` | `now()` | |
| `updated_at` | `timestamptz` | `now()` | Auto-updated via trigger |

---

#### `public.leads`
The central CRM entity. Every inbound contact is a lead.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | PK `gen_random_uuid()` | |
| `first_name` | `text` | NOT NULL | |
| `last_name` | `text` | NULL | Single-name contacts allowed |
| `phone_number` | `text` | NOT NULL | Primary contact; used for WA phone lookup |
| `secondary_phone` | `text` | NULL | Alternate number |
| `email` | `text` | NULL | |
| `city` | `text` | NULL | |
| `address` | `text` | NULL | |
| `channel` | `text` | NULL | Acquisition channel: `website`, `whatsapp`, `meta_lead_form`, `facebook`, `instagram` |
| `source` | `text` | NULL | Pabbly passthrough `source` field (distinct from `utm_source`) |
| `campaign_id` | `text` | NULL | Free-text; joins to `campaign_metrics.campaign_id` |
| `campaign_name` | `text` | NULL | Display name of campaign |
| `ad_name` | `text` | NULL | Specific ad creative name |
| `platform` | `text` | NULL | Sub-platform: `facebook`, `instagram`, `google`, `website` |
| `deal_value` | `numeric(14,2)` | NULL | Set when status→`won` |
| `deal_duration` | `text` | NULL | Duration string from WonDealModal |
| `domain` | `indulge_domain` enum | `'indulge_concierge'` | Business unit — drives RLS |
| `status` | `lead_status` enum | `'new'` | 8-stage pipeline |
| `assigned_to` | `uuid` | NULL → `profiles(id)` | SET NULL on profile delete |
| `assigned_at` | `timestamptz` | NULL | Timestamp when agent was assigned — SLA clock anchor |
| `is_off_duty` | `boolean` | NULL | True when lead arrived between 18:00–08:59 IST |
| `utm_source` | `text` | NULL | e.g. `meta`, `google`, `whatsapp`, `organic` |
| `utm_medium` | `text` | NULL | e.g. `facebook`, `instagram`, `google_search` |
| `utm_campaign` | `text` | NULL | Campaign name; linked to `campaign_metrics.campaign_id` |
| `form_data` | `jsonb` | NULL | Raw passthrough of ALL unmapped webhook fields (zero data loss) |
| `notes` | `text` | NULL | Agent visible notes |
| `private_scratchpad` | `text` | NULL | Agent-only scratchpad; never shown to managers/admins |
| `follow_up_drafts` | `jsonb` | NULL | Dict `{"1": "...", "2": "...", "3": "..."}` — 3-strike follow-up notes |
| `personal_details` | `text` | NULL | Client persona: hobbies, lifestyle, birthday notes |
| `company` | `text` | NULL | Executive Dossier: employer/company |
| `tags` | `text[]` | `'{}'` | Event/campaign tagging e.g. `griffin_event`, `furak_party` |
| `lost_reason` | `text` | NULL | Modal values: `Not Interested`, `Price Objection`, `Bought Competitor`, `Other` |
| `lost_reason_tag` | `text` | NULL | Legacy enum-style tag: `budget_exceeded`, `irrelevant_unqualified`, etc. |
| `lost_reason_notes` | `text` | NULL | Free-text notes for lost |
| `trash_reason` | `text` | NULL | Modal values: `Incorrect Data`, `Not our TG`, `Spam` |
| `nurture_reason` | `text` | NULL | Modal values: `Future Prospect`, `Cold` |
| `attempt_count` | `integer` | `0` | Incremented each time status→`attempted`; triggers nurture toast at count=3 |
| `sla_alert_dismissed` | `boolean` | NULL | When true, SLA monitor skips this lead forever |
| `agent_alert_sent` | `boolean` | NULL | SLA Level 1 alert tracking flag |
| `manager_alert_sent` | `boolean` | NULL | SLA Level 2/3 alert tracking flag |
| `created_at` | `timestamptz` | `now()` | |
| `updated_at` | `timestamptz` | `now()` | Auto-updated via trigger |

**Lead Status Pipeline** (`lead_status` enum, 8 stages):
```
new → attempted → connected → in_discussion → won
                                            ↘ nurturing
                                            ↘ lost
                                            ↘ trash
```
Color coding (`LEAD_STATUS_CONFIG` in `lib/types/database.ts`):
- `new` → amber gold `#D4AF37`
- `attempted` → blue `#3B82F6`
- `connected` → indigo `#818CF8`
- `in_discussion` → emerald `#10B981`
- `won` → gold `#D4AF37`
- `nurturing` → cyan `#0E7490`
- `lost` → red `#EF4444`
- `trash` → gray `#6B7280`

**Key Indexes on leads**:
- `leads_assigned_status_idx` on `(assigned_to, status) WHERE assigned_to IS NOT NULL` — powers agent dashboard queries
- `leads_utm_campaign_idx` on `(utm_campaign) WHERE utm_campaign IS NOT NULL` — links to campaign metrics

---

#### `public.tasks`
Agent/manager tasks. Supports multi-assignee via `uuid[]` array (added migration 034). Also used as the **Shop War Room task container** (extended in migration 054).

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `lead_id` | `uuid` | NULL → `leads(id)` | CASCADE delete; NULL for manager/shop tasks |
| `assigned_to_users` | `uuid[]` | `'{}'` | Array; at least 1 required; GIN indexed |
| `created_by` | `uuid` | NULL → `profiles(id)` | Added migration 033 |
| `title` | `text` | NOT NULL | |
| `task_type` | `task_type` enum | `'call'` | See enum values below |
| `status` | `task_status` enum | `'pending'` | `pending` / `completed` / `overdue` |
| `due_date` | `timestamptz` | NOT NULL | Primary scheduling anchor |
| `notes` | `text` | NULL | |
| `progress_updates` | `jsonb` | `'[]'` | Array of `{timestamp, message, user_id, user_name}` |
| `follow_up_step` | `integer` | `0` | 3-Strike Follow-Up Engine step counter |
| `follow_up_history` | `jsonb` | `'[]'` | Array of `{step, note, date}` |
| `shop_operation_scope` | `text` | `'individual'` | Added 054: `individual` / `group` (Shop War Room) |
| `target_inventory` | `integer` | NULL | Optional: total units to sell |
| `target_sold` | `integer` | `0` | Atomic counter incremented via `increment_shop_task_target_sold()` RPC |
| `shop_task_priority` | `text` | `'normal'` | `super_high` / `high` / `normal` |
| `deadline` | `timestamptz` | NULL | Shop deadline; UI falls back to `due_date` when null |
| `shop_product_name` | `text` | NULL | Product label for shop tasks |
| `created_at` | `timestamptz` | `now()` | |
| `updated_at` | `timestamptz` | `now()` | |

**Task Types** (`task_type` enum):
- Agent types: `call`, `whatsapp_message`, `email`, `file_dispatch`, `general_follow_up`
- Manager types: `campaign_review`, `strategy_meeting`, `budget_approval`, `performance_analysis`

Shop tasks always use `task_type = 'whatsapp_message'` (the default chosen for shop ops) with `shop_operation_scope` as the real differentiator.

---

#### `public.lead_activities`
**Immutable** audit log. No UPDATE or DELETE policies exist. Every action on a lead is permanently recorded.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `lead_id` | `uuid` | NOT NULL → `leads(id)` CASCADE |
| `performed_by` | `uuid` | Legacy column (pre-048); nullable post-048 |
| `actor_id` | `uuid` | New column (post-048) → `profiles(id)` nullable |
| `type` | `activity_type` enum | Legacy field: `status_change`, `note`, `call_attempt`, `task_created` |
| `action_type` | `text` | New field: `lead_created`, `status_changed`, `note_added`, `agent_assigned`, `task_created`, `task_completed` |
| `payload` | `jsonb` | Legacy details blob |
| `details` | `jsonb` | New details blob (mirrors `payload`) |
| `created_at` | `timestamptz` | Immutable |

**Note on dual columns**: Migration 048 made `performed_by` and `type` nullable for backward compatibility. New inserts write both old (`performed_by`/`type`/`payload`) and new (`actor_id`/`action_type`/`details`) fields simultaneously to remain compatible with existing queries.

---

#### `public.campaign_metrics`
Cached ad spend data synced from Meta/Google Ads APIs via Pabbly or server-side sync jobs.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `platform` | `ad_platform` enum | `meta`, `google`, `website`, `events`, `referral` |
| `campaign_id` | `text` | NOT NULL; unique per platform |
| `campaign_name` | `text` | NOT NULL |
| `amount_spent` | `numeric(14,2)` | |
| `impressions` | `bigint` | |
| `clicks` | `bigint` | |
| `cpc` | `numeric(10,4)` | Cost per click |
| `last_synced_at` | `timestamptz` | |
| UNIQUE | `(platform, campaign_id)` | Upsert target |

---

#### `public.campaign_drafts`
Ad Planner Studio: saved campaign plans before deployment.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `campaign_name` | `text` | |
| `platform` | `ad_platform` enum | |
| `objective` | `text` | NULL |
| `total_budget` | `numeric(14,2)` | |
| `target_cpa` | `numeric(14,2)` | |
| `projected_revenue` | `numeric(14,2)` | |
| `status` | `draft_status` enum | `draft`, `approved`, `deployed` |
| `created_by` | `uuid` | → `profiles(id)` |

---

#### `public.shop_orders`
Indulge Shop order lifecycle rows. Can be attached to either a CRM lead (`lead_id`) or a shop task (`task_id`), but not both.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `lead_id` | `uuid` | NULL → `leads(id)` CASCADE; nullable (added in 054) |
| `task_id` | `uuid` | NULL → `tasks(id)` SET NULL; added in 054 |
| `assigned_to` | `uuid` | → `profiles(id)` SET NULL |
| `product_name` | `text` | NOT NULL |
| `amount` | `numeric(14,2)` | CHECK ≥ 0 |
| `status` | `text` | `pending`/`processing`/`shipped`/`delivered`/`cancelled` |
| `customer_name` | `text` | NULL; used when no CRM lead row (task-only WA sales) |
| `customer_phone` | `text` | NULL; used when no CRM lead row |
| `created_at` | `timestamptz` | |

**Constraint**: `shop_orders_lead_or_task_ctx` CHECK: `(lead_id IS NOT NULL AND task_id IS NULL) OR (task_id IS NOT NULL)` — ensures every order has at least a task context.

---

#### `public.shop_master_targets`
Admin-created inventory/revenue target definitions for the Shop War Room.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `title` | `text` | NOT NULL; display name |
| `inventory_total` | `int` | Total units available |
| `inventory_sold` | `int` | Auto-incremented via trigger when `shop_target_updates` row inserted |
| `priority` | `text` | `super_high` / `high` / `normal` |
| `status` | `text` | `active` / `completed` |
| `created_at` | `timestamptz` | |

---

#### `public.shop_target_updates`
Agent log entries for master target progress. Inserting a row atomically increments `shop_master_targets.inventory_sold` via the `trg_shop_target_updates_inc_inventory` trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `target_id` | `uuid` | → `shop_master_targets(id)` CASCADE |
| `agent_id` | `uuid` | → `profiles(id)` CASCADE |
| `notes` | `text` | |
| `units_sold_in_update` | `int` | Added to parent `inventory_sold` |
| `created_at` | `timestamptz` | |

---

#### `public.whatsapp_messages`
WhatsApp Cloud API chat history per lead. Two-way: `inbound` (from webhook) and `outbound` (from CRM).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `lead_id` | `uuid` | NOT NULL → `leads(id)` CASCADE |
| `direction` | `text` | `inbound` / `outbound` |
| `message_type` | `text` | `text` / `template` / `image` |
| `content` | `text` | Message body |
| `status` | `text` | `sent` / `delivered` / `read` / `failed` |
| `wa_message_id` | `text` | NULL; Meta's message ID — used for deduplication on inbound webhook |
| `created_at` | `timestamptz` | |

**Index**: `whatsapp_messages_lead_id_created_at_idx` on `(lead_id, created_at ASC)` — optimizes thread rendering.

---

#### `public.lead_routing_rules`
Admin/manager-defined ordered routing rules. Evaluated top-down (by `priority` ASC) before falling back to the time-based waterfall.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `priority` | `integer` | Default 100; lower number = evaluated first |
| `rule_name` | `text` | Human-readable label |
| `is_active` | `boolean` | Default true; inactive rules are skipped |
| `condition_field` | `text` | `utm_campaign`, `utm_source`, `utm_medium`, `domain`, `source` |
| `condition_operator` | `text` | `equals`, `contains`, `starts_with` |
| `condition_value` | `text` | Value to match against |
| `action_type` | `text` | `assign_to_agent` / `route_to_domain_pool` |
| `action_target_uuid` | `uuid` | NULL → `profiles(id)` SET NULL; used when `action_type = 'assign_to_agent'` |
| `action_target_domain` | `text` | Used when `action_type = 'route_to_domain_pool'` |

---

#### `public.field_mappings` + `public.webhook_endpoints`
The Dynamic Field Mapping Engine configuration tables. See Section 4 for full engine documentation.

**`webhook_endpoints`**:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `source_name` | `text` | e.g. `Meta Lead Ads` |
| `channel` | `text` | UNIQUE; `meta` / `google` / `website` |
| `endpoint_url` | `text` | e.g. `/api/webhooks/leads/meta` |
| `is_active` | `boolean` | Default true |

**`field_mappings`**:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `endpoint_id` | `uuid` | → `webhook_endpoints(id)` CASCADE |
| `incoming_json_key` | `text` | Top-level or dot-notation path e.g. `payload.phone_number` |
| `target_db_column` | `text` | Column in `public.leads` e.g. `phone_number` |
| `transformation_rule` | `text` | NULL (passthrough) / `lowercase` / `uppercase` / `trim` / `extract_numbers` / `capitalize` |
| `fallback_value` | `text` | Used if incoming value is blank/null |
| `is_active` | `boolean` | Default true |
| UNIQUE | `(endpoint_id, incoming_json_key)` | One mapping per key per channel |

---

#### `public.webhook_logs`
Raw inbound payload logging. Every webhook POST is asynchronously logged here for debugging and replay.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `source` | `text` | `meta` / `google` / `website` / `whatsapp` |
| `raw_payload` | `jsonb` | Complete unmodified body |
| `created_at` | `timestamptz` | |

---

#### `public.clients`
Promoted from leads upon `status = 'won'`. The `closeWonDeal` server action inserts here after updating the lead.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `first_name` | `text` | |
| `last_name` | `text` | NULL |
| `phone_number` | `text` | |
| `email` | `text` | NULL |
| `lead_origin_id` | `uuid` | Reference back to originating lead |
| `membership_status` | `text` | `active` by default |

---

#### `public.onboarding_leads`
Separate table for tracking onboarding conversions (not to be confused with the leads pipeline).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `client_name` | `text` | |
| `amount` | `numeric` | |
| `agent_name` | `text` | |
| `assigned_to` | `uuid` | |
| `created_at` | `timestamptz` | |

---

#### `public.personal_todos`
Agent-private to-do items; not linked to leads. RLS: user sees only their own rows.

---

#### `public.sla_alert_tracking`
System table for tracking which SLA alerts have been sent per lead (separate from the `agent_alert_sent`/`manager_alert_sent` columns on `leads`). Added migration 030.

---

### Key Database Functions (PostgreSQL)

| Function | Signature | Purpose |
|---|---|---|
| `get_user_role()` | `() → TEXT` | JWT-first role resolver; SECURITY DEFINER |
| `get_user_domain()` | `() → TEXT` | JWT-first domain resolver; SECURITY DEFINER |
| `get_my_role()` | `() → TEXT` | Alias for `get_user_role()` |
| `get_my_domain()` | `() → TEXT` | Alias for `get_user_domain()` |
| `get_role_from_jwt()` | `() → TEXT` | Alias for `get_user_role()` |
| `pick_next_agent_for_domain(p_domain TEXT)` | `→ UUID` | Domain-aware round-robin; filters out `is_on_leave=true`; cap of 15 new leads for any agent |
| `get_field_mappings_for_channel(p_channel TEXT)` | `→ TABLE` | Returns active mappings for `meta`/`google`/`website`; used by ingestion engine |
| `increment_shop_task_target_sold(p_task_id UUID)` | `→ INT` | Atomic `target_sold + 1` with auth check; raises exception if not authorized |
| `shop_target_updates_inc_inventory()` | trigger function | Increments `shop_master_targets.inventory_sold` on `shop_target_updates` INSERT |
| `assign_next_agent()` | `() → UUID` | Legacy global round-robin (no domain filter); superseded by domain-aware version |
| `pick_next_agent_capped()` | `() → UUID` | Cap-aware version without domain filter; transitional; Samson exception built-in |
| `update_modified_column()` | trigger function | Sets `updated_at = now()` before UPDATE on all tables |
| `handle_new_user()` | trigger function | Auto-creates `profiles` row on `auth.users` INSERT; SECURITY DEFINER |

---

## 4. Ingestion & ETL Pipeline (The Data Front Door)

### Pabbly Webhook Architecture

Pabbly Connect acts as the no-code middleware between ad platforms and the CRM. The flow is:

```
Meta Lead Ads / Google Ads / Website Form
        ↓
    Pabbly Connect (ETL/mapping layer)
        ↓
POST /api/webhooks/leads/{meta|google|website}
  Authorization: Bearer <PABBLY_WEBHOOK_SECRET>
        ↓
   Dynamic Field Mapping Engine
        ↓
   Lead Routing Engine
        ↓
   processAndInsertLead()
        ↓
   public.leads INSERT + lead_activities INSERT
```

**Authentication**: All Pabbly-facing endpoints call `verifyPabblyWebhook(request)` from `lib/utils/webhook.ts`. This performs a **timing-safe** comparison of the `Authorization: Bearer` token against `process.env.PABBLY_WEBHOOK_SECRET`. Returns `401` if invalid.

**Webhook Log**: Every inbound POST is immediately enqueued to `enqueueWebhookLog()` (from `lib/services/webhookLog.ts`) which fires-and-forgets a non-blocking insert to `public.webhook_logs`. This happens before any processing — guaranteeing the raw payload is always captured even if processing fails.

---

### Dynamic Field Mapping Engine (`lib/services/fieldMappingEngine.ts`)

**Purpose**: Allows managers to visually map incoming JSON keys from any Pabbly channel to Supabase `leads` table columns — zero code changes required.

**Execution Flow**:

1. **Channel lookup**: Calls `get_field_mappings_for_channel(p_channel)` RPC via service role. Returns all active `field_mappings` rows for the channel, ordered by `created_at ASC`.

2. **Key resolution**: Supports **dot-notation** paths (e.g., `payload.phone_number`) via the `getNestedValue()` function which traverses nested objects safely.

3. **Transformation**: Each mapping row can specify a `transformation_rule`:
   - `lowercase` → `value.toLowerCase()`
   - `uppercase` → `value.toUpperCase()`
   - `trim` → `value.trim()`
   - `extract_numbers` → `value.replace(/\D/g, '')`
   - `capitalize` → first char uppercase, rest lowercase
   - `null` → passthrough (no transformation)

4. **Fallback**: If the incoming value is `null` or empty, `fallback_value` is used (if set).

5. **Unmapped keys → `form_data`**: Any top-level incoming key that has NO mapping row is collected into `unmappedFormData`. This JSONB object is stored in `leads.form_data` — **zero data loss guarantee**.

6. **Return contract**:
   ```typescript
   {
     hasMappings: boolean,      // false → no rows configured, use hardcoded fallback
     mappedFields: Record<string, unknown>,    // ready for DB insert
     unmappedFormData: Record<string, unknown> // goes into leads.form_data
   }
   ```

7. **Fallback behavior**: When `hasMappings = false` (no mappings configured for this channel), the webhook adapters fall through to **hardcoded parsing logic** (e.g., Meta's `raw_meta_fields` array format). This provides backward compatibility.

---

### Dynamic Lead Routing Engine (`lib/services/evaluateRoutingRules.ts`)

**Pure function** — no database I/O. Takes `LeadRoutingRule[]` (pre-fetched) and the merged lead payload; returns the first matching rule's action or `null`.

**Condition Fields supported**:
- `utm_campaign` — direct from payload
- `utm_source` — direct from payload
- `utm_medium` — direct from payload
- `domain` — direct from payload
- `source` — from payload; falls back to `utm_source` if raw source is blank

**Operators**: `equals`, `contains`, `starts_with` — all case-insensitive, trimmed comparison.

**Priority ordering**: Rules are re-sorted by `priority ASC` inside the function (even if caller doesn't). First match wins.

**Action types**:
- `assign_to_agent`: Returns `{ action_type, action_target_uuid }` — agent UUID is set directly
- `route_to_domain_pool`: Returns `{ action_type, action_target_domain }` — overrides working domain for subsequent waterfall

---

### Full `resolveAssignedAgent()` Waterfall (`lib/services/leadIngestion.ts`)

This is the complete agent assignment decision tree executed for every incoming lead:

```
Step 1: Dynamic Routing Engine
  ├── Fetch all active rules from `lead_routing_rules` (ordered by priority ASC)
  ├── Evaluate against merged payload (rawPayload merged with parsed lead)
  ├── If rule matches with action_type='assign_to_agent' → RETURN that agent UUID
  └── If rule matches with action_type='route_to_domain_pool' → override workingDomain, continue to Step 2

Step 2: Time-Based IST Shift Check
  ├── getCurrentHourIST() via date-fns-tz (timezone: 'Asia/Kolkata')
  │
  ├── NIGHT SHIFT (20:00–10:59 IST):
  │   └── Pool: [meghana, amit]
  │       └── pickNextAgentForDomain(workingDomain, [meghana_id, amit_id])
  │
  └── DAY SHIFT (11:00–19:59 IST):
      ├── Check Samson's today lead count:
      │   SELECT count(*) FROM leads WHERE assigned_to = samson_id AND created_at >= startOfTodayIST
      ├── If Samson count < 15: Pool = [samson, meghana, amit, kaniisha]
      └── If Samson count >= 15 (AT CAP): Pool = [meghana, amit, kaniisha]
          └── pickNextAgentForDomain(workingDomain, pool)

Final fallback: pickNextAgentForDomain(workingDomain, null)
  → Uses Postgres function pick_next_agent_for_domain()
  → Round-robin by lowest new_lead_count, skips is_on_leave=true agents
  → Returns NULL if no eligible agents → lead inserted as unassigned
```

**Agent pool emails** (hardcoded in `leadIngestion.ts`):
- `meghana@indulge.global`
- `amit@indulge.global`
- `samson@indulge.global` (daily cap = 15 new leads in day shift)
- `kaniisha@indulge.global`

UUIDs are resolved at startup and cached for the process lifetime (`cachedAgentIds`).

**`is_off_duty` flag**: Set to `true` when `isOffDutyInsertion()` detects current IST hour is `>= 18` or `< 9`. This affects which SLA clock is used for the lead.

---

### Webhook Endpoints

#### `POST /api/webhooks/leads/meta`
Accepts Pabbly → Meta Lead Ads payloads. Parses `raw_meta_fields` (array of `{name, values}` objects) when dynamic mapping is not configured. UTM: `source=meta`, `medium=facebook|instagram|website`.

#### `POST /api/webhooks/leads/google`
Accepts Pabbly → Google Ads payloads. Similar flow with Google-specific field names.

#### `POST /api/webhooks/leads/website`
Accepts Pabbly → website form / Typeform payloads.

#### `POST /api/webhooks/whatsapp`
Meta WhatsApp Cloud API webhook. See Section 5 for full documentation.

#### `POST /api/webhooks/onboarding-conversion`
Separate endpoint for recording onboarding conversions to `onboarding_leads` table.

---

## 5. Communications Engine: Meta WhatsApp Cloud API

### Environment Variables Required

| Variable | Purpose |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number ID for outbound messages |
| `WHATSAPP_API_TOKEN` | Meta Graph API Bearer token |
| `WHATSAPP_VERIFY_TOKEN` | Must match Meta dashboard "Verify token" for GET challenge |
| `WHATSAPP_APP_SECRET` | Optional; if set, POST body validated via `X-Hub-Signature-256` |

---

### Outbound Flow (CRM → WhatsApp lead)

**Entry point**: `sendWhatsAppMessage(leadId, text)` in `lib/actions/whatsapp.ts` (Next.js Server Action).

```
1. Zod validate: { leadId: uuid, text: string min(1) max(4096) }
2. Auth check: createClient() → auth.getUser() → must be authenticated
3. Fetch lead.phone_number from Supabase (RLS enforced)
4. Normalize phone: strip all non-digits → raw digits string
5. Validate: digits.length >= 8
6. POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
   Body: { messaging_product: "whatsapp", to: digits, type: "text", text: { body: text } }
   Headers: Authorization: Bearer {API_TOKEN}
7. On 200: extract wa_message_id from response.messages[0].id
8. INSERT into whatsapp_messages: { lead_id, direction:'outbound', message_type:'text', content, status:'sent', wa_message_id }
9. revalidatePath(`/leads/${leadId}`)
10. Return { success: true, message: WhatsAppMessage }
```

**24-Hour Window Error Handling**: If Meta returns an error containing "24 hour" or "outside the allowed window", the error message is replaced with a user-friendly explanation about the Meta 24-hour customer care window and template requirement.

---

### Inbound Flow (WhatsApp lead → CRM)

**Entry point**: `POST /api/webhooks/whatsapp` — `app/api/webhooks/whatsapp/route.ts`

```
1. Read raw body as text (for HMAC signature verification)
2. If WHATSAPP_APP_SECRET is set:
   - Verify X-Hub-Signature-256 header using HMAC-SHA256(appSecret, rawBody)
   - Reject with 401 if signature doesn't match
3. Parse JSON body
4. Return 200 immediately (Meta requires acknowledgment)
5. Use Next.js `after()` to process asynchronously AFTER response is sent

ASYNC PROCESSING per message in payload:
  - Extract all messages from entry[].changes[].value.messages[]
  - For each message:
    a. Deduplicate: check if wa_message_id already in whatsapp_messages → skip if found
    b. Extract body text (handles type: text|button|interactive|image|video|document)
    c. Normalize sender's wa_id to digits only (strip all non-digits)
    d. Phone lookup: SELECT id FROM leads WHERE phone_number IN [digits, +digits, stripped variants] LIMIT 2

    IF lead found:
      → INSERT whatsapp_messages: { lead_id, direction:'inbound', content:bodyText, status:'delivered', wa_message_id }

    IF lead NOT found:
      → processAndInsertLead() to create new lead:
        { first_name, last_name (from WA profile name), phone_number: digits,
          utm_source:'whatsapp', utm_medium:'whatsapp_cloud',
          message: bodyText, form_data: {whatsapp_wa_id, whatsapp_message_id} }
      → INSERT whatsapp_messages against new lead_id
```

**Phone normalization variants** (`phoneStoredVariants()`): For digits string `d`, tries: `d`, `+d`, and if starts with `00`: the rest without prefix and `+rest`. This handles both E.164 and local formats stored in the DB.

**GET verification**: Handles `hub.mode=subscribe` + `hub.verify_token` + `hub.challenge` — responds with `hub.challenge` as plain text for Meta webhook registration.

---

### Global WhatsApp Hub (`/whatsapp`)

**Server component**: `app/(dashboard)/whatsapp/page.tsx`

Calls `getRecentWhatsAppConversations()` which:
1. Queries `whatsapp_messages` DESC by `created_at`, `LIMIT 500`
2. Joins lead info: `lead:leads(id, first_name, last_name, phone_number, status, assigned_to)`
3. Deduplicates in-memory by `lead_id` — keeps only the most recent message per lead
4. Returns array of `{ lead, latestMessage }` sorted by most recent message

**Client component**: `WhatsAppHubClient` — master-detail layout:
- Left panel (`400px` fixed): scrollable conversation list sorted by latest message timestamp
- Right panel (flex-1): full chat thread for selected lead, rendered by `WhatsAppChatModule`

---

## 6. Workspaces & Workflows

### The Shop Workspace (`/shop/workspace`)

**Access gate**: `requireShopWorkspaceAccess()` — checks user is in `indulge_shop` domain OR has `admin`/`founder` role. Redirects to `/` if unauthorized.

**Access helper**: `canAccessShopSurfaces(profile)` in `lib/shop/access.ts` — returns `true` if `domain === 'indulge_shop'` OR role in `['admin', 'founder', 'manager']`.

#### Shop Task Structure

Shop tasks live in the existing `tasks` table with `shop_operation_scope` set (either `'individual'` or `'group'`). They are distinguished from CRM lead tasks by:
- `lead_id = null` (no linked lead)
- `shop_operation_scope IS NOT NULL`
- `shop_task_priority` set
- `task_type = 'whatsapp_message'` (WhatsApp outreach context)

**Creating a Shop Task** (`createShopTask` server action):
- Individual: exactly 1 assignee
- Group: at least 2 assignees
- Optional inventory target: `target_inventory` (units) + `shop_product_name`
- Priority: `super_high` / `high` / `normal`

**Register Sale flow** (`registerTaskSale` server action):
1. Validate assignee OR elevated role
2. `INSERT shop_orders` with `task_id`, `customer_name`, `customer_phone`, `amount`, `product_name`
3. Call `increment_shop_task_target_sold(task_id)` RPC → atomically increments `tasks.target_sold`
4. Append to `tasks.progress_updates` JSONB array: `"🎉 {agentName} sold 1 unit to {customerName}"`
5. `revalidatePath('/shop/workspace')`

#### `shop_master_targets` + `shop_target_updates` (Admin Panel)

Separate from shop tasks. Admin creates master inventory targets (e.g., "Event Tickets: 200 total"). Agents submit progress updates via `shop_target_updates`. The `trg_shop_target_updates_inc_inventory` trigger automatically increments the parent `inventory_sold` counter.

---

### The Lead Dossier (`/leads/[id]`)

The dossier is a **multi-panel RSC page** with Suspense-driven async sections, each with dedicated skeleton loaders:

**Layout sections** (rendered via `LeadDossierAsync.tsx`):

| Section | Component | Data Source |
|---|---|---|
| Lead Journey Bar | `LeadJourneyBar` | `lead_activities` filtered and shaped into timeline stages |
| Status Action Panel | `StatusActionPanel` | Server Action driven; handles 8-stage transitions |
| Lead Info Cards | Inline in page | `leads` row fields |
| Task Widget | `LeadTaskWidget` | `tasks` WHERE `lead_id = X` |
| WhatsApp Chat Module | `WhatsAppChatModule` | `whatsapp_messages` WHERE `lead_id = X` |
| Activity Timeline | `ActivityTimeline` | `lead_activities` reverse-chronological |
| Context Chat | `LeadContextChat` | Internal team chat thread on the lead |
| Executive Dossier | Inline accordion | `company`, `personal_details`, `private_scratchpad` fields |
| Follow-Up Drafts | 3 accordions | `follow_up_drafts` JSONB `{"1":"...", "2":"...", "3":"..."}` |

**3-Strike Nurture Engine**: When `markAttemptedAndScheduleRetry()` is called and the total `call_attempt` activity count reaches 3, `showNurtureToast = true` is returned to trigger a UI nudge to move the lead to nurturing.

**Disposition Modals**: `StatusActionPanel` renders contextual modals based on target status:
- `lost` → `LostDealModal`: reasons: `Not Interested`, `Price Objection`, `Bought Competitor`, `Other`
- `trash` → `TrashLeadModal`: reasons: `Incorrect Data`, `Not our TG`, `Spam`
- `nurturing` → `NurtureModal`: reasons: `Future Prospect`, `Cold`
- `won` → `WonDealModal`: collects `deal_value` (number) + `deal_duration` (text) → promotes lead to `clients` table

---

### SLA Monitor (`lib/hooks/useSLA_Monitor.ts`)

Real-time client-side SLA breach detection. Polls every **60 seconds**.

**Two rule sets**:

| Mode | Lead Flag | SLA Clock Start | Level 1 | Level 2 | Level 3 |
|---|---|---|---|---|---|
| On-Duty | `is_off_duty = false` | `assigned_at` | 5 min | 10 min | 15 min |
| Off-Duty | `is_off_duty = true` | Next 9:00 AM IST | 60 min | 90 min | 120 min |

**Off-duty anchor logic**: For leads created 18:00–23:59 IST, the anchor is the next day's 9:00 AM IST. For leads created 00:00–08:59 IST, the anchor is the same day's 9:00 AM IST.

**Role behavior**:
- `agent`: sees only their own breached leads (`assigned_to = userId`)
- `admin` / `founder` / `manager`: sees ALL breached leads across all agents (includes `assigned_agent` join for display)

**Breach sort order**: Level 3 first, then 2, then 1; within same level, oldest `assigned_at` first (most urgent).

**SLA alert dismissal**: `dismissSlaAlert(leadId)` sets `leads.sla_alert_dismissed = true`. Once dismissed, the SLA monitor query must exclude these leads — check component filter logic.

---

### Dashboard Layout (`app/(dashboard)/layout.tsx`)

The root authenticated layout wraps all dashboard pages with:

```
TaskReminderProvider
  └── LeadAlertProvider
        └── ChatProvider (currentUserId)
              └── ProfileProvider (profile)
                    └── SLAProvider (profile)
                          └── layout-canvas div
                                ├── Sidebar (profile)
                                └── ml-60 content shell
                                      └── main (bg-[#F9F9F6] rounded-2xl paper-shadow)
                                            └── CommandPaletteProvider
                                                  └── TaskAlertProvider
                                                        └── {children}
```

**Auth gate**: Calls `supabase.auth.getUser()` and fetches `profiles` row. Redirects to `/login` if either is missing.

---

## 7. Helper Functions, Hooks & Utilities

### IST Time Utilities (`lib/services/leadIngestion.ts`)

All time-sensitive operations use `date-fns-tz` with `Asia/Kolkata` (IST = UTC+5:30):

```typescript
const IST = "Asia/Kolkata";

// Get current IST hour
function getCurrentHourIST(): number {
  return getHours(toZonedTime(new Date(), IST));
}

// Get start of today in IST as ISO string (for DB range queries)
function getStartOfTodayIST(): string {
  return startOfDay(toZonedTime(new Date(), IST)).toISOString();
}

// Detect off-duty insertion (18:00 to 08:59 IST)
function isOffDutyInsertion(): boolean {
  const h = getHours(toZonedTime(new Date(), IST));
  return h >= 18 || h < 9;
}
```

**SLA off-duty anchor** (in `useSLA_Monitor.ts`):
```typescript
// For is_off_duty=true leads: SLA clock starts at next 9 AM IST after lead creation
function getOffDutyAnchor(createdAt: string): Date {
  // If created between 18:00–23:59 IST → anchor = next day 09:00 IST
  // If created between 00:00–08:59 IST → anchor = same day 09:00 IST
}
```

---

### Zod Validation Schemas

Key schemas and their locations:

| Schema | Location | Validates |
|---|---|---|
| `leadPayloadSchema` | `lib/services/leadIngestion.ts` | Webhook ingestion payloads; coerces all phone/email to null if blank |
| `sendSchema` | `lib/actions/whatsapp.ts` | `{ leadId: uuid, text: min(1) max(4096) }` |
| `createShopTaskSchema` | `lib/actions/shop-tasks.ts` | Shop task creation; superRefine validates scope+assignee count |
| `registerSaleSchema` | `lib/actions/shop-tasks.ts` | `{ taskId, customerName, customerPhone, dealAmount }` |
| `closeWonDealSchema` | `lib/actions/leads.ts` | `{ leadId, dealValue: positive number, dealDuration: min(1) }` |
| `updateEmailSchema` | `lib/actions/leads.ts` | `{ leadId: uuid, email: email() or '' }` |
| `updateTagsSchema` | `lib/actions/leads.ts` | `{ leadId, tags: string[] max(50) each max(80) }` |
| `scratchpadSchema` | `lib/actions/leads.ts` | `{ leadId, text: max(10000) }` |
| `followUpDraftsSaveSchema` | `lib/actions/leads.ts` | `{ leadId, drafts: {"1":max(5000), "2":max(5000), "3":max(5000)} }` |

---

### Webhook Security (`lib/utils/webhook.ts`)

```typescript
// Timing-safe Bearer token comparison (prevents timing attacks)
function secretsMatch(incoming: string, expected: string): boolean {
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Used by all Pabbly endpoints
verifyPabblyWebhook(request) → checks Authorization: Bearer against PABBLY_WEBHOOK_SECRET

// Used by other internal endpoints
verifyBearerSecret(request, envVarName) → checks against process.env[envVarName]
```

**WhatsApp inbound** uses HMAC-SHA256 signature verification:
```typescript
function verifyMetaSignature(rawBody: string, signatureHeader: string, appSecret: string): boolean {
  // HMAC-SHA256(appSecret, rawBody) compared against X-Hub-Signature-256 header (sha256=<hex>)
  // Uses timingSafeEqual for constant-time comparison
}
```

---

### `useUserDomain` Hook (`lib/hooks/useUserDomain.ts`)

Client-side hook that reads the current user's domain from the ProfileProvider context. Used by the `DomainSwitcher` component and any surface that needs to know the user's business unit without an additional DB fetch.

---

### Route Pages & Navigation Map

```
/                           → Agent Dashboard (getDashboardData: unattained leads + tasks + won)
/leads                      → Leads Table (paginated, filterable by status/domain/source)
/leads/[id]                 → Lead Dossier (full async RSC with WhatsApp + activities)
/tasks                      → Tasks Board
/workspace                  → Agent Workspace (personal todos + scratchpad)
/calendar                   → Smart Calendar
/performance                → Agent Performance stats
/whatsapp                   → Global WhatsApp Hub (master-detail)
/shop/workspace             → Shop War Room (requires indulge_shop domain)
/shop/workspace/tasks/[id]  → Individual shop task detail
/escalations                → SLA Escalation Dashboard
/conversions                → Onboarding conversions tracking
/profile                    → User profile edit
/manager/dashboard          → Manager/Scout dashboard (cross-agent view)
/manager/campaigns          → Campaign management
/scout/dashboard            → Legacy scout dashboard (still routed)
/scout/campaigns            → Campaign analytics
/scout/campaigns/[id]       → Campaign deep-dive
/scout/planner              → Ad Planner Studio
/scout/team                 → Team roster
/scout/roster               → Agent roster management
/admin                      → Admin user management
/admin/shop                 → Admin shop targets management
/admin/shop/workspace       → Admin shop workspace view
/admin/routing              → Lead routing rules editor
/admin/integrations         → Webhook endpoint status
/admin/mappings             → Dynamic field mapping configuration
/admin/onboarding           → Onboarding oversight
/admin/conversions          → Admin conversion records
/admin/marketing            → Marketing analytics
/indulge-world              → Brand/ecosystem page
```

---

### Key TypeScript Constants (`lib/types/database.ts`)

```typescript
// Roles that can mutate data (UI guardrails)
const MUTABLE_ROLES: UserRole[] = ["admin", "founder", "manager", "agent"];

// Roles with cross-domain visibility
const GLOBAL_ROLES: UserRole[] = ["admin", "founder"];

// Lead status logical order for dropdowns
const LEAD_STATUS_ORDER: LeadStatus[] = [
  "new", "attempted", "connected", "in_discussion",
  "won", "nurturing", "lost", "trash"
];

// Task type groupings
const AGENT_TASK_TYPES: TaskType[] = ["call", "general_follow_up", "whatsapp_message", "file_dispatch", "email"];
const MANAGER_TASK_TYPES: TaskType[] = ["campaign_review", "strategy_meeting", "budget_approval", "performance_analysis"];

// @deprecated alias
const SCOUT_TASK_TYPES = MANAGER_TASK_TYPES;
```

---

### Server Action Pattern (All mutations follow this pattern)

```typescript
"use server";

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");
  const { data: profile } = await supabase.from("profiles").select("role, domain").eq("id", user.id).single();
  const role = profile?.role ?? "agent";
  const domain = profile?.domain ?? "indulge_concierge";
  return { supabase, user, role, domain };
}

function isPrivilegedRole(role: string): boolean {
  return role === "admin" || role === "founder" || role === "manager";
}

// Every mutation:
// 1. getAuthUser() - authenticate + fetch role
// 2. Fetch target resource to check ownership
// 3. Ownership check: isPrivilegedRole(role) || resource.assigned_to === user.id
// 4. Mutate
// 5. Log activity (optional)
// 6. revalidatePath(...)
// 7. Return { success: boolean, error?: string }
```

---

### `isPrivilegedRole()` Definition (Server-Side Authorization)

This helper (used in all server actions) considers `admin`, `founder`, and `manager` as privileged. `agent` and `guest` are non-privileged. This determines whether a user can see/mutate resources beyond their own assignment.

---

## 8. Critical Business Rules

1. **Lead assignment is never concurrent**: `pick_next_agent_for_domain()` uses `ORDER BY new_lead_count ASC, created_at ASC / id ASC` — deterministic single-row result. No distributed locking needed due to Postgres's MVCC.

2. **Samson daily cap is 15 new leads** (hardcoded in both the Postgres function and the TypeScript waterfall). This is an explicit business rule — Samson handles quality over quantity during day shift.

3. **Night shift = 20:00–10:59 IST** (hours 20,21,22,23,0,1,...,10). Only Meghana and Amit are eligible.

4. **Day shift = 11:00–19:59 IST** (hours 11–19). Full pool (Samson unless capped, Meghana, Amit, Kaniisha).

5. **Off-duty lead SLA starts at 9 AM IST** the following morning. A lead created at 2 AM IST has until 10 AM IST (Level 1) before it starts breaching.

6. **`lead_activities` rows are IMMUTABLE** — no UPDATE or DELETE policies exist. This is an auditable log; never attempt to modify these rows.

7. **Won deal auto-creates a `clients` row** and triggers `triggerFinanceNotification()` (internal API call to `/api/finance-notify`).

8. **Nurturing auto-creates a task**: Both `markLeadNurturing()` and `updateLeadStatus(..., 'nurturing')` call `createNurturingTask()` which inserts a `general_follow_up` task due 3 months out.

9. **3-Strike nurture suggestion**: After 3 `call_attempt` activity rows are logged for a lead, the UI shows a nurture toast to suggest moving the lead to nurturing status.

10. **Shop task `target_sold` is atomically incremented** via the `increment_shop_task_target_sold()` Postgres function — not via a direct UPDATE — to prevent race conditions when multiple agents register sales concurrently.

11. **WhatsApp 24-hour window**: Outbound messages beyond 24 hours of last customer contact are rejected by Meta. The CRM surfaces a specific error message when this happens.

12. **Domain default is `indulge_concierge`** everywhere — in Zod schemas, Postgres function fallbacks, and TypeScript defaults. Any unrecognized domain value is sanitized to `indulge_concierge`.

---

## 9. Environment Variables Reference

| Variable | Used By | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service clients | Bypasses RLS for webhook ingestion |
| `PABBLY_WEBHOOK_SECRET` | `verifyPabblyWebhook()` | Bearer token for all Pabbly-facing endpoints |
| `WHATSAPP_PHONE_NUMBER_ID` | `sendWhatsAppMessage()` | Meta phone number ID |
| `WHATSAPP_API_TOKEN` | `sendWhatsAppMessage()` | Meta Graph API Bearer token |
| `WHATSAPP_VERIFY_TOKEN` | `GET /api/webhooks/whatsapp` | Meta webhook registration challenge |
| `WHATSAPP_APP_SECRET` | `POST /api/webhooks/whatsapp` | Optional HMAC signature verification |
| `INTERNAL_API_SECRET` | `triggerFinanceNotification()` | Internal microservice auth |
| `NEXT_PUBLIC_APP_URL` | `triggerFinanceNotification()` | Base URL for internal API calls |

---

*End of claude.md — Indulge Atlas System Architecture & Knowledge Base*

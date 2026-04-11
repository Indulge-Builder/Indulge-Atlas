# Indulge Atlas — System Architecture & Knowledge Base

> **Canonical Reference** — Originally generated 2026-04-09; updated 2026-04-11 after Code Red security lockdown (migrations 058–060, per-channel webhook secrets, Sentry observability, and CI/CD hardening).
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
| Phone Parsing | `libphonenumber-js` (E.164 normalization with `IN` country default) |
| HTML Sanitization | `isomorphic-dompurify` (zero-tags policy for all user-facing strings) |
| Styling | Tailwind CSS + shadcn/ui component primitives |
| External APIs | Meta WhatsApp Cloud API (Graph API v19.0), Meta Lead Ads, Google Ads |
| Webhook Orchestration | Pabbly Connect (acts as middleware between ad platforms and the CRM ingestion endpoints) |
| Error Monitoring | Sentry (`@sentry/nextjs`) — server + edge runtimes + `global-error.tsx` UI |
| Test Framework | Vitest + `@vitejs/plugin-react` + `vite-tsconfig-paths` |
| CI/CD | GitHub Actions (lint → test on every push/PR to `main`) |

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

### ⚠️ CRITICAL: Migration 058 — RLS No Longer Trusts JWT `user_metadata`

**Migration `058_rls_authorization_profiles_only.sql` is a security-critical rewrite of all authorization helpers.**

**The vulnerability it closed:** Supabase clients can call `supabase.auth.updateUser({ data: { role: 'admin' } })` to write arbitrary values into `user_metadata`, which is embedded verbatim in the JWT. Any RLS policy or helper function that read `role`/`domain` from the JWT `user_metadata` could be bypassed by any authenticated user who self-promoted their own role.

**The fix:**

| Old Behavior (pre-058) | New Behavior (post-058) |
|---|---|
| `get_user_role()` reads JWT `user_metadata.role` first, falls back to `profiles` | `get_user_role()` reads **only from `public.profiles`** via `auth.uid()` |
| `handle_new_user()` reads role/domain from `raw_user_meta_data` | `handle_new_user()` reads role/domain **only from `raw_app_meta_data`** |

**`app_metadata` vs `user_metadata`:**
- `raw_user_meta_data` — writable by **any authenticated client** (`supabase.auth.updateUser()`). **Never trust for authorization.**
- `raw_app_meta_data` — writable **only by the service role or Supabase Admin API**. Safe to use during server-side user creation.

**Canonical `get_user_role()` post-058:**
```sql
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::TEXT FROM public.profiles WHERE id = auth.uid()),
    'agent'
  );
$$;
```

**Canonical `get_user_domain()` post-058:**
```sql
CREATE OR REPLACE FUNCTION public.get_user_domain()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT domain::TEXT FROM public.profiles WHERE id = auth.uid()),
    'indulge_concierge'
  );
$$;
```

**Canonical `handle_new_user()` post-058:**
```sql
-- Role/domain are read from raw_app_meta_data ONLY.
-- full_name is still read from raw_user_meta_data (safe — not used for authorization).
IF NEW.raw_app_meta_data->>'role' IN ('admin', 'founder', 'manager', 'agent', 'guest') THEN
  v_role := (NEW.raw_app_meta_data->>'role')::public.user_role;
END IF;
```

**Operational consequence:** To assign a role/domain to a new user, the admin must use the Supabase service role (or Admin API) to set `app_metadata`. The signup `options.data` field (which populates `user_metadata`) is ignored for authorization purposes. Sessions created before migration 058 should be force-invalidated if tampering is suspected — all new role checks go directly to the `profiles` table, so stale JWT claims are now irrelevant.

All backward-compatible aliases (`get_my_role()`, `get_my_domain()`, `get_role_from_jwt()`) were updated in the same migration and now delegate to the profile-only implementations.

### The 4 Business Unit Domains (`indulge_domain` enum)

```sql
CREATE TYPE public.indulge_domain AS ENUM (
 'indulge_concierge', -- Primary luxury concierge / onboarding sales arm
 'indulge_shop', -- E-commerce / product sales war room
 'indulge_house', -- Property / lifestyle experiences
 'indulge_legacy' -- Long-term membership & legacy clients
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
 'admin', -- Full system access, all domains, all mutations, user management
 'founder', -- Same as admin for data access; conceptually the business owner
 'manager', -- Full CRUD within own domain; was 'scout' pre-056
 'agent', -- SELECT/INSERT/UPDATE own assigned leads/tasks in own domain; no DELETE
 'guest' -- SELECT only, own domain; no mutations; was 'finance' pre-056
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

### RLS Helper Functions (Post-058 Canonical — Profiles-Only)

All RLS policies call these `SECURITY DEFINER` functions. **Post-058, all JWT claim reads have been removed.** Functions exclusively query `public.profiles`:

```sql
-- Primary: reads ONLY from profiles table via auth.uid()
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS TEXT
 → (SELECT role::TEXT FROM public.profiles WHERE id = auth.uid()) COALESCE 'agent'

CREATE OR REPLACE FUNCTION public.get_user_domain() RETURNS TEXT
 → (SELECT domain::TEXT FROM public.profiles WHERE id = auth.uid()) COALESCE 'indulge_concierge'

-- Backward-compatible aliases (all now point to profiles-only logic):
public.get_my_role() → public.get_user_role()
public.get_my_domain() → public.get_user_domain()
public.get_role_from_jwt() → public.get_user_role()  ← name is now a misnomer; reads profiles
```

**Stale session behavior:** Unlike pre-058, there is no JWT claim fallback. A user with a stale JWT whose `profiles` row has been updated will immediately see the new role/domain on the next RLS evaluation — no session force-refresh required for the correct role to take effect. Conversely, a user whose `profiles` row is deleted will default to `'agent'`/`'indulge_concierge'` via the `COALESCE`.

### Admin Profile Creation Trigger (Post-058)

When a new Supabase auth user is created (`on_auth_user_created` trigger on `auth.users`), `handle_new_user()` SECURITY DEFINER inserts a `profiles` row. **Post-058: role and domain are read exclusively from `raw_app_meta_data`** (service-role writable only). `full_name` is still read from `raw_user_meta_data` (non-privileged, used for display only). Defaults: `role='agent'`, `domain='indulge_concierge'`.

**To create a user with an elevated role**, use the Supabase Admin API or service role client:
```typescript
// Correct (post-058): role goes in app_metadata
await supabase.auth.admin.createUser({
  email: 'manager@indulge.global',
  app_metadata: { role: 'manager', domain: 'indulge_shop' },
  user_metadata: { full_name: 'Display Name' }, // safe — display only
});
```

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
| `phone_number` | `text` | NOT NULL | Primary contact; stored in E.164 format post-ingestion |
| `secondary_phone` | `text` | NULL | Alternate number; also normalized to E.164 |
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
| `form_data` | `jsonb` | NULL | Raw passthrough of ALL unmapped webhook fields (zero data loss); sanitized via `sanitizeFormData()` |
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

**Key Indexes on `public.leads`** (as of migration 059):

| Index Name | Columns | Filter | Purpose |
|---|---|---|---|
| `leads_assigned_status_idx` | `(assigned_to, status)` | `WHERE assigned_to IS NOT NULL` | Agent dashboard queries |
| `leads_utm_campaign_idx` | `(utm_campaign)` | `WHERE utm_campaign IS NOT NULL` | Campaign metrics join |
| `leads_domain_status_created_idx` | `(domain, status, created_at DESC)` | — | Manager dashboards; filter by domain + status, order by recency |
| `leads_phone_number_idx` | `(phone_number)` | — | WhatsApp inbound: E.164 phone lookup variants |
| `leads_new_status_created_idx` | `(created_at DESC)` | `WHERE status = 'new'` | SLA monitor: new uncontacted leads ordered by creation |

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

Shop tasks always use `task_type = 'whatsapp_message'` with `shop_operation_scope` as the real differentiator.

**Key Indexes on `public.tasks`** (as of migration 059):

| Index Name | Columns | Filter | Purpose |
|---|---|---|---|
| `tasks_assigned_users_pending_idx` | GIN `(assigned_to_users)` | `WHERE status = 'pending'` | Agent task boards: pending tasks by assignee array membership |

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

**Key Indexes on `public.lead_activities`** (as of migration 059):

| Index Name | Columns | Purpose |
|---|---|---|
| `lead_activities_lead_created_idx` | `(lead_id, created_at DESC)` | Dossier timeline: activities per lead, newest first |

**Note on dual columns**: Migration 048 made `performed_by` and `type` nullable for backward compatibility. New inserts write both old (`performed_by`/`type`/`payload`) and new (`actor_id`/`action_type`/`details`) fields simultaneously.

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
Indulge Shop order lifecycle rows.

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
Agent log entries for master target progress.

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
| `content` | `text` | Message body; sanitized via `sanitizeText()` before INSERT |
| `status` | `text` | `sent` / `delivered` / `read` / `failed` |
| `wa_message_id` | `text` | NULL; Meta's message ID — used for deduplication on inbound webhook |
| `created_at` | `timestamptz` | |

**Index**: `whatsapp_messages_lead_id_created_at_idx` on `(lead_id, created_at ASC)` — optimizes thread rendering.

---

#### `public.webhook_logs`
Raw inbound payload logging. Every webhook POST is asynchronously logged here for debugging and replay.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `source` | `text` | `meta` / `google` / `website` / `whatsapp` |
| `raw_payload` | `jsonb` | Complete unmodified body |
| `created_at` | `timestamptz` | |

**Key Indexes on `public.webhook_logs`** (as of migration 059):

| Index Name | Columns | Purpose |
|---|---|---|
| `webhook_logs_created_idx` | `(created_at DESC)` | Webhook log hygiene / debugging by time |

---

#### `public.lead_routing_rules`
Admin/manager-defined ordered routing rules.

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
System table for tracking which SLA alerts have been sent per lead. Added migration 030.

---

### Database Views (Post-Migration 060)

#### `public.vw_latest_whatsapp_threads`

```sql
CREATE OR REPLACE VIEW public.vw_latest_whatsapp_threads AS
SELECT DISTINCT ON (lead_id) *
FROM public.whatsapp_messages
ORDER BY lead_id, created_at DESC;
```

**Purpose**: Returns one row per lead — the most recent `whatsapp_messages` row for each lead. Replaces the in-memory JavaScript deduplication that the Global WhatsApp Hub previously performed (which required loading up to 500 rows and deduplicating in a `Map`). This is a pure SQL O(log n) operation using the existing `whatsapp_messages_lead_id_created_at_idx` index.

**Permissions**: `GRANT SELECT` to both `authenticated` and `service_role`.

**Usage**: The `getRecentWhatsAppConversations()` query should target this view instead of raw `whatsapp_messages` when building the hub conversation list.

---

### Key Database Functions (PostgreSQL)

| Function | Signature | Purpose |
|---|---|---|
| `get_user_role()` | `() → TEXT` | **Post-058**: profiles-only role resolver; SECURITY DEFINER; no JWT read |
| `get_user_domain()` | `() → TEXT` | **Post-058**: profiles-only domain resolver; SECURITY DEFINER; no JWT read |
| `get_my_role()` | `() → TEXT` | Alias for `get_user_role()` |
| `get_my_domain()` | `() → TEXT` | Alias for `get_user_domain()` |
| `get_role_from_jwt()` | `() → TEXT` | Alias for `get_user_role()` (name is now a misnomer; no JWT read) |
| `pick_next_agent_for_domain(p_domain TEXT)` | `→ UUID` | **Post-060**: Domain-aware round-robin with `pg_advisory_xact_lock` for burst-safe serialization; cap of 15 new leads; skips `is_on_leave=true` |
| `get_field_mappings_for_channel(p_channel TEXT)` | `→ TABLE` | Returns active mappings for `meta`/`google`/`website`; used by ingestion engine |
| `increment_shop_task_target_sold(p_task_id UUID)` | `→ INT` | Atomic `target_sold + 1` with auth check |
| `shop_target_updates_inc_inventory()` | trigger function | Increments `shop_master_targets.inventory_sold` on `shop_target_updates` INSERT |
| `assign_next_agent()` | `() → UUID` | Legacy global round-robin (no domain filter); superseded |
| `pick_next_agent_capped()` | `() → UUID` | Cap-aware version without domain filter; transitional |
| `update_modified_column()` | trigger function | Sets `updated_at = now()` before UPDATE on all tables |
| `handle_new_user()` | trigger function | **Post-058**: Auto-creates `profiles` row; reads role/domain ONLY from `raw_app_meta_data`; SECURITY DEFINER |

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
 Authorization: Bearer <PER_CHANNEL_SECRET>
 ↓
 Rate Limiting (Upstash — 100 req/min sliding window per IP)
 ↓
 Webhook Log (fire-and-forget async INSERT to webhook_logs)
 ↓
 Dynamic Field Mapping Engine
 ↓
 Lead Routing Engine
 ↓
 Data Sanitization Pipeline (HTML strip → depth cap → 10 KB limit)
 ↓
 Phone Normalization (libphonenumber-js E.164)
 ↓
 processAndInsertLead()
 ↓
 public.leads INSERT + lead_activities INSERT
```

### Per-Channel Pabbly Secrets (Post-Hardening)

**Previously**, all Pabbly-facing lead endpoints used a single shared `PABBLY_WEBHOOK_SECRET`. This was replaced with **per-channel secrets** to allow independent rotation and to prevent a compromised Meta secret from also authenticating Google or website payloads.

| Endpoint | Environment Variable | Helper Called |
|---|---|---|
| `POST /api/webhooks/leads/meta` | `PABBLY_META_SECRET` | `verifyBearerSecret(request, 'PABBLY_META_SECRET')` |
| `POST /api/webhooks/leads/google` | `PABBLY_GOOGLE_SECRET` | `verifyBearerSecret(request, 'PABBLY_GOOGLE_SECRET')` |
| `POST /api/webhooks/leads/website` | `PABBLY_WEBSITE_SECRET` | `verifyBearerSecret(request, 'PABBLY_WEBSITE_SECRET')` |
| `POST /api/webhooks/ads` | `PABBLY_WEBHOOK_SECRET` | (inline `secretsMatch`; legacy shared secret retained for campaign metrics) |

All comparisons use `timingSafeEqual` from Node `crypto` to prevent timing-based token inference. The `verifyBearerSecret(request, envVarName)` helper in `lib/utils/webhook.ts` returns `NextResponse | null` — `null` means authorized; a `NextResponse` with status `401` is returned immediately to the caller.

**Authentication**: Endpoints return `401` on:
- Missing `Authorization` header
- Header present but not prefixed with `Bearer `
- Token present but doesn't match the expected secret
- Environment variable for the expected secret is not set

### Rate Limiting

All webhook POST endpoints (leads + WhatsApp) call `checkWebhookRateLimit(request)` from `lib/utils/rateLimit.ts` before any auth check. Uses **Upstash Redis sliding window: 100 requests per minute per IP**.

**Fail-closed behavior**: If `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` env vars are missing, the function returns `{ success: false }`, which causes the endpoint to respond `429` and block the request. This is intentional — missing rate-limit configuration is treated as a misconfiguration that should be visible rather than silently bypassed.

IP extraction priority: `X-Forwarded-For` (first hop) → `X-Real-IP` → `'unknown-ip'`.

### Dynamic Field Mapping Engine (`lib/services/fieldMappingEngine.ts`)

**Purpose**: Allows managers to visually map incoming JSON keys from any Pabbly channel to Supabase `leads` table columns — zero code changes required.

**Execution Flow**:

1. **Channel lookup**: Calls `get_field_mappings_for_channel(p_channel)` RPC via service role. Returns all active `field_mappings` rows for the channel, ordered by `created_at ASC`.

2. **Key resolution**: Supports **dot-notation** paths (e.g., `payload.phone_number`) via `getNestedValue()`.

3. **Transformation**: Each mapping row can specify a `transformation_rule`:
 - `lowercase` → `value.toLowerCase()`
 - `uppercase` → `value.toUpperCase()`
 - `trim` → `value.trim()`
 - `extract_numbers` → `value.replace(/\D/g, '')`
 - `capitalize` → first char uppercase, rest lowercase
 - `null` → passthrough (no transformation)
 - Rule matching is **case-insensitive** (input is lowercased before switch)

4. **Fallback**: If the incoming value is `null` or empty, `fallback_value` is used (if set).

5. **Unmapped keys → `form_data`**: Any top-level incoming key that has NO mapping row is collected into `unmappedFormData`. This JSONB object is stored in `leads.form_data` — **zero data loss guarantee**.

6. **Return contract**:
 ```typescript
 {
   hasMappings: boolean, // false → no rows configured, use hardcoded fallback
   mappedFields: Record<string, unknown>, // ready for DB insert
   unmappedFormData: Record<string, unknown> // goes into leads.form_data
 }
 ```

7. **Fail-open**: When `hasMappings = false` or RPC errors, the engine returns `{ hasMappings: false, mappedFields: {}, unmappedFormData: {} }` without throwing. Adapters fall through to hardcoded parsing.

8. **Engine indicator**: When the dynamic engine is used, the response body includes `_engine: 'dynamic'` for debugging.

### Dynamic Lead Routing Engine (`lib/services/evaluateRoutingRules.ts`)

**Pure function** — no database I/O. Takes `LeadRoutingRule[]` (pre-fetched) and the merged lead payload; returns the first matching rule's action or `null`.

**Condition Fields**: `utm_campaign`, `utm_source`, `utm_medium`, `domain`, `source` (falls back to `utm_source` if raw source is blank).

**Operators**: `equals`, `contains`, `starts_with` — all case-insensitive, trimmed comparison.

**Priority ordering**: Rules are re-sorted by `priority ASC` inside the function (even if caller doesn't). First match wins.

**Action types**:
- `assign_to_agent`: Returns `{ action_type, action_target_uuid }` — agent UUID is set directly
- `route_to_domain_pool`: Returns `{ action_type, action_target_domain }` — overrides working domain for subsequent waterfall

**Guards**: A matching `assign_to_agent` rule with a null `action_target_uuid` is **skipped**; the engine continues to the next rule. Same for `route_to_domain_pool` with a blank/empty `action_target_domain`.

### Full `resolveAssignedAgent()` Waterfall (`lib/services/leadIngestion.ts`)

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
 │ └── Pool: [meghana, amit]
 │ └── pickNextAgentForDomain(workingDomain, [meghana_id, amit_id])
 │
 └── DAY SHIFT (11:00–19:59 IST):
 ├── Check Samson's today lead count:
 │ SELECT count(*) FROM leads WHERE assigned_to = samson_id AND created_at >= startOfTodayIST
 ├── If Samson count < 15: Pool = [samson, meghana, amit, kaniisha]
 └── If Samson count >= 15 (AT CAP): Pool = [meghana, amit, kaniisha]
 └── pickNextAgentForDomain(workingDomain, pool)

Final fallback: pickNextAgentForDomain(workingDomain, null)
 → Uses Postgres function pick_next_agent_for_domain() [post-060: advisory lock acquired first]
 → Round-robin by lowest new_lead_count, skips is_on_leave=true agents
 → Returns NULL if no eligible agents → lead inserted as unassigned
```

**Agent pool emails** (hardcoded in `leadIngestion.ts`):
- `meghana@indulge.global`
- `amit@indulge.global`
- `samson@indulge.global` (daily cap = 15 new leads in day shift)
- `kaniisha@indulge.global`

UUIDs are resolved at startup and cached for the process lifetime (`cachedAgentIds`).

**`is_off_duty` flag**: Set to `true` when `isOffDutyInsertion()` detects current IST hour is `>= 18` or `< 9`.

### Data Sanitization Pipeline (`lib/utils/sanitize.ts`)

All text fields from external webhook sources are passed through a two-layer sanitization pipeline before being written to the database:

#### Layer 1: `sanitizeText(input: string): string`

Uses `isomorphic-dompurify` with a zero-tags policy:
```typescript
DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
```
- Strips all HTML tags (`<script>`, `<b>`, `<img>`, etc.)
- Strips all HTML attributes
- Preserves plain text content
- Safe for both server (Node.js) and client via `isomorphic-dompurify`'s environment detection

Applied to all `string` fields in the ingestion pipeline via `sanitizePayloadStringFields()`, which iterates over `PAYLOAD_TEXT_KEYS` in `leadIngestion.ts`.

#### Layer 2: `sanitizeFormData(json: Record<string, unknown>): Record<string, unknown>`

Protects the `leads.form_data` JSONB column from oversized or malicious payloads:

1. **Recursive sanitization**: Traverses all leaves; `string` leaves are passed through `sanitizeText()`; `number` and `boolean` values pass through unchanged; `bigint` values are serialized to string; `function` and `symbol` values become `null`.

2. **Depth capping at 2 levels**: Objects nested deeper than `MAX_NEST_DEPTH = 2` are replaced with `null` (objects) or `[]` (arrays). This prevents arbitrarily deep payloads from bloating the DB.

3. **10 KB size limit**: After sanitization, the output is serialized to JSON and its UTF-8 byte length is measured. If it exceeds `MAX_FORM_JSON_BYTES = 10 * 1024` (10,240 bytes), the entire payload is replaced with:
 ```json
 { "_truncated": true, "_max_bytes": 10240, "excerpt": "<first 8000 chars of sanitized serialization>" }
 ```

4. **Error safety**: Any `JSON.stringify` failure returns `{ "_sanitize_error": true, "_reason": "stringify_failed" }`.

**Fields sanitized via `sanitizeText` in `PAYLOAD_TEXT_KEYS`:**
`first_name`, `last_name`, `full_name`, `email`, `city`, `address`, `secondary_phone`, `campaign_name`, `ad_name`, `platform`, `source`, `utm_source`, `utm_medium`, `utm_campaign`, `message`, `notes`, `personal_details`, `company`.

### Phone Normalization Pipeline (`lib/utils/phone.ts`)

All `phone_number` and `secondary_phone` values are normalized before insertion using `libphonenumber-js`.

#### `normalizeToE164(phone: string, defaultCountry: CountryCode = 'IN'): string`

**Normalization logic:**
1. Trim the input. Return `''` immediately if blank.
2. Attempt `parsePhoneNumberFromString(trimmed, defaultCountry)` via `libphonenumber-js`.
3. If parsed successfully and `parsed.isValid()` → return `parsed.format('E.164')` (e.g., `+919876543210`).
4. **Fallback** (parse failure or invalid): Strip all non-digits → if result is empty, return `''`; otherwise return `'+91' + digits` (conservative India prefix for inbound webhooks).

**Examples**:
- `'9876543210'` → `'+919876543210'` (valid IN mobile)
- `'+91 98765 43210'` → `'+919876543210'` (spaces normalized)
- `'hello world'` → `''` (no digits)
- `''` → `''`

#### `e164LookupVariants(e164: string): string[]`

Generates all storage variants of an E.164 string to match legacy `leads.phone_number` rows that may have been stored without the `+` prefix, as bare digits, or with a `00` country prefix:

For `+919876543210`: returns `['919876543210', '+919876543210', '9876543210']`
For `009198...`: additionally returns the form without the `00` prefix and the `+` prefixed form.

Used by the WhatsApp inbound webhook to perform a multi-variant `IN` query on `leads.phone_number` (the `leads_phone_number_idx` index from migration 059 makes this efficient).

---

## 5. Communications Engine: Meta WhatsApp Cloud API

### Environment Variables Required

| Variable | Purpose |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number ID for outbound messages |
| `WHATSAPP_API_TOKEN` | Meta Graph API Bearer token |
| `WHATSAPP_VERIFY_TOKEN` | Must match Meta dashboard "Verify token" for GET challenge |
| `WHATSAPP_APP_SECRET` | **Mandatory** post-hardening; POST body validated via `X-Hub-Signature-256` |

### ⚠️ HMAC Enforcement — `WHATSAPP_APP_SECRET` Is Now Required

**Post-hardening, `WHATSAPP_APP_SECRET` is no longer optional.** If the environment variable is not set or is blank, the `POST /api/webhooks/whatsapp` handler immediately returns `500 { error: 'Server misconfiguration' }` and refuses to process any message.

```typescript
// In app/api/webhooks/whatsapp/route.ts
const appSecret = process.env.WHATSAPP_APP_SECRET;
if (!appSecret?.trim()) {
  return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
}
```

**HMAC-SHA256 validation flow:**
1. Read the raw request body as text (before any JSON parsing) to preserve byte-exact content for signature verification.
2. Extract `X-Hub-Signature-256` header. If missing, return `401`.
3. Compute `HMAC-SHA256(appSecret, rawBody)` and compare to the received hex (after stripping the `sha256=` prefix) using `timingSafeEqual` from Node `crypto`.
4. If signature is invalid, return `401`.
5. Only then parse the body as JSON. On parse failure, return `400`.
6. Return `200 { received: true }` immediately (Meta requires fast acknowledgment).
7. Use Next.js `after()` to process the payload asynchronously after the response is sent.

**`verifyMetaSignature` implementation:**
```typescript
function verifyMetaSignature(rawBody, signatureHeader, appSecret): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expectedHex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const receivedHex = signatureHeader.slice(7);
  const a = Buffer.from(receivedHex, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

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

### Inbound Flow (WhatsApp lead → CRM)

**Entry point**: `POST /api/webhooks/whatsapp` — `app/api/webhooks/whatsapp/route.ts`

```
1. Rate limit check (Upstash — returns 429 if exceeded)
2. WHATSAPP_APP_SECRET presence check — 500 if missing
3. Read raw body as text (for HMAC signature verification)
4. Extract X-Hub-Signature-256 header → 401 if missing
5. verifyMetaSignature(rawBody, sig, appSecret) → 401 if invalid
6. Parse JSON → 400 on failure
7. Return 200 { received: true } immediately
8. after() → handleWhatsAppWebhookPayload(payload)

ASYNC PROCESSING per message:
 - Extract all messages from entry[].changes[].value.messages[]
 - For each message:
 a. Deduplicate: check if wa_message_id already in whatsapp_messages → skip if found
 b. Extract body text (handles type: text|button|interactive|image|video|document)
 c. Normalize sender's wa_id via normalizeWaIdToDigits()
 d. Build E.164 via normalizeToE164(waIdRaw, 'IN') + e164LookupVariants()
 e. Phone lookup: SELECT id FROM leads WHERE phone_number IN [...variants] LIMIT 2

 IF lead found:
 → sanitizeText(bodyText)
 → INSERT whatsapp_messages: { lead_id, direction:'inbound', content:sanitized, status:'delivered', wa_message_id }

 IF lead NOT found:
 → processAndInsertLead() to create new lead
 → INSERT whatsapp_messages against new lead_id
```

**GET verification**: Handles `hub.mode=subscribe` + `hub.verify_token` + `hub.challenge` — responds with `hub.challenge` as plain text for Meta webhook registration.

### Global WhatsApp Hub (`/whatsapp`)

**Server component**: `app/(dashboard)/whatsapp/page.tsx`

Calls `getRecentWhatsAppConversations()`. The hub conversation list should target `public.vw_latest_whatsapp_threads` (added in migration 060) which provides the latest message per lead as a Postgres `DISTINCT ON` view, eliminating the need for in-memory JS deduplication of up to 500 rows.

**Client component**: `WhatsAppHubClient` — master-detail layout:
- Left panel (`400px` fixed): scrollable conversation list sorted by latest message timestamp
- Right panel (flex-1): full chat thread for selected lead, rendered by `WhatsAppChatModule`

---

## 6. Workspaces & Workflows

### The Shop Workspace (`/shop/workspace`)

**Access gate**: `requireShopWorkspaceAccess()` — checks user is in `indulge_shop` domain OR has `admin`/`founder` role. Redirects to `/` if unauthorized.

**Access helper**: `canAccessShopSurfaces(profile)` in `lib/shop/access.ts` — returns `true` if `domain === 'indulge_shop'` OR role in `['admin', 'founder', 'manager']`.

#### Shop Task Structure

Shop tasks live in the existing `tasks` table with `shop_operation_scope` set (either `'individual'` or `'group'`). Distinguished from CRM lead tasks by:
- `lead_id = null`
- `shop_operation_scope IS NOT NULL`
- `shop_task_priority` set
- `task_type = 'whatsapp_message'`

**Creating a Shop Task** (`createShopTask` server action):
- Individual: exactly 1 assignee
- Group: at least 2 assignees
- Optional inventory target: `target_inventory` (units) + `shop_product_name`
- Priority: `super_high` / `high` / `normal`

**Register Sale flow** (`registerTaskSale` server action):
1. Validate assignee OR elevated role
2. `INSERT shop_orders` with `task_id`, `customer_name`, `customer_phone`, `amount`, `product_name`
3. Call `increment_shop_task_target_sold(task_id)` RPC → atomically increments `tasks.target_sold`
4. Append to `tasks.progress_updates` JSONB array
5. `revalidatePath('/shop/workspace')`

---

### The Lead Dossier (`/leads/[id]`)

Multi-panel RSC page with Suspense-driven async sections:

| Section | Component | Data Source |
|---|---|---|
| Lead Journey Bar | `LeadJourneyBar` | `lead_activities` filtered into timeline stages |
| Status Action Panel | `StatusActionPanel` | Server Action driven; 8-stage transitions |
| Lead Info Cards | Inline in page | `leads` row fields |
| Task Widget | `LeadTaskWidget` | `tasks` WHERE `lead_id = X` |
| WhatsApp Chat Module | `WhatsAppChatModule` | `whatsapp_messages` WHERE `lead_id = X` |
| Activity Timeline | `ActivityTimeline` | `lead_activities` reverse-chronological |
| Context Chat | `LeadContextChat` | Internal team chat thread on the lead |
| Executive Dossier | Inline accordion | `company`, `personal_details`, `private_scratchpad` |
| Follow-Up Drafts | 3 accordions | `follow_up_drafts` JSONB |

**3-Strike Nurture Engine**: After 3 `call_attempt` activity rows are logged, `showNurtureToast = true` is returned to suggest nurturing.

**Disposition Modals**:
- `lost` → `LostDealModal`
- `trash` → `TrashLeadModal`
- `nurturing` → `NurtureModal`
- `won` → `WonDealModal`: collects `deal_value` + `deal_duration` → promotes lead to `clients` table

---

### SLA Monitor (`lib/hooks/useSLA_Monitor.ts`)

Real-time client-side SLA breach detection. Polls every **60 seconds**.

| Mode | Lead Flag | SLA Clock Start | Level 1 | Level 2 | Level 3 |
|---|---|---|---|---|---|
| On-Duty | `is_off_duty = false` | `assigned_at` | 5 min | 10 min | 15 min |
| Off-Duty | `is_off_duty = true` | Next 9:00 AM IST | 60 min | 90 min | 120 min |

**Off-duty anchor logic**: For leads created 18:00–23:59 IST → anchor is next day 09:00 IST. For leads created 00:00–08:59 IST → anchor is same day 09:00 IST.

**`computeBreachLevel(assignedAt, createdAt, isOffDuty)`** is an exported pure function — testable without mocking React state.

**Role behavior**:
- `agent`: sees only their own breached leads
- `admin` / `founder` / `manager`: sees ALL breached leads across all agents

**Breach sort order**: Level 3 first, then 2, then 1; within same level, oldest `assigned_at` first.

---

### Dashboard Layout (`app/(dashboard)/layout.tsx`)

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

function getCurrentHourIST(): number {
  return getHours(toZonedTime(new Date(), IST));
}

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

| Schema | Location | Validates |
|---|---|---|
| `leadPayloadSchema` | `lib/services/leadIngestion.ts` | Webhook ingestion payloads; coerces all phone/email to null if blank |
| `sendSchema` | `lib/actions/whatsapp.ts` | `{ leadId: uuid, text: min(1) max(4096) }` |
| `createShopTaskSchema` | `lib/actions/shop-tasks.ts` | Shop task creation; superRefine validates scope+assignee count |
| `registerSaleSchema` | `lib/actions/shop-tasks.ts` | `{ taskId, customerName, customerPhone, dealAmount }` |
| `closeWonDealSchema` | `lib/actions/leads.ts` | `{ leadId: uuid, dealValue: positive number, dealDuration: min(1) }` |
| `updateEmailSchema` | `lib/actions/leads.ts` | `{ leadId: uuid, email: email() or '' }` |
| `updateTagsSchema` | `lib/actions/leads.ts` | `{ leadId, tags: string[] max(50) each max(80) }` |
| `scratchpadSchema` | `lib/actions/leads.ts` | `{ leadId, text: max(10000) }` |
| `followUpDraftsSaveSchema` | `lib/actions/leads.ts` | `{ leadId, drafts: {"1":max(5000), "2":max(5000), "3":max(5000)} }` |
| `adsPayloadSchema` | `app/api/webhooks/ads/route.ts` | Array or single campaign metrics object from Pabbly; upserted to `campaign_metrics` |

---

### Webhook Security (`lib/utils/webhook.ts`)

```typescript
// Timing-safe Bearer token comparison (prevents timing attacks)
function secretsMatch(incoming: string, expected: string): boolean {
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Legacy: checks against PABBLY_WEBHOOK_SECRET (still used by /api/webhooks/ads)
verifyPabblyWebhook(request) → null | NextResponse(401)

// Per-channel: checks against process.env[envVarName]
// Used by: PABBLY_META_SECRET, PABBLY_GOOGLE_SECRET, PABBLY_WEBSITE_SECRET
verifyBearerSecret(request, envVarName) → null | NextResponse(401)
```

---

### `useUserDomain` Hook (`lib/hooks/useUserDomain.ts`)

Client-side hook that reads the current user's domain from the ProfileProvider context.

---

### Route Pages & Navigation Map

```
/ → Agent Dashboard (getDashboardData: unattained leads + tasks + won)
/leads → Leads Table (paginated, filterable by status/domain/source)
/leads/[id] → Lead Dossier (full async RSC with WhatsApp + activities)
/tasks → Tasks Board
/workspace → Agent Workspace (personal todos + scratchpad)
/calendar → Smart Calendar
/performance → Agent Performance stats
/whatsapp → Global WhatsApp Hub (master-detail)
/shop/workspace → Shop War Room (requires indulge_shop domain)
/shop/workspace/tasks/[id] → Individual shop task detail
/escalations → SLA Escalation Dashboard
/conversions → Onboarding conversions tracking
/profile → User profile edit
/manager/dashboard → Manager/Scout dashboard (cross-agent view)
/manager/campaigns → Campaign management
/scout/dashboard → Legacy scout dashboard (still routed)
/scout/campaigns → Campaign analytics
/scout/campaigns/[id] → Campaign deep-dive
/scout/planner → Ad Planner Studio
/scout/team → Team roster
/scout/roster → Agent roster management
/admin → Admin user management
/admin/shop → Admin shop targets management
/admin/shop/workspace → Admin shop workspace view
/admin/routing → Lead routing rules editor
/admin/integrations → Webhook endpoint status
/admin/mappings → Dynamic field mapping configuration
/admin/onboarding → Onboarding oversight
/admin/conversions → Admin conversion records
/admin/marketing → Marketing analytics
/indulge-world → Brand/ecosystem page
```

---

### Key TypeScript Constants (`lib/types/database.ts`)

```typescript
const MUTABLE_ROLES: UserRole[] = ["admin", "founder", "manager", "agent"];
const GLOBAL_ROLES: UserRole[] = ["admin", "founder"];
const LEAD_STATUS_ORDER: LeadStatus[] = [
 "new", "attempted", "connected", "in_discussion",
 "won", "nurturing", "lost", "trash"
];
const AGENT_TASK_TYPES: TaskType[] = ["call", "general_follow_up", "whatsapp_message", "file_dispatch", "email"];
const MANAGER_TASK_TYPES: TaskType[] = ["campaign_review", "strategy_meeting", "budget_approval", "performance_analysis"];
// @deprecated alias
const SCOUT_TASK_TYPES = MANAGER_TASK_TYPES;
```

---

### Server Action Pattern

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
// 1. getAuthUser() - authenticate + fetch role from profiles
// 2. Fetch target resource to check ownership
// 3. Ownership check: isPrivilegedRole(role) || resource.assigned_to === user.id
// 4. Mutate
// 5. Log activity (optional)
// 6. revalidatePath(...)
// 7. Return { success: boolean, error?: string }
```

---

## 8. Critical Business Rules

1. **Lead assignment is never concurrent** (post-060): `pick_next_agent_for_domain()` acquires `pg_advisory_xact_lock(hashtext('agent_assignment_' || domain))` before the SELECT. This serializes all concurrent calls for the same domain within a single Postgres transaction. See Section 11 for full details.

2. **Samson daily cap is 15 new leads** (hardcoded in both the Postgres function and the TypeScript waterfall). This is an explicit business rule — Samson handles quality over quantity during day shift.

3. **Night shift = 20:00–10:59 IST** (hours 20,21,22,23,0,1,...,10). Only Meghana and Amit are eligible.

4. **Day shift = 11:00–19:59 IST** (hours 11–19). Full pool (Samson unless capped, Meghana, Amit, Kaniisha).

5. **Off-duty lead SLA starts at 9 AM IST** the following morning. A lead created at 2 AM IST has until 10 AM IST (Level 1) before it starts breaching.

6. **`lead_activities` rows are IMMUTABLE** — no UPDATE or DELETE policies exist. Never attempt to modify these rows.

7. **Won deal auto-creates a `clients` row** and triggers `triggerFinanceNotification()` (internal API call to `/api/finance-notify`).

8. **Nurturing auto-creates a task**: Both `markLeadNurturing()` and `updateLeadStatus(..., 'nurturing')` call `createNurturingTask()` which inserts a `general_follow_up` task due 3 months out.

9. **3-Strike nurture suggestion**: After 3 `call_attempt` activity rows are logged, the UI shows a nurture toast.

10. **Shop task `target_sold` is atomically incremented** via `increment_shop_task_target_sold()` Postgres function.

11. **WhatsApp 24-hour window**: Outbound messages beyond 24 hours of last customer contact are rejected by Meta. The CRM surfaces a specific error message.

12. **Domain default is `indulge_concierge`** everywhere.

13. **RLS authorization uses only `public.profiles`** (post-058). JWT `user_metadata` claims are never used for authorization. Role/domain for new users must be set in `app_metadata` via service role.

14. **`WHATSAPP_APP_SECRET` is mandatory** (post-hardening). The WhatsApp webhook refuses all inbound POST requests if this env var is missing.

15. **Per-channel webhook secrets**: Each lead ingestion channel (`meta`, `google`, `website`) has its own Bearer token env var. Compromise of one does not affect others.

---

## 9. Environment Variables Reference

| Variable | Used By | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service clients | Bypasses RLS for webhook ingestion |
| `PABBLY_WEBHOOK_SECRET` | `verifyPabblyWebhook()`, `/api/webhooks/ads` | Legacy shared secret for campaign metrics endpoint |
| `PABBLY_META_SECRET` | `POST /api/webhooks/leads/meta` | **Per-channel** Bearer token for Meta Lead Ads ingestion |
| `PABBLY_GOOGLE_SECRET` | `POST /api/webhooks/leads/google` | **Per-channel** Bearer token for Google Ads ingestion |
| `PABBLY_WEBSITE_SECRET` | `POST /api/webhooks/leads/website` | **Per-channel** Bearer token for website form ingestion |
| `WHATSAPP_PHONE_NUMBER_ID` | `sendWhatsAppMessage()` | Meta phone number ID |
| `WHATSAPP_API_TOKEN` | `sendWhatsAppMessage()` | Meta Graph API Bearer token |
| `WHATSAPP_VERIFY_TOKEN` | `GET /api/webhooks/whatsapp` | Meta webhook registration challenge |
| `WHATSAPP_APP_SECRET` | `POST /api/webhooks/whatsapp` | **Mandatory** HMAC-SHA256 signature verification |
| `INTERNAL_API_SECRET` | `triggerFinanceNotification()` | Internal microservice auth |
| `NEXT_PUBLIC_APP_URL` | `triggerFinanceNotification()` | Base URL for internal API calls |
| `UPSTASH_REDIS_REST_URL` | `checkWebhookRateLimit()` | Upstash Redis URL for sliding-window rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | `checkWebhookRateLimit()` | Upstash Redis token |
| `SENTRY_DSN` / (hardcoded in config) | `sentry.server.config.ts`, `sentry.edge.config.ts` | Sentry error ingestion endpoint |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side Sentry | Public DSN for browser error capture |

---

## 10. CI/CD & Observability

### GitHub Actions — Continuous Integration

**File**: `.github/workflows/ci.yml`

Every `push` or `pull_request` targeting the `main` branch triggers the `CI / Lint & Test` job on `ubuntu-latest` with Node.js 20:

```
Step 1: actions/checkout@v4       — checkout code
Step 2: actions/setup-node@v4     — Node 20 with npm cache
Step 3: npm ci                    — clean install from lockfile
Step 4: npm run lint               — ESLint (eslint.config.mjs)
Step 5: npx vitest run             — full test suite (no watch mode)
```

**Branch protection**: PRs to `main` must pass this workflow before merge. No bypasses. Lint failures and test failures both block the pipeline.

### Vitest Configuration

**File**: `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "node",    // Node.js environment (not jsdom)
    globals: true,          // describe/it/expect available without import
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
  },
});
```

**Key choices:**
- `environment: "node"` — tests run in Node.js, not jsdom. Pure function tests, service logic, and webhook handler tests don't require a browser environment.
- `tsconfigPaths` plugin — resolves `@/` path aliases identically to the Next.js build, so test files can import `@/lib/utils/phone` without modification.
- `globals: true` — no need to import `describe`, `it`, `expect` in each test file.
- Test files live in `__tests__/` and must end in `.test.ts` or `.test.tsx`.

### Testing Protocol — `TESTING_MASTER_PLAN.md`

**File**: `TESTING_MASTER_PLAN.md` (project root)

A 728-line, 263-test-case specification document organized into 4 tiers:

| Tier | Scope | Count |
|---|---|---|
| 1 — Core Business Logic | Pure unit tests: routing rules, SLA math, transformations, phone normalization, sanitization, webhook auth helpers, WhatsApp payload parsing | 100 |
| 2 — Security & RLS | DB integration tests verifying the permission matrix for all 5 roles across all core tables; `get_user_role()` fallback behavior; `pick_next_agent_for_domain()` cap and leave logic | 54 |
| 3 — Data Front Door | HTTP integration tests for all webhook endpoints: authentication, rate limiting, payload parsing, field mapping engine, HMAC verification | 49 |
| 4 — Server Actions & E2E | Full lead lifecycle (new → won → client promotion), 3-strike nurture, Shop War Room atomic increments, `sendWhatsAppMessage` | 60 |

The plan also documents **calls-to-action** for functions that must be exported before they can be unit tested:
- `applyTransformation` / `getNestedValue` in `fieldMappingEngine.ts`
- `splitFullName` / `isOffDutyInsertion` in `leadIngestion.ts`
- WhatsApp route helpers (`verifyMetaSignature`, `extractMessageBody`, `extractIncomingChats`) should be extracted to `lib/utils/whatsapp-helpers.ts`

### Sentry Observability — Flight Recorder

Sentry is initialized in three distinct runtime contexts:

#### Server Runtime (`sentry.server.config.ts`)
```typescript
Sentry.init({
  dsn: "https://21bcc878e1d4ab5e62c17c15ece47c95@o4511191483285504.ingest.de.sentry.io/4511191491346512",
  tracesSampleRate: 1,    // 100% trace sampling (review in production at scale)
  enableLogs: true,       // structured log forwarding to Sentry
  sendDefaultPii: true,   // PII included in error reports
});
```

#### Edge Runtime (`sentry.edge.config.ts`)
Identical configuration to server. Applied to middleware and edge route handlers.

#### Instrumentation Hook (`instrumentation.ts`)
Next.js 14 `instrumentation.ts` bootstraps Sentry at server startup using the `register()` hook and routes per `NEXT_RUNTIME`:
```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge")   await import("./sentry.edge.config");
}
export const onRequestError = Sentry.captureRequestError;
```
`onRequestError` is a Next.js 14 instrumentation hook that automatically captures any unhandled request-level errors and forwards them to Sentry.

#### Global Error UI (`app/global-error.tsx`)
The Next.js 14 `global-error.tsx` boundary is the last line of defense for catastrophic application errors (including root layout crashes). It:
1. Calls `Sentry.captureException(error)` via `useEffect` on mount — guaranteeing the error is always reported to Sentry even if no other boundary catches it.
2. Renders a branded "Light Quiet Luxury" error screen consistent with the CRM design language:
 - Off-white `#F9F9F6` background
 - `rounded-2xl` card with `border-stone-200` and `shadow-sm`
 - `AlertCircle` icon in a muted rose tone
 - Copy: *"System Interruption — An unexpected error occurred in the workspace. Our engineering team has been automatically notified and is investigating."*
 - "Reload Workspace" button calls `reset()` to attempt recovery.
3. Provides `suppressHydrationWarning` on both `<html>` and `<body>` to prevent hydration noise in the error state.

**Sentry DSN**: `https://21bcc878e1d4ab5e62c17c15ece47c95@o4511191483285504.ingest.de.sentry.io/4511191491346512`

---

## 11. Transaction Integrity — Advisory Locks for Agent Assignment

### The Problem: Burst Traffic Race Conditions

The `pick_next_agent_for_domain()` Postgres function selects the agent with the fewest `new`-status leads and assigns the next incoming lead to them (round-robin). Under normal traffic, Postgres's MVCC prevents most conflicts. However, under **burst traffic** — e.g., 10–20 simultaneous webhook POSTs arriving from a viral ad — multiple concurrent transactions can read the same "fewest leads" agent before any of them has committed their INSERT, causing all 10–20 leads to be assigned to the same agent.

### The Solution: `pg_advisory_xact_lock` (Migration 060)

**File**: `supabase/migrations/060_fortify_queries_and_locks.sql`

```sql
CREATE OR REPLACE FUNCTION public.pick_next_agent_for_domain(p_domain TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
  v_domain   TEXT;
BEGIN
  -- Normalize legacy domain alias
  v_domain := CASE WHEN p_domain = 'indulge_global' THEN 'indulge_concierge' ELSE p_domain END;

  -- Acquire a transaction-scoped advisory lock keyed by domain.
  -- All concurrent calls for the same domain will queue here and execute serially.
  PERFORM pg_advisory_xact_lock(hashtext('agent_assignment_' || COALESCE(v_domain, '')));

  -- This SELECT now runs with a serialization guarantee: no other transaction
  -- for this domain can be between its own SELECT and INSERT simultaneously.
  SELECT p.id INTO v_agent_id
  FROM public.profiles p
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) AS new_lead_count
    FROM   public.leads
    WHERE  status = 'new'
    GROUP  BY assigned_to
  ) lc ON lc.assigned_to = p.id
  WHERE p.role      = 'agent'
    AND p.domain::TEXT = v_domain
    AND p.is_active = true
    AND (p.is_on_leave IS NULL OR p.is_on_leave = false)
    AND COALESCE(lc.new_lead_count, 0) < 15
  ORDER BY COALESCE(lc.new_lead_count, 0) ASC, p.created_at ASC
  LIMIT 1;

  RETURN v_agent_id;
END;
$$;
```

### How `pg_advisory_xact_lock` Works

`pg_advisory_xact_lock(key bigint)` acquires an **exclusive session-level advisory lock** that is:
- **Transaction-scoped**: automatically released when the calling transaction commits or rolls back — no manual unlock needed, no leak risk.
- **Domain-scoped**: the lock key is `hashtext('agent_assignment_' || domain)`. Concurrent ingestion for **different domains** does not block each other (`indulge_shop` and `indulge_concierge` acquire different lock keys).
- **Blocking**: concurrent calls for the **same domain** queue up and execute serially. This means the second webhook arriving 1ms after the first will wait at the `PERFORM` line until the first transaction commits its lead INSERT and releases the lock.
- **Not a row lock**: this is an application-level coordination mechanism, not a table or row lock. It does not affect reads or writes outside this function.

### Lock Lifecycle in a Burst Scenario

```
T=0ms: Webhook A (indulge_concierge) → picks up advisory lock → selects agent X (0 leads)
T=1ms: Webhook B (indulge_concierge) → blocks at advisory lock (queued)
T=2ms: Webhook C (indulge_concierge) → blocks at advisory lock (queued)
T=5ms: Webhook A commits (lead assigned to agent X, now has 1 new lead) → lock released
T=5ms: Webhook B acquires lock → selects agent Y (0 leads, since agent X now has 1) → commits
T=6ms: Webhook C acquires lock → selects agent Z (0 leads) → commits
```

Result: Round-robin assignment is perfectly preserved even under simultaneous burst traffic.

### Lock Key Construction

```sql
hashtext('agent_assignment_' || COALESCE(v_domain, ''))
```

`hashtext()` is a Postgres built-in that converts a text string to a 32-bit integer suitable for advisory locks. The `COALESCE` guards against null domain. Example keys:
- `hashtext('agent_assignment_indulge_concierge')` → integer A
- `hashtext('agent_assignment_indulge_shop')` → integer B (different, no contention between domains)

### Legacy Domain Alias Handling

The function retains backward compatibility for the pre-056 `indulge_global` domain value:
```sql
v_domain := CASE WHEN p_domain = 'indulge_global' THEN 'indulge_concierge' ELSE p_domain END;
```
This ensures callers passing the legacy value still resolve to the canonical domain before the lock key is computed and the profile query runs.

---

*End of claude.md — Indulge Atlas System Architecture & Knowledge Base*
*Last updated: 2026-04-11 — Code Red security lockdown: migrations 058–060, per-channel secrets, Sentry, CI/CD hardening.*

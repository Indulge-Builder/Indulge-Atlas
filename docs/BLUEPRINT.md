# ATLAS BLUEPRINT
## Indulge Atlas — Complete System Reference & Architectural Contract

> **Authored**: 2026-04-23 · **Updated**: 2026-05-23
> **Based on**: Full codebase audit, numbered migrations through **094** (Gupshup chatbot), lib/ and app/, git status
> **Status**: Authoritative specification. Supersedes all prior versions.
> **Audience**: Engineers, technical stakeholders.

---

## Section 1 — Project Vision & Context

### What Is Indulge Atlas?

**Indulge Atlas** is a bespoke Company Operating System built exclusively for the **Indulge Group** — a high-ticket luxury lifestyle brand ecosystem. It began as a CRM for inbound sales and is evolving into a full internal platform covering CRM, team collaboration, project management, AI-assisted workflows, budgeting, and a WhatsApp-first AI chatbot.

**The four business units (domains):**
- `indulge_concierge` — Luxury lifestyle concierge & primary inbound sales
- `indulge_shop` — E-commerce & product sales (Shop War Room)
- `indulge_house` — Property & lifestyle experiences
- `indulge_legacy` — Long-term membership & legacy client management

**Cross-domain staff** (Finance, Tech, Marketing, Onboarding) use `indulge_global` domain for read access across all business units.

### Who Uses It

- **Sales agents** — managing inbound leads from Meta/Google/WhatsApp ad campaigns
- **Shop agents** — WhatsApp-first product sales in the Shop War Room
- **Managers** — cross-agent performance, campaign analytics, morning briefings
- **Admins/Founders** — user management, routing rules, integrations, budget oversight, full visibility
- **Internal support staff** (Tech, Finance, Marketing, Onboarding) — projects, tasks, cross-domain analytics
- **Elia AI** — Member intelligence assistant: full-page `/elia-preview` (`EliaChat` + `EliaChatMessage`), sidebar shell (`EliaSidePanel.jsx`), client Overview chat, WhatsApp profile analysis pipeline, and Gupshup inbound chatbot

### Core Problems Solved

1. **Speed-to-Lead**: Sub-5-minute inbound lead response with SLA monitoring and breach alerts
2. **Multi-channel ingestion**: Meta Lead Ads, Google Ads, website forms, WhatsApp, and Gupshup → single `leads` table
3. **Multi-tenant data isolation**: Four business units share one database; PostgreSQL RLS enforces complete row-level separation
4. **WhatsApp-first communication**: Two-way sync with Meta Cloud API + Gupshup AI bot for inbound prospects
5. **Gamified SLA compliance**: Real-time breach detection surfaced to agents and managers
6. **Team collaboration**: Projects, tasks, internal chat across all departments
7. **AI member intelligence**: Elia profiles built from WhatsApp history; on-demand summaries; chatbot lead qualification

---

## Section 2 — Current Status

### 2.1 Production-Ready (Hardened with RLS, Auth, Audit Trail)

**CRM Core:**
- Lead ingestion pipeline (Meta, Google, website, WhatsApp, Gupshup) via Pabbly webhooks + Gupshup webhook with per-channel Bearer auth, HMAC-SHA256 WhatsApp verification, rate limiting, dynamic field mapping engine, burst-safe advisory-locked round-robin agent assignment
- `agentRoutingConfig` is wired into `leadIngestion.ts` — hardcoded email pool is supplemented by the DB-driven config
- Lead dossier (`/leads/[id]`) — full 8-stage pipeline, WhatsApp two-way sync, activity timeline, tasks, disposition modals, scratchpad, follow-up drafts, executive dossier, tags, collaborators
- Leads table (`/leads`) — paginated, filterable by status/domain/source
- **Clients** (`/clients`, `/clients/[id]`) — member directory + dossier tabs (**Overview** default, **Profile**, **Notes**, **Service History**, **WhatsApp**). **There is no separate Membership tab** — membership (`ClientMembershipTab`) renders **inside Profile** below `ClientProfileFields`, with `showContact={false}`, under a **Membership** heading. **Overview** (`components/clients/overview/`): Elia 3-sentence member summary is **on demand only** — `ClientOverviewTab` + `ClientSummaryCard` expose **Generate summary**; `getClientSummary` in `lib/actions/elia.ts` (Haiku) runs **after** the user clicks. **Metric pills** (membership, Freshdesk ticket counts, profile completeness %) load on visit via `ClientMetricPills` — completeness is **not** duplicated on the Profile tab or as a directory column. **Profile** tab (`components/clients/profile/`): grouped fields with light stone section headers, no per-section field-count chips, high-contrast field labels. **Elia Intelligence** section (bottom of Profile): `EliaProfileAnalyseButton` + inline `elia_profile` display (summary, sentiment, travel, recent requests) — migration **091**. **Membership** section (same tab): Timeline shows start/end cards, term length, status pill, term progress bar. **Client-scoped Elia chat** (POST `/api/elia/chat` with optional `clientId`; session not persisted; chat resets when leaving tab). **Chetto mapping admin tool**: `/clients/chetto-mapping` (admin/founder/manager — `canManageAnyClient()` gate) + `/clients/unmapped` for bulk Chetto group ID assignment. Service History reads Freshdesk tickets live (server-only `FRESHDESK_API_KEY`); paginates across Freshdesk pages. Top stats rule: **open = every status except Resolved/Closed** (`status !== 4 && status !== 5`), resolved = `4 | 5`. AI ticket summary via Anthropic (`getTicketAISummary` in `lib/actions/freshdesk.ts`). **WhatsApp (Chetto)** — `ChettoTab.tsx`: group lookup by normalized phone + India dial variants; `lib/actions/chetto.ts` integrates Chetto Joule (`https://apiv2.chetto.ai/joule`) with queendom→sub-org maps; `timelineNotAvailable` when Joule 404s while group metadata exists.

- Global WhatsApp Hub (`/whatsapp`) — master-detail, `DISTINCT ON` view for latest threads
- SLA monitor (`useSLA_Monitor`) — 60s polling, Level 1/2/3 breach detection, IST-aware off-duty anchors via consolidated `lib/utils/sla.ts`
- Shop War Room (`/shop/workspace`) — task-based WhatsApp sales, atomic `target_sold` RPC, order registration, master targets
- Personal Workspace (`/workspace`) — `DailyAnchor`, `PrimaryFocus`, `Scratchpad`, `WhisperBox`, `WorkspaceBoard` in `components/workspace/`
- Admin panel — user management, routing rules editor, field mapping builder, webhook endpoint status, onboarding oversight
- Campaign metrics — ad spend sync from Meta/Google via Pabbly, upsert to `campaign_metrics`, campaign dossier views
- Authentication — Supabase Auth PKCE, cookie sessions, profile-based role resolution
- **Middleware live** — `middleware.ts` created 2026-05-23; exports `{ proxy as middleware, config }` from `proxy.ts`; session refresh and edge auth gate now functional
- Security vault — RLS on all tables, `get_user_role()` reads only from `profiles`, JWT claims never trusted for authorization

**Budget Module (Migration 092):**
- `budget_transactions` + budget deliverables tables per domain
- `/budget` route + `lib/actions/budget.ts` + `components/budget/BudgetClient.tsx`
- Visible and editable by founder/admin/super_admin only (application-layer + RLS)

**Gupshup WhatsApp Chatbot (Migration 094):**
- `bot_catalog_items` — product catalog for Elia bot recommendations
- `bot_sessions` — per-phone conversation state (7-turn limit, handoff flag)
- `webhook_logs.source` extended to include `'gupshup'`
- Services: `lib/services/gupshupChatbot.ts` (Haiku-powered Elia persona, catalog-aware, 7-turn limit, lead handoff via `processAndInsertLead()`) + `lib/services/gupshupClient.ts` (outbound REST to `api.gupshup.io`)
- Webhook: `POST /api/webhooks/gupshup` (`GUPSHUP_WEBHOOK_SECRET`)
- Env: `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_WEBHOOK_SECRET`

**Manager Command Center (`/manager/`):**
- Full route suite: `dashboard`, `campaigns`, `campaigns/[id]`, `planner`, `roster`, `team`
- Morning Briefing component, Campaign Dossier, Agent Roster, Conversion Feed, Velocity Funnel, World Clock
- `lib/actions/manager-analytics.ts` — real analytics data (leaderboard, funnel, wins)
- `/scout/*` routes are permanently redirected (301) to `/manager/*` in `next.config.ts`

**Projects System (Migrations 062–065, fully live):**
- `projects`, `project_members`, `task_groups`, `task_comments`, `task_progress_updates` tables with full RLS
- `components/projects/` — board view, list view, project card, task card, task detail sheet
- `app/(dashboard)/projects/` — **permanently redirected** to `/tasks` (see `next.config.ts`)
- `lib/actions/projects.ts` — full CRUD for projects, task groups, tasks within projects

**Atlas Unified Task System (Migrations 067–086, fully live):**
- **Master / subtask / personal** model on a single `tasks` table via `unified_task_type`; rich workflow via `atlas_status` (five values after migration **079**)
- **`task_remarks`** append-only agent + system timeline; **`import_batches`** for CSV; **`task_notifications`** (077) for in-app notifications
- Migration **085**: `task_remarks` gains `previous_status` and `content` columns for richer timeline
- Migration **086**: `shop_orders` context preserved when task deleted
- Routes: `/tasks` (My Tasks + Atlas Tasks), `/tasks/[id]` workspace, `/tasks/import`; **`/task-insights`** (manager/admin/founder) — index, `[departmentId]` detail, `agents/[agentId]` dossier
- **`lib/actions/tasks.ts`**, **`lib/actions/task-intelligence.ts`**, **`components/tasks/`**, **`components/task-intelligence/`**
- **Task Insights index:** `max-w-5xl`; department chip filter; Agents tab first; agent summaries prefetched on scope change; no department card grid on index; bento workspace tiles (`taskInsightsBento.ts`); SOP strip omits completed rows

**Department Access Control (Migration 066, fully live):**
- `employee_department` enum: `concierge`, `finance`, `tech`, `shop`, `house`, `legacy`, `marketing`, `onboarding`
- `profiles` extended: `department`, `job_title`, `reports_to` columns
- `get_user_department()` SECURITY DEFINER function
- `lib/constants/departments.ts` — `DEPARTMENT_CONFIG`, `DOMAIN_CONFIG`, `DEPARTMENT_ROUTE_ACCESS`

**Task Performance Indexes (Migration 093):**
- GIN + B-tree indexes on `tasks` for task-intelligence aggregate queries (no schema changes)

**Security Hardening (done):**
- `sendDefaultPii: false` in `sentry.server.config.ts`
- Per-channel Pabbly secrets (Meta/Google/website each have independent Bearer tokens)
- HMAC-SHA256 WhatsApp webhook verification (`WHATSAPP_APP_SECRET` mandatory)
- `lib/utils/sla.ts` — consolidated `getOffDutyAnchor()`
- `middleware.ts` live — session refresh and edge auth gate functional (fixed 2026-05-23)

### 2.2 In Preview / Partially Built

| Feature | Location | Status |
|---|---|---|
| Elia AI Assistant | `app/(dashboard)/elia-preview/page.tsx`, `components/elia/EliaChat.tsx`, `EliaChatMessage.tsx`, `EliaSidePanel.jsx` | `/elia-preview`: RSC passes `clientCount`; POST `/api/elia/chat`. Client Overview: scoped chat + on-demand `getClientSummary`. Profile → Elia Intelligence: WhatsApp profile pipeline (migration **091**). `EliaSidePanel.jsx`: sidebar shell (JSX). |
| Manager Morning Briefing | `components/manager/MorningBriefing.tsx` | Some widgets real, some stubs |
| Executive Briefing | `lib/briefing/executiveBriefing.ts`, `lib/actions/briefing.ts` | Service exists, no clear UI page consuming it |
| Performance analytics | `app/(dashboard)/performance/page.tsx` | Page + `lib/actions/performance.ts` exists; mix of real and stubbed data |
| Smart Calendar | `app/(dashboard)/calendar/page.tsx` | NLP date parsing with `chrono-node`, coverage unclear |
| Ad Planner Studio | `app/(dashboard)/manager/planner/` | UI built, `lib/actions/planner.ts` exists, no actual deployment to ad platforms |
| Internal chat | `components/chat/` | `GlobalChatDrawer` and `LeadContextChat` functional but untested at scale |

### 2.3 Mock Data / Placeholder (Risk)

| File | Used By | Risk |
|---|---|---|
| `lib/concierge/mockData.ts` | `components/concierge/ConciergeClient.tsx` → `app/(dashboard)/concierge/page.tsx` | **ACTIVE**: Fabricated UHNI client profiles served to real users |
| `lib/data/campaigns-mock.ts` | Unknown — may not be in any live import path | Latent |

### 2.4 Critical Known Bugs (Unresolved)

1. ~~**`proxy.ts` is dead code — middleware is not running.**~~ **FIXED 2026-05-23** — `middleware.ts` now exists at root; session refresh and edge auth gate are live.

2. **Hardcoded agent emails still partially present in `leadIngestion.ts`.** While `agentRoutingConfig` is imported, the hardcoded shift pool logic (night/day shift, Samson cap) still references specific email addresses.

3. **`/api/webhooks/leads/route.ts` (legacy root endpoint)** — exists alongside per-channel routes; unclear if it receives live traffic. Needs confirmation before removal.

4. **`lib/concierge/mockData.ts` serves a live route** — the concierge page appears in the sidebar and shows fabricated UHNI data to real users.

5. **`EliaSidePanel.jsx` is `.jsx` not `.tsx`** — bypasses type safety.

6. **`supabase/20260308000000_initial_schema.sql`** — a migration file outside the numbered `001–094` sequence; its relationship to the canonical migration history is ambiguous.

7. **`/api/bootstrap` and `/api/campaigns/sync`** — no visible auth on these routes. Needs audit before public exposure.

### 2.5 Tech Debt Items (Non-Blocking)

- `lib/briefing/executiveBriefing.ts` — exists but no UI surface consuming it; may be dead code
- `SCOUT_TASK_TYPES` — marked `@deprecated` in `lib/types/database.ts`, still present
- Dual-write in `lead_activities` — old columns (`performed_by`, `type`, `payload`) still written alongside new (`actor_id`, `action_type`, `details`)
- `tsconfig.tsbuildinfo` — committed to repo; should be gitignored
- `.DS_Store` files in multiple directories — should be gitignored
- `tracesSampleRate: 1` in Sentry configs — 100% sampling is expensive at production scale; should be reduced to 0.1
- `next-themes` installed but dark/light toggle is not user-facing
- Many components still hardcode `#D4AF37` — should migrate to `brand-gold` tokens

---

## Section 3 — Full Tech Stack

### Runtime

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js App Router | 16.1.6 |
| Runtime | React | 19.2.3 |
| Language | TypeScript | ^5 (strict mode) |
| Package Manager | npm | (lockfile present) |

> ⚠️ **Next.js 16.1.6 + React 19**: Bleeding edge — beyond current stable 15.x. Uses Turbopack (`turbopack: { root: process.cwd() }` in `next.config.ts`).

### Backend / Database

| Concern | Technology |
|---|---|
| Database | Supabase (PostgreSQL 15) |
| Auth | Supabase Auth (JWT + cookie sessions via PKCE) |
| ORM | None — hand-written Supabase JS queries |
| Client Library | `@supabase/supabase-js ^2.98.0` + `@supabase/ssr ^0.9.0` |
| Rate Limiting | Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`) |

### Frontend

| Concern | Technology |
|---|---|
| Styling | Tailwind CSS ^4 (v4 beta — uses `@tailwindcss/postcss` plugin, not v3 plugin) |
| Component Primitives | Radix UI (full suite) + shadcn/ui |
| Variant Management | `class-variance-authority` (CVA) |
| Class Merging | `tailwind-merge` + custom `cn()` utility |
| Animations | `framer-motion ^12.35.1` |
| Forms | `react-hook-form ^7.71.2` + `@hookform/resolvers` |
| Charts | `recharts ^3.8.0` |
| Toasts | `sonner ^2.0.7` |
| Date Picker | `react-day-picker ^9.14.0` |
| Icons | `lucide-react ^0.577.0` |
| Date Handling | `date-fns ^4.1.0` + `date-fns-tz ^3.2.0` |
| NLP Date Parsing | `chrono-node ^2.9.0` |
| Theming | `next-themes ^0.4.6` (installed, no user-facing toggle) |

### Validation & Security

| Concern | Technology |
|---|---|
| Schema Validation | Zod ^4.3.6 |
| HTML Sanitization | `isomorphic-dompurify ^3.8.0` (zero-tags policy) |
| Phone Normalization | `libphonenumber-js ^1.12.41` (E.164, IN default) |
| Error Monitoring | `@sentry/nextjs ^10.48.0` (server + edge + client) |

### Dev / CI

| Tool | Version |
|---|---|
| Vitest | ^4.1.4 |
| ESLint | ^9.39.4 + `eslint-config-next ^16.2.3` |
| tsx | ^4.21.0 |
| `@vitejs/plugin-react` | ^6.0.1 |
| `vite-tsconfig-paths` | ^6.1.1 |
| CI/CD | GitHub Actions — lint + test on every push/PR to `main` |
| Deployment | Vercel |

### External Services

| Service | Protocol | Used For |
|---|---|---|
| Meta WhatsApp Cloud API (v19.0) | REST + HMAC webhook | Outbound messages + inbound webhook sync |
| Pabbly Connect | Webhook intermediary | ETL from Meta/Google Ads + website forms |
| Meta Lead Ads | Via Pabbly | Lead form submissions |
| Google Ads | Via Pabbly | Lead form submissions |
| Gupshup | REST + webhook | Inbound WhatsApp AI chatbot — Elia persona, lead capture |
| Upstash Redis | REST | Sliding-window rate limiting on webhooks |
| Sentry | SDK | Error monitoring + performance tracing |
| Supabase | Managed Postgres + Auth + Realtime + Storage | Database, auth, real-time subscriptions |
| Freshdesk | REST (`indulge.freshdesk.com/api/v2`) | Client Service History: contacts + tickets (Basic auth, server-only key) |
| Anthropic | REST (`api.anthropic.com`) | `/api/elia/chat`, `getClientSummary`, `getTicketAISummary`, `runEliaWhatsAppAnalysis`, Gupshup bot; model `claude-haiku-4-5-20251001`; `ANTHROPIC_API_KEY` |
| Chetto (Joule) | REST (`apiv2.chetto.ai/joule`) | Client WhatsApp tab: find concierge WhatsApp group by phone, optional timeline + AI insight prompts; `CHETTO_API_KEY` server-only |

---

## Section 4 — Architecture Overview

### High-Level Pattern

Full-stack monolith on Next.js App Router. Server Components, Server Actions, and API Route Handlers coexist in a single deployable application. No separate backend service.

```
┌──────────────────────────────────────────────────────────────┐
│                     Next.js 16 Monolith                      │
│                                                              │
│  middleware.ts (proxy.ts) — session refresh + auth gate      │
│                                                              │
│  ┌──────────────────┐   ┌─────────────────────────────────┐  │
│  │ App Router        │   │ API Routes (/api/...)            │  │
│  │ (RSC + Actions)  │   │ webhooks/leads/{meta,google,web} │  │
│  │                  │   │ webhooks/whatsapp                │  │
│  │ /dashboard/**    │   │ webhooks/gupshup                │  │
│  │ /auth/**         │   │ webhooks/ads                    │  │
│  │ /tv/**           │   │ finance-notify / campaigns/sync  │  │
│  └────────┬─────────┘   └──────────────┬──────────────────┘  │
│           │                            │                      │
│           └──────────────┬─────────────┘                      │
│                          │ Supabase JS Client                 │
└──────────────────────────┼────────────────────────────────────┘
                           │
              ┌────────────▼───────────┐
              │     Supabase Cloud     │
              │  PostgreSQL + Auth     │
              │  + Realtime + Storage  │
              └────────────────────────┘
                           │
          ┌────────────────┼──────────────┬────────────────┐
          │                │              │                │
     Pabbly Connect    Meta Cloud API  Upstash Redis   Gupshup
     (webhook ETL)     (WhatsApp)     (rate limiting)  (WhatsApp bot)
```

### Data Flow — Webhook Ingestion

```
Ad Platform (Meta / Google / Website)
  → Pabbly Connect (ETL layer)
    → POST /api/webhooks/leads/{channel}  (rate-limit + bearer auth)
      → Dynamic Field Mapping Engine (DB-driven rules)
        → Lead Routing Engine (dynamic rules + IST shift waterfall)
          → processAndInsertLead() (service-role Supabase client)
            → leads INSERT + lead_activities INSERT
              → revalidatePath() → RSC re-render

Gupshup inbound prospect
  → POST /api/webhooks/gupshup  (GUPSHUP_WEBHOOK_SECRET bearer auth)
    → gupshupChatbot.ts (Haiku bot — catalog lookup, session state)
      → sendGupshupMessage() for reply
      → processAndInsertLead() on handoff (7-turn limit or explicit handoff)
```

### Data Flow — User Mutation

```
Agent clicks status button (StatusActionPanel)
  → Next.js Server Action (lib/actions/leads.ts)
    → getAuthUser() (auth + role from profiles)
      → Ownership/role check
        → supabase.from('leads').update(...)
          → supabase.from('lead_activities').insert(...)
            → revalidatePath('/leads/[id]')
              → Next.js cache bust → RSC re-render
```

### State Management

| State | Location | Mechanism |
|---|---|---|
| Auth session | Supabase cookie (HTTP-only) | `@supabase/ssr` + middleware session refresh |
| User profile | `ProfileProvider` context | Fetched once in DashboardLayout |
| SLA breach state | `SLAProvider` context | 60s polling via `useSLA_Monitor` |
| Task alerts | `TaskAlertProvider` context | Supabase Realtime |
| Lead alerts | `LeadAlertProvider` context | Supabase Realtime |
| Chat messages | `useMessages` hook | Supabase Realtime |
| Project task updates | `useTaskRealtime` hook | Supabase Realtime |
| Atlas Tasks / Task Insights | `useTaskIntelligenceRealtime`, etc. | Supabase Realtime + `router.refresh()` |
| Server data | Next.js Data Cache | RSC fetch + `revalidatePath()` |
| Rate limit counters | Upstash Redis | External, persistent |
| Gupshup bot sessions | `bot_sessions` table | Per-phone conversation state, 7-turn limit |
| All business data | Supabase PostgreSQL | Source of truth |

### Provider Tree (Dashboard Layout)

```
TaskReminderProvider
  └── LeadAlertProvider
        └── ChatProvider (currentUserId)
              └── ProfileProvider (profile)
                    └── SLAProvider (profile)
                          └── layout-canvas div
                                ├── Sidebar (profile)
                                └── ml-60 content shell
                                      └── main (.paper-shadow)
                                            └── CommandPaletteProvider
                                                  └── TaskAlertProvider
                                                        └── {children}
```

---

## Section 5 — File & Folder Structure

### 5.1 Design Tokens (`app/globals.css`)

- **`@theme inline`** defines `--color-brand-black`, **`--color-brand-gold`**, **`--color-brand-gold-light`**, **`--color-brand-gold-dark`** (Tailwind utilities: `bg-brand-gold`, `text-brand-gold-dark`, etc.). The **`gold` suffix is legacy naming**; values are a **muted warm umber** — not bright metallic gold.
- **Surfaces & chrome** — `--color-surface` / `--color-surface-subtle` / `--color-surface-border`, taupe/olive helpers, `--shadow-gold`.
- **Primary CTA** — `components/ui/button.tsx` variant **`gold`**: `bg-brand-gold`, `text-surface` (cream on fill), `hover:bg-brand-gold-dark`.
- **Tech debt:** many components still use hardcoded **`#D4AF37`**; new work should prefer **`brand-gold`** / theme tokens.

```
/
├── __tests__/                      Vitest test files
│   ├── phone.test.ts
│   ├── sanitize.test.ts
│   └── time.test.ts
│
├── .github/workflows/ci.yml        GitHub Actions: lint + test on push/PR to main
├── .env.example                    Template for required env vars (committed)
├── middleware.ts                   ✅ Live — re-exports proxy as middleware + config
├── proxy.ts                        Next.js middleware implementation
│
├── app/
│   ├── layout.tsx                  Root layout: fonts, Sentry, global providers
│   ├── globals.css                 Tailwind @import + @theme inline tokens
│   ├── error.tsx / global-error.tsx
│   │
│   ├── (auth)/                     Login, forgot-password, update-password
│   │
│   ├── (dashboard)/                Authenticated shell — shares DashboardLayout
│   │   ├── layout.tsx              Auth gate + provider tree + layout-canvas
│   │   ├── page.tsx                / — Agent Dashboard
│   │   ├── leads/                  Leads table + Lead Dossier RSC (force-dynamic)
│   │   ├── clients/
│   │   │   ├── page.tsx            Client directory
│   │   │   ├── [id]/page.tsx       Overview (on-demand summary, metrics, Elia chat) + Profile + Notes + Service History + WhatsApp tabs
│   │   │   ├── chetto-mapping/     Admin: bulk map Chetto group IDs to client records
│   │   │   └── unmapped/           Clients with no Chetto group mapping
│   │   ├── tasks/                  Atlas Tasks — index, [id] workspace, import
│   │   ├── task-insights/          Task Insights index + [departmentId] + agents/[agentId]
│   │   ├── budget/                 Budget tracking (founder/admin/super_admin only)
│   │   ├── workspace/              Personal workspace (DailyAnchor, PrimaryFocus, Scratchpad, WhisperBox)
│   │   ├── whatsapp/               Global WhatsApp Hub
│   │   ├── calendar/               Smart calendar (chrono-node NLP)
│   │   ├── performance/            Agent performance analytics
│   │   ├── profile/                User profile settings
│   │   ├── escalations/            SLA escalation table
│   │   ├── conversions/            Conversion history
│   │   ├── concierge/              ⚠️ MOCK DATA
│   │   ├── elia-preview/           Full-page Elia chat
│   │   ├── indulge-world/          Brand/org chart
│   │   ├── projects/               → 301 redirect to /tasks
│   │   ├── manager/                dashboard, campaigns, planner, roster, team
│   │   ├── admin/                  conversions, integrations, mappings, marketing, onboarding, routing, shop
│   │   └── shop/workspace/         Shop War Room
│   │
│   ├── api/
│   │   ├── elia/chat/route.ts      POST — Haiku; optional clientId
│   │   ├── elia/analyse-client/    POST — Bearer ELIA_ANALYSIS_SECRET; cron trigger
│   │   ├── chetto/                 find-group, group, timeline, insights (CHETTO_API_KEY proxy)
│   │   ├── campaigns/sync/         Campaign metrics sync
│   │   ├── finance-notify/         Internal: won deal notification (INTERNAL_API_SECRET)
│   │   ├── bootstrap/              ⚠️ No visible auth — audit needed
│   │   ├── freshdesk/attachment/   Freshdesk attachment proxy
│   │   ├── tv/onboarding-feed/     TV display data
│   │   └── webhooks/
│   │       ├── ads/                Pabbly → campaign_metrics
│   │       ├── leads/              ⚠️ Legacy combined endpoint — unclear if active
│   │       ├── leads/meta/         Meta Lead Ads (PABBLY_META_SECRET)
│   │       ├── leads/google/       Google Ads (PABBLY_GOOGLE_SECRET)
│   │       ├── leads/website/      Website forms (PABBLY_WEBSITE_SECRET)
│   │       ├── gupshup/            Gupshup inbound bot (GUPSHUP_WEBHOOK_SECRET)
│   │       ├── onboarding-conversion/
│   │       └── whatsapp/           Meta Cloud API two-way sync (HMAC-SHA256)
│   │
│   ├── auth/callback/              Supabase PKCE auth callback
│   └── tv/conversions/             TV display mode
│
├── components/
│   ├── ui/                         Zero-dependency design system primitives
│   │   ├── button.tsx              CVA — 8 variants × 6 sizes
│   │   ├── indulge-button.tsx      Extends Button: loading state + icon slots
│   │   ├── input.tsx               CVA — size + error props
│   │   ├── card.tsx                surfaceCardVariants (5 tones × 4 elevations)
│   │   ├── indulge-field.tsx       Form field wrapper: label + error + hint
│   │   ├── info-row.tsx            Canonical icon-label-value row
│   │   └── ...                     badge, dialog, sheet, select, skeleton, tabs, tooltip, etc.
│   │
│   ├── layout/                     Sidebar, TopBar, NotificationBell, LeaderPerspectiveNotice
│   ├── leads/                      All CRM lead components (dossier, modals, table, collaborators)
│   ├── clients/                    Client list + profile; overview/; profile/; membership/; chetto/ (ChettoTab + ChettoMappingClient); FreshdeskTab; unmapped/
│   ├── elia/                       EliaChat.tsx, EliaChatMessage.tsx, EliaMobilePrototype.tsx, EliaSidePanel.jsx (⚠️ JSX)
│   ├── tasks/                      Atlas Tasks UI (40+ components — master list, subtask modal, import, My Tasks)
│   ├── task-intelligence/          Task Insights UI (18 components + taskInsightsBento.ts)
│   ├── manager/                    Full manager suite (Morning Briefing, Campaign Dossier, etc.)
│   ├── projects/                   Shared board/list/sheet primitives
│   ├── workspace/                  DailyAnchor, PrimaryFocus, Scratchpad, WhisperBox, WorkspaceBoard
│   ├── whatsapp/                   ActiveChatPanel, WhatsAppHubClient
│   ├── dashboard/                  Agent dashboard widgets
│   ├── budget/                     BudgetClient
│   ├── admin/                      Admin panel components
│   ├── chat/                       GlobalChatDrawer, LeadContextChat, ChatProvider
│   ├── calendar/                   Smart calendar views
│   ├── shop/                       Shop War Room components
│   ├── sla/                        SLAProvider + ProfileProvider
│   ├── providers/                  TaskAlertProvider, LeadAlertProvider, CommandPaletteProvider
│   ├── concierge/                  ⚠️ ALL MOCK DATA
│   └── indulge-world/              Brand/org chart views
│
├── lib/
│   ├── actions/                    Server Actions ("use server") — 38 modules
│   │   ├── leads.ts, clients.ts, tasks.ts, task-intelligence.ts, projects.ts
│   │   ├── shop-tasks.ts, whatsapp.ts, admin.ts, auth.ts, campaigns.ts
│   │   ├── dashboards.ts, manager-analytics.ts, performance.ts, planner.ts
│   │   ├── roster.ts, routing-rules.ts, search.ts, team-stats.ts
│   │   ├── freshdesk.ts, elia.ts, budget.ts, briefing.ts
│   │   ├── chetto.ts               ⚠️ No "use server" — route-handler-only imports
│   │   └── ...                     field-mappings, manager, messages, notifications,
│   │                               onboarding-conversions, pipeline, profile, scratchpad,
│   │                               sla, smart-calendar, todos, workspace
│   │
│   ├── services/                   Core business services (not component-facing)
│   │   ├── leadIngestion.ts        processAndInsertLead(), IST shift waterfall
│   │   ├── fieldMappingEngine.ts   Dynamic field mapping from DB rules
│   │   ├── evaluateRoutingRules.ts Pure routing rule evaluation (no I/O)
│   │   ├── agentRoutingConfig.ts   DB-driven agent routing config
│   │   ├── eliaProfileAnalysis.ts  WhatsApp → Chetto → Haiku → client_profiles.elia_profile
│   │   ├── gupshupChatbot.ts       Gupshup inbound bot — Elia persona, 7-turn limit, lead handoff
│   │   ├── gupshupClient.ts        Gupshup outbound REST client
│   │   ├── taskContext.ts          Task read model (service role, cross-domain)
│   │   ├── taskNotificationInsert.ts
│   │   ├── campaign-sync.ts
│   │   └── webhookLog.ts
│   │
│   ├── elia/chat-prompt.ts         eliaSystemPrompt, eliaClientScopedPrompt, buildWhatsAppProfilePrompt
│   ├── briefing/executiveBriefing.ts   Executive briefing service (no UI surface yet)
│   ├── freshdesk/                  client.ts + types.ts — server-only; never import from browser
│   ├── concierge/mockData.ts       ⚠️ MOCK DATA in production path
│   │
│   ├── utils/
│   │   ├── sanitize.ts             sanitizeText() + sanitizeFormData()
│   │   ├── phone.ts                normalizeToE164() + e164LookupVariants()
│   │   ├── sla.ts                  getOffDutyAnchor() — canonical shared SLA utility
│   │   ├── webhook.ts              verifyPabblyWebhook() + verifyBearerSecret()
│   │   ├── rateLimit.ts            Upstash sliding-window rate limiter
│   │   ├── date-format.ts          IST-aware date formatters
│   │   └── ...                     time, audio, auth-errors, format-phone-display,
│   │                               lead-source-mapper, site-url
│   │
│   ├── hooks/
│   │   ├── useSLA_Monitor.ts       60s poll SLA breach detection
│   │   ├── useSlaAlerts.ts / useSlaAlerts.utils.ts
│   │   ├── useTaskRealtime.ts      Project task + Atlas board/index/modal realtime
│   │   ├── useTaskIntelligenceRealtime.ts
│   │   ├── useMessages.ts          Internal chat realtime
│   │   ├── useLeadCollaboratorsRealtime.ts
│   │   ├── useNotificationRealtime.ts
│   │   └── ...                     useDebounce, useClientOnly, useUserDomain
│   │
│   ├── constants/
│   │   ├── departments.ts          DEPARTMENT_CONFIG, DOMAIN_CONFIG, DEPARTMENT_ROUTE_ACCESS
│   │   ├── chetto-jokers.ts        Client-safe joker phone labels
│   │   ├── personalTaskTags.ts     Personal task tag constants
│   │   ├── tasks.ts                Task-related constants
│   │   └── onboarding-overview.ts
│   │
│   ├── types/
│   │   ├── database.ts             All TypeScript types + constants (HAND-WRITTEN — not generated)
│   │   ├── campaigns.ts            Campaign-specific types
│   │   └── onboarding-overview.ts
│   │
│   ├── schemas/                    lead.ts, password.ts, tasks.ts — Zod schemas
│   ├── auth/getAuthUser.ts         Shared auth helper (non-action modules)
│   ├── supabase/                   client.ts (browser), server.ts (SSR), service.ts (bypasses RLS)
│   └── leads/                      leadDetailRequestCache.ts, leadJourneyStages.ts,
│                                   leadsTableSelect.ts, pipelineProgress.ts
│
├── supabase/
│   ├── config.toml
│   ├── 20260308000000_initial_schema.sql  ⚠️ Outside numbered sequence
│   └── migrations/                 094 numbered SQL files (001–094)
│
├── docs/                           BLUEPRINT.md, Elia - Architecture.md, TESTING_MASTER_PLAN.md, etc.
├── scripts/                        map-chetto-groups.ts, seed-clients.ts, sync-csv-phones.ts, zoho-import.py
├── next.config.ts                  Next.js config + Sentry + /scout/* redirects
├── package.json / tsconfig.json / vitest.config.ts
└── sentry.server.config.ts / sentry.edge.config.ts / instrumentation.ts
```

---

## Section 6 — Authentication & Authorization

### Authentication Flow

1. User submits email/password at `/login` → `lib/actions/auth.ts` → `supabase.auth.signInWithPassword()`
2. Supabase returns session JWT stored in HTTP-only cookies via `@supabase/ssr`
3. **`middleware.ts`** (live as of 2026-05-23) — re-exports `proxy` from `proxy.ts`. `proxy.ts` creates a server client, refreshes the session cookie, and redirects unauthenticated requests to `/login`. Auth session missing errors on public routes (login, forgot-password, webhooks) are expected and suppressed.
4. Auth gate enforced by `app/(dashboard)/layout.tsx` RSC as a second layer
5. Password reset: `/forgot-password` → `/update-password` via `auth/callback/route.ts` (PKCE)

### Authorization — Three-Layer Defense

1. **Middleware** (`middleware.ts` via `proxy.ts`): ✅ Live — session refresh + auth redirects
2. **Server Actions** (`getAuthUser()`): Every mutation re-authenticates, fetches role from `profiles`, checks ownership
3. **PostgreSQL RLS**: All queries subject to row-level policies calling `get_user_role()`, `get_user_domain()`, `get_user_department()`

### Access Control Axes

| Axis | Field | Controls | Mechanism |
|---|---|---|---|
| **Data** | `profiles.domain` | What rows you can read/write | RLS via `get_user_domain()` |
| **Workspace** | `profiles.department` | What screens/routes you can open | `DEPARTMENT_ROUTE_ACCESS` in `lib/constants/departments.ts` |

### Roles

| Role | Access |
|---|---|
| `admin` | Full system access, all domains, user management |
| `founder` | Same as admin for data; no DELETE on profiles |
| `manager` | Full CRUD within own domain |
| `agent` | Own assigned leads/tasks within own domain |
| `guest` | SELECT only, own domain |

### Domains (post-066)

| Domain | Who | Data Access |
|---|---|---|
| `indulge_concierge` | Concierge, Onboarding agents | Concierge domain data |
| `indulge_shop` | Shop agents | Shop domain data |
| `indulge_house` | House agents | House domain data |
| `indulge_legacy` | Legacy agents | Legacy domain data |
| `indulge_global` | Finance, Tech, Marketing staff | Read ALL domains (cross-domain SELECT) |

### Departments (post-066)

`concierge`, `finance`, `tech`, `shop`, `house`, `legacy`, `marketing`, `onboarding`

`NULL` department = admin/founder (cross-departmental).

### Critical Security Rule (Migration 058)

`get_user_role()` and `get_user_domain()` read **ONLY from `public.profiles`**. JWT `user_metadata` is never trusted for authorization. This invariant must never regress.

---

## Section 7 — Database Schema

### Migration History

94 numbered SQL files in `supabase/migrations/` (001 through **094** as of this revision). Key milestones:

| Migration | Change |
|---|---|
| 011 | Fresh schema — profiles, leads, tasks |
| 029 | 8-stage lead status pipeline |
| 031 | Comprehensive RLS enablement |
| 041 | Multi-tenant domain isolation |
| 053 | Shop War Room workspace |
| 055 | WhatsApp messages table |
| 056 | Strict tenant isolation — scout→manager, finance→guest |
| 057 | Dynamic field mapping engine |
| 058 | **RLS Security Hardening** — JWT claims removed from authorization |
| 059 | Missing indexes on leads |
| 060 | Advisory lock on agent assignment, `vw_latest_whatsapp_threads` view |
| 061 | `agent_routing_config` table |
| 062–065 | Projects system (`projects`, `project_members`, `task_groups`, `task_comments`, `task_progress_updates`) |
| 066 | `employee_department` enum, `profiles.department/job_title/reports_to`, `get_user_department()`, `indulge_global` re-added |
| **067** | **Unified task schema** — `unified_task_type`, `atlas_status`, `task_remarks`, `import_batches` |
| **068–072** | Backfill, RLS v2, indexes, task_remarks metadata, priority `critical` |
| **073–075** | Realtime for task_remarks + task_groups; drop legacy tasks RLS from 063 |
| **076–078** | Group-task experiment, `task_notifications`, backfill to master workspaces |
| **079** | `atlas_status` five values (remap `in_review` / `blocked`) |
| **080** | `lead_collaborators` + RLS (cross-domain lead access) |
| **081** | Ad-hoc tasks and SOPs |
| **082** | Spawn exclude personal self SOPs |
| **083–084** | `task_remarks` RLS visibility + group member insert |
| **085** | `task_remarks` gains `previous_status` + `content` columns |
| **086** | `shop_orders` context preserved when task deleted |
| **087–089** | Client profile foundation, update policy, completeness cache |
| **090** | `clients.chetto_group_id` column |
| **091** | `client_profiles.elia_profile` JSONB (EliaProfile), `elia_version`, `elia_analyzed_at`, `elia_messages_through` |
| **092** | `budget_transactions` + budget deliverables tables |
| **093** | Task performance indexes (GIN + B-tree on tasks) |
| **094** | `bot_catalog_items`, `bot_sessions`; `webhook_logs.source` extended to include `'gupshup'` |

### Core Tables

#### `profiles`
One row per auth user. RLS authorization anchor.

| Key Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK = `auth.users.id` |
| `role` | user_role enum | admin/founder/manager/agent/guest |
| `domain` | indulge_domain enum | Business unit assignment (drives RLS) |
| `department` | employee_department enum | NULL for admin/founder |
| `job_title` | text | Display only |
| `reports_to` | uuid → profiles | Org hierarchy |
| `is_active` | boolean | Set false to deactivate |
| `is_on_leave` | boolean | Prevents lead assignment |

#### `leads`
Central CRM entity. 8-stage pipeline: `new → attempted → connected → in_discussion → won/nurturing/lost/trash`

Key columns: `phone_number` (E.164), `domain`, `status`, `assigned_to`, `assigned_at`, `is_off_duty`, `form_data` (JSONB), `follow_up_drafts`, `private_scratchpad`, `tags`, `deal_value`

#### `tasks`
Multi-purpose via `unified_task_type` = `master` | `subtask` | `personal`. Atlas Tasks are primary; also covers CRM tasks (`lead_id IS NOT NULL`), Shop tasks (`shop_operation_scope IS NOT NULL`), project board subtasks (`project_id IS NOT NULL`).

Extended columns include: `project_id`, `group_id`, `parent_task_id`, `priority`, `progress`, `estimated_minutes`, `actual_minutes`, `position`, `tags`, `attachments`, `unified_task_type`, `atlas_status`, domain/department, archive/import fields, `master_task_id`.

#### `task_remarks`
Append-only timeline for Atlas subtasks. Gains `previous_status` + `content` in migration **085**.

#### `clients`
Members promoted from leads on `status = won`. Extended in **090** with `chetto_group_id`.

#### `client_profiles`
One row per client. Extended in **091** with `elia_profile` (JSONB `EliaProfile`), `elia_version`, `elia_analyzed_at`, `elia_messages_through`. Writes via `getServiceSupabaseClient()` (service role).

#### `bot_catalog_items` / `bot_sessions` (Migration 094)
- `bot_catalog_items` — product catalog for Gupshup Elia bot recommendations (category, name, description, price_range, image_url)
- `bot_sessions` — per-phone conversation state: turn count (max 7), handoff flag, message history JSONB

#### `budget_transactions` (Migration 092)
Budget tracking per domain. Founder/admin/super_admin only via application-layer + RLS.

#### Other Core Tables

| Table | Purpose |
|---|---|
| `whatsapp_messages` | Two-way WhatsApp thread per lead |
| `campaign_metrics` | Cached ad spend (Meta/Google via Pabbly) |
| `shop_orders` | Shop order lifecycle |
| `shop_master_targets` | Admin-defined inventory targets |
| `lead_routing_rules` | Dynamic routing rules |
| `field_mappings` | Dynamic webhook field mapping config |
| `webhook_logs` | Raw inbound payload archive (source includes `'gupshup'` post-094) |
| `task_notifications` | In-app task event notifications (077) |
| `lead_collaborators` | Cross-domain lead access grants (080) |
| `agent_routing_config` | DB-driven agent routing config |
| `personal_todos` | Agent-private to-do items |
| `sla_alert_tracking` | Per-lead SLA alert sent flags |

### Database Functions

| Function | Purpose |
|---|---|
| `get_user_role()` | Profiles-only role resolver (SECURITY DEFINER, no JWT) |
| `get_user_domain()` | Profiles-only domain resolver |
| `get_user_department()` | Profiles-only department resolver (added 066) |
| `pick_next_agent_for_domain(domain)` | Round-robin with `pg_advisory_xact_lock` |
| `increment_shop_task_target_sold(task_id)` | Atomic counter increment |
| `get_project_member_role(project_id)` | Returns current user's role in a project |
| `is_project_member(project_id)` | Returns true if current user is a project member |
| `handle_new_user()` | Trigger: creates profiles row from `raw_app_meta_data` only |
| `set_updated_at()` | Trigger function: updates `updated_at = now()` |

---

## Section 8 — Key Workflows & Data Flows

### Lead Ingestion Pipeline

```
Ad Platform → Pabbly Connect
  → POST /api/webhooks/leads/{meta|google|website}
    → checkWebhookRateLimit() [Upstash, 100/min/IP, fail-closed]
    → verifyBearerSecret(request, 'PABBLY_{CHANNEL}_SECRET') [timing-safe]
    → async webhookLog INSERT (fire-and-forget)
    → fieldMappingEngine.ts [DB rules → mapped + unmapped fields]
    → evaluateRoutingRules.ts [pure function, first-match-wins]
    → resolveAssignedAgent() [IST shift waterfall + advisory lock]
    → sanitizePayloadStringFields() + normalizeToE164()
    → processAndInsertLead() [service-role INSERT]
    → leads INSERT + lead_activities INSERT
    → revalidatePath('/')
```

### Gupshup Bot Flow

```
Prospect sends WhatsApp message via Gupshup
  → POST /api/webhooks/gupshup (GUPSHUP_WEBHOOK_SECRET bearer auth)
    → gupshupChatbot.ts
      → bot_sessions lookup (or create) by phone
      → bot_catalog_items lookup for context
      → buildSystemPrompt() + Haiku (claude-haiku-4-5-20251001, max_tokens 512)
      → sendGupshupMessage() → gupshupClient.ts → api.gupshup.io
      → increment turn count in bot_sessions
      → if turns >= 7 OR explicit handoff intent:
          → processAndInsertLead() → lead inserted → human agent takes over
```

### Agent Assignment Waterfall

```
1. Dynamic routing rules (lead_routing_rules, priority ASC)
2. IST Time-Based Shift:
   NIGHT (20:00–10:59 IST): pool = [meghana, amit]
   DAY (11:00–19:59 IST): check Samson cap (<15), build pool
3. Fallback: pick_next_agent_for_domain(domain)
   → pg_advisory_xact_lock (burst-safe)
   → Round-robin: lowest new_lead_count, skips is_on_leave=true
   → Returns NULL if no eligible agents → lead inserted unassigned
```

### Atlas Unified Task Workflow

1. **Master task** — `createMasterTask` seeds `tasks` (`unified_task_type: master`), `projects`, `project_members`, three default Kanban groups, then sets `project_id` / `master_task_id` on the master row.
2. **Subtasks** — Live in `task_groups` columns; agent narrative in `task_remarks` (append-only), structured % progress in `task_progress_updates`; cache invalidation via `revalidateAtlasTaskSurfaces`.
3. **Task Insights** — `lib/actions/task-intelligence.ts`; role gate (manager or privileged); Realtime via `useTaskIntelligenceRealtime`. Main index: department filter chips, Agents + Workspaces tabs, prefetched agent summaries, no department card grid.

### Elia WhatsApp Profile Analysis

```
triggerEliaWhatsAppAnalysis(clientId)  [manager+ only]
  → lib/services/eliaProfileAnalysis.ts
    → lib/actions/chetto.ts → Chetto Joule timeline fetch
    → classify messages: client vs staff (e164LookupVariants)
    → skip if < 5 new client messages since elia_messages_through
    → buildWhatsAppProfilePrompt() → Haiku (max_tokens 2000)
    → UPDATE client_profiles SET elia_profile = {...}
    → INSERT if no row exists
    → ClientDetailView refetches via getClientById (tab stays on Profile)

Cron trigger: POST /api/elia/analyse-client
  → Bearer ELIA_ANALYSIS_SECRET
  → body: { clientId }
  → same runEliaWhatsAppAnalysis() service
```

---

## Section 9 — All Integrations

### Webhook Endpoints

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/webhooks/leads/meta` | POST | Bearer `PABBLY_META_SECRET` | Meta Lead Ads ingestion |
| `/api/webhooks/leads/google` | POST | Bearer `PABBLY_GOOGLE_SECRET` | Google Ads ingestion |
| `/api/webhooks/leads/website` | POST | Bearer `PABBLY_WEBSITE_SECRET` | Website form ingestion |
| `/api/webhooks/leads` | POST | ⚠️ Unknown | Legacy — unclear if active |
| `/api/webhooks/ads` | POST | Bearer `PABBLY_WEBHOOK_SECRET` | Campaign metrics upsert |
| `/api/webhooks/whatsapp` | GET/POST | HMAC-SHA256 `WHATSAPP_APP_SECRET` | Meta WhatsApp two-way sync |
| `/api/webhooks/gupshup` | POST | Bearer `GUPSHUP_WEBHOOK_SECRET` | Gupshup inbound bot messages |
| `/api/webhooks/onboarding-conversion` | POST | — | Onboarding conversion event |
| `/api/finance-notify` | POST | Bearer `INTERNAL_API_SECRET` | Won deal notification |
| `/api/chetto/find-group` | GET | Cookie session + `CHETTO_API_KEY` | Resolve concierge group by phone |
| `/api/chetto/timeline` | GET | Same | Proxy Joule message timeline |
| `/api/chetto/insights` | POST | Same | Chetto Intelligence prompt chips |
| `/api/elia/chat` | POST | Cookie session | Haiku chat (global or client-scoped) |
| `/api/elia/analyse-client` | POST | Bearer `ELIA_ANALYSIS_SECRET` | WhatsApp profile analysis cron |
| `/api/campaigns/sync` | POST | ⚠️ No auth visible | Campaign sync — audit needed |
| `/api/bootstrap` | POST | ⚠️ No auth visible | Bootstrap helper — audit needed |
| `/api/tv/onboarding-feed` | GET | TV token | TV display data |

---

## Section 10 — Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Bypasses RLS — webhooks + elia_profile writes |
| `PABBLY_WEBHOOK_SECRET` | ✅ | Campaign metrics endpoint |
| `PABBLY_META_SECRET` | ✅ | Meta lead ingestion |
| `PABBLY_GOOGLE_SECRET` | ✅ | Google lead ingestion |
| `PABBLY_WEBSITE_SECRET` | ✅ | Website form ingestion |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ | Meta phone number ID |
| `WHATSAPP_API_TOKEN` | ✅ | Meta Graph API Bearer token |
| `WHATSAPP_VERIFY_TOKEN` | ✅ | Meta webhook challenge |
| `WHATSAPP_APP_SECRET` | ✅ Mandatory | HMAC-SHA256 signature key |
| `INTERNAL_API_SECRET` | ✅ | Internal API auth (finance-notify) |
| `ANTHROPIC_API_KEY` | ✅ | All Elia + Gupshup bot Claude calls |
| `ELIA_ANALYSIS_SECRET` | ✅ | Cron auth for `/api/elia/analyse-client` |
| `FRESHDESK_API_KEY` | ✅ | Freshdesk REST API (server-only) |
| `CHETTO_API_KEY` | Optional | Chetto Joule — enables `/api/chetto/*` + Elia profile pipeline |
| `CHETTO_ORG_ID` | Optional | Chetto org identifier |
| `GUPSHUP_API_KEY` | ✅ (if bot active) | Gupshup outbound messages |
| `GUPSHUP_APP_NAME` | ✅ (if bot active) | Gupshup app name |
| `GUPSHUP_WEBHOOK_SECRET` | ✅ (if bot active) | Gupshup webhook Bearer auth |
| `NEXT_PUBLIC_APP_URL` | ✅ | Base URL for internal calls |
| `UPSTASH_REDIS_REST_URL` | ✅ Fail-closed | Upstash Redis endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ Fail-closed | Upstash Redis token |
| `SENTRY_DSN` | Optional | Server Sentry DSN (also hardcoded in config) |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Browser Sentry DSN |
| `SENTRY_AUTH_TOKEN` | Optional | Sentry source map upload (CI) |

**`.env.example`** exists at project root with placeholder values.

---

## Section 11 — Testing

### Current Coverage

Tests across 3 files (pure utility functions only):

| File | Cases | What's Tested |
|---|---|---|
| `__tests__/phone.test.ts` | 3 | `normalizeToE164()` |
| `__tests__/sanitize.test.ts` | 2 | `sanitizeFormData()` |
| `__tests__/time.test.ts` | ? | Time utilities |

### Infrastructure

- **Framework**: Vitest ^4.1.4, `@vitejs/plugin-react`, `vite-tsconfig-paths`
- **Environment**: `node` — pure function tests
- **CI**: `npx vitest run` on every push/PR to `main`

### Planned Coverage (`TESTING_MASTER_PLAN.md`)

263 planned cases across 4 tiers. Current gap: ~98%.

| Tier | Planned | Done |
|---|---|---|
| 1 — Core Business Logic | 100 | ~5 |
| 2 — Security & RLS | 54 | 0 |
| 3 — Data Front Door | 49 | 0 |
| 4 — Server Actions & E2E | 60 | 0 |

---

## Section 12 — Architectural Decisions

### Decision Log

| Decision | Rejected Alternatives | Reasoning |
|---|---|---|
| **Single `public` schema, naming conventions** | Schema-per-department | No benefit at current scale |
| **`employee_department` enum on `profiles`** | Separate join table | 95%+ employees are in one department |
| **Role + explicit scope grants** | Full ABAC/Casbin | Maintenance burden exceeds benefit |
| **Next.js monolith** | Separate API service | Doubles deployment surface; no benefit at current scale |
| **Sequential numbered migrations** | Timestamp-prefixed | Simpler at current scale; revisit when count exceeds 100 |
| **Two-axis access control (domain + department)** | Single-axis | CRM agents and internal staff have orthogonal needs |
| **`middleware.ts` re-exports `proxy.ts`** | Rename proxy.ts | Separation preserves implementation clarity; `proxy.ts` can be tested independently |
| **`sendDefaultPii: false` in Sentry** | PII enabled | UHNI client data cannot flow to a US-hosted third party |
| **Gupshup as second WhatsApp provider** | Extend Meta webhook | Gupshup provides managed bot session + outbound API; Meta webhook is for agent-side sync |
| **`bot_sessions` 7-turn limit** | Unlimited turns | Prevents infinite bot loops; ensures human handoff for qualified leads |

### Architectural Invariants

These are load-bearing decisions. Changing any requires a full architectural review.

1. `get_user_role()`, `get_user_domain()`, `get_user_department()` read **ONLY from `public.profiles`**. JWT claims are never trusted for authorization.
2. All SECURITY DEFINER functions have `SET search_path = public`.
3. `lead_activities` and `task_progress_updates` are append-only. No UPDATE or DELETE policies. Ever.
4. `components/ui/` is zero-dependency — no imports from `lib/actions/` or feature code.
5. Server Actions are the **only** entry point from components to database mutations.
6. All user-supplied text fields pass through `sanitizeText()` before any DB write.
7. Phone numbers are stored in E.164 format. `normalizeToE164()` on every phone field before insert.
8. The `pg_advisory_xact_lock` on `pick_next_agent_for_domain()` must never be removed.
9. `profiles.id` = `auth.users.id`. Every `profiles` row must have a corresponding `auth.users` row.
10. Every new table must have RLS enabled.
11. **Gupshup + Anthropic API keys are server-only.** `GUPSHUP_API_KEY` and `ANTHROPIC_API_KEY` must never appear in client bundles. All bot logic runs in `lib/services/gupshupChatbot.ts` — never import from client components.

**Next.js Server Actions:** Every **export** from `lib/actions/*.ts` (`"use server"`) must be an **`async`** Server Action. Synchronous helpers belong in plain modules such as `lib/elia/chat-prompt.ts`.

---

## Section 13 — Roadmap

### Phase 0 — Foundation Hardening (Items Remaining)

| Item | Status | Priority |
|---|---|---|
| ~~Create `middleware.ts` at root~~ | ✅ Done 2026-05-23 | ~~CRITICAL~~ |
| Remove mock data from `/concierge` page | ❌ Not done | High |
| Audit `/api/bootstrap` and `/api/campaigns/sync` — no visible auth | ❌ Not done | High |
| Audit legacy `/api/webhooks/leads` root endpoint — unclear if active | ❌ Not done | Medium |
| Convert `EliaSidePanel.jsx` to TypeScript | ❌ Not done | Medium |
| Remove `@deprecated SCOUT_TASK_TYPES` dead code | ❌ Not done | Low |
| Run `supabase gen types typescript` — replace handwritten database.ts | ❌ Not done | Medium |

**Completed Phase 0 items:**
- ✅ `middleware.ts` created — session refresh and edge auth gate live (2026-05-23)
- ✅ `sendDefaultPii: false` in Sentry
- ✅ `/scout/*` → `/manager/*` permanent redirects
- ✅ `agentRoutingConfig` wired into `leadIngestion.ts`
- ✅ `lib/utils/sla.ts` — duplicate `getOffDutyAnchor()` resolved
- ✅ Foundation migrations (062–094) run

### Phase 1 — Universal Employee Layer MVP

Goal: every employee has a daily reason to open Atlas beyond their CRM role.

Planned deliverables (in build order):
1. **Directory** (`/directory`) — org chart + employee profiles
2. **Announcements** (`/announcements`) — company/department broadcasts
3. **Notifications panel** — in-app notification center (`task_notifications` already exists)
4. **Leaves — Employee** (`/leaves`) — apply/track leave; `hr_leave_requests`, `hr_leave_balances`
5. **Leaves — Approval** — approve/reject; auto-sets `profiles.is_on_leave`
6. **Calendar extension** — add leave events + holidays to smart calendar
7. **Profile completeness** — edit `job_title`, `department`, `reports_to`, avatar

### Phase 2 — Department Workspace Rollout

1. **Concierge Workspace** — replace mock data; `crm_concierge_clients`, `crm_concierge_requests`
2. **Finance Employee Self-Service** — expense claims, advance requests, payslip viewer
3. **HR Workspace** — recruitment pipeline + onboarding checklists
4. **Marketing Workspace** — content calendar + asset library
5. **Tech Workspace** — ticket system + sprint board
6. **Finance Workspace (full)** — invoice management + budget vs actuals (budget tables already in 092)

### Phase 3 — AI Agent Layer (Elia)

Pre-conditions: `sys_audit_log` populated, `sys_api_keys` table + key validation middleware, context API endpoints.

Build order:
1. Agent infrastructure — `sys_api_keys`, validation middleware, audit log writer
2. Lead scoring agent — reads `getLeadContext()`, writes score + next_best_action
3. WhatsApp reply drafting — generates draft in `follow_up_drafts`; human approves
4. Morning briefing generation — replaces stub in `MorningBriefing.tsx`
5. Concierge request triage — vendor recommendation + complexity scoring
6. Gupshup bot: expand catalog, multi-turn memory improvements, image/media handling

---

## Section 14 — Changelog

| Date | Milestone |
|---|---|
| 2026-03-08 | Initial schema (`20260308000000_initial_schema.sql`) |
| 2026-03 to early Apr | Migrations 001–057: leads pipeline, tasks, shop, WhatsApp, field mapping |
| 2026-04-11 | Code Red security lockdown: migrations 058–060, per-channel webhook secrets, Sentry hardening, CI/CD |
| 2026-04-11 | DRY component library refactor: CVA variants, `IndulgeButton`, `IndulgeField`, `InfoRow` |
| 2026-04-22 | `ATLAS_BLUEPRINT.md` v1 + `audit.md` v1; migration 061 (`agent_routing_config`) |
| 2026-04-22–23 | Migrations 062–066: Projects system, department access control; `/scout/*` redirects; Sentry PII fix; `lib/utils/sla.ts` consolidated; manager suite; `lib/constants/departments.ts` |
| 2026-04-23 | `ATLAS_BLUEPRINT.md` v2 |
| 2026-04-30 | **v3** — 71 migrations through 080; Atlas unified tasks + Task Insights documented |
| 2026-05-05 | **v3.1** — Task Insights index refresh (Agents-first tabs, bento tiles, prefetch) |
| 2026-05-05 | **v3.2** — `/elia-preview` flagship chat: `EliaChat.tsx` + `EliaChatMessage.tsx` |
| 2026-05-06 | **v3.3** — Chetto WhatsApp tab on client dossier; Membership under Profile |
| 2026-05-07 | **v3.4** — Freshdesk pagination fix; open ticket stat rule updated |
| 2026-05-17 | **v3.5** — Elia WhatsApp profile analysis (migration 091); Profile tab Elia Intelligence |
| 2026-05-23 | **v4.0** — Migrations 092–094 (Budget, task indexes, Gupshup chatbot); `middleware.ts` live; Chetto mapping admin tool; Workspace module; `proxy.ts` auth-session log suppressed; BLUEPRINT updated to current state |

---

*End of ATLAS_BLUEPRINT.md*
*Supersedes all prior versions.*
*For Atlas Tasks / Task Insights / task_remarks / related migrations, see §2.1, §7, §8, and `TESTING_MASTER_PLAN.md`.*
*Review Section 13 (Roadmap) at the end of each Phase. Review Section 12 (Architectural Decisions) only when a revisit trigger is met.*

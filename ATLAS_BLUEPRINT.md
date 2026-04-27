# ATLAS BLUEPRINT
## Indulge Atlas — Complete System Reference & Architectural Contract

> **Authored**: 2026-04-23  
> **Based on**: Full codebase audit, all 66 migrations, all lib/ and app/ directories, git status  
> **Status**: Authoritative specification. Supersedes all prior versions.  
> **Audience**: Engineers, technical stakeholders.

---

## Section 1 — Project Vision & Context

### What Is Indulge Atlas?

**Indulge Atlas** is a bespoke Company Operating System built exclusively for the **Indulge Group** — a high-ticket luxury lifestyle brand ecosystem. It began as a CRM for inbound sales and is evolving into a full internal platform covering CRM, team collaboration, project management, and AI-assisted workflows.

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
- **Admins/Founders** — user management, routing rules, integrations, full visibility
- **Internal support staff** (Tech, Finance, Marketing, Onboarding) — projects, tasks, cross-domain analytics
- **Elia AI** — AI assistant (in preview) embedded in the sidebar

### Core Problems Solved

1. **Speed-to-Lead**: Sub-5-minute inbound lead response with SLA monitoring and breach alerts
2. **Multi-channel ingestion**: Meta Lead Ads, Google Ads, website forms, and WhatsApp → single `leads` table
3. **Multi-tenant data isolation**: Four business units share one database; PostgreSQL RLS enforces complete row-level separation
4. **WhatsApp-first communication**: Two-way sync with Meta Cloud API from inside the lead dossier
5. **Gamified SLA compliance**: Real-time breach detection surfaced to agents and managers
6. **Team collaboration**: Projects, tasks, internal chat across all departments

---

## Section 2 — Current Status

### 2.1 Production-Ready (Hardened with RLS, Auth, Audit Trail)

**CRM Core:**
- Lead ingestion pipeline (Meta, Google, website, WhatsApp) via Pabbly webhooks with per-channel Bearer auth, HMAC-SHA256 WhatsApp verification, rate limiting, dynamic field mapping engine, burst-safe advisory-locked round-robin agent assignment
- `agentRoutingConfig` is now wired into `leadIngestion.ts` — hardcoded email pool is supplemented by the DB-driven config
- Lead dossier (`/leads/[id]`) — full 8-stage pipeline, WhatsApp two-way sync, activity timeline, tasks, disposition modals, scratchpad, follow-up drafts, executive dossier, tags
- Leads table (`/leads`) — paginated, filterable by status/domain/source
- Global WhatsApp Hub (`/whatsapp`) — master-detail, `DISTINCT ON` view for latest threads
- SLA monitor (`useSLA_Monitor`) — 60s polling, Level 1/2/3 breach detection, IST-aware off-duty anchors via consolidated `lib/utils/sla.ts`
- Shop War Room (`/shop/workspace`) — task-based WhatsApp sales, atomic `target_sold` RPC, order registration, master targets
- Admin panel — user management, routing rules editor, field mapping builder, webhook endpoint status, onboarding oversight
- Campaign metrics — ad spend sync from Meta/Google via Pabbly, upsert to `campaign_metrics`, campaign dossier views
- Authentication — Supabase Auth PKCE, cookie sessions, profile-based role resolution (post-058 hardened)
- Security vault — RLS on all tables, `get_user_role()` reads only from `profiles`, JWT claims never trusted for authorization

**Manager Command Center (`/manager/`):**
- Full route suite: `dashboard`, `campaigns`, `campaigns/[id]`, `planner`, `roster`, `team`
- Morning Briefing component, Campaign Dossier, Agent Roster, Conversion Feed, Velocity Funnel, World Clock
- `lib/actions/manager-analytics.ts` — real analytics data (leaderboard, funnel, wins)
- `/scout/*` routes are permanently redirected (301) to `/manager/*` in `next.config.ts`

**Projects System (Migrations 062–065, fully live):**
- `projects`, `project_members`, `task_groups`, `task_comments`, `task_progress_updates` tables with full RLS
- `tasks` table extended: `project_id`, `group_id`, `parent_task_id`, `priority`, `progress`, `estimated_minutes`, `actual_minutes`, `position`, `tags`, `attachments`
- `components/projects/` — board view, list view, project card, task card, task detail sheet, create project modal, update progress modal
- `app/(dashboard)/projects/` — projects index + `[id]` detail page
- `lib/actions/projects.ts` — full CRUD for projects, task groups, tasks within projects
- `lib/hooks/useTaskRealtime.ts` — Realtime subscription for task comments and progress updates

**Department Access Control (Migration 066, fully live):**
- `employee_department` enum: `concierge`, `finance`, `tech`, `shop`, `house`, `legacy`, `marketing`, `onboarding`
- `profiles` extended: `department`, `job_title`, `reports_to` columns
- `get_user_department()` SECURITY DEFINER function (same pattern as `get_user_role()`)
- `indulge_global` domain re-added to enum as a real value for cross-department read access
- `lib/constants/departments.ts` — `DEPARTMENT_CONFIG`, `DOMAIN_CONFIG`, `DEPARTMENT_ROUTE_ACCESS` — single source of truth for all UI routing and access logic
- Sidebar filters nav items based on department route access map
- Profiles SELECT policy updated: all authenticated users can read all profiles (for directory)
- Leads SELECT policy updated: `indulge_global` domain users see all leads across all domains

**Security Hardening (done):**
- `sendDefaultPii: false` in `sentry.server.config.ts` — PII no longer forwarded to Sentry
- Per-channel Pabbly secrets (Meta/Google/website each have independent Bearer tokens)
- HMAC-SHA256 WhatsApp webhook verification (`WHATSAPP_APP_SECRET` mandatory)
- `lib/utils/sla.ts` — consolidated `getOffDutyAnchor()` (duplicate implementation resolved)

### 2.2 In Preview / Partially Built

| Feature | Location | Status |
|---|---|---|
| Elia AI Assistant | `app/(dashboard)/elia-preview/page.tsx`, `components/elia/EliaSidePanel.jsx` | UI built in JSX (not TSX), design tokens inline; no backend yet |
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

1. **`proxy.ts` is dead code — middleware is not running.** `middleware.ts` does not exist at the project root. Next.js only loads middleware from `middleware.ts`. Session refresh and edge-level auth gate are non-functional. Auth is enforced only by the RSC `app/(dashboard)/layout.tsx` (fires after render begins, not at the edge). Fix: create `middleware.ts` at root that exports `{ proxy as middleware, config } from "./proxy"`.

2. **Hardcoded agent emails still partially present in `leadIngestion.ts`.** While `agentRoutingConfig` is now imported, the hardcoded shift pool logic (night/day shift, Samson cap) still references specific email addresses. Agent identity is still partially source-code-level configuration.

3. **`/api/webhooks/leads/route.ts` (legacy root endpoint)** — exists alongside per-channel routes; unclear if it receives live traffic. Needs confirmation before removal.

4. **`lib/concierge/mockData.ts` serves a live route** — the concierge page appears in the sidebar and shows fabricated UHNI data to real users.

5. **`EliaSidePanel.jsx` is `.jsx` not `.tsx`** — the rest of the codebase is TypeScript strict mode. This file bypasses type safety.

6. **`supabase/20260308000000_initial_schema.sql`** — a migration file outside the numbered `001–066` sequence; its relationship to the canonical migration history is ambiguous.

### 2.5 Tech Debt Items (Non-Blocking)

- `lib/briefing/executiveBriefing.ts` — exists but no clear UI surface consuming it; may be dead code
- `SCOUT_TASK_TYPES` — marked `@deprecated` in `lib/types/database.ts`, still present
- Dual-write in `lead_activities` — old columns (`performed_by`, `type`, `payload`) still written alongside new (`actor_id`, `action_type`, `details`)
- `tsconfig.tsbuildinfo` — committed to repo; should be gitignored
- `.DS_Store` files in multiple directories — should be gitignored
- `tracesSampleRate: 1` in Sentry configs — 100% sampling is expensive at production scale; should be reduced to 0.1
- No `.env.example` ⚠️ Actually: `.env.example` DOES exist in the project root (visible in directory listing)
- `next-themes` installed but dark/light toggle is not user-facing

---

## Section 3 — Full Tech Stack

### Runtime

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js App Router | 16.1.6 |
| Runtime | React | 19.2.3 |
| Language | TypeScript | ^5 (strict mode) |
| Package Manager | npm | (lockfile present) |

> ⚠️ **Next.js 16.1.6 + React 19**: Bleeding edge — beyond current stable 15.x. Introduces upgrade risk. Uses Turbopack (`turbopack: { root: process.cwd() }` in next.config.ts).

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
| Deployment | Vercel (inferred from Next.js stack + Sentry config) |

### External Services

| Service | Protocol | Used For |
|---|---|---|
| Meta WhatsApp Cloud API (v19.0) | REST + HMAC webhook | Outbound messages + inbound webhook sync |
| Pabbly Connect | Webhook intermediary | ETL from Meta/Google Ads + website forms |
| Meta Lead Ads | Via Pabbly | Lead form submissions |
| Google Ads | Via Pabbly | Lead form submissions |
| Upstash Redis | REST | Sliding-window rate limiting on webhooks |
| Sentry | SDK | Error monitoring + performance tracing |
| Supabase | Managed Postgres + Auth + Realtime + Storage | Database, auth, real-time subscriptions |

---

## Section 4 — Architecture Overview

### High-Level Pattern

Full-stack monolith on Next.js App Router. Server Components, Server Actions, and API Route Handlers coexist in a single deployable application. No separate backend service.

```
┌──────────────────────────────────────────────────────────────┐
│                     Next.js 16 Monolith                      │
│                                                              │
│  ┌──────────────────┐   ┌─────────────────────────────────┐  │
│  │ App Router        │   │ API Routes (/api/...)            │  │
│  │ (RSC + Actions)  │   │ webhooks/leads/{meta,google,web} │  │
│  │                  │   │ webhooks/whatsapp                │  │
│  │ /dashboard/**    │   │ webhooks/ads                    │  │
│  │ /auth/**         │   │ finance-notify                  │  │
│  │ /tv/**           │   │ campaigns/sync                  │  │
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
          ┌────────────────┼──────────────┐
          │                │              │
     Pabbly Connect    Meta Cloud API  Upstash Redis
     (webhook ETL)     (WhatsApp)     (rate limiting)
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
| Auth session | Supabase cookie (HTTP-only) | `@supabase/ssr` |
| User profile | `ProfileProvider` context | Fetched once in DashboardLayout |
| SLA breach state | `SLAProvider` context | 60s polling via `useSLA_Monitor` |
| Task alerts | `TaskAlertProvider` context | Supabase Realtime |
| Lead alerts | `LeadAlertProvider` context | Supabase Realtime |
| Chat messages | `useMessages` hook | Supabase Realtime |
| Project task updates | `useTaskRealtime` hook | Supabase Realtime |
| Server data | Next.js Data Cache | RSC fetch + `revalidatePath()` |
| Rate limit counters | Upstash Redis | External, persistent |
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

```
/
├── __tests__/                      Vitest test files (5 cases — see Section 11)
│   ├── phone.test.ts
│   └── sanitize.test.ts
│
├── .github/workflows/ci.yml        GitHub Actions: lint + test on push/PR to main
├── .env.example                    Template for required env vars (committed)
│
├── app/
│   ├── layout.tsx                  Root layout: fonts, Sentry, global providers
│   ├── globals.css                 Tailwind @import + design tokens (colors, surfaces, canvas)
│   ├── error.tsx                   Non-catastrophic error boundary
│   ├── global-error.tsx            Last-resort boundary + Sentry.captureException
│   │
│   ├── (auth)/                     No shared layout — login, forgot-password, update-password
│   │
│   ├── (dashboard)/                Authenticated shell — shares DashboardLayout
│   │   ├── layout.tsx              Auth gate + provider tree + layout-canvas
│   │   ├── page.tsx                / — Agent Dashboard
│   │   ├── leads/                  Leads table + Lead Dossier RSC
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx       Lead Dossier (force-dynamic RSC)
│   │   ├── tasks/page.tsx
│   │   ├── workspace/page.tsx
│   │   ├── calendar/page.tsx
│   │   ├── performance/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── whatsapp/page.tsx
│   │   ├── escalations/page.tsx
│   │   ├── conversions/page.tsx
│   │   ├── concierge/page.tsx      ⚠️ MOCK DATA — full mock UHNI profiles served
│   │   ├── elia-preview/page.tsx   Elia AI assistant preview (in development)
│   │   ├── indulge-world/page.tsx  Brand/org chart page
│   │   ├── projects/               Projects system
│   │   │   ├── page.tsx            Projects index
│   │   │   └── [id]/page.tsx       Project board/detail
│   │   ├── manager/                Manager workspace (fully consolidated)
│   │   │   ├── page.tsx            Manager Command Center
│   │   │   ├── campaigns/          Campaign list + [id] dossier
│   │   │   ├── planner/            Ad Planner Studio
│   │   │   ├── roster/             Agent roster
│   │   │   └── team/               Team management
│   │   ├── admin/                  Admin-role views (user mgmt, routing, integrations)
│   │   └── shop/workspace/         Shop War Room
│   │
│   ├── api/
│   │   ├── bootstrap/              One-time DB bootstrap helper
│   │   ├── campaigns/sync/         Campaign metrics sync
│   │   ├── finance-notify/         Internal: called on won deal
│   │   ├── tv/onboarding-feed/     TV dashboard data feed
│   │   └── webhooks/
│   │       ├── ads/                Pabbly → campaign_metrics upsert
│   │       ├── leads/              Legacy combined endpoint (⚠️ status unclear)
│   │       ├── leads/meta/
│   │       ├── leads/google/
│   │       ├── leads/website/
│   │       ├── onboarding-conversion/
│   │       └── whatsapp/           Two-way WhatsApp Cloud API sync
│   │
│   ├── auth/callback/              Supabase PKCE auth callback
│   └── tv/conversions/             TV display mode (no standard auth)
│
├── components/
│   ├── ui/                         Zero-dependency design system primitives
│   │   ├── button.tsx              CVA — 8 variants × 6 sizes
│   │   ├── indulge-button.tsx      Extends Button: loading state + icon slots
│   │   ├── input.tsx               CVA — size + error props
│   │   ├── card.tsx                surfaceCardVariants (5 tones × 4 elevations) + Card family
│   │   ├── indulge-field.tsx       Form field wrapper: label + error + hint
│   │   ├── info-row.tsx            Canonical icon-label-value row (Lead Dossier)
│   │   └── ...                     badge, dialog, sheet, select, skeleton, tabs, tooltip, etc.
│   │
│   ├── layout/                     Sidebar, TopBar, NotificationBell
│   ├── leads/                      All CRM lead components (dossier, modals, table)
│   ├── admin/                      Admin panel components
│   ├── chat/                       GlobalChatDrawer, LeadContextChat, ChatProvider
│   ├── calendar/                   Smart calendar views
│   ├── dashboard/                  Agent dashboard widgets
│   ├── escalations/                SLA escalation table
│   ├── manager/                    Full manager suite components (Morning Briefing, etc.)
│   ├── projects/                   Project board, list, cards, task detail sheet
│   ├── concierge/                  ConciergeClient.tsx — ⚠️ ALL MOCK DATA
│   ├── elia/                       EliaSidePanel.jsx — AI assistant preview
│   ├── shop/                       Shop War Room components
│   ├── sla/                        SLAProvider + ProfileProvider
│   ├── providers/                  TaskAlertProvider, LeadAlertProvider, CommandPaletteProvider
│   ├── domain/                     DomainSwitcher
│   └── indulge-world/              Brand/org chart views
│
├── lib/
│   ├── actions/                    Next.js Server Actions ("use server") — the only component-facing data layer
│   │   ├── leads.ts                Lead status transitions, activity logging, won deal
│   │   ├── tasks.ts                Task CRUD (CRM + personal)
│   │   ├── projects.ts             Project + task group + project task CRUD
│   │   ├── shop-tasks.ts           Shop task creation + sale registration
│   │   ├── whatsapp.ts             sendWhatsAppMessage()
│   │   ├── admin.ts                User management
│   │   ├── auth.ts                 signIn, signOut
│   │   ├── campaigns.ts            Campaign metrics
│   │   ├── dashboards.ts           getDashboardData()
│   │   ├── manager-analytics.ts    Manager-level analytics (leaderboard, funnel, wins)
│   │   ├── performance.ts          Agent performance stats
│   │   ├── planner.ts              Ad Planner Studio
│   │   ├── roster.ts               Agent roster data
│   │   ├── routing-rules.ts        Routing rules CRUD
│   │   ├── search.ts               Global command palette search
│   │   ├── team-stats.ts           Team statistics
│   │   └── ...                     briefing, calendar, messages, profile, workspace, etc.
│   │
│   ├── services/                   Core business services (not component-facing)
│   │   ├── leadIngestion.ts        processAndInsertLead(), IST shift waterfall
│   │   ├── fieldMappingEngine.ts   Dynamic field mapping from DB rules
│   │   ├── evaluateRoutingRules.ts Pure routing rule evaluation (no I/O)
│   │   ├── agentRoutingConfig.ts   DB-driven agent routing config (wired into ingestion)
│   │   ├── campaign-sync.ts        Campaign metrics sync logic
│   │   └── webhookLog.ts           Fire-and-forget webhook logging
│   │
│   ├── utils/
│   │   ├── sanitize.ts             sanitizeText() + sanitizeFormData()
│   │   ├── phone.ts                normalizeToE164() + e164LookupVariants()
│   │   ├── webhook.ts              verifyPabblyWebhook() + verifyBearerSecret()
│   │   ├── rateLimit.ts            Upstash sliding-window rate limiter
│   │   ├── sla.ts                  getOffDutyAnchor() — consolidated shared SLA utility
│   │   ├── date-format.ts          IST-aware date formatters
│   │   └── ...                     time, audio, lead-source-mapper
│   │
│   ├── hooks/
│   │   ├── useSLA_Monitor.ts       Client-side SLA breach detection (60s poll)
│   │   ├── useSlaAlerts.ts         SLA alert toast logic
│   │   ├── useSlaAlerts.utils.ts   computeBreachLevel() pure function
│   │   ├── useMessages.ts          Supabase Realtime subscription for chat
│   │   ├── useTaskRealtime.ts      Realtime for task comments + progress updates
│   │   └── ...                     useDebounce, useClientOnly, useUserDomain
│   │
│   ├── constants/
│   │   └── departments.ts          DEPARTMENT_CONFIG, DOMAIN_CONFIG, DEPARTMENT_ROUTE_ACCESS
│   │
│   ├── supabase/
│   │   ├── client.ts               Browser client (singleton)
│   │   ├── server.ts               Server client (cookie-aware)
│   │   └── service.ts              Service role client (bypasses RLS — webhooks only)
│   │
│   ├── types/
│   │   ├── database.ts             All TypeScript types + constants (HAND-WRITTEN — not generated)
│   │   └── campaigns.ts            Campaign-specific types
│   │
│   ├── concierge/mockData.ts       ⚠️ MOCK DATA in production path
│   ├── data/campaigns-mock.ts      ⚠️ MOCK DATA (latent — may not be imported)
│   └── ...                         briefing, leads/, schemas/, tv/, shop/, onboarding/
│
├── supabase/
│   ├── config.toml                 Supabase CLI project config
│   ├── 20260308000000_initial_schema.sql  ⚠️ Outside numbered sequence — relationship unclear
│   └── migrations/                 66 sequential migration files (001–066)
│
├── proxy.ts                        Next.js middleware IMPLEMENTATION — ⚠️ NOT auto-loaded (no middleware.ts)
├── next.config.ts                  Next.js config + Sentry + /scout/* redirects
├── TESTING_MASTER_PLAN.md          263-case test specification (only 5 cases implemented)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── sentry.server.config.ts
├── sentry.edge.config.ts
└── instrumentation.ts
```

---

## Section 6 — Authentication & Authorization

### Authentication Flow

1. User submits email/password at `/login` → `lib/actions/auth.ts` → `supabase.auth.signInWithPassword()`
2. Supabase returns session JWT stored in HTTP-only cookies via `@supabase/ssr`
3. `proxy.ts` (middleware) contains session refresh and redirect logic — **but `middleware.ts` does not exist, so this is not running**
4. Auth gate is enforced by `app/(dashboard)/layout.tsx` RSC — calls `supabase.auth.getUser()`, redirects to `/login` if missing
5. Password reset: `/forgot-password` → `/update-password` via `auth/callback/route.ts` (PKCE)

### Authorization — Three-Layer Defense

1. **Middleware** (`proxy.ts`): ⚠️ NOT RUNNING — see critical bug
2. **Server Actions** (`getAuthUser()`): Every mutation re-authenticates, fetches role from `profiles`, checks ownership
3. **PostgreSQL RLS**: All queries subject to row-level policies calling `get_user_role()`, `get_user_domain()`, `get_user_department()`

### Access Control Axes

**Two orthogonal axes govern what a user can do:**

| Axis | Field | Controls | Mechanism |
|---|---|---|---|
| **Data** | `profiles.domain` | What rows you can read/write | RLS via `get_user_domain()` |
| **Workspace** | `profiles.department` | What screens/routes you can open | `DEPARTMENT_ROUTE_ACCESS` in `lib/constants/departments.ts` |

### Roles (post-056)

| Role | Access |
|---|---|
| `admin` | Full system access, all domains, user management |
| `founder` | Same as admin for data; no DELETE on profiles |
| `manager` | Full CRUD within own domain (was `scout` pre-056) |
| `agent` | Own assigned leads/tasks within own domain |
| `guest` | SELECT only, own domain (was `finance` pre-056) |

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

66 sequential migrations in `supabase/migrations/001–066`. Key milestones:

| Migration | Change |
|---|---|
| 011 | Fresh schema — profiles, leads, tasks |
| 029 | 8-stage lead status pipeline |
| 031 | Comprehensive RLS enablement |
| 041 | Multi-tenant domain isolation |
| 053 | Shop War Room workspace |
| 055 | WhatsApp messages table |
| 056 | Strict tenant isolation — scout→manager, finance→guest, indulge_global→indulge_concierge rename |
| 057 | Dynamic field mapping engine |
| 058 | **RLS Security Hardening** — JWT claims removed from authorization, profiles-only |
| 059 | Missing indexes (5 strategic indexes on leads) |
| 060 | Advisory lock on agent assignment, `vw_latest_whatsapp_threads` view |
| 061 | `agent_routing_config` table |
| 062 | `projects`, `project_members`, `task_groups` tables + RLS |
| 063 | `tasks` extended with project system columns |
| 064 | `task_comments`, `task_progress_updates` tables |
| 065 | `tasks.due_date` nullable |
| 066 | `employee_department` enum, `profiles.department/job_title/reports_to`, `get_user_department()`, `indulge_global` re-added, updated RLS |

### Core Tables

#### `profiles`
One row per auth user. RLS authorization anchor. Auto-created by `on_auth_user_created` trigger.

| Key Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK = `auth.users.id` |
| `role` | user_role enum | admin/founder/manager/agent/guest |
| `domain` | indulge_domain enum | Business unit assignment (drives RLS) |
| `department` | employee_department enum | NULL for admin/founder (added 066) |
| `job_title` | text | Display only (added 066) |
| `reports_to` | uuid → profiles | Org hierarchy (added 066) |
| `is_active` | boolean | Set false to deactivate without deleting |
| `is_on_leave` | boolean | Agent leave status — prevents lead assignment |

#### `leads`
Central CRM entity. 8-stage pipeline: `new → attempted → connected → in_discussion → won/nurturing/lost/trash`

Key columns: `phone_number` (E.164), `domain`, `status`, `assigned_to`, `assigned_at`, `is_off_duty`, `form_data` (JSONB — zero data loss), `follow_up_drafts`, `private_scratchpad`, `tags`, `deal_value`

#### `tasks`
Multi-purpose: CRM lead tasks, shop tasks, personal tasks, project tasks. Discriminated by:
- `lead_id IS NOT NULL` → CRM task
- `shop_operation_scope IS NOT NULL` → Shop War Room task
- `project_id IS NOT NULL` → Project task
- All nulls → personal task

Extended in 062/063 with: `project_id`, `group_id`, `parent_task_id`, `priority`, `progress`, `estimated_minutes`, `actual_minutes`, `position`, `tags`, `attachments`

#### `lead_activities`
Immutable audit log. No UPDATE or DELETE policies. Dual-write (legacy + new columns) for backward compat.

#### `projects` / `project_members` / `task_groups`
Project system (migration 062). RLS uses `is_project_member()` and `get_project_member_role()` helper functions. Four project roles: `owner`, `manager`, `member`, `viewer`.

#### `task_comments` / `task_progress_updates`
Added in migration 064. `task_progress_updates` is append-only (no UPDATE/DELETE policies). Both published to Supabase Realtime via `useTaskRealtime` hook.

#### Other Core Tables

| Table | Purpose |
|---|---|
| `whatsapp_messages` | Two-way WhatsApp thread per lead |
| `campaign_metrics` | Cached ad spend (Meta/Google via Pabbly) |
| `campaign_drafts` | Ad Planner Studio saves |
| `shop_orders` | Shop order lifecycle |
| `shop_master_targets` | Admin-defined inventory targets |
| `lead_routing_rules` | Dynamic routing rules |
| `field_mappings` | Dynamic webhook field mapping config |
| `webhook_endpoints` | Webhook endpoint status |
| `webhook_logs` | Raw inbound payload archive |
| `clients` | Promoted from leads on `status = won` |
| `onboarding_leads` | Separate onboarding tracking |
| `personal_todos` | Agent-private to-do items |
| `sla_alert_tracking` | Per-lead SLA alert sent flags |
| `agent_routing_config` | DB-driven agent routing configuration |

### Database Functions

| Function | Purpose |
|---|---|
| `get_user_role()` | Profiles-only role resolver (SECURITY DEFINER, no JWT) |
| `get_user_domain()` | Profiles-only domain resolver |
| `get_user_department()` | Profiles-only department resolver (added 066) |
| `pick_next_agent_for_domain(domain)` | Round-robin with `pg_advisory_xact_lock` — burst-safe serialization |
| `increment_shop_task_target_sold(task_id)` | Atomic counter increment |
| `get_project_member_role(project_id)` | Returns current user's role in a project |
| `is_project_member(project_id)` | Returns true if current user is a project member |
| `handle_new_user()` | Trigger: creates profiles row; reads role/domain/department from `raw_app_meta_data` only |
| `set_updated_at()` | Trigger function: updates `updated_at = now()` |

### Database Views

| View | Purpose |
|---|---|
| `vw_latest_whatsapp_threads` | `DISTINCT ON (lead_id)` — latest WhatsApp message per lead (O(log n) via index) |

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

### Agent Assignment Waterfall (`resolveAssignedAgent()`)

```
1. Dynamic routing rules (from lead_routing_rules table, priority ASC)
   → If assign_to_agent rule matches → return agent UUID
   → If route_to_domain_pool matches → override domain, continue

2. IST Time-Based Shift Check (getCurrentHourIST())
   NIGHT (20:00–10:59 IST): pool = [meghana, amit]
   DAY (11:00–19:59 IST):
     → Check Samson daily cap (<15): pool = [samson, meghana, amit, kaniisha]
     → Samson at cap: pool = [meghana, amit, kaniisha]
   → pickNextAgentForDomain(domain, pool)

3. Final fallback: pick_next_agent_for_domain(domain)
   → pg_advisory_xact_lock (domain-scoped, burst-safe)
   → Round-robin: lowest new_lead_count, skips is_on_leave=true, cap<15
   → Returns NULL if no eligible agents → lead inserted unassigned
```

### Lead Dossier Async Sections

| Section | Data Source | Notes |
|---|---|---|
| Lead Journey Bar | `lead_activities` | Timeline stage progress |
| Status Action Panel | Server Actions | 8-stage transitions with optimistic UI |
| Task Widget | `tasks WHERE lead_id = X` | |
| WhatsApp Chat | `whatsapp_messages WHERE lead_id = X` | |
| Activity Timeline | `lead_activities` (reverse-chronological) | |
| Context Chat | Internal chat via `useMessages` | Supabase Realtime |
| Executive Dossier | `company`, `personal_details`, `private_scratchpad` | |
| Follow-Up Drafts | `follow_up_drafts` JSONB | 3-strike system |

### Shop War Room Flow

1. Admin creates a shop task with `shop_operation_scope`, `target_inventory`, `shop_product_name`
2. Agent registers a sale via `registerTaskSale()` → INSERT `shop_orders` + `increment_shop_task_target_sold()` RPC (atomic)
3. `shop_master_targets.inventory_sold` incremented via trigger on `shop_target_updates` INSERT

### WhatsApp Two-Way Sync

**Outbound:** `sendWhatsAppMessage(leadId, text)` → Zod validate → auth check → fetch lead phone → POST Meta Graph API v19.0 → INSERT `whatsapp_messages` (outbound) → revalidatePath

**Inbound:** POST `/api/webhooks/whatsapp` → rate limit → HMAC-SHA256 verify → return 200 immediately → `after()` async processing → deduplicate by `wa_message_id` → phone lookup variants → INSERT `whatsapp_messages` (inbound) OR `processAndInsertLead()` if no match

### Project Task Workflow

1. User creates project → auto-added as `owner` in `project_members`
2. Owner/manager adds task groups (board columns) with position ordering
3. Members create tasks within groups with priority, assignees, due dates
4. Real-time updates via `useTaskRealtime` subscription on `task_comments` and `task_progress_updates`
5. Progress logged as append-only entries in `task_progress_updates`

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
| `/api/webhooks/whatsapp` | GET/POST | HMAC-SHA256 `WHATSAPP_APP_SECRET` | WhatsApp two-way sync |
| `/api/webhooks/onboarding-conversion` | POST | — | Onboarding conversion event |
| `/api/finance-notify` | POST | Bearer `INTERNAL_API_SECRET` | Won deal notification |
| `/api/campaigns/sync` | POST | — | ⚠️ No auth visible — audit needed |
| `/api/bootstrap` | POST | — | ⚠️ No auth visible — audit needed |
| `/api/tv/onboarding-feed` | GET | TV token | TV display data |

### External Services

| Service | Env Var(s) | Protocol |
|---|---|---|
| Meta WhatsApp Cloud API | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | REST + HMAC |
| Pabbly Connect | `PABBLY_META_SECRET`, `PABBLY_GOOGLE_SECRET`, `PABBLY_WEBSITE_SECRET`, `PABBLY_WEBHOOK_SECRET` | Webhook ETL |
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | REST |
| Sentry | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | SDK |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | REST + WS |

---

## Section 10 — Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Bypasses RLS for webhook writes |
| `PABBLY_WEBHOOK_SECRET` | ✅ | Campaign metrics endpoint |
| `PABBLY_META_SECRET` | ✅ | Meta lead ingestion |
| `PABBLY_GOOGLE_SECRET` | ✅ | Google lead ingestion |
| `PABBLY_WEBSITE_SECRET` | ✅ | Website form ingestion |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ | Meta phone number ID |
| `WHATSAPP_API_TOKEN` | ✅ | Meta Graph API Bearer token |
| `WHATSAPP_VERIFY_TOKEN` | ✅ | Meta webhook challenge |
| `WHATSAPP_APP_SECRET` | ✅ Mandatory | HMAC-SHA256 signature key |
| `INTERNAL_API_SECRET` | ✅ | Internal API auth (finance-notify) |
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

5 test cases across 2 files (pure utility functions only):

| File | Cases | What's Tested |
|---|---|---|
| `__tests__/phone.test.ts` | 3 | `normalizeToE164()` |
| `__tests__/sanitize.test.ts` | 2 | `sanitizeFormData()` |

### Infrastructure

- **Framework**: Vitest ^4.1.4, `@vitejs/plugin-react`, `vite-tsconfig-paths`
- **Environment**: `node` (not jsdom) — pure function tests
- **Globals**: `describe`/`it`/`expect` without imports
- **CI**: `npx vitest run` on every push/PR to `main`

### Planned Coverage (`TESTING_MASTER_PLAN.md`)

263 planned cases across 4 tiers. Current gap: 98%.

| Tier | Planned | Done |
|---|---|---|
| 1 — Core Business Logic | 100 | 5 |
| 2 — Security & RLS | 54 | 0 |
| 3 — Data Front Door | 49 | 0 |
| 4 — Server Actions & E2E | 60 | 0 |

**Functions requiring export before they can be tested:**
- `applyTransformation` / `getNestedValue` in `fieldMappingEngine.ts`
- `splitFullName` / `isOffDutyInsertion` in `leadIngestion.ts`
- `verifyMetaSignature` / `extractMessageBody` in WhatsApp route (extract to `lib/utils/whatsapp-helpers.ts`)

---

## Section 12 — Architectural Decisions

### Decision Log

| Decision | Rejected Alternatives | Reasoning |
|---|---|---|
| **Single `public` schema, naming conventions** | Schema-per-department | No benefit at current scale; adds operational surface area; breaks RLS helper pattern |
| **`employee_department` enum on `profiles`** | Separate join table | 95%+ employees are in one department; join adds query complexity for no benefit |
| **Role + explicit scope grants** | Full ABAC/Casbin | Maintenance burden exceeds benefit; 5-role model with scopes covers all foreseeable cases |
| **Supabase Storage (planned)** | AWS S3, Cloudinary | Integrates with Supabase RLS; one fewer external service |
| **Realtime for entities, SSE for user notifications (planned)** | WebSockets, polling | WebSockets require persistent server (not Vercel-compatible); polling is wasteful |
| **Next.js monolith** | Separate API service | Doubles deployment surface; no benefit at current scale |
| **SHA-256 hash for API keys (planned)** | JWT agent auth | Individual revocation via `is_active=false`; JWTs require a blocklist |
| **`proxy.ts` retained, `middleware.ts` needed** | Rename `proxy.ts` | Current state is a bug — `middleware.ts` must be created to re-export from `proxy.ts` |
| **`sendDefaultPii: false` in Sentry** | PII enabled | UHNI client data cannot flow to a US-hosted third party; fixed as of 2026-04-22 |
| **Sequential numbered migrations** | Timestamp-prefixed | Simpler at current scale; revisit when count exceeds 100 |
| **Two-axis access control (domain + department)** | Single-axis | CRM agents and internal staff have orthogonal needs: domain drives data, department drives screens |

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

---

## Section 13 — Roadmap

### Phase 0 — Foundation Hardening (Items Remaining)

**Blockers that must be resolved before building new features:**

| Item | Status | Priority |
|---|---|---|
| Create `middleware.ts` at root (export from `proxy.ts`) | ❌ Not done | **CRITICAL** |
| Remove mock data from `/concierge` page | ❌ Not done | High |
| Audit `/api/bootstrap` and `/api/campaigns/sync` — no visible auth | ❌ Not done | High |
| Audit legacy `/api/webhooks/leads` root endpoint — unclear if active | ❌ Not done | Medium |
| Convert `EliaSidePanel.jsx` to TypeScript | ❌ Not done | Medium |
| Remove `@deprecated SCOUT_TASK_TYPES` dead code | ❌ Not done | Low |
| Run `supabase gen types typescript` — replace handwritten database.ts | ❌ Not done | Medium |

**Completed Phase 0 items:**
- ✅ `sendDefaultPii: false` in Sentry
- ✅ `/scout/*` → `/manager/*` permanent redirects in `next.config.ts`
- ✅ `agentRoutingConfig` wired into `leadIngestion.ts`
- ✅ `lib/utils/sla.ts` created — duplicate `getOffDutyAnchor()` resolved
- ✅ Foundation migrations (062–066) run: department access, projects system

### Phase 1 — Universal Employee Layer MVP

Goal: every employee has a daily reason to open Atlas beyond their CRM role.

Planned deliverables (in build order):
1. **Directory** (`/directory`) — org chart + employee profiles (data columns already in `profiles` from migration 066)
2. **Announcements** (`/announcements`) — company/department broadcasts; `sys_announcements` table
3. **Notifications panel** — in-app notification center; `sys_notifications` + `sys_notification_prefs` + SSE
4. **Leaves — Employee** (`/leaves`) — apply/track leave; `hr_leave_requests`, `hr_leave_balances`, `hr_leave_types`, `hr_holidays`
5. **Leaves — Approval** — approve/reject for managers and HR; auto-sets `profiles.is_on_leave`
6. **Calendar extension** — add leave events + holidays to smart calendar
7. **Profile completeness** — edit `job_title`, `department`, `reports_to`, avatar

### Phase 2 — Department Workspace Rollout

Build sequence (by business priority):
1. **Concierge Workspace** — highest priority; `crm_concierge_clients`, `crm_concierge_requests`, `crm_concierge_vendors` tables; replace mock data
2. **Management Workspace** — extend existing with leave calendar + headcount from Phase 1
3. **Finance Employee Self-Service** — expense claims, advance requests, payslip viewer
4. **HR Workspace** — recruitment pipeline + onboarding checklists
5. **Marketing Workspace** — content calendar + asset library + campaign consolidation
6. **Tech Workspace** — ticket system + sprint board (dogfood Atlas's own dev process)
7. **Finance Workspace (full)** — invoice management + budget vs actuals

### Phase 3 — AI Agent Layer (Elia)

Pre-conditions:
1. `sys_audit_log` populated by all Server Actions
2. `sys_api_keys` table + key validation middleware
3. Context API endpoints for leads, concierge requests, leave requests

Build order:
1. Agent infrastructure — `sys_api_keys`, validation middleware, audit log writer
2. Lead scoring agent — reads `getLeadContext()`, writes score + next_best_action
3. WhatsApp reply drafting — generates draft stored in `follow_up_drafts`; human approves
4. Morning briefing generation — replaces stub in `MorningBriefing.tsx`
5. Concierge request triage — vendor recommendation + complexity scoring
6. IT ticket classification — auto type + priority from title + description

---

## Section 14 — Changelog

| Date | Milestone |
|---|---|
| 2026-03-08 | Initial schema (`20260308000000_initial_schema.sql`) |
| 2026-03 to early Apr | Migrations 001–057: leads pipeline, tasks, shop, WhatsApp, field mapping |
| 2026-04-11 | Code Red security lockdown: migrations 058–060, per-channel webhook secrets, Sentry hardening, CI/CD |
| 2026-04-11 | DRY component library refactor: CVA variants, `IndulgeButton`, `IndulgeField`, `InfoRow` |
| 2026-04-22 | `ATLAS_BLUEPRINT.md` v1 + `audit.md` v1 authored; migration 061 (`agent_routing_config`) |
| 2026-04-22–23 | Migrations 062–066: Projects system, department access control; `/scout/*` redirects live; `sendDefaultPii` fixed; `lib/utils/sla.ts` consolidated; manager suite fully built; `lib/constants/departments.ts` added |
| 2026-04-23 | `ATLAS_BLUEPRINT.md` v2 — this document |

---

*End of ATLAS_BLUEPRINT.md*  
*Supersedes all prior versions and the deleted `audit.md`.*  
*Review Section 13 (Roadmap) at the end of each Phase. Review Section 12 (Architectural Decisions) only when a revisit trigger is met.*

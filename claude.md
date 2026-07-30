# Indulge Atlas — AI Context File

> **Updated**: 2026-05-23  
> **Purpose**: Fast-load context for AI assistants. Read this once and be ready to work.  
> Supersedes all prior versions. Full reference: `docs/BLUEPRINT.md`.

---

## Project Summary

**Indulge Atlas** is a bespoke Company OS for the Indulge Group — a luxury lifestyle brand. It started as a CRM for inbound sales leads and is expanding into a full internal platform (HR, projects, finance, AI assistant). Stack: **Next.js 16.1.6 + React 19** App Router, **Supabase** (PostgreSQL 15 + Auth + Realtime), **TypeScript strict**, **Tailwind CSS v4** (beta), **Radix UI + shadcn/ui**. Current phase: CRM is production-ready; **Clients** directory with **Overview** (on-demand Elia member summary, metrics, scoped chat), dossier **Profile** tab (**`ClientProfileFields`** + **Elia Intelligence** WhatsApp profile analysis + stacked **Membership** via **`ClientMembershipTab`**, `showContact={false}`), Freshdesk **Service History**, **WhatsApp** tab with **Chetto** group intel; Projects system shipped; department access control shipped; **Budget** module shipped (migration **092**); **Gupshup WhatsApp chatbot** shipped (migration **094**); Elia AI: **full-page preview** at **`/elia-preview`** + **`/api/elia/chat`**, WhatsApp → structured `elia_profile` (migration **091**); **`middleware.ts`** now exists and is live (fixed 2026-05-23).

---

## Codebase Map

```
app/(auth)/               Login, forgot-password, update-password
app/(dashboard)/          All authenticated routes — shares DashboardLayout
  layout.tsx              Auth gate + provider tree (TaskReminder→LeadAlert→Chat→Profile→SLA)
  page.tsx                / — Agent Dashboard
  leads/[id]/page.tsx     Lead Dossier RSC (force-dynamic)
  clients/                Client directory + profile — tabs: Overview, Profile (dossier profile/ +
                          Membership block membership/ showContact={false}), Notes, Service History,
                          WhatsApp (chetto/ChettoTab)
  clients/chetto-mapping/ Admin tool — map Chetto group IDs to clients (force-dynamic)
  clients/unmapped/       Clients with no Chetto group mapping
  manager/                Manager Command Center — dashboard, campaigns, planner, roster, team
  projects/               → 301 redirect to /tasks (see next.config.ts)
  tasks/                  Atlas Tasks — index, [id] workspace, import
  task-insights/          Org-wide task view (manager/admin/founder): index, [departmentId], agents/[agentId]
  admin/                  Admin panel — conversions, integrations, mappings, marketing, onboarding,
                          routing, shop, academy-seeds subpages
  budget/                 Budget tracking — transactions + deliverables per domain (admin/founder only)
  shop/workspace/         Shop War Room + tasks/[taskId]
  workspace/              Agent personal workspace (DailyAnchor, PrimaryFocus, Scratchpad, WhisperBox)
  whatsapp/               Global WhatsApp Hub — master-detail latest threads
  concierge/              ⚠️ MOCK DATA — fabricated UHNI profiles served to real users
  elia-preview/           Full-page Elia chat — EliaChat + EliaChatMessage; RSC → getEliaActiveMemberCount()
  academy/                Academy intern training simulator (force-dynamic) — two-panel client list
                          + inline conversation; session/[id] single-session view. Tabs:
                          Clients / Free practice / Cohort (trainer-only, gated server-side)
  indulge-world/          Brand/org chart page
  calendar/               Smart calendar (chrono-node NLP)
  performance/            Agent performance analytics
  escalations/            SLA escalation table
  conversions/            Conversion history
  profile/                User profile settings

app/api/
  elia/chat               POST — Anthropic Haiku; optional clientId for member-scoped chat
  elia/analyse-client     POST — Bearer ELIA_ANALYSIS_SECRET; cron → runEliaWhatsAppAnalysis
  academy/chat            POST — Academy client-persona turn; text/plain STREAM (not SSE/JSON)
  chetto/                 find-group, group, timeline, insights — proxy routes (CHETTO_API_KEY server-only)
  webhooks/               leads/meta, leads/google, leads/website, ads, whatsapp, gupshup,
                          onboarding-conversion (Pabbly + HMAC auth)
  campaigns/sync          Campaign metrics sync
  finance-notify          Internal: won deal notification
  bootstrap               One-time DB bootstrap helper
  tv/onboarding-feed      TV display data feed
  freshdesk/attachment    Freshdesk attachment proxy

components/ui/            Zero-dependency design system — Button, Card, Input, IndulgeButton, IndulgeField, InfoRow
components/leads/         All CRM lead components (dossier panels, modals, table, collaborators)
components/clients/       ClientsIndex, ClientDetailView, ClientProfileSheet; overview/, profile/
                          (EliaProfileAnalyseButton, Elia Intelligence), membership/, chetto/ChettoTab,
                          FreshdeskTab, unmapped/
components/manager/       Manager suite (MorningBriefing, CampaignDossier, AgentCard, etc.)
components/projects/      Project board, list, task cards, task detail sheet
components/tasks/         Atlas Tasks UI (master list, subtask modal, import, My Tasks — 40+ components)
components/task-intelligence/  Task Insights dashboard, department detail, employee dossier,
                               workspace bento grid (taskInsightsBento.ts), AssignTaskModal
components/elia/          EliaChat.tsx, EliaChatMessage.tsx — /elia-preview UI (TSX).
                          EliaMobilePrototype.tsx. EliaSidePanel.jsx — sidebar shell (JSX not TSX ⚠️)
components/academy/       Academy UI (13) — ClientList + ClientConversation + AcademyClientShell
                          (two-panel /academy), AcademyChat/AcademyBubble/AcademyComposer (chat),
                          AcademyProgressHeader/ProgressRing/ProgressBreakdown, AcademyReport,
                          CohortTable, ScenarioPicker, SeedEditor. Atlas tokens only
                          (zero hardcoded hex in components; the `chat-*` tokens in
                          app/globals.css ARE the WhatsApp palette — #075e54 / #25d366 / #d9fdd3)
components/layout/        Sidebar, TopBar, NotificationBell, LeaderPerspectiveNotice
components/workspace/     DailyAnchor, PrimaryFocus, Scratchpad, WhisperBox, WorkspaceBoard
components/whatsapp/      ActiveChatPanel, WhatsAppHubClient
components/dashboard/     ConversionHistory, DashboardHero, MyTasksWidget, PastLeadsList
components/admin/         Admin panel components (conversions, mappings, pipeline, routing)
components/chat/          ChatProvider, GlobalChatDrawer, LeadContextChat
components/sla/           SLAProvider, ProfileProvider, AgentSLAAlert
components/providers/     CommandPaletteProvider, LeadAlertProvider, TaskAlertProvider
components/budget/        BudgetClient
components/calendar/      LuxuryGrid, SmartTaskModal, LeadResolutionFlow
components/indulge-world/ OrgChart, ClientJourneyView, BrandOnboardingView

lib/actions/              Primary "use server" modules — component-facing data layer
                          (exception: chetto.ts — no "use server"; route handlers only)
  leads.ts                Lead mutations, won deal, activity logging
  clients.ts              Client directory, detail, notes, profile updates
  freshdesk.ts            Freshdesk tickets + Elia AI ticket summary (auth + read-only)
  elia.ts                 Elia: getEliaClientContext, getEliaActiveMemberCount,
                          getEliaSingleClientProfileText, getClientSummary (Haiku),
                          triggerEliaWhatsAppAnalysis (manager+)
  chetto.ts               Chetto Joule helpers — no "use server"; used only by app/api/chetto/*
  academy.ts              Academy clients, sessions, cohort, seed authoring (service role +
                          isAcademyTrainer)
  projects.ts             Project + task group + project task CRUD
  tasks.ts                Atlas unified tasks (masters, subtasks, personal, import)
  shop-tasks.ts           Shop task creation + sale registration
  task-intelligence.ts    Task Insights + employee dossier read APIs
  manager-analytics.ts    Manager leaderboard, funnel, wins
  budget.ts               Budget transactions + deliverables CRUD
  briefing.ts             Executive briefing generation
  admin.ts, auth.ts, campaigns.ts, dashboards.ts, field-mappings.ts,
  manager.ts, messages.ts, notifications.ts, onboarding-conversions.ts,
  performance.ts, pipeline.ts, planner.ts, profile.ts, roster.ts,
  routing-rules.ts, scratchpad.ts, search.ts, sla.ts, smart-calendar.ts,
  team-stats.ts, todos.ts, whatsapp.ts, workspace.ts

lib/services/             Internal business services (not component-facing)
  eliaProfileAnalysis.ts  WhatsApp → Chetto Joule → Haiku → client_profiles.elia_profile
                          (service role; NOT "use server")
  academyEvaluator.ts     Academy session close → Opus structured scoring → training_reviews
                          (service role; NOT "use server")
  gupshupChatbot.ts       Gupshup WhatsApp chatbot logic — Elia-powered conversational bot,
                          catalog lookup, lead handoff (server-only; ANTHROPIC_API_KEY + GUPSHUP_API_KEY)
  gupshupClient.ts        Gupshup outbound REST client (GUPSHUP_API_KEY, GUPSHUP_APP_NAME)
  leadIngestion.ts        Webhook ETL + agent assignment waterfall
  fieldMappingEngine.ts   Dynamic field mapping from DB rules
  agentRoutingConfig.ts   DB-driven routing config (wired into ingestion)
  evaluateRoutingRules.ts Pure function — routing rule evaluation
  taskContext.ts          Task read model (service role, cross-domain)
  taskNotificationInsert.ts  task_notifications insert helper
  campaign-sync.ts        Campaign metrics sync logic
  webhookLog.ts           Fire-and-forget webhook logging

lib/freshdesk/            Freshdesk REST client + types — server-only; call via lib/actions/freshdesk.ts
lib/elia/                 chat-prompt.ts — eliaSystemPrompt, eliaClientScopedPrompt,
                          buildWhatsAppProfilePrompt (not "use server")
lib/academy/              Academy pure modules, 10 files (none are "use server"): models.ts (model
                          ids, ACADEMY_TURN_CAP, ACADEMY_EVALUATOR_VERSION), persona.ts,
                          evaluator.ts, rubric.ts, randomize.ts, pii.ts, curriculum.ts (tiers +
                          memberForTask 176-name client roster), progressScore.ts (weighted
                          progress model), mentor.ts (in-chat cues + typingDelayFor),
                          types.ts (UI view models)
lib/briefing/             executiveBriefing.ts — executive briefing service (no UI surface yet)
lib/hooks/
  useSLA_Monitor.ts       60s poll SLA breach detection (client-side)
  useTaskRealtime.ts      Realtime: task comments + progress updates
  useTaskIntelligenceRealtime.ts  Task Insights + employee dossier realtime bumps
  useMessages.ts          Supabase Realtime for internal chat
  useLeadCollaboratorsRealtime.ts, useNotificationRealtime.ts, useUserDomain.ts,
  useDebounce.ts, useClientOnly.ts, useSlaAlerts.ts, useSlaAlerts.utils.ts

lib/utils/
  sanitize.ts             sanitizeText() + sanitizeFormData() — run on all external input
  phone.ts                normalizeToE164() + e164LookupVariants()
  sla.ts                  getOffDutyAnchor() — shared SLA utility (canonical)
  webhook.ts              verifyBearerSecret() + verifyPabblyWebhook()
  date-format.ts          IST-aware date formatters
  rateLimit.ts            Upstash sliding-window rate limiter
  audio.ts, auth-errors.ts, format-phone-display.ts, lead-source-mapper.ts,
  site-url.ts, time.ts

lib/constants/
  departments.ts          DEPARTMENT_CONFIG, DOMAIN_CONFIG, DEPARTMENT_ROUTE_ACCESS
  chetto-jokers.ts        Known agent "Joker" WhatsApp numbers (safe for client import)
  personalTaskTags.ts     Personal task tag constants
  tasks.ts                Task-related constants
  onboarding-overview.ts  Onboarding overview config

lib/types/database.ts     ALL TypeScript types + enums + constants (HAND-WRITTEN — not generated)
lib/supabase/             client.ts (browser), server.ts (SSR), service.ts (bypasses RLS)
lib/schemas/              lead.ts, password.ts, tasks.ts — Zod schemas
lib/auth/                 getAuthUser.ts — shared auth helper
lib/leads/                leadDetailRequestCache.ts, leadJourneyStages.ts, leadsTableSelect.ts,
                          pipelineProgress.ts

supabase/manual/          Standalone apply files — Academy parts 1–8 (part 4 is a verify query)
supabase/seed-data/       academy-task-register.json — source of truth for migration 130

middleware.ts             ✅ Live — exports { proxy as middleware, config } from "./proxy"
proxy.ts                  Next.js middleware implementation (createServerClient, session refresh,
                          auth redirects, public route allowlist)

app/(academy)/            Standalone Academy app — own shell, own nav, own login. Mounts NONE of
                          the dashboard provider tree. /academy, /academy/session/[id],
                          /academy/seeds
app/(academy-auth)/       Ungated sibling group holding /academy/login only (gating it with the
                          layout it serves would redirect-loop)
```

---

## Core Conventions

### Naming & Structure

- **Server Actions**: `lib/actions/<module>.ts` — one file per module, `"use server"` at top (**exception**: **`lib/actions/chetto.ts`** omits `"use server"` — Chetto helpers + constants are consumed only by **`app/api/chetto/*/route.ts`**; **`ChettoTab`** calls those routes via **`fetch`**, never imports `chetto.ts` on the client)
- **Components**: domain-specific in `components/<domain>/`, shared primitives in `components/ui/`
- **Hard rule**: `components/ui/` never imports from `lib/actions/` or any feature code
- **Hard rule**: Client components never call Supabase directly for writes — always through Server Actions
- **TypeScript**: strict mode everywhere. JSX-only exception: **`components/elia/EliaSidePanel.jsx`** (fix to `.tsx` when touched)

### Every Server Action Pattern

```typescript
"use server";

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");
  const { data: profile } = await supabase.from("profiles")
    .select("role, domain, department").eq("id", user.id).single();
  const role = profile?.role ?? "agent";
  const domain = profile?.domain ?? "indulge_concierge";
  return { supabase, user, role, domain };
}

// Every mutation:
// 1. getAuthUser()            → authenticate + fetch role from profiles
// 2. Fetch target resource   → check ownership
// 3. Ownership/role gate     → isPrivilegedRole(role) || resource.assigned_to === user.id
// 4. Mutate via supabase     → RLS is second-layer protection
// 5. Log activity (if needed)
// 6. revalidatePath(...)
// 7. return { success: boolean, error?: string }
```

Shared `getAuthUser` also available from **`lib/auth/getAuthUser.ts`** for non-action modules.

### UI Components — Always Use These

```tsx
// ✅ Use IndulgeButton (not raw Button) when loading state is possible
<IndulgeButton variant="gold" loading={isPending} leftIcon={<Plus />}>Save</IndulgeButton>

// ✅ Use IndulgeField for every form input
<IndulgeField label="Campaign name" error={errors.title?.message} required>
  <Input {...register("title")} error={!!errors.title} />
</IndulgeField>

// ✅ Use InfoRow for icon-label-value data display (Lead Dossier pattern)
<InfoRow icon={Phone} label="Phone" value={lead.phone_number} />

// ✅ Use surfaceCardVariants for surfaces (not raw className bg colors)
<div className={surfaceCardVariants({ tone: "luxury", elevation: "sm" })} />
```

### Design Tokens (`app/globals.css` — `@theme inline`)

- **Primary accent** — `--color-brand-gold` / `--color-brand-gold-light` / `--color-brand-gold-dark` → Tailwind `brand-gold` utilities. **Legacy name `gold`:** values are **muted warm umber** (`#5f5348` base), paired with cream surfaces — not bright metallic gold.
- **Primary CTA** — `IndulgeButton` / `Button` **`variant="gold"`** → `bg-brand-gold`, `text-surface`, `hover:bg-brand-gold-dark`
- **Surface white**: `#F9F9F6` (`--color-surface` / `text-surface` on dark fills)
- **Border**: `#E5E4DF`
- **Dark shell**: `#1A1814` (layout-canvas)
- **Card tones**: `luxury` (white), `subtle`, `glass` (blur), `stone` (#F9F9F6), `dark` (#1A1814)
- **Layout**: `.layout-canvas` (dark textured shell) + `.paper-shadow` (floating content card, 12px above canvas on 3 sides)
- **Typography**: Playfair Display (headings), Geist Sans (body)
- **Migration note:** many files still hardcode `#D4AF37`; prefer **`brand-gold`** for new UI.

### Data Safety Rules

- ALL external text → `sanitizeText()` before any DB write
- ALL phone numbers → `normalizeToE164()` before insert/update (stored as E.164)
- Form data (JSONB) → `sanitizeFormData()` (depth cap 2, 10KB max)
- RLS authorization reads ONLY from `public.profiles` — NEVER from JWT claims

---

## How to Do Common Tasks

### Add a New Route

1. Create `app/(dashboard)/<route>/page.tsx`
2. Fetch data via Server Actions in the RSC — no `useEffect` data fetching
3. Add a Suspense boundary with a matching skeleton if async
4. Update `DEPARTMENT_ROUTE_ACCESS` in `lib/constants/departments.ts` for appropriate departments
5. Add to Sidebar nav if user-facing

### Add a New Server Action

1. Add to `lib/actions/<module>.ts` (create file if module is new)
2. Start with `"use server";`
3. Validate input with Zod before anything else
4. Call `getAuthUser()` first — always authenticate before any DB operation
5. Return `{ success: boolean, data?: T, error?: string }`

### Add a New Database Table

1. Create `supabase/migrations/0XX_description.sql` — next number after **094**
2. Enable RLS: `ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;`
3. Add RLS policies using `get_user_role()` and/or `get_user_domain()` / `get_user_department()` — never read from JWT
4. Add `service_role` bypass policy for internal service operations
5. Add TypeScript types to `lib/types/database.ts`
6. One migration = one schema change (no combining unrelated changes)

### Add a Project Task / Comment

```typescript
// lib/actions/projects.ts has the full suite:
createProject(params)
createTaskGroup(projectId, params)
createGroupTask(projectId, groupId, params)
addTaskComment(taskId, content)
updateTaskProgress(taskId, newProgress, note)
```

### Use the Department/Domain Access System

```typescript
import { DEPARTMENT_CONFIG, DEPARTMENT_ROUTE_ACCESS, isDepartmentRoute } from "@/lib/constants/departments";

// Get workspace route for a department
const route = DEPARTMENT_CONFIG["tech"].workspaceRoute; // "/projects"

// Check if a route is accessible for a department
isDepartmentRoute("/projects", DEPARTMENT_ROUTE_ACCESS["tech"]); // true
```

### Create a New User (Admin API)

```typescript
// Role and domain go in app_metadata (NOT user_metadata — that's writable by users)
await supabase.auth.admin.createUser({
  email: 'agent@indulge.global',
  app_metadata: { role: 'agent', domain: 'indulge_concierge', department: 'concierge' },
  user_metadata: { full_name: 'Display Name', job_title: 'Senior Agent' },
});
```

---

## What NOT To Do

- **Never trust JWT claims for authorization** — always read from `profiles` table
- **Never write to the DB from a client component** — always through Server Actions
- **Never import `lib/actions/` into `components/ui/`** — ui is a zero-dependency zone
- **Never use `useEffect` for data fetching** — fetch in RSC, pass as props
- **Never hard-code role checks in JSX** — use `isPrivilegedRole(role)` from `lib/types/database.ts`
- **Never add columns to existing tables in a migration that also creates a new table** — atomic schema changes only
- **Never use `SELECT *` on tables with sensitive data** — be explicit about columns
- **Never skip RLS** on new tables — `ENABLE ROW LEVEL SECURITY` is mandatory
- **Never use `get_role_from_jwt()` for real authorization** — use `get_user_role()` directly
- **Never use polling for data that changes faster than 1/min** — use Realtime instead
- **Never store plaintext secrets** — API keys go as SHA-256 hashes in `sys_api_keys`
- **Never add business rules as hardcoded constants in source** without flagging them (the agent email pool in `leadIngestion.ts` is known tech debt)
- **Never import `lib/services/gupshupChatbot.ts` or `lib/services/gupshupClient.ts` from client components** — server-only; Gupshup API key must never reach the browser

---

## Active Context (as of 2026-05-23)

**Recently shipped:**
- **Academy — intern training simulator (2026-07-28, migrations 124–130, all applied)** — one **client**, one **request**: the intern replies as that client's concierge in a WhatsApp-style chat, an LLM plays the client, and on close a **separate** evaluator scores the transcript. New **`academy`** department + **`isAcademyTrainer(role, department)`** (privileged roles OR `department='academy'`; everyone else is an intern). Migrations: **124** the enum value alone (Postgres cannot use a new enum value in the txn that adds it — same pattern as `122_employee_department_watcher.sql`); **125** four tables + `is_academy_trainer()` / `can_access_academy_session(uuid)` SECURITY DEFINER helpers + RLS + realtime — `scenario_seeds` (trainer-only, holds the answers), `training_sessions`, **`training_turns` — APPEND-ONLY (SELECT+INSERT policies only)**, `training_reviews` (service-role writes only); **126** the original 12 hand-written scenarios; **127** `training_turns.attachments jsonb` + a PRIVATE `academy-attachments` storage bucket + object RLS; **128** 12 more scenarios (24 free-practice total); **129** `advanced`/`expert` tiers + curriculum columns (`group_number`, `day_number`, `task_number`, `task_date`, `raised_by`, `brief`) + `academy_group_progress()` RPC; **130** **176 curriculum tasks** built from the real Indulge Retail Training register (17 training days, 4–27 July 2026), source of truth `supabase/seed-data/academy-task-register.json`. Standalone apply files in **`supabase/manual/`**. Progress is **performance-weighted, not completion-weighted** (`lib/academy/progressScore.ts`). Chat layer: staged message arrival behind a typing indicator (`typingDelayFor`), in-thread mentor cues (`nextMentorCue`, at most once each, **never persisted**), framer-motion entry, sticky header + composer over a single scroll region. Per-session randomisation (`lib/academy/randomize.ts`) mutates one hidden constraint so seeds can't be memorised — persona **and** evaluator read the mutated value. 166 tests across 7 offline suites, plus `__tests__/academy-live-signoff.test.ts` (real API, `describe.skipIf`-gated on `ACADEMY_LIVE=1`, skipped by default). Full spec: **`docs/ACADEMY_PAGE_SPEC.md`**.
- **Academy extracted into its own app + Freshdesk ticket workflow (2026-07-28, migration 131)** — Academy now lives in the **`app/(academy)`** route group with its own shell, nav and login (`/academy/login`, in the ungated `(academy-auth)` sibling), mounting **none** of the eight dashboard providers. Pages use **`AcademyTopBar`**, not `components/layout/TopBar` — that one needs `useChatDrawer`/`useProfile`/`useCommandPalette`. The Atlas dashboard now **gates out interns** (`department === 'academy'` && unprivileged → `/academy`), closing a real hole: `DEPARTMENT_ROUTE_ACCESS` only ever filtered Sidebar links and was never an authorization check. **Genie Trainer was removed** (`training/`, `app/(training)/train/`, `components/training/`, `app/api/training/`, 3 suites) and replaced by the ticket workflow — note "Genie" remains Indulge's word for a concierge agent and is untouched elsewhere. **The ticket workflow:** every request is presented as a Freshdesk ticket (derived, not stored — `lib/academy/ticket.ts`); closing the conversation now yields status **`awaiting_ticket`**, not `completed`. The intern writes resolution summary / internal notes / public reply / status / priority / tags / time spent, an Opus reviewer scores five dimensions (`lib/academy/ticketReview.ts` + `lib/services/academyTicketReview.ts`), and **only an accepted ticket earns progress**. Quality and the pass decision are computed in code (`computeTicketQuality`, `decidePassed`) — a model "pass" can only ever be downgraded. Progress model gained **`documentation_quality`** (11 metrics, still summing to 1); the ticket blends into three other metrics at **30%** so paperwork cannot rescue a badly handled member. **NB: repo is npm-managed — never run `pnpm` (it relocates node_modules); typecheck via `npx tsc --noEmit`.**
- **`middleware.ts` created (2026-05-23)** — `export { proxy as middleware, config } from "./proxy"`. Session refresh and edge auth gate now live. The noisy `Auth session missing!` log on public routes is also suppressed (expected for logged-out users).
- **Gupshup WhatsApp chatbot (migration 094)** — `bot_catalog_items` + `bot_sessions` tables; `webhook_logs.source` extended to include `'gupshup'`. Services: **`lib/services/gupshupChatbot.ts`** (Haiku-powered Elia conversational bot — catalog lookup, 7-turn limit, lead handoff) + **`lib/services/gupshupClient.ts`** (outbound REST). Webhook: **`POST /api/webhooks/gupshup`** (`GUPSHUP_WEBHOOK_SECRET`). Env: `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_WEBHOOK_SECRET`.
- **Budget module (migration 092)** — `budget_transactions` + budget deliverables tables per domain; `/budget` route; `lib/actions/budget.ts`; `components/budget/BudgetClient.tsx`. Visible to founder/admin/super_admin only (application-layer + RLS).
- **Task performance indexes (migration 093)** — GIN + B-tree indexes on tasks for task-intelligence queries.
- **Clients / Chetto mapping admin tool** — `/clients/chetto-mapping` + `/clients/unmapped`; `ChettoMappingClient` (`components/clients/chetto/`); `getClientsChettoMappingPage` in `lib/actions/clients.ts`. Admin/founder/manager only.
- **Elia WhatsApp profile intelligence (2026-05, migration 091)** — `client_profiles.elia_profile` (JSONB `EliaProfile`), `elia_version`, `elia_analyzed_at`, `elia_messages_through`. Pipeline: **`lib/services/eliaProfileAnalysis.ts`** fetches Chetto timeline → Haiku → persists via `getServiceSupabaseClient()`. Manual trigger: `triggerEliaWhatsAppAnalysis` (`lib/actions/elia.ts`). Cron: `POST /api/elia/analyse-client` + `ELIA_ANALYSIS_SECRET`. UI: Profile tab **Elia Intelligence** — `EliaProfileAnalyseButton` + inline display. Prompt: `buildWhatsAppProfilePrompt` in `lib/elia/chat-prompt.ts`.
- **Clients / Profile UX** — Profile tab: dossier-style layout; Membership lives under Profile (`ClientMembershipTab`, `showContact={false}`); no standalone Membership tab; no completeness bar on Profile tab; no completeness % column in directory list.
- **Chetto on client dossier** — `components/clients/chetto/ChettoTab.tsx` (WhatsApp tab): fetches `/api/chetto/find-group`, `/api/chetto/timeline`, `/api/chetto/insights`; `timelineNotAvailable` when Joule 404s; `lib/constants/chetto-jokers.ts`.
- **`/elia-preview` Elia chat** — `EliaChat.tsx` + `EliaChatMessage.tsx`: Atlas tokens, three-column layout (md+), Framer Motion; RSC passes `clientCount` from `getEliaActiveMemberCount()`; POST `/api/elia/chat` (last 10 history turns).
- **Task Insights (`/task-insights`)** — `max-w-5xl`; department chip filter; Agents tab first; agent summaries prefetched; bento workspace tiles (`taskInsightsBento.ts`); SOP section hides completed rows.
- **Client dossier Overview tab** — on-demand Haiku member summary (`getClientSummary`); Freshdesk-backed metrics; client-scoped Elia chat.
- **Workspace module** — `/workspace` personal workspace: `DailyAnchor`, `PrimaryFocus`, `Scratchpad`, `WhisperBox`, `WorkspaceBoard` in `components/workspace/`.

**Currently in development:**
- **`components/elia/EliaSidePanel.jsx`** — sidebar shell (JSX); same `/api/elia/chat` + global context as preview
- Further Elia features (tools, persistence, streaming, RAG)

**Immediate priorities:**
1. ~~Create `middleware.ts`~~ ✅ Done (2026-05-23)
2. Replace mock data in `/concierge` page with a real stub or "Coming Soon" gate
3. Continue expanding Elia (tools, persistence, etc.)
4. Audit `/api/bootstrap` and `/api/campaigns/sync` — no visible auth

---

## Elia integration (quick reference)

| Surface | Mechanism |
|--------|-----------|
| `/elia-preview` | `EliaChat` — POST `/api/elia/chat` with `{ message, conversationHistory? }`; all serialized members via `getEliaClientContext()`; RSC supplies `clientCount` via `getEliaActiveMemberCount()` |
| Sidebar `EliaSidePanel` | Same route + global context (JSX panel) |
| `/clients/[id]` Overview chat | POST `/api/elia/chat` with `clientId` — `getEliaSingleClientProfileText` + `eliaClientScopedPrompt` |
| Overview summary card | `getClientSummary(clientId)` — Haiku; on-demand via Generate summary only |
| Profile → **Elia Intelligence** | `triggerEliaWhatsAppAnalysis(clientId)` → `runEliaWhatsAppAnalysis`; reads Chetto timeline, writes `client_profiles.elia_profile`; inline display in `ClientProfileFields` |
| Service History ticket AI | `getTicketAISummary` in `lib/actions/freshdesk.ts` |
| Cron / automation | POST `/api/elia/analyse-client` — body `{ clientId }`, Bearer `ELIA_ANALYSIS_SECRET` |
| Gupshup WhatsApp bot | `POST /api/webhooks/gupshup` → `gupshupChatbot.ts` — Elia persona, catalog-aware, 7-turn limit, lead handoff |

**Models (Atlas today):** All production Elia calls use **`claude-haiku-4-5-20251001`** via REST (`api.anthropic.com/v1/messages`). No streaming. Chat: `max_tokens` 1024; summary: 300; WhatsApp profile analysis: 2000; Gupshup bot: 512.

**Env:** `ANTHROPIC_API_KEY`, `ELIA_ANALYSIS_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (profile analysis writes only), `CHETTO_API_KEY`, `CHETTO_ORG_ID` (optional), `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_WEBHOOK_SECRET`.

**Module boundaries:**

| Module | `"use server"`? | Role |
|--------|-----------------|------|
| `lib/actions/elia.ts` | Yes | Auth-gated server actions only (async exports) |
| `lib/elia/chat-prompt.ts` | No | Pure prompt builders |
| `lib/services/eliaProfileAnalysis.ts` | No | Chetto fetch + Haiku + service-role DB write |
| `lib/actions/chetto.ts` | No | Joule HTTP helpers — imported by API routes and eliaProfileAnalysis |
| `lib/services/gupshupChatbot.ts` | No | Gupshup bot logic — imported only by `/api/webhooks/gupshup` |
| `lib/services/gupshupClient.ts` | No | Gupshup outbound REST — server-only |

**`client_profiles` Elia columns (migration 091):** `elia_profile` (JSONB), `elia_version`, `elia_analyzed_at`, `elia_messages_through`. Type: **`EliaProfile`** in `lib/types/database.ts`. Incremental runs use `elia_messages_through` as `sinceTimestamp`; require ≥5 new client messages before calling Haiku.

## Chetto (WhatsApp groups — quick reference)

| Surface | Mechanism |
|--------|-----------|
| `/clients/[id]` → **WhatsApp** | `ChettoTab` — `fetch` `GET /api/chetto/find-group`, `GET /api/chetto/timeline`, `POST /api/chetto/insights` (session cookie); route handlers call `lib/actions/chetto.ts` + `CHETTO_API_KEY` |
| `/clients/chetto-mapping` | Admin tool — `ChettoMappingClient`; bulk map Chetto group IDs to client records |
| Server | `CHETTO_API_KEY` — never in client bundles; Joule base `https://apiv2.chetto.ai/joule` |

Chetto is **not** Elia: separate vendor API and env key from `ANTHROPIC_API_KEY`. Timeline may be empty when Joule returns **404** for `.../timeline` even if `GET .../groups/{id}` works — UI surfaces `timelineNotAvailable`.

## Academy (intern training simulator — quick reference)

| Surface | Mechanism |
|--------|-----------|
| `/academy` | Two-panel `AcademyClientShell`: `ClientList` (left, one row per client) + `ClientConversation` (right, opens **inline** on selection — no View button, no navigation). Tabs Clients / Free practice / Cohort (trainer-only, gated server-side). `getAcademyClients`, `getAcademyClientThread`, `listAcademyScenarios`, `getMyAcademySessions`, `getAcademyCohort` (`lib/actions/academy.ts`) |
| `/academy/session/[id]` | One session — `AcademyChat`; a closed session keeps the chat with the review folded beneath it (`ReviewToggle` → `AcademyReport`). Trainers open others' sessions `readOnly` |
| `/admin/academy-seeds` | `SeedEditor` — trainer-only; `createSeed`/`updateSeed` refuse the write and return `piiIssues` when `scanSeedForPII` flags anything |
| **Session creation is lazy** | Opening a client does **NOT** create a session — browsing 176 clients would write 176 junk rows. `getAcademyClientThread` renders a preview opening from the seed; `startAcademySession` runs on the intern's **first reply** and returns `openingMessage` so the previewed bubble and the persisted transcript agree |
| **Persona** (the client) | `POST /api/academy/chat` `{ sessionId, message, attachments? }` → **`text/plain` streaming** (NOT SSE, NOT JSON — read with `res.body.getReader()`). `claude-haiku-4-5-20251001`, `max_tokens` **200** (deliberately low so replies stay message-length). Headers: `X-Academy-Degraded: 1` (canned fallback), `X-Academy-Turn-Cap: 1` (last allowed turn). 409 = closed or cap reached. Cap `ACADEMY_TURN_CAP` = 24 |
| **Evaluator** (the scorer) | `runAcademyEvaluation` (`lib/services/academyEvaluator.ts`) on close — **`claude-opus-4-8`**, structured JSON output, `max_tokens` 2000, idempotent on `session_id`. Six dimensions 1–5, `factual_accuracy` weighted 1.5; **`overall` is computed in code** (`computeOverall`), never asked of the model |

**Persona / evaluator split is the design:** the persona prompt (`lib/academy/persona.ts`) carries the seed's hidden constraints so the client can reveal them when correctly probed, but **never the rubric** — it must not grade, coach, or admit to being an AI (pinned by `__tests__/academy-persona-guardrails.test.ts`). All judgment happens afterwards, in a different call, on a different model. Every review stamps `model_version` = `ACADEMY_EVALUATOR_VERSION` so scoring drift is detectable; sessions stamp the persona model. `buildPersonaSystemPrompt` also takes **`openingMessage`**: the opening turn maps to `assistant` and Anthropic requires a `user` first message, so the route strips it — without echoing it back into the system prompt the persona invents a different scenario (caught in live sign-off).

**`training_turns` is the graded transcript and is append-only** — SELECT + INSERT policies only (migration 125). Nothing rewrites a turn after the fact, and mentor cues are never written to it.

**Progress is performance-weighted, not completion-weighted** (`lib/academy/progressScore.ts`): ten metrics with fixed weights (task completion 20%, response quality 20%, accuracy 15%, time efficiency 15%, AI evaluation 10%, first attempt 5%, critical thinking 5%, communication 5%, research quality 3%, consistency 2%). `academyBar = Σ requestScores ÷ totalRequests`, so the bar only reaches 100 by handling every request **well**; time efficiency is multiplied by response quality so speed cannot buy a score. **Honest provenance:** the evaluator emits only six rubric dimensions, so six metrics are proxied off rubric dimensions and four come from session telemetry/history — every mapping is declared in `METRIC_SOURCE`.

**Env:** `ANTHROPIC_API_KEY` (shared with Elia — no Academy-specific key; missing → the chat degrades to a canned reply and evaluation fails loudly) + `SUPABASE_SERVICE_ROLE_KEY` (all Academy actions use `getServiceSupabaseClient()`). `ACADEMY_LIVE=1` unskips `__tests__/academy-live-signoff.test.ts`, the only Academy suite that hits the real API.

**Tests:** 166 passing across 7 offline suites (`academy-rubric`, `academy-pii`, `academy-randomize`, `academy-evaluator`, `academy-persona-guardrails`, `academy-progress-score`, `academy-mentor`). Run with `node ./node_modules/vitest/vitest.mjs run <paths>`.

---

## Key Dependencies

| Package | What It Does |
|---|---|
| `@supabase/supabase-js` | DB queries via `supabase.from('table').select(...)` |
| `@supabase/ssr` | Cookie-aware session handling in Next.js RSC + middleware |
| `zod` | Schema validation on ALL Server Actions + webhooks |
| `isomorphic-dompurify` | HTML sanitization (zero-tags policy) for user input |
| `libphonenumber-js` | E.164 phone normalization (IN default) |
| `date-fns` + `date-fns-tz` | All date/time operations — always use `Asia/Kolkata` for IST |
| `framer-motion` | Animations and transitions |
| `class-variance-authority` | CVA variants for all `components/ui/` primitives |
| `recharts` | Charts in manager dashboard |
| `sonner` | Toast notifications |
| `chrono-node` | NLP date parsing in smart calendar |
| `@upstash/ratelimit` | Webhook rate limiting (fail-closed: missing env = 429) |
| Chetto REST API | WhatsApp group metadata + timeline (via `lib/actions/chetto.ts`; `CHETTO_API_KEY`) |
| Gupshup REST API | Outbound WhatsApp messages for chatbot (via `lib/services/gupshupClient.ts`; `GUPSHUP_API_KEY`) |

---

## Gotchas & Quirks

1. **`middleware.ts` now exists** ✅ — Created 2026-05-23. Session refresh and edge auth gate are live. `proxy.ts` is the implementation; `middleware.ts` re-exports it. The `Auth session missing!` error is suppressed for expected logged-out requests.

2. **Tailwind v4** — uses `@tailwindcss/postcss` plugin, not the v3 `tailwindcss` plugin. Some v3 patterns don't work. Design tokens live in `app/globals.css` **`@theme inline`**: brand accent as **umber** under legacy `--color-brand-gold*` names; many components still use hardcoded `#D4AF37`.

3. **`indulge_global` has two meanings** — pre-056 it was the old name for `indulge_concierge` domain. Post-066 it was re-added as a NEW real domain for Finance/Tech/Marketing cross-domain read access. The `pick_next_agent_for_domain()` function still normalizes `indulge_global` → `indulge_concierge` for lead assignment (Finance/Tech staff are not in the lead assignment pool).

4. **`lead_activities` dual-write** — both old columns (`performed_by`, `type`, `payload`) and new columns (`actor_id`, `action_type`, `details`) are written simultaneously. Don't remove the old writes until a data migration is run.

5. **No Supabase-generated types** — `lib/types/database.ts` is entirely hand-written. Running `supabase gen types typescript` is planned but not done. Be careful about type drift after new migrations.

6. **`force-dynamic` on lead dossier** — `app/(dashboard)/leads/[id]/page.tsx` exports `dynamic = "force-dynamic"`. Every dossier load is a full SSR — intentional for per-user data.

7. **`components/elia/EliaSidePanel.jsx` is `.jsx` not `.tsx`** — bypasses TypeScript. `EliaChat.tsx` / `EliaChatMessage.tsx` are strict TSX.

8. **`lib/concierge/mockData.ts` is live** — imported by `ConciergeClient.tsx` which is served via the sidebar to real users. Treat it as a critical debt item.

9. **Agent email pool in `leadIngestion.ts`** — night/day shift and Samson's cap are still partially hardcoded. `agentRoutingConfig.ts` is wired in but doesn't fully replace the hardcoded shift logic.

10. **Supabase Realtime on tasks** — `REPLICA IDENTITY FULL` is set on the tasks table (migration 047). All column values (not just changed ones) are broadcast on UPDATE. Useful for Realtime but adds overhead to write-heavy operations.

11. **Two-axis access model** — `domain` (profiles.domain) controls what DATA a user sees (RLS). `department` (profiles.department) controls what SCREENS they can open (`DEPARTMENT_ROUTE_ACCESS`). These are orthogonal.

12. **Sentry is installed but fully disabled** — `@sentry/nextjs` remains in `package.json` but nothing initialises it. `withSentryConfig` is removed from `next.config.ts`; `instrumentation.ts` / `instrumentation-client.ts` are no-ops; `sentry.server.config.ts` / `sentry.edge.config.ts` have no `Sentry.init()` call; `app/global-error.tsx` does not call `captureException`. Re-enable by restoring `Sentry.init()` in the config files, wrapping `nextConfig` with `withSentryConfig` in `next.config.ts`, and exporting `onRequestError = Sentry.captureRequestError` from `instrumentation.ts`.

13. **`supabase/20260308000000_initial_schema.sql`** — a migration file outside the numbered `001–094` sequence. Don't reference it in new migration work.

14. **`SCOUT_TASK_TYPES`** in `lib/types/database.ts` — marked `@deprecated`, still present. Use `MANAGER_TASK_TYPES` instead.

15. **Freshdesk is server-only** — never import `lib/freshdesk/client.ts` from client components. Use `getClientFreshdeskTickets` / `getTicketAISummary` from `lib/actions/freshdesk.ts` only.

16. **`"use server"` action modules** — Next.js requires **async** exports from `lib/actions/*.ts`. Put synchronous helpers in `lib/elia/chat-prompt.ts` or a util module without `"use server"`. `lib/actions/chetto.ts` intentionally omits `"use server"` — do not add the directive without splitting exports.

17. **Chetto / Joule** — `CHETTO_API_KEY` only on server. `ChettoTab` uses `fetch` to `/api/chetto/*` (session cookie). `lib/services/eliaProfileAnalysis.ts` calls `lib/actions/chetto.ts` directly (Joule `https://apiv2.chetto.ai/joule`) — never `/api/chetto/*`. Expect `timelineNotAvailable` when timeline returns 404 while group metadata exists.

18. **Elia profile persistence** — Writes use `getServiceSupabaseClient()` (`SUPABASE_SERVICE_ROLE_KEY` required). Pattern: UPDATE `client_profiles` by `client_id`, INSERT only if no row. After manual analysis, `ClientDetailView` refetches via `getClientById` — tab stays on Profile.

19. **Chetto vs Elia profile analysis** — Chetto tab = read/browse WhatsApp + Chetto insights API. Elia Intelligence = Claude-built `elia_profile` stored on `client_profiles`. Separate env keys: `CHETTO_API_KEY` vs `ANTHROPIC_API_KEY`.

20. **Gupshup chatbot is separate from Meta WhatsApp** — Gupshup is a second WhatsApp Business API provider for the inbound AI bot flow. `GUPSHUP_API_KEY`/`GUPSHUP_APP_NAME`/`GUPSHUP_WEBHOOK_SECRET` are distinct from `WHATSAPP_API_TOKEN`/`WHATSAPP_APP_SECRET`. Bot sessions are stored in `bot_sessions`; catalog in `bot_catalog_items` (migration 094).

21. **Budget module is role-gated at application layer** — migration 092 adds `budget_transactions`; RLS enforces Supabase-level access but the route/actions also check for founder/admin/super_admin at the action layer.

22. **`/clients/chetto-mapping` is admin-only** — `canManageAnyClient()` gate. Only admin/founder/super_admin/manager can bulk-assign Chetto group IDs to client records.

23. **`proxy.ts` suppresses `Auth session missing!` for public routes** — this error is expected (logged-out user hits any route before middleware redirects). The error is only logged if the message is something other than `"Auth session missing!"`.

24. **`training_turns` has no UPDATE or DELETE policy — by design** — migration 125 grants SELECT + INSERT only. It is the transcript the evaluator grades, so it must not be rewritable after scoring. Adding either policy breaks the guarantee. Migration 127 added an `attachments` column and that is fine: a schema change is not a row mutation, and attachments are supplied at INSERT time.

25. **`can_access_academy_session()` must be created after `training_sessions`** — it is `LANGUAGE sql`, so PostgreSQL parses and validates its body at CREATE time. Defining it earlier fails with `42P01: relation "public.training_sessions" does not exist`. Same table-then-helper ordering as `108_concierge_ticket_tables.sql`.

26. **Academy mentor cues must never be persisted** — `nextMentorCue` lines live in `AcademyChat` component state and die with the mount. Writing them into `training_turns` would pollute the graded transcript and teach the persona to expect a coach in the room.

27. **`npx vitest` swallows stdout on this machine** — run suites with `node ./node_modules/vitest/vitest.mjs run <paths>`. The repo is npm-managed; never run `pnpm` here (it relocates `node_modules`).

# Indulge Atlas — AI Context File

> **Updated**: 2026-05-06  
> **Purpose**: Fast-load context for AI assistants. Read this once and be ready to work.  
> Supersedes all prior versions. Full reference: `ATLAS_BLUEPRINT.md`.

---

## Project Summary

**Indulge Atlas** is a bespoke Company OS for the Indulge Group — a luxury lifestyle brand. It started as a CRM for inbound sales leads and is expanding into a full internal platform (HR, projects, finance, AI assistant). Stack: **Next.js 16.1.6 + React 19** App Router, **Supabase** (PostgreSQL 15 + Auth + Realtime), **TypeScript strict**, **Tailwind CSS v4** (beta), **Radix UI + shadcn/ui**. Current phase: CRM is production-ready, **Clients** directory with **Overview** (on-demand Elia member summary, metrics, scoped chat), dossier **Profile** tab (**`ClientProfileFields`** + stacked **Membership** via **`ClientMembershipTab`**, `showContact={false}`), Freshdesk **Service History**, **WhatsApp** tab with **Chetto** group intel (**`lib/actions/chetto.ts`**, **`/api/chetto/*`**, **`CHETTO_API_KEY`**), Projects system shipped, department access control shipped, Elia AI: **full-page preview** at **`/elia-preview`** (`EliaChat` / `EliaChatMessage`, theme-aligned) + **`/api/elia/chat`**, sidebar **`EliaSidePanel.jsx`** still in preview.

---

## Codebase Map

```
app/(auth)/               Login, forgot-password, update-password
app/(dashboard)/          All authenticated routes — shares DashboardLayout
  layout.tsx              Auth gate + provider tree (TaskReminder→LeadAlert→Chat→Profile→SLA)
  page.tsx                / — Agent Dashboard
  leads/[id]/page.tsx     Lead Dossier RSC (force-dynamic)
  clients/                Client directory + profile — tabs: **Overview**, **Profile** (dossier `profile/` + **Membership** block `membership/` with `showContact={false}` — no separate Membership tab), **Notes**, **Service History**, **WhatsApp** (`chetto/ChettoTab`)
  manager/                Manager Command Center — campaigns, planner, roster, team
  projects/[id]/          Projects board system
  task-insights/          Org-wide task view (manager / admin / founder): index, `[departmentId]` detail, `agents/[agentId]` dossier
  concierge/              ⚠️ MOCK DATA — fabricated UHNI profiles served to real users
  elia-preview/           Full-page Elia chat — `EliaChat` + `EliaChatMessage`; RSC loads `getEliaActiveMemberCount()` → `clientCount`; POST `/api/elia/chat`
app/api/                  elia/chat — Anthropic Haiku (global or client-scoped via optional clientId)
app/api/chetto/           Chetto proxy routes — find-group, insights, timeline (`CHETTO_API_KEY` server-only)
app/api/webhooks/         Pabbly (leads/meta, leads/google, leads/website, ads) + WhatsApp

components/ui/            Zero-dependency design system — Button, Card, Input, IndulgeButton, IndulgeField, InfoRow
components/leads/         All CRM lead components (dossier panels, modals, table)
components/clients/       Client list (`ClientsIndex`, …), `ClientDetailView` / `ClientProfileSheet`; **overview/**, **profile/**, **membership/**, **chetto/ChettoTab**; FreshdeskTab
components/manager/       Manager suite (MorningBriefing, CampaignDossier, AgentCard, etc.)
components/projects/      Project board, list, task cards, task detail sheet
components/task-intelligence/  Task Insights dashboard, department detail, employee dossier, workspace bento grid (`taskInsightsBento.ts`), AssignTaskModal
components/elia/          `EliaChat.tsx`, `EliaChatMessage.tsx` — `/elia-preview` UI (TSX). `EliaSidePanel.jsx` — sidebar shell (JSX not TSX ⚠️)
components/layout/        Sidebar, TopBar, NotificationBell

lib/actions/              Primary `"use server"` modules — component-facing data layer (exception: **`chetto.ts`** — **no** `"use server"`; route handlers import server-only Chetto helpers)
  leads.ts                Lead mutations, won deal, activity logging
  clients.ts              Client directory, detail, notes, profile updates
  freshdesk.ts            Freshdesk tickets + Elia AI ticket summary (auth + read-only)
  elia.ts                 Elia: `getEliaClientContext`, **`getEliaActiveMemberCount`** (preview header stats), `getEliaSingleClientProfileText`, **getClientSummary** (Haiku); sync helpers MUST NOT be exported here — use `lib/elia/chat-prompt.ts`
  chetto.ts               Chetto Joule helpers — **no** `"use server"` (Next.js forbids exporting constants/sync helpers from `use server` modules); used **only** by `app/api/chetto/*`; **`CHETTO_API_KEY`** server-side
  projects.ts             Project + task group + project task CRUD
  tasks.ts                Atlas unified tasks (masters, subtasks, personal, import)
  task-intelligence.ts    Task Insights + employee dossier read APIs
  manager-analytics.ts    Manager leaderboard, funnel, wins
  [module].ts             One file per feature domain
lib/freshdesk/            Freshdesk REST client + types — **server-only**; call via `lib/actions/freshdesk.ts` only
lib/elia/                 chat-prompt.ts — Elia system prompts + sync helpers (not `"use server"`)
lib/services/             Internal business services (not component-facing)
  leadIngestion.ts        Webhook ETL + agent assignment waterfall
  fieldMappingEngine.ts   Dynamic field mapping from DB rules
  agentRoutingConfig.ts   DB-driven routing config (wired into ingestion)
  evaluateRoutingRules.ts Pure function — routing rule evaluation
lib/utils/
  sanitize.ts             sanitizeText() + sanitizeFormData() — run on all external input
  phone.ts                normalizeToE164() + e164LookupVariants()
  sla.ts                  getOffDutyAnchor() — shared SLA utility (canonical)
  webhook.ts              verifyBearerSecret() + verifyPabblyWebhook()
lib/constants/departments.ts  DEPARTMENT_CONFIG, DOMAIN_CONFIG, DEPARTMENT_ROUTE_ACCESS
lib/constants/chetto-jokers.ts  Known agent “Joker” WhatsApp numbers (safe for client import)
lib/hooks/useSLA_Monitor.ts   60s poll SLA breach detection (client-side)
lib/hooks/useTaskRealtime.ts  Realtime: task comments + progress updates
lib/types/database.ts         ALL TypeScript types + enums + constants (HAND-WRITTEN — not generated)
lib/supabase/             client.ts (browser), server.ts (SSR), service.ts (bypasses RLS)
proxy.ts                  Next.js middleware IMPL — ⚠️ NOT loaded (no middleware.ts at root)
```

---

## Core Conventions

### Naming & Structure

- **Server Actions**: `lib/actions/<module>.ts` — one file per module, `"use server"` at top (**exception**: **`lib/actions/chetto.ts`** omits `"use server"` — Chetto helpers + constants are consumed only by **`app/api/chetto/*/route.ts`**; **`ChettoTab`** calls those routes via **`fetch`**, never imports `chetto.ts` on the client)
- **Components**: domain-specific in `components/<domain>/`, shared primitives in `components/ui/`
- **Hard rule**: `components/ui/` never imports from `lib/actions/` or any feature code
- **Hard rule**: Client components never call Supabase directly for writes — always through Server Actions
- **TypeScript**: strict mode everywhere. JSX-only exceptions: **`components/elia/EliaSidePanel.jsx`** (fix to `.tsx` when touched)

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
- **Primary CTA** — `IndulgeButton` / `Button` **`variant="gold"`** → `bg-brand-gold`, `text-surface`, `hover:bg-brand-gold-dark` (`components/ui/button.tsx`).
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

1. Create `supabase/migrations/0XX_description.sql` — increment the number
2. Enable RLS: `ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;`
3. Add RLS policies using `get_user_role()` and/or `get_user_domain()` / `get_user_department()` — never read from JWT
4. Add `service_role` bypass policy for internal service operations
5. Add TypeScript types to `lib/types/database.ts` (or run `supabase gen types typescript`)
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
import { DEPARTMENT_CONFIG, DEPARTMENT_ROUTE_ACCESS, isDepartmentRoute } from "@/lib/constants/departments.ts";

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
- **Never use `get_role_from_jwt()` for real authorization** — it's now an alias for `get_user_role()` (profiles-only) but the name is misleading; use `get_user_role()` directly
- **Never use polling for data that changes faster than 1/min** — use Realtime instead
- **Never store plaintext secrets** — API keys go as SHA-256 hashes in `sys_api_keys`
- **Never add business rules as hardcoded constants in source** without flagging them (the agent email pool in `leadIngestion.ts` is known tech debt)

---

## Active Context (as of 2026-05-06)

**Recently shipped:**
- **Clients / Profile UX (2026-05)** — **Profile** tab: dossier-style **`profile/`** layout (no top completeness bar); **`ProfileSection`** / **`ProfileFieldRow`** styling tweaks. **Membership** content lives **under Profile** (border + label), **`ClientMembershipTab`** with **`showContact={false}`** — Plan + Timeline (queendom on plan rows); **no standalone Membership tab**. **Client directory** list: no trailing completeness % column (Overview pills unchanged).
- **Chetto on client dossier** — **`components/clients/chetto/ChettoTab.tsx`** (`/clients/[id]` → **WhatsApp** tab): **`fetch`** to **`/api/chetto/find-group`**, **`/api/chetto/timeline`**, **`/api/chetto/insights`** (credentials); **`lib/actions/chetto.ts`** implements Joule calls + queendom/group-id maps (**no** `"use server"`); **`CHETTO_API_KEY`** env; **`timelineNotAvailable`** when Joule timeline 404s while group exists; **`lib/constants/chetto-jokers.ts`**; UI in bordered **`rounded-2xl`** card + **`min-w-0`** / wrap-safe text (avoids **`main`** overflow clip)
- **`/elia-preview` Elia chat** — `components/elia/EliaChat.tsx`, `EliaChatMessage.tsx`: Atlas tokens (`atlas-masthead-texture`, `surfaceCardVariants`, `brand-gold`, `#E5E4DF`), secondary copy at **`#6b6b6b`** (matches `:root` `--muted-foreground`); three-column layout (md+); Framer Motion load + message enter; `app/(dashboard)/elia-preview/page.tsx` passes **`clientCount`** from **`getEliaActiveMemberCount()`**; same POST **`/api/elia/chat`** contract (incl. last **10** `conversationHistory` turns)
- **Design tokens + primary CTA** — `app/globals.css` `@theme inline`: **`--color-brand-gold*`** values are **muted warm umber** (cream-friendly accent; legacy `gold` naming). `components/ui/button.tsx` **`gold`** variant uses `bg-brand-gold` / `text-surface` / `hover:bg-brand-gold-dark`. Many legacy **`#D4AF37`** literals remain across the repo.
- **Task Insights (`/task-insights`)** — Main page: `max-w-5xl`; department **chip** filter; tabs **Agents** (first) then **All workspaces**; agent summaries **prefetched** when scope changes (not tab-gated); no department **card grid** on index (department drill-down remains at `/task-insights/[departmentId]`). Workspace tiles: bento-style grid + compact cards (`GroupTasksCommandView`, `taskInsightsBento.ts`). Employee list: signed-in user first, SOP section hides completed rows, hint “Click on a card to open.”
- **Client dossier Overview tab** — `/clients/[id]` default tab: **on-demand** Haiku **member summary** (`getClientSummary` via **Generate summary** in `ClientOverviewTab` / `ClientSummaryCard`); Freshdesk-backed **metrics** (still on load); **client-scoped Elia chat** (POST `/api/elia/chat` with `clientId`). Components: `components/clients/overview/*`; prompts in `lib/elia/chat-prompt.ts`; logic in `lib/actions/elia.ts`
- **Clients + Freshdesk Service History** — `/clients`; live tickets (`FRESHDESK_API_KEY`); Elia ticket summary (`lib/actions/freshdesk.ts`, Haiku; same transport as `/api/elia/chat`)
- Migrations 062–066: Projects system + department access control
- `components/projects/` — full board and task UI
- `components/manager/` — full manager suite
- `lib/constants/departments.ts` — department config + route access map
- `lib/utils/sla.ts` — consolidated `getOffDutyAnchor()` (was duplicated)
- `/scout/*` → `/manager/*` permanent redirects in `next.config.ts`
- `sendDefaultPii: false` in Sentry configs

**Currently in development:**
- **`components/elia/EliaSidePanel.jsx`** — sidebar shell (JSX); same `/api/elia/chat` + global context as preview
- Further Elia features (tools, persistence, streaming, RAG beyond current context packing)

**Immediate priorities:**
1. Create `middleware.ts` at root — critical bug, session refresh not working
2. Replace mock data in `/concierge` page with a real stub or "Coming Soon" gate
3. Continue expanding Elia (tools, persistence, etc.)

---

## Elia integration (quick reference)

| Surface | Mechanism |
|--------|-----------|
| `/elia-preview` | `EliaChat` — POST `/api/elia/chat` with `{ message, conversationHistory? }`; **all** serialized members via `getEliaClientContext()`; page RSC supplies **`clientCount`** via **`getEliaActiveMemberCount()`** for right-rail stats |
| Sidebar `EliaSidePanel` | Same route + global context (JSX panel) |
| `/clients/[id]` Overview chat | Same route — add **`clientId`** (UUID) — loads one member via `getEliaSingleClientProfileText`, `eliaClientScopedPrompt` |
| Overview summary card | Server Action **`getClientSummary(clientId)`** — Haiku, client + profile + Freshdesk snapshot; invoked **only** when the user clicks **Generate summary** (`ClientOverviewTab`) |
| Service History ticket AI | **`getTicketAISummary`** in `lib/actions/freshdesk.ts` |

**Env:** `ANTHROPIC_API_KEY` (server). **`lib/actions/elia.ts`** must export **async** server actions only — put synchronous helpers in **`lib/elia/chat-prompt.ts`** (or another non–`use server` module).

## Chetto (WhatsApp groups — quick reference)

| Surface | Mechanism |
|--------|-----------|
| `/clients/[id]` → **WhatsApp** | **`ChettoTab`** — **`fetch`** **`GET /api/chetto/find-group`**, **`GET /api/chetto/timeline`**, **`POST /api/chetto/insights`** (session cookie); route handlers call **`lib/actions/chetto.ts`** + **`CHETTO_API_KEY`** |
| Server | **`CHETTO_API_KEY`** — never in client bundles; Joule base `https://apiv2.chetto.ai/joule` |

Chetto is **not** Elia: separate vendor API and env key from **`ANTHROPIC_API_KEY`**. Timeline may be empty when Joule returns **404** for **`.../timeline`** even if **`GET .../groups/{id}`** works — UI surfaces **`timelineNotAvailable`** (often indexing / API coverage, not Atlas-only).

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
| Chetto REST API | WhatsApp group metadata + timeline (via **`lib/actions/chetto.ts`**; **`CHETTO_API_KEY`**) |

---

## Gotchas & Quirks

1. **`middleware.ts` does not exist** — `proxy.ts` is the implementation but Next.js never loads it. Session refresh and edge auth gate are non-functional. Fix: `export { proxy as middleware, config } from "./proxy"` in a new `middleware.ts`.

2. **Tailwind v4** — uses `@tailwindcss/postcss` plugin, not the v3 `tailwindcss` plugin. Some v3 patterns don't work. Design tokens live in `app/globals.css` **`@theme inline`** (Section 5.1 in `ATLAS_BLUEPRINT.md`): brand accent as **umber** under legacy `--color-brand-gold*` names; many components still use hardcoded `#D4AF37`.

3. **`indulge_global` has two meanings** — pre-056 it was the old name for `indulge_concierge` domain. Post-066 it was re-added as a NEW real domain for Finance/Tech/Marketing cross-domain read access. The `pick_next_agent_for_domain()` function still normalizes `indulge_global` → `indulge_concierge` for lead assignment (Finance/Tech staff are not in the lead assignment pool).

4. **`lead_activities` dual-write** — both old columns (`performed_by`, `type`, `payload`) and new columns (`actor_id`, `action_type`, `details`) are written simultaneously. Don't remove the old writes until a data migration is run.

5. **No Supabase-generated types** — `lib/types/database.ts` is entirely hand-written. Running `supabase gen types typescript` is planned but not done. Be careful about type drift after new migrations.

6. **`force-dynamic` on lead dossier** — `app/(dashboard)/leads/[id]/page.tsx` exports `dynamic = "force-dynamic"`. Every dossier load is a full SSR — intentional for per-user data.

7. **`components/elia/EliaSidePanel.jsx` is `.jsx` not `.tsx`** — bypasses TypeScript. **`EliaChat.tsx` / `EliaChatMessage.tsx`** are strict TSX.

8. **`lib/concierge/mockData.ts` is live** — imported by `ConciergeClient.tsx` which is served via the sidebar to real users. Treat it as a critical debt item.

9. **Agent email pool in `leadIngestion.ts`** — night/day shift and Samson's cap are still partially hardcoded. `agentRoutingConfig.ts` is wired in but doesn't fully replace the hardcoded shift logic.

10. **Supabase Realtime on tasks** — `REPLICA IDENTITY FULL` is set on the tasks table (migration 047). This means all column values (not just changed ones) are broadcast on UPDATE. Useful for Realtime but adds overhead to write-heavy operations.

11. **Two-axis access model** — `domain` (profiles.domain) controls what DATA a user sees (RLS). `department` (profiles.department) controls what SCREENS they can open (`DEPARTMENT_ROUTE_ACCESS`). These are orthogonal: a Finance user can have `domain = indulge_global` (sees all data) but only `department = finance` (sees finance-relevant routes).

12. **Sentry DSN is committed** — `sentry.server.config.ts` has a hardcoded DSN. This is low risk (DSNs are semi-public) but worth noting.

13. **`supabase/20260308000000_initial_schema.sql`** — a migration file outside the numbered `001–066` sequence. Its relationship to the canonical migration history is unclear. Don't reference it in new migration work.

14. **`SCOUT_TASK_TYPES`** in `lib/types/database.ts` — marked `@deprecated`, still present. Use `MANAGER_TASK_TYPES` instead.

15. **Freshdesk is server-only** — never import `lib/freshdesk/client.ts` from client components. Use `getClientFreshdeskTickets` / `getTicketAISummary` from `lib/actions/freshdesk.ts` only. `FRESHDESK_API_KEY` must not appear in client bundles.

16. **`"use server"` action modules** — Next.js requires **async** exports from `lib/actions/*.ts`. Put synchronous helpers (e.g. `parseEliaClientDisplayNameFromProfile`, prompt string builders) in **`lib/elia/chat-prompt.ts`** or a util module without `"use server"`. **`lib/actions/chetto.ts`** intentionally omits `"use server"` so route handlers can import maps/constants — do not add the directive without splitting exports.

17. **Chetto / Joule** — **`CHETTO_API_KEY`** only on server; **`ChettoTab`** uses **`fetch`** to **`/api/chetto/*`** only. **`lib/actions/chetto.ts`** is **not** a Server Actions module. Expect **`timelineNotAvailable`** when the timeline endpoint returns **404** / “No groups found” while group metadata still resolves.

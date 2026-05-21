# ATLAS AUDIT REPORT

Generated: 2026-05-05

## Executive Summary (5 bullet points max)

- **`public.tasks` is a 46-column God Table** spanning CRM follow-ups, Shop War Room, project/Atlas board work, and unified Atlas metadata; RLS and app queries rely on overlapping rules and discriminators that are easy to omit.
- **Onboarding is split** between CRM/admin “oversight” (real `leads`), a **parallel ledger** (`onboarding_leads` + webhook + TV/admin surfaces), and department config — **no single module boundary**; `onboarding_leads` SELECT policy still uses **`get_role_from_jwt()`**, which conflicts with the profiles-only auth model elsewhere.
- **CRM lead task UI is miswired to Atlas personal-task actions**: `createTask` / `completeTask` in `lib/actions/tasks.ts` are aliases for `createPersonalTask` / `completePersonalTask`, while `LeadTaskWidget` and `LeadFollowUpAccordion` pass legacy **lead-task-shaped** payloads — **new tasks become personal rows without `lead_id`; completing real lead tasks no-ops** (personal-only update filter).
- **Component surface area is large** (e.g. **47 files under `components/tasks/`**, **30 `*Modal*.tsx`** files) with repeated patterns (multiple “create task” modals, **595 `#D4AF37` literal hits** in `components/`, `app/`, `lib/` combined) and **legacy `/projects` links** still present in `components/projects/*` despite **301 redirects** in `next.config.ts`.
- **`onboarding-code/` was not found** at the repo root; a parallel folder **`onbording-code/`** (typo) exists with **~221 files** — treat as duplicate / staging tree; main app wiring lives under `app/`, `components/`, `lib/`.

---

## Section 1: God Table Analysis — `tasks`

### Column → domain mapping

Canonical column set derived from migrations `001` / `011` (base), `033`, `034`, `040`, `054`, `063`, `065`, `067`, `076`, `081` (and related CHECK updates `072`, `078`, `079`). **Total: 46 columns.**

| Column | Domain (per audit taxonomy) | NOT NULL / default (as of migrations) |
|--------|-------------------------------|----------------------------------------|
| `id` | Shared | NOT NULL, default `gen_random_uuid()` |
| `lead_id` | CRM lead follow-up | NULLable FK |
| `task_type` | CRM channel / flow enum | NOT NULL, default `'call'` |
| `follow_up_step`, `follow_up_history` | CRM lead follow-up | NOT NULL with defaults |
| `shop_operation_scope`, `target_inventory`, `target_sold`, `shop_task_priority`, `deadline`, `shop_product_name` | Shop War Room | `scope`/`sold`/`priority` NOT NULL with defaults; others NULLable |
| `project_id`, `group_id`, `parent_task_id`, `priority`, `progress`, `estimated_minutes`, `actual_minutes`, `position`, `tags`, `attachments` | Project board / Atlas board | `position` NOT NULL default 0; `progress` default 0; others NULLable |
| `unified_task_type`, `atlas_status`, `domain`, `department`, `master_task_id`, `parent_group_task_id`, `archived_at`, `archived_by`, `imported_from`, `import_batch_id`, `cover_color`, `icon_key`, `visibility`, `is_daily`, `daily_date`, `is_daily_sop_template` | Atlas unified task system | `unified_task_type` / `atlas_status` NOT NULL with defaults; `visibility` NOT NULL default `'personal'`; `is_daily` / `is_daily_sop_template` NOT NULL default false; others NULLable |
| `assigned_to_users`, `created_by`, `title`, `notes`, `due_date`, `status`, `created_at`, `updated_at`, `progress_updates` | Shared / ambiguous | `title`, `status`, `assigned_to_users`, `progress_updates`, timestamps NOT NULL (with defaults); `due_date` NULLable after `065`; `created_by` NULLable |

**Coupling points (columns reused across domains):**  
`title`, `notes`, `due_date`, `status`, `assigned_to_users`, `created_by`, `task_type`, `progress`, `progress_updates`, `tags`, `attachments` — each appears in more than one semantic use (CRM vs shop vs Atlas vs legacy).

**Verdict:** **This table has 46 columns serving at least 4 semantic domains (CRM, Shop, Project/Atlas board, Unified Atlas metadata) plus shared fields — it is a God Table.**  
**Severity: CRITICAL** (operational and type-safety risk; every new feature adds NULLable surface).

### TypeScript types referencing `tasks` (`lib/types/database.ts`)

Verified symbols include (non-exhaustive but complete for major shapes):  
`TaskStatus`, `TaskGroup`, `ProjectTask`, `TaskAttachment`, `TaskComment`, `TaskProgressUpdate`, **`Task`**, **`TaskWithLead`**, `MasterTask`, `SubTask`, `PersonalTask`, `WorkspaceSubtaskAssignment`, `EmployeeTaskMetrics`, `TaskInsightsWorkspaceCard`, `OrgTaskSummary`, `MasterTaskAnalytics`, `DepartmentTaskOverview`, `TaskIntelligenceOverdueSubtaskSnapshot`, `OrganisationTaskContext`, `TaskIntelligenceAgentSummary`, `TaskIntelligencePersonalTaskRow`, `TaskRemark`, `TaskRemarkRow`, `TaskNotification`.

**Discriminating fields (documented in code / usage):**

- **CRM / lead-linked:** `lead_id` set; often `unified_task_type = 'subtask'` historically; legacy `status` (`pending` / `completed` / `overdue`).
- **Shop:** `shop_operation_scope` NOT NULL (`054` default `'individual'`); queries in `lib/actions/shop-tasks.ts` use `.not("shop_operation_scope", "is", null)` plus assignee filter.
- **Project / master board:** `project_id`, `group_id`, `parent_task_id`; `unified_task_type` `'master' | 'subtask'` after backfills (`067`–`078`).
- **Personal / SOP:** `unified_task_type = 'personal'`; optional `is_daily`, `daily_date`, `is_daily_sop_template`.

**Safe unions:** In practice the codebase needs **multiple discriminated views** (≥ **4** distinct product meanings: lead-follow-up vs shop vs atlas master/subtask vs personal); exact compile-time enforcement is **not** centralized in one union — interfaces overlap (`SubTask extends ProjectTask`, etc.).

### Query discrimination & bleed risk (`lib/actions`)

| File | Representative `tasks` queries | Filters | Risk |
|------|-------------------------------|---------|------|
| `lib/actions/tasks.ts` | Many selects/inserts/updates | Mix of `unified_task_type`, `project_id`, assignee arrays, `lead_id` in some paths | **`getLegacyMyTasks`** filters primarily by `assigned_to_users` (+ optional lead domain OR) — **no `unified_task_type` / `shop_operation_scope` discriminator** → shop rows assigned to same user could appear in legacy “my tasks” UI if RLS allows. **`getTaskById`** — ID only (+ app-side assignee/admin check). |
| `lib/actions/shop-tasks.ts` | `getOngoingShopTasks`, `createShopTask`, `registerTaskSale` | `status=pending`, `shop_operation_scope` present, assignee `contains`; insert sets `lead_id: null`, **does not set `unified_task_type` / `domain`** (DB defaults apply) | Shop rows look like generic `subtask` rows; reliance on **shop columns + RLS** rather than a single enum discriminator. **`registerTaskSale` select** is by `id` only before mutating — mitigated by follow-up assignee / role checks. |
| `lib/actions/projects.ts` | Re-exports from `tasks.ts` | Same as tasks module | No separate query layer — **projects are not isolated in actions**.

**RLS note (tasks SELECT):** Migration `076` introduced `tasks_select_v3`. Migration `080` **drops and recreates `tasks_select_v2`** but **does not drop `tasks_select_v3`**. For `PERMISSIVE` policies, **multiple SELECT policies OR together** — effective rules are the **union** of `v2` and `v3`, which is **hard to reason about** and is a **maintainability / isolation bug risk**.

**`tasks_insert_v2` (`069`):** `WITH CHECK (auth.uid() IS NOT NULL)` — **any authenticated user can insert a row** subject to column constraints; **domain separation depends on SELECT/UPDATE policies and app logic**, not insert narrowing.

**Missing filter examples:** `getTaskById(taskId)` — no domain discriminator in query (relies on RLS + post-check).  

**Severity summary:** **CRITICAL** (table + RLS complexity); **HIGH** for query-level discriminator discipline.

### `LeadTaskWidget` vs `MyTasksWidget`

- **`MyTasksWidget`** uses `createPersonalTask` / `completePersonalTask` — **correct** for personal Atlas tasks.
- **`LeadTaskWidget`** imports `createTask` / `completeTask`, which are **`export const createTask = createPersonalTask`** and **`completeTask = completePersonalTask`** (`lib/actions/tasks.ts` ~2557–2561). It passes `{ leadId, title, dueAt, type, notes }`, which **does not match `CreatePersonalTaskSchema`** (`lib/schemas/tasks.ts`) — unknown keys are stripped; **`leadId` is ignored**. **New “lead” tasks become personal tasks without `lead_id`.** **`completePersonalTask`** requires `unified_task_type = 'personal'` — **completing a real CRM task via this path fails** (no row updated).  
**Same pattern in `components/leads/LeadFollowUpAccordion.tsx` (calls `createTask` with lead payload).**

---

## Section 2: Onboarding Surface Area Map

### Meaning A — CRM pipeline / “onboarding department” motion

- **Department config:** `onboarding` entry in `lib/constants/departments.ts` (`workspaceRoute: "/admin/onboarding"`).
- **Admin UI:** `app/(dashboard)/admin/onboarding/page.tsx` — loads **`leads`** via `OnboardingLeadsContent` (not `onboarding_leads`), plus `getOnboardingAgentsWithStats`, `getCampaignsWithAttribution`, `getOnboardingPulse`.
- **Components:** `components/onboarding/*` (tabs, dashboard, leads content).
- **Other “onboarding” strings:** e.g. `BrandOnboardingView` (Indulge World), `AdminCreateTaskModal` copy, `lib/schemas/tasks` — **naming only**, not the ledger.

### Meaning B — `onboarding_leads` ledger

- **Schema (`052_onboarding_leads.sql`):** `id`, `client_name`, `amount`, `agent_name`, `assigned_to` (text, constrained), `created_at`. **No FK to `public.leads`.**
- **Purpose:** Internal conversion events (webhook + admin recording), TV/admin displays.
- **RLS:** `onboarding_leads_admin_select` — `USING (public.get_role_from_jwt() = 'admin')` — **JWT-based**, unlike the documented profiles-first model.
- **Write path:** `app/api/webhooks/onboarding-conversion/route.ts` → `lib/onboarding/onboardingConversion.ts`; `lib/actions/onboarding-conversions.ts` (`recordOnboardingConversionFromAdmin`) uses **service role** insert helper.

### Files with `onboarding` in path (main repo)

| Path | Role |
|------|------|
| `app/(dashboard)/admin/onboarding/page.tsx` | Meaning **A** (leads oversight) |
| `app/(dashboard)/admin/onboarding/OnboardingOversightClient.tsx` | Meaning **A** |
| `components/onboarding/*` | Meaning **A** |
| `lib/onboarding/onboardingConversion.ts` | Meaning **B** |
| `lib/actions/onboarding-conversions.ts` | Meaning **B** (admin action) |
| `app/api/webhooks/onboarding-conversion/route.ts` | Meaning **B** |
| `app/api/tv/onboarding-feed/route.ts` | Likely **B** / TV (not fully traced in this pass) |
| `components/tv/TvOnboardingConversionsClient.tsx` | **B** (display) |
| `app/tv/conversions/page.tsx` | **B** / TV |

**Admin sub-routes:** **`/admin/onboarding` is a single page** (tabbed client UI) — **no** `admin/onboarding/*` nested route files found.

### `onboarding-code/` vs `onbording-code/`

- **`onboarding-code/`:** **not found** in the workspace.
- **`onbording-code/`:** **present** — appears to be a **partial duplicate** of the app (e.g. parallel `lib/actions`, `components/tasks`, `app/api/webhooks/onboarding-conversion`). **Not wired** as the main Next app root; treat as **staging / fork / typo copy**.

**Should onboarding exist as a standalone module?** **Yes, as a bounded context** — today it is **scar tissue** across admin, TV, webhooks, `lib/onboarding`, and CRM leads.

**Verdict:** **HIGH** severity (boundary + policy inconsistency + naming collision with CRM “onboarding”).

---

## Section 3: Component Duplication Inventory

### 4a — Modals

**30 files** matching `components/**/*Modal*.tsx` (includes `DepartmentModalSkeleton.tsx`).

| Modal (examples) | Role | Likely duplicate cluster |
|------------------|------|---------------------------|
| `AddTaskModal`, `AdminCreateTaskModal`, `CreatePersonalTaskModal`, `CreateMasterTaskModal`, `CreateShopTaskModal`, `AssignTaskModal`, `SubTaskModal`, `EditTaskModal`, `SmartTaskModal` | Task creation/editing | **>60% overlap** in “title + due + assign + submit” patterns |
| `CreateProjectModal` vs `CreateMasterTaskModal` | Project legacy vs Atlas master | Structural overlap (deprecated `components/projects/` vs `components/tasks/`) |
| `WonDealModal`, `LostLeadModal`, `NurtureModal`, `TrashLeadModal` | Lead outcomes | Shared dialog shell + form patterns |
| `CreateUserModal`, `EditUserModal` | Admin users | Same primitives, different fields |

### 4b — Forms (`react-hook-form`)

**13 component files** under `components/` using `useForm` / `react-hook-form` (grep-verified). Overlapping field sets: **task modals** (title, due date, assignees, notes), **lead modals**, **admin user modals**, **AssignTaskModal**.

### 4c — Tables / lists (examples)

- **Tasks:** `AtlasTasksListView`, `TaskListView`, `MyTasksDashboard`, shop boards, task intelligence views, project `ListView` (legacy).
- **Leads:** `LeadsTable`, onboarding oversight reuses `LeadsTable`, conversions tables, TV client.

### 4d — `*Card.tsx`

**14 files** under `components/**/*Card.tsx` (includes `ui/card.tsx`). **Highest structural duplication risk:** `tasks/TaskCard.tsx` vs `tasks/MasterTaskCard.tsx` vs `tasks/SubTaskCard.tsx` vs `projects/ProjectCard.tsx` (different domains, similar tile layout patterns).

### 4e — `#D4AF37` literals

- **595 matches** across `components/`, `app/`, `lib/` (`*.tsx`, `*.ts`, `*.jsx`, `*.css`) — **token drift** vs theme (`globals.css` / `@theme`).
- Heavy-hitters (grep count lines): e.g. `AtlasTasksListView.tsx` (31), `MyTasksDashboard.tsx` (29), `CreateUserModal.tsx` (28), `GlobalChatDrawer.tsx` (25), `AssignTaskModal.tsx` (17), `ConciergeClient.tsx` (16), etc.

### Folder weight

- **`components/tasks/`:** **47 files** — high bundle risk if many routes import disjoint subsets; worth **import-graph** follow-up (not run in this audit).

**Verdict:** **HIGH** (modal/form duplication + token literals).

---

## Section 4: Module Boundary Violations

- **No `lib/actions/index.ts` barrel** — every consumer imports concrete paths (`@/lib/actions/tasks`, etc.).
- **No per-domain public API** — boundaries are **folder convention only**.
- **`DEPARTMENT_ROUTE_ACCESS`** is a **routing allowlist**, not an architectural module seal: it **does not prevent** cross-imports or cross-table reads.
- **Cross-domain imports (examples):** Shop components correctly use `@/lib/actions/shop-tasks` / `shop`; lead components mostly stay on `leads` / `tasks` / `whatsapp`. **Risk is semantic** (tasks actions shared by all domains) rather than a single forbidden import.
- **RSC inline Supabase:** `components/onboarding/OnboardingLeadsContent.tsx` queries **`tasks`** directly (server component) instead of a dedicated action — **bypasses the “actions as data layer” convention** (still server-side, not client Supabase).

**Verdict:** **HIGH**.

---

## Section 5: Quick Wins (no schema change)

1. **Fix `createTask` / `completeTask` exports** — restore dedicated **CRM lead task** server actions (or rename exports so UI cannot import the wrong symbol); update **`LeadTaskWidget`** and **`LeadFollowUpAccordion`** immediately.
2. **Replace hardcoded `/projects` links** in `components/projects/*` and **Sidebar** entry (`components/layout/Sidebar.tsx` still lists `href: "/projects"`) with **`/tasks`** to match redirects and reduce confusion.
3. **Centralize brand gold** — replace `#D4AF37` literals incrementally with **CSS variables / theme tokens** (start with `components/ui/*` and top-hit files).
4. **Consolidate task modals** — shared layout for “create task” flows (single shell, domain-specific fields).
5. **Document RLS policy intent** for `tasks` — resolve **`tasks_select_v2` vs `tasks_select_v3` overlap** in a follow-up migration (read-only audit cannot change DB).
6. **`onboarding_leads` policy** — align `052` admin SELECT with **`get_user_role()` from profiles** (matches Section 12 invariants).

---

## Section 6: Refactor Roadmap (safe execution order)

### Phase 1 — Zero-risk consolidations

- Token pass (`#D4AF37` → theme).
- Navigation cleanup (`/projects` → `/tasks`).
- **Critical bugfix:** lead task create/complete wiring (no migration).

### Phase 2 — Component library hardening

- Shared **Modal shell** + **form field groups** for task flows.
- Thin wrappers around `IndulgeField` / `IndulgeButton` for repeated patterns.

### Phase 3 — Task table split strategy

- Introduce **views or split tables** by domain (`crm_tasks`, `shop_tasks`, `atlas_tasks`) *or* strict **`task_kind` discriminator + check constraints** and **narrow RLS** — requires migration design + backfill (out of scope here).

### Phase 4 — Onboarding as a standalone module

- Single package-like folder: `lib/modules/onboarding/` with **explicit exports** (ledger webhook, admin actions, TV feed, mappers).
- Rename CRM-only “onboarding department” UI if needed to avoid **Meaning A/B** collision.

---

## Section 7: What Must NOT Be Touched (load-bearing code)

From **`ATLAS_BLUEPRINT.md` Section 12 — Architectural Invariants** (verbatim substance):

1. `get_user_role()`, `get_user_domain()`, `get_user_department()` read **ONLY from `public.profiles`**. JWT claims are never trusted for authorization.
2. All **SECURITY DEFINER** functions have `SET search_path = public`.
3. **`lead_activities`** and **`task_progress_updates`** are append-only. No UPDATE or DELETE policies. Ever.
4. **`components/ui/`** is zero-dependency — no imports from `lib/actions/` or feature code.
5. Server Actions are the **only** entry point from components to database **mutations**.
6. All user-supplied text fields pass through **`sanitizeText()`** before any DB write.
7. Phone numbers are stored in **E.164** format. **`normalizeToE164()`** on every phone field before insert.
8. The **`pg_advisory_xact_lock`** on **`pick_next_agent_for_domain()`** must never be removed.
9. **`profiles.id` = `auth.users.id`**. Every `profiles` row must have a corresponding `auth.users` row.
10. Every new table must have **RLS enabled**.

**Next.js Server Actions rule (same section):** every **export** from `lib/actions/*.ts` with `"use server"` must be **`async`**.

**Blueprint / code discrepancies flagged in this audit**

- **`middleware.ts` missing** at repo root (per blueprint and `CLAUDE.md`) — **`proxy.ts` exists but is not loaded by Next** until re-exported.
- **`onboarding_leads` RLS** uses **`get_role_from_jwt()`** (`052`) — conflicts with invariant (1) if JWT is not strictly an alias of profiles.
- **Concierge route serves mock UHNI data** — `app/(dashboard)/concierge/page.tsx` renders `ConciergeClient` (known mock); **CRITICAL** product risk, aligns with blueprint Phase 0.

---

## Appendix: Route audit (`app/(dashboard)/`)

**Redirects (verified):** `next.config.ts` maps `/projects` and `/projects/:path*` → `/tasks` (permanent).

| Path | Data sources (representative) | Tables / RPC (representative) | Access notes | Sidebar | Assessment |
|------|------------------------------|-------------------------------|--------------|---------|------------|
| `/` | `getDashboardData`, `getAgentDailyRoster`, `getMyTasks`, `createClient` | `leads`, `tasks`, `profiles` | Agent dashboard | Yes | Core |
| `/workspace` | `getTodos` | varies | Workspace | Yes | Core |
| `/leads`, `/leads/[id]` | RSC + Supabase | `leads`, related | Concierge + others via routes | Yes | Core |
| `/clients`, `/clients/[id]` | `clients` actions | `clients` | Department-gated | Yes | Core |
| `/whatsapp` | `getRecentWhatsAppConversations` | messages/conversations | Gated | Yes | Core |
| `/tasks`, `/tasks/[id]`, `/tasks/import` | `tasks` actions, `createClient` | `tasks`, `projects`, … | Tech + shared | Yes | Core Atlas |
| `/projects`, `/projects/[id]` | `getUserProjects`, `getProject` | still calls **tasks** via actions | **301 → /tasks** | Sidebar still has `/projects` | **Redirected; legacy UI remains in repo** |
| `/task-insights/*` | `task-intelligence` actions | tasks aggregates | Manager/founder-style | Yes | Core |
| `/shop/workspace`, `/admin/shop/workspace` | `ShopWorkspaceView` + actions inside | `tasks`, `shop_orders`, … | Shop | Yes (shop) | Core |
| `/admin/onboarding` | team-stats, campaigns, dashboards, `OnboardingLeadsContent` | **`leads`**, **`tasks`** (next-task map) | Admin/founder/manager | Admin nav | **Meaning A** |
| `/admin/conversions`, `/conversions`, `/tv/conversions` | conversions UI | `onboarding_leads` / admin | Admin / TV | Varies | **Meaning B** surfaces |
| `/concierge` | `ConciergeClient` | **mock** | Routed | Yes | **CRITICAL mock** |
| `/elia-preview` | `getEliaActiveMemberCount`, auth gate | profiles | Authenticated | Sidebar / preview | **Preview / flagship UI per blueprint changelog** |
| `/indulge-world` | client-only dynamic imports | — | Presentation | Yes | **Client-only page** |
| `/manager/*`, `/admin/*`, `/calendar`, `/performance`, `/escalations`, `/profile` | Mix of actions + `createClient` | domain-specific | `DEPARTMENT_ROUTE_ACCESS` | Varies | Operational |

---

*End of report — read-only audit; no code changes applied in this session.*

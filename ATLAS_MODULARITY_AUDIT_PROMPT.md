# ATLAS MODULARITY AUDIT — CURSOR PROMPT
## Feed this entire file into Cursor (Composer / Agent mode)

> **Goal**: Perform a full surgical audit of the Indulge Atlas codebase.  
> Do NOT make any changes yet. Only read, trace, and report.  
> The output will be a structured `ATLAS_AUDIT_REPORT.md` file.

---

## 0. Context (read before scanning)

Indulge Atlas started as a CRM for inbound leads (Meta/Google/WhatsApp → `public.leads`) and has grown into a multi-department ERP with:
- CRM module (leads, dossier, onboarding conversions)
- Shop War Room (WhatsApp-first product sales)
- Projects & Atlas Task system (internal work management)
- Clients module (post-sale member management)
- Manager Command Center (analytics, campaigns, roster)
- Elia AI assistant

The codebase has accumulated **technical debt across four specific dimensions** that this audit must quantify and map precisely. Those four dimensions are described in Section 2 below.

The developer has a folder named `onboarding-code/` which contains files they believe are related to the onboarding management system — treat those files as a **second reference lens** alongside the main codebase. Cross-reference them with what actually lives in `app/`, `lib/`, `components/`, and `supabase/migrations/`.

---

## 1. Scan Order (do in sequence)

### Step 1 — Database: the `tasks` table (God Table analysis)

Read: `supabase/migrations/` — every file that touches the `tasks` table (look for `CREATE TABLE tasks`, `ALTER TABLE tasks`, `ADD COLUMN`, and any RLS policies on `tasks`).

Map every column in `public.tasks` to its **actual domain**. Use this classification:

| Column group | Belongs to |
|---|---|
| `lead_id`, `task_type`, `follow_up_step`, `follow_up_history` | CRM lead follow-up tasks |
| `shop_operation_scope`, `target_inventory`, `target_sold`, `shop_task_priority`, `deadline`, `shop_product_name` | Shop War Room tasks |
| `project_id`, `group_id`, `parent_task_id`, `priority`, `progress`, `estimated_minutes`, `actual_minutes`, `position`, `tags`, `attachments` | Project board tasks |
| `unified_task_type`, `atlas_status`, `domain`, `department`, `master_task_id`, `parent_group_task_id`, `archived_at`, `archived_by`, `imported_from`, `import_batch_id`, `cover_color`, `icon_key`, `visibility`, `is_daily`, `daily_date`, `is_daily_sop_template` | Atlas unified task system |
| `assigned_to_users`, `created_by`, `title`, `notes`, `due_date`, `status` | Shared / ambiguous |

**Output**: A table showing each column, its domain, and whether it is `NOT NULL` / has a default. Flag every column that serves more than one domain (these are coupling points). Count the total number of columns. State: "This table has N columns serving M distinct domains — it is a God Table."

Then read `lib/types/database.ts` and find: how many TypeScript types or interfaces reference the `tasks` table? List them all with their discriminating fields (e.g. `unified_task_type`, `lead_id IS NOT NULL`, `shop_operation_scope IS NOT NULL`).

---

### Step 2 — Onboarding: full surface area map

Onboarding in Atlas has **two different meanings** that are currently conflated. Map both precisely.

**Meaning A — The CRM pipeline "onboarding" motion:**
This is the flow where inbound leads come in, agents work them, and they eventually convert. The `onboarding` department and the `indulge_concierge` domain are involved.

Scan and list every file where the string `onboarding` appears in:
- `app/(dashboard)/admin/` routes
- `app/api/webhooks/onboarding*`
- `lib/onboarding/`
- `components/` (any file)
- `supaarding migrations/` (any SQL touching `onboarding_leads`)

**Meaning B — The standalone `onboarding_leads` ledger:**
Read `supabase/migrations/` for `CREATE TABLE onboarding_leads` and all subsequent migrations touching it. Document: what columns exist, what the table's actual purpose is (it is NOT `public.leads` — it is a parallel conversion ledger used by the TV display and admin views).

**Cross-reference with `onboarding-code/` folder**: List every file in that folder and state which of Meaning A or Meaning B (or both, or neither) each file actually belongs to.

**Output**: A two-column table: `File path | What it does | Which meaning (A/B/both/neither) | Should it exist as a standalone module?`

---

### Step 3 — Page and route audit

Read `app/(dashboard)/` — list every route. For each route output:
- Path
- What data it fetches (which Server Actions / lib/actions files)
- Which database tables it reads
- Who can access it (role/department gate from `DEPARTMENT_ROUTE_ACCESS` in `lib/constants/departments.ts`)
- Whether it has a corresponding sidebar entry
- **Assessment**: Is this route standalone, is it duplicated elsewhere, or is it a stub/dead route?

Pay special attention to:
- `/concierge` — currently serving `lib/concierge/mockData.ts` (confirmed mock data to real users — flag as CRITICAL)
- `/admin/onboarding/*` — how many sub-routes? What do they actually do?
- `/projects/*` → 301 redirected to `/tasks` — confirm this is wired and nothing still references `/projects` directly in components
- `/elia-preview` — is this a preview page or is it a permanent surface?
- Any route that references `onboarding` in the file path or in its imports

---

### Step 4 — Component duplication audit

This is the most important performance/DRY scan. Read every file in `components/`.

**4a — Modal duplication:**
Search for every component file whose name contains `Modal`. List them all. For each, document:
- What it does (one sentence)
- Which parent page/component renders it
- Whether another modal in the codebase does something substantially similar

Flag any pair of modals that share >60% of their UI (e.g. two "add task" modals, two "confirm action" modals, two "assign agent" modals).

**4b — Form duplication:**
Search for every component that contains a `<form` or uses `react-hook-form` (`useForm`, `register`, `handleSubmit`). List them. Flag any that collect the same fields (e.g. multiple components collecting `title` + `due_date` + `assigned_to`).

**4c — Table/list duplication:**
Search for every component that renders a list or table of the same entity type. E.g. how many places does a "list of tasks" get rendered? How many "lead list" variants exist? List them.

**4d — Card/tile duplication:**
Search for components named `*Card.tsx` or `*Tile.tsx`. List them. Flag any that are structurally identical but live in different domain folders (e.g. `components/tasks/TaskCard.tsx` vs `components/projects/TaskCard.tsx`).

**4e — Hardcoded values that should be constants:**
Search for `#D4AF37` (old gold hex literal). Count occurrences across all files. List the files. This is a known tech debt item but the count matters for understanding the surface area.

---

### Step 5 — Task system coupling points

The `tasks` table is shared across CRM, Shop, Projects, and Atlas. Find every place in the codebase where the task system is queried and document what discriminating filter (if any) is used:

Search `lib/actions/tasks.ts`, `lib/actions/shop-tasks.ts`, `lib/actions/projects.ts` for every Supabase query against `tasks`. For each query:
- What filters are applied? (`lead_id`, `unified_task_type`, `shop_operation_scope`, `project_id`)
- What columns are selected?
- Is there a missing filter that could cause data leakage between domains?

Then search `components/tasks/`, `components/projects/`, `components/leads/` for any component that directly constructs a task query (bypassing lib/actions). Flag these — they violate the Server Actions invariant.

Also find: does `LeadTaskWidget` use the same query path as `MyTasksWidget`? Do they share any logic, or are they completely duplicated? Read both files.

---

### Step 6 — Server Actions audit (DRY violations)

Read all files in `lib/actions/`. For each exported async function:
- What table(s) does it read/write?
- Does a functionally equivalent function exist in another actions file?

Pay special attention to:
- Any `getAuth` / `getAuthUser` pattern — is it copy-pasted in every file, or is there a shared utility?
- Any `revalidatePath` calls — are they consistent? Are there paths being revalidated that no longer exist?
- Functions that only wrap a single Supabase query with no business logic — these are candidates for consolidation.

---

### Step 7 — RLS policy audit (onboarding-specific)

Read `supabase/migrations/` — every file that creates RLS policies.

For the `onboarding_leads` table specifically: what policies exist? Who can INSERT? Who can SELECT? Is there a service_role bypass? Is this consistent with how `public.leads` is protected?

For the `tasks` table: with N domains sharing one table, how do the RLS policies prevent a concierge agent from seeing shop tasks? If they do not, flag this as a DATA ISOLATION BUG.

---

### Step 8 — Wiring map of `onboarding-code/` folder

Read every file in `onboarding-code/`. For each file:
1. Identify what it does
2. Find its counterpart in the main codebase (or confirm it has none)
3. State whether it is:
   - **Standalone** — self-contained, no dependencies on main CRM code
   - **Tightly coupled** — imports from main CRM actions, components, or types
   - **Orphaned** — exists in onboarding-code but has no wiring in the main app
   - **Duplicated** — same logic exists elsewhere under a different name

---

## 2. The Four Problems to Diagnose (quantify each)

After completing all scans above, produce a findings section for each:

---

### Problem 1 — God Table: `tasks` is serving 5 masters

**What to measure:**
- Total column count in `tasks`
- Number of distinct domains using the table
- Number of columns that are `NULL` in 3+ out of 4 use cases (wasted space / confusion)
- Number of TypeScript discriminated union types needed to safely use this table
- Number of queries that do NOT filter by a domain discriminator (risk of cross-domain data bleed)

**Root cause to state:** The table started as CRM lead follow-up tasks, then shop tasks were bolted on (`shop_operation_scope`), then project tasks were bolted on (`project_id`), then the unified Atlas system was bolted on (`unified_task_type`). Each wave added columns without splitting the table.

**Impact:** Every query must carry discriminating WHERE clauses or risk returning the wrong task type. Type safety requires a complex discriminated union. Any new task domain means adding more nullable columns to an already bloated table.

---

### Problem 2 — Onboarding is not a module, it is scar tissue

**What to measure:**
- Count of files with `onboarding` in their path
- Count of files that import from `lib/onboarding/` or reference `onboarding_leads`
- Count of admin sub-routes dedicated to onboarding
- Whether the onboarding flow can be disabled or removed without touching CRM code
- Whether `onboarding_leads` is truly independent from `public.leads` or has foreign key coupling

**Root cause to state:** The onboarding system was added incrementally — a table here, a webhook there, an admin route somewhere else — without defining what "onboarding" means as a bounded context. The result is that onboarding logic is spread across CRM actions, admin routes, a TV feed, a separate webhook, and a parallel table, with no clear module boundary.

**Impact:** Cannot develop, test, or hand off onboarding independently. Cannot enable/disable onboarding for a domain. Cannot know what "onboarding" owns without grep.

---

### Problem 3 — Component sprawl is killing load time

**What to measure:**
- Total count of Modal components
- Count of modal pairs that are functionally equivalent
- Total count of form components using react-hook-form
- Count of forms collecting the same field set
- Count of files with hardcoded `#D4AF37` (design token drift)
- Count of `*Card.tsx` components and how many share structure
- Estimated bundle impact: list any component folder that has >10 files and assess whether all 10 are actively imported somewhere

**Root cause to state:** Each domain (CRM, tasks, shop, projects, onboarding) built its own modal set, its own card components, and its own form patterns in isolation. `components/ui/` primitives exist but are not being composed — feature components are being written from scratch instead of composing from primitives.

**Impact:** Larger JavaScript bundle → slower initial load. Inconsistent UX across domains. Bug fixes must be applied in N places. Design token changes (like brand-gold) must touch N files.

---

### Problem 4 — Missing module boundaries mean no safe refactor path

**What to measure:**
- Does any module (concierge, shop, onboarding, tasks) have a clear entry point file that aggregates its exports?
- Can any single module be removed from the codebase without touching files in other modules?
- How many `import` statements cross domain boundaries (e.g. a concierge component importing a shop action)?
- Does `lib/constants/departments.ts` serve as an effective boundary or is it just a routing map?

**Root cause to state:** Modules are defined by folder convention only, not by explicit contracts. There is no `index.ts` barrel per module that defines the public API. Components import directly from other domain folders. There is no enforced boundary between `lib/actions/leads.ts` and `lib/actions/shop-tasks.ts`.

**Impact:** Refactoring any one domain risks breaking others in non-obvious ways. There is no way to know whether a domain is self-contained without tracing every import manually.

---

## 3. Output Format

Produce a single file: `ATLAS_AUDIT_REPORT.md`

Structure it as follows:

```
# ATLAS AUDIT REPORT
Generated: [date]

## Executive Summary (5 bullet points max)

## Section 1: God Table Analysis — `tasks`
[Table: column → domain mapping]
[Coupling points]
[Missing discriminators in queries]
[Verdict + severity: CRITICAL / HIGH / MEDIUM]

## Section 2: Onboarding Surface Area Map
[Table: file → meaning A/B/standalone/coupled]
[onboarding-code/ cross-reference]
[Missing module boundary assessment]
[Verdict + severity]

## Section 3: Component Duplication Inventory
[Modal pairs that can be merged]
[Form components that can be consolidated]
[Card components that can be unified]
[Hardcoded token count]
[Verdict + severity]

## Section 4: Module Boundary Violations
[Cross-domain imports]
[Missing barrel files]
[Verdict + severity]

## Section 5: Quick Wins (no schema change needed)
[List of changes that reduce bundle size or duplication with zero DB migration]

## Section 6: Refactor Roadmap (safe execution order)
[Phase 1 — Zero-risk consolidations]
[Phase 2 — Component library hardening]
[Phase 3 — Task table split strategy]
[Phase 4 — Onboarding as a standalone module]

## Section 7: What Must NOT Be Touched (load-bearing code)
[List invariants from ATLAS_BLUEPRINT.md Section 12 that constrain any refactor]
```

---

## 4. Hard Rules During This Audit

- Do NOT make any code changes. Read only.
- Do NOT hallucinate file paths. If you cannot find a file, say "not found."
- When you quote a column name, function name, or import path, verify it exists in the file you say it does.
- If the `onboarding-code/` folder is empty or does not exist at the expected path, say so explicitly before proceeding.
- Treat `ATLAS_BLUEPRINT.md` and `claude.md` as authoritative context — but verify their claims against the actual code. Flag any discrepancy between what the blueprint says and what the code actually does.
- The architectural invariants in `ATLAS_BLUEPRINT.md Section 12` are constraints on any refactor — list them explicitly in Section 7 of your output so the engineer knows what cannot be touched.

---

## 5. After the Report is Done

Once `ATLAS_AUDIT_REPORT.md` is written, output a single summary paragraph with this format:

> **Cursor ready.** The audit found [N] critical issues, [N] high-severity issues, and [N] quick wins. The highest-risk area is [X]. The safest place to begin refactoring is [Y]. Do not proceed with changes until the engineer reviews and approves the report.

Then stop. Do not begin any refactoring in this session.

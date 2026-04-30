# User details: domain, department, roles, and permissions

This document describes how **users** are represented, created, and authorized in Indulge Atlas. It is derived from the current codebase: `lib/types/database.ts`, `lib/constants/departments.ts`, `lib/actions/admin.ts`, `lib/validations/user.ts`, Supabase migrations (notably **058**, **056**, **066**, **069**), `components/layout/Sidebar.tsx`, and related server actions.

---

## 1. Mental model: two independent axes

The product uses **two orthogonal concepts** (see comments in `lib/constants/departments.ts` and migration `066_department_access_control.sql`):

| Axis | Field(s) | Answers | Primary enforcement |
|------|-----------|---------|----------------------|
| **1 — Domain** | `profiles.domain` (`indulge_domain` enum) | *What data can this user see?* | **Row-Level Security (RLS)** on `leads`, `tasks`, etc. |
| **2 — Department** | `profiles.department` (`employee_department` enum, nullable) | *Which app areas / routes can they open?* | **UI** — sidebar nav filtering via `DEPARTMENT_ROUTE_ACCESS` |

They are **not** the same: a Finance user might have `domain = indulge_global` (broad data visibility) and `department = finance` (narrow screen access). Tech and Marketing follow the same `indulge_global` + specific department pattern.

**Important:** RLS for authorization must use **`public.profiles`** (via `get_user_role()` / `get_user_domain()` / `get_user_department()`), **not** JWT `user_metadata` or `app_metadata` claims. Client-modifiable `user_metadata` was historically dangerous; migration **058** hardens this (see §7).

---

## 2. Database: `public.profiles`

### 2.1 Core fields (TypeScript: `Profile` in `lib/types/database.ts`)

| Column | Type / notes |
|--------|----------------|
| `id` | UUID — matches `auth.users.id` |
| `full_name`, `email` | Display / login identity |
| `phone`, `dob` | Optional PII |
| `role` | `UserRole` — see §4 |
| `domain` | `IndulgeDomain` — tenant / data scope for RLS |
| `department` | `EmployeeDepartment` **or NULL** — workspace routing; NULL = cross-departmental (typically **admin** / **founder**) |
| `job_title` | Display only |
| `reports_to` | UUID FK to `profiles.id` — manager line (optional) |
| `is_on_leave` | When true, excluded from `pick_next_agent_for_domain` (lead routing) |
| `is_active` | Deactivation; admin flow can ban user in Auth when set false |
| `created_at`, `updated_at` | Timestamps |

### 2.2 Enums in Postgres (must stay aligned with `lib/types/database.ts`)

- **`indulge_domain`:** `indulge_concierge`, `indulge_shop`, `indulge_house`, `indulge_legacy`, and (from migration **066**) `indulge_global` for cross–business-unit internal roles.
- **`employee_department`:** `concierge`, `finance`, `tech`, `shop`, `house`, `legacy`, `marketing`, `onboarding`.
- **`user_role`:** `admin`, `founder`, `manager`, `agent`, `guest` — matches `UserRole` in TypeScript.

---

## 3. Domains (`IndulgeDomain`)

### 3.1 Values and product meaning

| Domain | Typical use |
|--------|-------------|
| `indulge_concierge` | Primary concierge & inbound sales (default for many users) |
| `indulge_shop` | E-commerce / Shop BU |
| `indulge_house` | Property / House BU |
| `indulge_legacy` | Legacy / membership |
| `indulge_global` | **Cross-BU read access** — Finance, Tech, Marketing (internal); **not** used for “old alias” of concierge (that was migrated away in **056**) |

`DOMAIN_CONFIG` in `lib/constants/departments.ts` provides UI labels, descriptions, and pill colors.

### 3.2 `coerceIndulgeDomain()`

`coerceIndulgeDomain(raw)` in `lib/constants/departments.ts` maps unknown or empty strings to `indulge_concierge` so domain-scoped helpers (e.g. `departmentsVisibleForDomain`, Task Insights) never receive an invalid domain.

### 3.3 RLS: who sees which rows (summary)

- **`leads` (post–066 `leads_select`):**
  - `admin` / `founder` — all leads
  - `get_user_domain() = 'indulge_global'` — **all leads** (cross-domain read)
  - `manager` — leads in their domain
  - `agent` — leads **assigned to them** **or** in their domain
  - `guest` — leads in their domain (read-only)

- **`tasks` (migration **069** `tasks_select_v2` — high level):**
  - `admin` / `founder` — broad access
  - `indulge_global` users can see master/subtask rows matching the policy (same domain or global, plus project membership / assignee rules)
  - Policy text uses `get_user_role()` and `get_user_domain()` only (no JWT for auth decisions)

- **`profiles` (post–066):**
  - `profiles_select` allows **all authenticated** users to read all profile rows (internal directory / collaboration). Comment in migration: display fields only, no sensitive HR fields on this table.
  - Earlier migration **056** had stricter `profiles_select`; **066** replaced it with `USING (true)` for authenticated `SELECT`.

- **`profiles` UPDATE (from **056**, not superseded in **066**):** user may update **own** row, or `admin` / `founder` may update. Inserts: `admin`/`founder` only. Deletes: `admin` only.

### 3.4 Lead assignment: `indulge_global` → concierge pool

`pick_next_agent_for_domain(p_domain)` (e.g. `supabase/migrations/060_fortify_queries_and_locks.sql`) **normalizes**:

```text
p_domain = 'indulge_global'  →  effective v_domain = 'indulge_concierge'
```

So **Finance / Tech / Marketing staff** with `indulge_global` are **not** selected as round-robin agents; lead assignment still pulls from the concierge agent pool. This is **intentional** (documented in migration **066** comments and `CLAUDE.md`).

Agent selection filters: `p.role = 'agent'`, `p.domain` matches the effective domain, `is_active`, not on leave, cap on “new” leads, etc.

---

## 4. Departments (`EmployeeDepartment`)

### 4.1 What department controls

- **Sidebar navigation:** For users who are **not** `admin` or `founder`, the visible links are filtered by `DEPARTMENT_ROUTE_ACCESS[department]` and `isDepartmentRoute()` (`components/layout/Sidebar.tsx`).
- **NULL department:** Treated as **cross-departmental** — e.g. **admin** and **founder** typically have `department = NULL` and **bypass** the department route filter entirely (`isGlobalRole`).
- If an **agent**/**manager** has `NULL` department, the code **skips** the department route gate when `deptRoutes` would be null (defensive; creation flows should set department for those roles when possible).

### 4.2 `DEPARTMENT_CONFIG` (single source of truth: `lib/constants/departments.ts`)

For each department key, config includes: `label`, `description`, `icon`, `accentColor`, `primaryDomain`, `allowedDomains`, `workspaceRoute`.

**Examples:**

- `concierge` — `primaryDomain: indulge_concierge`, routes include `/`, `/workspace`, `/leads`, `/tasks`, …
- `finance` / `tech` / `marketing` — often `primaryDomain: indulge_global` (or `allowedDomains` including global + concierge for finance/marketing)
- `shop` — `indulge_shop`, `workspaceRoute: /shop/workspace`
- `onboarding` — includes `/admin/onboarding` in `DEPARTMENT_ROUTE_ACCESS`

### 4.3 `DEPARTMENT_ROUTE_ACCESS`

Maps each `EmployeeDepartment` to an array of path **prefixes**. Matching rules in `isDepartmentRoute()`:

- The route `"/"` is an **exact** match only (so it does not open every page).
- Other entries match exact path or `href.startsWith(route + "/")`.

### 4.4 `departmentsVisibleForDomain(domain)`

Returns departments whose `primaryDomain` **or** `allowedDomains` includes the given `IndulgeDomain`. Used for **managers** and **Task Insights**-style scoping: managers see departments aligned with their domain; **admins** / **founders** can see all departments in those flows.

---

## 5. Roles (`UserRole`)

### 5.1 Values

`"admin" | "founder" | "manager" | "agent" | "guest"` (`lib/types/database.ts`).

### 5.2 Helper constants

- **`MUTABLE_ROLES`:** `admin`, `founder`, `manager`, `agent` — can mutate data in UI guardrails.
- **`GLOBAL_ROLES`:** `admin`, `founder` — in types file, “roles with cross-domain visibility” (conceptual; actual enforcement is RLS + `isPrivilegedRole`).
- **`isPrivilegedRole(role)`:** `true` for `admin` or `founder` — used widely in server actions and UI to skip department/domain checks where appropriate.

### 5.3 Role behaviors (synthesis)

| Role | Typical domain / department | Coarse behavior |
|------|----------------------------|-----------------|
| **admin** | Any; `department` often null | Full super-user in app; sidebar shows all allowed nav entries including admin tools; RLS super-user on many tables; only **admin** may delete profiles (per **056**); `CreateUser` restricted to **admin** only |
| **founder** | Any; `department` often null | Like admin for most RLS; **cannot** be assigned via `createUser` (blocked in `lib/actions/admin.ts`); some nav items limited to `admin` only (e.g. **Data Pipeline** `/admin/integrations` is `admin` only in sidebar) |
| **manager** | Domain + department | Manager features (campaigns, team, task insights in sidebar for manager/founder/admin), stricter scoping in `createMasterTask` (domain + `departmentsVisibleForDomain`); RLS: managers see their **domain** on leads |
| **agent** | Domain + department | Day-to-day CRM; lead visibility per **066**; may be gated on department for master task creation (must match own `department` / `domain` in `lib/actions/tasks.ts`) |
| **guest** | Domain | Read-oriented; in sidebar **All Leads** is allowed; `MUTABLE_ROLES` excludes guest; RLS: select-only on leads in domain |

`Sidebar` exports `MUTABLE_ROLES` and `canEdit(role)` for client checks — these mirror `MUTABLE_ROLES` in `database.ts` (keep in sync if you change roles).

### 5.4 Shop-specific UI rule

`canAccessShopSurfaces(profile)` in `lib/shop/access.ts`: **admin** and **founder** always; everyone else must have `domain === 'indulge_shop'` and role in `manager` | `agent` | `guest`. Used for `shopOnly` nav items in the Sidebar.

---

## 6. `profiles` + Auth: triggers and metadata

### 6.1 `handle_new_user()` (after migrations **058** + **066**)

On `auth.users` insert, a trigger runs `public.handle_new_user()` which **inserts** into `public.profiles`:

- **`role`:** from `raw_app_meta_data->>'role'` if in allowed list; else default **`agent`**.
- **`domain`:** from `raw_app_meta_data->>'domain'` if in the allowed list (includes `indulge_global` in **066**); else default **`indulge_concierge`**.
- **`department`:** from `raw_app_meta_data->>'department'` if valid enum value; else **NULL**.
- **`job_title`:** from `raw_user_meta_data` (trimmed) — display-only, not trusted for auth.
- **`full_name`:** from `raw_user_meta_data->>'full_name'` or email local-part.

**Invariant:** **Authorization** fields **must** come from **`app_metadata`** (service role / admin API), not from user-editable `user_metadata` (see **058**).

### 6.2 SQL helpers (always read from `profiles`, never from JWT for security decisions)

- `get_user_role()` → `profiles.role` default `'agent'`
- `get_user_domain()` → `profiles.domain` default `'indulge_concierge'`
- `get_user_department()` → `profiles.department` (can be NULL)

`get_role_from_jwt()` is an **alias** of `get_user_role()` (migration **058**); the name is misleading — **do not** assume it reads the JWT for real authorization.

---

## 7. User creation and administration (application workflow)

### 7.1 Server actions: `lib/actions/admin.ts`

- **`getAllProfiles` / `getUsersByDepartment`:** `requireAdminOrManager()` — caller must be `admin`, `founder`, or `manager` (by **profiles.role**).
- **`checkEmailExists`:** any authenticated user (for wizard duplicate check).
- **`getProfilesForReportsTo`:** any authenticated user; returns active **admin** / **founder** / **manager** for `reports_to` dropdown.
- **`createUser`:** **`requireAdminOnly()`** — **only `admin`** (not even founder, per code). Validated with `createUserSchema` (`lib/validations/user.ts`). Cannot assign **`founder`**. **Password** required when `send_invite === false` (min 12 chars).
- **Invite flow:** `inviteUserByEmail` + `updateUserById` to set `app_metadata` (invite path cannot set app_metadata in one shot).
- **Direct create:** `auth.admin.createUser` with `user_metadata` and `app_metadata` together.
- **Post-create:** `profiles` row is **updated** again via service client to sync `full_name`, `role`, `domain`, `job_title`, optional `department`, `reports_to` (avoids race with trigger).
- **`updateUserProfile`:** **admin** only; updates `profiles` and syncs Auth `user_metadata` / `app_metadata` when role/domain/department/name change; can ban user when `is_active` false.
- **`deleteUser`:** **admin** only — hard delete via Auth API.

### 7.2 Zod: `lib/validations/user.ts`

- `indulgeDomainSchema` — all five `IndulgeDomain` values.
- `employeeDepartmentSchema` — all eight departments.
- `userRoleSchema` / `createUserSchema` — optional `department` (nullable), `reports_to` UUID, invite vs password rules.

### 7.3 Admin UI

- `app/(dashboard)/admin/page.tsx` loads only if `profile.role` is in `admin` | `founder` | `manager` (page-level guard). **User creation** itself is still **admin-only** in the action.
- `components/admin/CreateUserModal.tsx` calls `createUser`, `checkEmailExists`, `getProfilesForReportsTo`.

### 7.4 Dashboard layout: every session

`app/(dashboard)/layout.tsx` loads the full `profiles` row (including `role`, `domain`, `department`, `job_title`, `reports_to`, `is_active`) and passes it to `Sidebar` and context providers. No user without a `profiles` row (redirect to login).

---

## 8. How the Sidebar combines role + domain + department

**Order of filtering** (`components/layout/Sidebar.tsx` for `navItems`):

1. **Role** — each item lists `roles: [...]`; user’s `profile.role` must be included.
2. **Shop-only** — if `shopOnly: true`, `canAccessShopSurfaces(profile)`; admins get shop items hidden for some entries (e.g. Shop Workspace for admin is explicitly excluded in code).
3. **Department** — if user is not `admin`/`founder` and has a non-null `department`, `href` must match `DEPARTMENT_ROUTE_ACCESS[department]` via `isDepartmentRoute`.

**Notable role lists in nav (non-exhaustive):**

- **System tools:** `/admin/integrations` — **admin** only.
- **User management** `/admin` (exact) — `admin` + `founder`.
- **Task Insights** — `manager` + `founder` + `admin` (not agents).
- **Manager section** (campaigns, team, planner, command center) — `manager` + `founder` (not admin, unless a nav item also lists admin).
- **Dashboard** `/` — `agent` + `manager` + `founder` (not `admin` in this array — admin home may differ by route usage).

**Department/domain badge** in the sidebar: shows department from `DEPARTMENT_CONFIG` when set; falls back to `DOMAIN_DISPLAY_CONFIG[profile.domain]`.

---

## 9. Server action patterns (representative)

### 9.1 `getAuthUser()` (example: `lib/actions/tasks.ts`)

Loads `id, full_name, role, domain, department` from `profiles` after `getUser()`. Defaults: role `agent`, domain `indulge_concierge`, department `null` if column missing.

### 9.2 `createMasterTask` domain/department rules (`lib/actions/tasks.ts`)

(Paraphrased; see source for exact errors.)

- **agent / guest:** must have a **department**; can only set task `department` to **own** and `domain` to **own**.
- **manager:** task `domain` must match their domain; `department` must be in `departmentsVisibleForDomain(domain)`.
- **admin / founder:** wider latitude (per function body).

This is **application-layer** policy on top of RLS.

### 9.3 Task Intelligence (`lib/actions/task-intelligence.ts`)

- `getAuthUser()` includes `coerceIndulgeDomain` for the profile domain.
- `assertTaskIntelligenceRole`: `manager` or `isPrivilegedRole` for main dashboards.
- `departmentsForCaller` / `resolveVisibleDepartments`: **privileged** get all `ALL_DEPARTMENTS`; **managers** get `departmentsVisibleForDomain(domain)` with a fallback to own department or `concierge` if empty.

---

## 10. `GLOBAL_ROLES` vs `isPrivilegedRole`

In `lib/types/database.ts`, `GLOBAL_ROLES` lists `admin` and `founder` as “cross-domain visibility” in a **type-level / UI grouping** sense. Hardened **RLS** still uses explicit `get_user_role() IN ('admin', 'founder')` and `get_user_domain() = 'indulge_global'` as written in each policy. Always verify **actual SQL** when changing access.

---

## 11. Security notes (for operators)

- **Do not** rely on `auth.jwt() -> user_metadata` for RLS; **058** exists because users could self-edit **user** metadata in the past.
- **`app_metadata`** is the channel for `role` / `domain` / `department` at signup; only service role / admin API can set it reliably.
- **Service client** (`createServiceClient`) in `lib/actions/admin.ts` bypasses RLS for admin maintenance — still gated by `requireAdminOnly` / `requireAdminOrManager` in application code.
- A **`middleware.ts`** re-exporting `proxy` is noted in `CLAUDE.md` as still needed in some deployments for session refresh — if missing, edge auth behavior may be incomplete; **not** a substitute for RLS on the server.

---

## 12. File index (where to look)

| Area | Location |
|------|----------|
| Type definitions | `lib/types/database.ts` — `UserRole`, `IndulgeDomain`, `EmployeeDepartment`, `Profile`, `isPrivilegedRole`, `MUTABLE_ROLES`, `GLOBAL_ROLES` |
| Department + domain config | `lib/constants/departments.ts` — `DEPARTMENT_CONFIG`, `DOMAIN_CONFIG`, `DEPARTMENT_ROUTE_ACCESS`, `isDepartmentRoute`, `departmentsVisibleForDomain`, `coerceIndulgeDomain` |
| Create/update users | `lib/actions/admin.ts`, `lib/validations/user.ts` |
| UI: nav + gating | `components/layout/Sidebar.tsx` — `navItems`, `canEdit`, `canAccessShopSurfaces` |
| Shop gating | `lib/shop/access.ts` |
| RLS + triggers | `supabase/migrations/058_rls_authorization_profiles_only.sql`, `066_department_access_control.sql`, `056_strict_tenant_isolation.sql`, `069_task_rls_domain_scoping.sql`, `060_fortify_queries_and_locks.sql` (agent pick) |
| App shell profile load | `app/(dashboard)/layout.tsx` |
| Product doc | `CLAUDE.md` (conventions, two-axis model, `createUser` example) |

---

*This file is a snapshot of the implementation. When you add departments, domains, or policies, update the migrations, `lib/types/database.ts`, `lib/constants/departments.ts`, and this document together.*

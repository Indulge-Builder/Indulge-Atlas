# Atlas Tasks — Technical Audit

**Date:** 2026-04-27  
**Scope:** Unified Atlas Tasks (master / subtask / personal), migrations 062–072, `lib/actions/tasks.ts`, realtime hooks, dashboard integration.  
**Method:** Full read of schema migrations, types, server actions, hooks, task components, pages, providers, navigation, and config.

---

## Section 1 — Schema Reality

### `tasks`

**Columns (relevant):** Core CRM columns plus project system fields from 063; unified columns from 067 (`unified_task_type`, `atlas_status`, `domain`, `department`, `archived_at`, `archived_by`, `imported_from`, `import_batch_id`, `cover_color`, `icon_key`, `master_task_id`), etc.

**FKs:** `project_id` → `projects`; `group_id` → `task_groups`; `parent_task_id` → `tasks`; `master_task_id` → `tasks`; `import_batch_id` → `import_batches`.

**RLS:** Policies named `tasks_select_v2`, `tasks_insert_v2`, `tasks_update_v2`, `tasks_delete_v2`, `tasks_service_role_all` (069). **Legacy policies `tasks_select`, `tasks_insert`, `tasks_update`, `tasks_delete` from 063 were never dropped**, so PERMISSIVE policies duplicate — effective access is the **union (OR)** of old and new rules (**type drift / security ambiguity**).

**Indexes:** 070 (`idx_tasks_unified_type_domain`, `idx_tasks_project_id_type`, `atlas_status`, etc.).

**Realtime:** `tasks` is in `supabase_realtime` publication (046). **REPLICA IDENTITY FULL** (047).

### `task_groups`

**RLS:** `task_groups_*` from 062 (service + member policies).

**Realtime:** **Not** added to `supabase_realtime` in any migration → **no postgres_changes events** for group CRUD.

**REPLICA IDENTITY:** Not set to FULL in migrations (default).

### `task_remarks` (067 + 071)

**Columns:** `id`, `task_id`, `author_id`, `content`, `state_at_time`, `progress_at_time`, `created_at`, `source` (071), `previous_status` (071, `TEXT` nullable).

**RLS:** SELECT/INSERT for authenticated; append-only (no UPDATE/DELETE); `task_remarks_service_role_insert` for `service_role`.

**Realtime:** Table created with `REPLICA IDENTITY FULL` but **never added to `supabase_realtime` publication** → **client subscriptions receive no events**.

### `task_comments` / `task_progress_updates` (064)

Append-only for `task_progress_updates`; `task_comments` has UPDATE/DELETE (by design). Both in realtime publication.

### `import_batches` (067)

RLS: SELECT/INSERT/UPDATE + service_role ALL. Not in realtime (audit trail only).

### Type drift vs migrations

| Area | Issue |
|------|--------|
| `TaskPriority` in `database.ts` | `urgent` \| `high` \| `medium` \| `low` — DB 072 adds **`critical`** and keeps `urgent`. |
| `taskPrioritySchema` | Same — no `critical`. |
| `TASK_PRIORITY_CONFIG` | No `critical` entry. |
| `Task` Row type | Omits `unified_task_type`, `atlas_status`, `import_batch_id`, etc. — hand-written `Database` interface incomplete. |
| `task_remarks.previous_status` | Typed as `AtlasTaskStatus \| null`; DB is unconstrained TEXT. |

---

## Section 2 — Server Action Coverage

Legend: Yes / No / Partial

| Mutation | Action | Zod | getAuthUser | task_remarks | Revalidate paths | Notes |
|----------|--------|-----|-------------|--------------|------------------|-------|
| Create master task | `createMasterTask` | Yes | Yes | No | `/tasks`, `/tasks/[id]` | OK — no remark required |
| Update master task | `updateMasterTask` | Yes | Yes | No | `/tasks`, detail | No system remark |
| Archive master task | `archiveMasterTask` | Yes | Yes | **No** | `/tasks`, detail **only** | Missing system log on master; **no `/`** |
| Delete master task | `deleteMasterTask` | Yes | Yes | No | `/tasks` | Privileged delete |
| Create task group | `createTaskGroupForMaster` | Yes | Yes | No | detail only | OK |
| Create subtask | `createSubTask` | Yes | Yes | No | detail, `/tasks` | Prompt: optional structural log — **none** |
| Update subtask fields | `updateSubTask` | Yes | Yes | Partial (status/due/priority) | detail **only** | **`prev.priority` bug** — select omits `priority`; logs may skip priority changes |
| Zone B log update | `updateSubTaskStatus` | Yes | Yes | Yes (`agent`) | detail **only** | **No `/tasks`, no `/`** |
| Progress % (structured) | `updateSubTaskProgress` | Yes | Yes | No (uses `task_progress_updates`) | detail **only** | OK per prompt |
| Assign subtask | `assignSubTask` | Yes | Yes | Intended **system** | detail **only** | **`insertSystemLog` via user client likely blocked by RLS** (`author_id` must equal `auth.uid()`) |
| Delete subtask | `deleteSubTask` | Yes | Yes | **No** | detail **only** | Missing system remark; missing `/`, `/tasks` |
| Checklist only | `updateSubTaskChecklist` | Yes | Yes | No | detail **only** | OK — no remark per prompt |
| Import CSV | `createImportBatch` | Yes | Yes | **No** master-level log | detail **only** | Missing one system entry on master; **no `/tasks` index** |
| Complete personal task | `completePersonalTask` | Yes | Yes | No | **None** | **No revalidation** — dashboard stale |
| Create personal task | `createPersonalTask` | Yes | Yes | No | **None** | **No revalidation** |

---

## Section 3 — Realtime Coverage

### Subscriptions today

| Hook / component | Channel | Table | Events | Handler |
|------------------|---------|-------|--------|---------|
| `useTaskRealtime` | per `taskId` | `task_comments`, `task_progress_updates`, `tasks` | INSERT/UPDATE/DELETE / INSERT / UPDATE | Local comments/progress/task state |
| `useAtlasTaskRealtime` | `tasks:master:{id}:board` | `tasks` | **UPDATE only** | `onSubtaskChanged`, `boardVersion++` |
| `useAtlasTaskRealtime` | subtask remarks | `task_remarks` | INSERT | Local `remarks` state |
| `SubTaskModal` Zone B | inline | `task_remarks` | INSERT | Merge into remarks |
| `TaskAlertProvider` | `overdue-task-alert` | `tasks` | `*` | Overdue count delta (uses **`status === pending`**, not `atlas_status`) |

### Gaps

1. **`task_remarks` not in publication** — modal/list timeline realtime **never fires** in production Supabase.
2. **`tasks` INSERT** (new subtask) — not subscribed → other users rely on manual refresh only.
3. **`task_groups`** — not published → group rename/add/delete invisible via Realtime.
4. **`useAtlasTaskRealtime`** board channel — UPDATE only; INSERT missing.
5. **Tasks index (`MasterTaskCard`)** — no subscription → completion % stale until navigation/refresh.

---

## Section 4 — Data Flow Integrity (five actions)

### 1. Agent updates subtask status via Log Update (Zone B)

- UI → `updateSubTaskStatus` → updates `tasks` + inserts `task_remarks` (`agent`).
- Realtime: **broken** for remarks (publication). Zone B optimistic path works locally.
- **Break:** Second tab / cross-user timeline depends on publication + RLS; remark insert uses user client — OK for agent.

### 2. Manager creates subtask from board/list

- `createSubTask` → INSERT `tasks` → revalidate detail + `/tasks`.
- Realtime: **no INSERT subscription** on detail board → `router.refresh()` only when UPDATE fires elsewhere; **new card may not appear** for others until refresh.
- **Break:** INSERT coverage missing.

### 3. Team lead imports CSV

- `createImportBatch` → many INSERTs + batch row update.
- **No master-level `task_remarks` system entry.** Revalidate misses `/tasks` index.
- **Break:** audit + index aggregate staleness.

### 4. Agent checks checklist (Zone A)

- `updateSubTaskChecklist` → `attachments` JSONB — no remark (correct).
- **Break:** `/` not revalidated — `MyTasksWidget` uses different data path; low impact for checklist-only.

### 5. Admin archives master task

- `archiveMasterTask` — **no system remark**; **no `revalidatePath('/')`**.
- Index page: user navigates away or refreshes — **not** live for other open sessions without Realtime on master row.

---

## Section 5 — Component Integration Map

| Component | Data source | Sync issue |
|-----------|-------------|------------|
| `MasterTaskCard` | RSC props (`subtask_count`, `completed_subtask_count`) | **Stale** when subtasks change elsewhere — no realtime/push |
| `TaskBoard` | Local state + `router.refresh` on UPDATE only | **Misses INSERT**; duplicate hook overlap with modal |
| `TaskListView` | Props from RSC | Updates when parent refreshes |
| `TaskAnalyticsPanel` | `getMasterTaskAnalytics` on mount + `masterTaskId` only | **No refetch** on subtask changes while panel open |
| `SubTaskModal` | `getSubTaskDetail` + local realtime (remarks) | Remarks realtime **inactive** without publication; Zone A task fields **no `tasks` UPDATE subscription** |
| `MyTasksWidget` (dashboard) | `getMyTasks` / `getMySubTasks` in RSC | **Stale** — mutations omit `revalidatePath('/')` |
| `TaskAlertProvider` | Poll + tasks `*` realtime | **Wrong column** for unified tasks (`status` vs `atlas_status`) |

---

## Section 6 — RLS and Security Gaps

- **Duplicate `tasks` policies** (063 + 069): OR-combination — **must drop** legacy named policies.
- **`task_remarks` INSERT as Atlas System** with user session: policy requires `author_id = auth.uid()` → **system author inserts fail** unless service role or additional policy.
- **`task_remarks` SELECT** (067): uses subquery on `profiles.domain` — not `get_user_domain()` helper but equivalent read from `profiles`.
- Append-only tables: **no UPDATE/DELETE** on `task_remarks` / `task_progress_updates` — **correct**.

---

## Section 7 — Type Drift Inventory

1. `TaskPriority` / Zod / UI configs — missing **`critical`** (DB 072).
2. `Database.public.Tables.tasks.Row` — missing unified task columns used in app.
3. `ProjectTask.priority` — same as `TaskPriority`.
4. `task_remarks.previous_status` — DB `TEXT`, app `AtlasTaskStatus | null`.

---

## Section 8 — Integration Gaps (Problem List)

1. **Critical — `task_remarks` not in `supabase_realtime`** — Timeline realtime never delivers (SubTaskModal, hooks). Consequence: broken multi-user timeline. Severity: **Critical** (feature silently absent).

2. **Critical — System `task_remarks` inserts with `ATLAS_SYSTEM_AUTHOR_ID` via user Supabase client** — violates `task_remarks_insert` (`author_id = auth.uid()`). Consequence: inserts fail; structural audit incomplete. Severity: **Critical**.

3. **High — Duplicate RLS policies on `tasks`** (063 + 069). Consequence: unintended broader access / ambiguous security model. Severity: **High**.

4. **High — `getTaskContext` uses user-scoped server client** — cross-domain Elia context may return null/incomplete. Severity: **High**.

5. **High — Missing `revalidatePath('/')` and often `/tasks`** on subtask mutations — `MyTasksWidget` stale. Severity: **High**.

6. **High — `TaskAnalyticsPanel` does not refetch** when subtasks change. Severity: **High**.

7. **High — `MasterTaskCard` completion** — no UPDATE/INSERT realtime on index list. Severity: **High**.

8. **High — `useAtlasTaskRealtime` missing `tasks` INSERT + `task_groups` events**. Severity: **High**.

9. **Medium — `createImportBatch`**: no master-level system remark; index revalidation incomplete. Severity: **Medium**.

10. **Medium — `archiveMasterTask` / `deleteSubTask`**: missing required system remarks (per product rules). Severity: **Medium**.

11. **Medium — `updateSubTask`**: `currentTask` select missing `priority` — priority-change system log skipped. Severity: **Medium**.

12. **Medium — `completePersonalTask` / `createPersonalTask`**: no revalidation. Severity: **Medium**.

13. **Medium — `TaskAlertProvider`** uses legacy `status === 'pending'` for overdue math — misaligned with `atlas_status` for project subtasks. Severity: **Medium**.

14. **Low — Sidebar label** "My Tasks" for `/tasks` vs product name "Atlas Tasks". Severity: **Low**.

15. **Low — `next.config`**: only `/projects/:id` redirect; no `/:path*` catch-all (optional depth). Severity: **Low**.

16. **Low — Import page `canImport`**: department array lists `"manager"`, `"admin"` as departments — **invalid** vs `employee_department` enum. Severity: **Low** (role branch partially masks).

---

## Post-Fix Status

**Date:** 2026-04-27  
**Issues catalogued (Section 8):** 16  
**Resolved in codebase:** 14  
**Deferred / environment-dependent:** 2 (manual QA + applying migrations to target Supabase)

### Resolution summary (maps to Section 8)

| # | Status | What changed |
|---|--------|----------------|
| 1 | Resolved | Migration **073** adds `task_remarks` to `supabase_realtime`. |
| 2 | Resolved | `insertSystemLog` uses **service-role** client + typed row; system author id. |
| 3 | Resolved | Migration **075** drops legacy `tasks_*` policies from 063. |
| 4 | Resolved | `getTaskContext` uses service role + full summary/groups/remarks shape. |
| 5 | Resolved | `revalidateAtlasTaskSurfaces` → `/`, `/tasks`, `/tasks/[id]` on mutations. |
| 6 | Resolved | `TaskAnalyticsPanel` refetches on `refreshSignal` from `useAtlasTaskRealtime` board version. |
| 7 | Resolved | `useMasterTasksIndexRealtime` + task subscriptions refresh index cards. |
| 8 | Resolved | `useAtlasTaskRealtime`: subtask INSERT, `task_groups` `*`, remarks INSERT; `useSubtaskRealtime` for modal. |
| 9 | Resolved | Import completion + system remark on master + revalidation wired in `tasks.ts`. |
| 10 | Resolved | Archive/delete/import paths log via `insertSystemLog` where required by product rules. |
| 11 | Resolved | `updateSubTask` select includes `priority` for priority-change logs. |
| 12 | Resolved | Personal task actions call `revalidateAtlasTaskSurfaces` / dashboard paths. |
| 13 | Resolved | `TaskAlertProvider` considers `atlas_status` when present. |
| 14 | Resolved | Sidebar label **Atlas Tasks**; `next.config` `/projects/:path*` → `/tasks/:path*`. |
| 15 | Resolved | Same as 14 (`next.config`). |
| 16 | Resolved | Import page `canImport` tightened (privileged departments + roles). |

### Type layer

- **`task_remarks`** added to `Database.public.Tables` (`TaskRemarkRow`, Insert/Update).
- **`critical`** priority aligned in types/schemas/UI lists where audited.

### Still manual

- Run migrations **073–075** on each Supabase environment.
- Execute **`TASKS_INTEGRATION_VERIFICATION.md`** in the browser and record sign-off (automated tests not in scope for this pass).

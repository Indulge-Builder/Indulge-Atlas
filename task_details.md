# Indulge Atlas — Task Management (Master Reference)

**Purpose:** Single authoritative reference for the **unified Atlas task system** (master / subtask / personal), **Task Insights**, related schema, server actions, realtime hooks, and operational verification.  
**Stack:** Next.js App Router, Supabase (PostgreSQL + Auth + Realtime), Server Actions, TypeScript strict.  
**Supersedes:** prior `TASK_SYSTEM_DOCUMENTATION.md`, `TASKS_AUDIT.md`, and `TASKS_INTEGRATION_VERIFICATION.md` (removed 2026-04-30).

---

## Table of contents

1. [Scope & boundaries](#1-scope--boundaries)
2. [Routes & app pages](#2-routes--app-pages)
3. [Migration index (task-related)](#3-migration-index-task-related)
4. [Data model & types](#4-data-model--types)
5. [Validation (Zod)](#5-validation-zod)
6. [Server Actions](#6-server-actions)
7. [Services & internal APIs](#7-services--internal-apis)
8. [UI map](#8-ui-map)
9. [Workflows & status rules](#9-workflows--status-rules)
10. [Permissions, RLS, and navigation](#10-permissions-rls-and-navigation)
11. [Caching, revalidation & Realtime](#11-caching-revalidation--realtime)
12. [Notifications & alerts](#12-notifications--alerts)
13. [Technical audit notes (consolidated)](#13-technical-audit-notes-consolidated)
14. [Manual verification checklist](#14-manual-verification-checklist)
15. [File index](#15-file-index)

---

## 1. Scope & boundaries

**In scope for this document**

- Atlas surfaces: `/tasks`, `/tasks/[id]`, `/tasks/import`, `/task-insights`.
- Unified rows on `public.tasks` with `unified_task_type` ∈ `master` | `subtask` | `personal`.
- Supporting tables: `projects`, `project_members`, `task_groups`, `task_remarks`, `task_comments`, `task_progress_updates`, `import_batches`, `task_notifications`.
- Code under `lib/actions/tasks.ts`, `lib/actions/task-intelligence.ts`, `lib/schemas/tasks.ts`, `lib/services/taskContext.ts`, `lib/services/taskNotificationInsert.ts`, `components/tasks/*`, `components/task-intelligence/*`, hooks `lib/hooks/useTaskRealtime.ts`, `lib/hooks/useTaskIntelligenceRealtime.ts`.

**Explicitly out of scope (related products)**

- **Shop workspace tasks** — `components/shop/tasks/*`, `app/(dashboard)/shop/workspace/tasks/*`.
- **CRM lead tasks** — `components/tasks/TaskDashboardClient.tsx`, `LeadTaskWidget.tsx`, lead-scoped task flows (`completeTask` / legacy CRM mutations in `lib/actions/tasks.ts` stubs where marked `@deprecated`).
- **Legacy `/projects` URLs** — permanent redirects to `/tasks` in `next.config.ts` (see §2).

---

## 2. Routes & app pages

| Route | Source file | Notes |
| --- | --- | --- |
| `/tasks` | `app/(dashboard)/tasks/page.tsx` | **My Tasks** vs **Atlas Tasks** tabs; query `?tab=my-tasks` \| `atlas-tasks`. Typically `dynamic = "force-dynamic"`. |
| `/tasks/[id]` | `app/(dashboard)/tasks/[id]/page.tsx` | Master task workspace — board/list, analytics, archive/delete (role-dependent). |
| `/tasks/import` | `app/(dashboard)/tasks/import/page.tsx` | CSV import; gated by role/department (see §10). |
| `/task-insights` | `app/(dashboard)/task-insights/page.tsx` | Department health dashboard; **manager**, **founder**, **admin** only (others redirected). |
| `/task-insights` loading | `app/(dashboard)/task-insights/loading.tsx` | Skeleton. |

**Redirects** (`next.config.ts`): `/projects` → `/tasks`, `/projects/:path*` → `/tasks/:path*`; `/manager/tasks` → `/task-insights`; legacy `/scout/*` → `/manager/*`.

---

## 3. Migration index (task-related)

Canonical numbered migrations live in `supabase/migrations/`. The repo currently contains **71** numbered SQL files (001–080 range with gaps filled). Task-relevant milestones:

| Migration | Summary |
| --- | --- |
| **034** | Multi-assignee support (`assigned_to_users`). |
| **046** | `tasks` added to `supabase_realtime` publication. |
| **047** | `REPLICA IDENTITY FULL` on `tasks` (Realtime payload shape). |
| **062** | `projects`, `project_members`, `task_groups` + RLS. |
| **063** | `tasks` extended for project system (`project_id`, `group_id`, `priority`, `progress`, etc.). |
| **064** | `task_comments`, `task_progress_updates` (append-only progress log). |
| **065** | `tasks.due_date` nullable. |
| **067** | **Unified task schema:** `unified_task_type`, `atlas_status`, domain/department, archive + import metadata, `master_task_id`; **`task_remarks`** append-only log; **`import_batches`**; RLS on remarks; `REPLICA IDENTITY FULL` on `task_remarks`. |
| **068** | Backfill / align task types for unified model. |
| **069** | **Tasks RLS v2** — domain-scoped policies (`tasks_*_v2` naming in migrations). |
| **070** | Task indexes (unified type, domain, `atlas_status`, etc.). |
| **071** | `task_remarks`: `source`, `previous_status`; system author profile seed. |
| **072** | Task priority constraint — adds **`critical`** to DB allowed priorities. |
| **073** | **`task_remarks` → `supabase_realtime` publication** (timeline subscriptions). |
| **074** | **`task_groups`** `REPLICA IDENTITY FULL` + publication (column/board realtime). |
| **075** | **Drop legacy `tasks_select` / `tasks_insert` / `tasks_update` / `tasks_delete`** (063) to avoid permissive OR duplication with 069. |
| **076** | Group-task experiment + personal privacy: extends `unified_task_type` with `group`, `visibility`, `group_task_members`, etc. (partially superseded by 078). |
| **077** | **`task_notifications`** table + RLS + Realtime publication. |
| **078** | Retire `group` rows → promote to **`master`** workspaces; ensure `projects` / default `task_groups` where needed. |
| **079** | **`atlas_status` narrowed to five values** — `todo`, `in_progress`, `done`, `error`, `cancelled`; legacy `in_review` / `blocked` remapped to `in_progress`. |
| **080** | **`lead_collaborators`** + RLS (cross-domain lead access); comments reference same explicit-grant philosophy as `project_members`. |

> **Apply order:** ship migrations through **079** (and 080 for CRM collaboration) on every Supabase environment before relying on app types that assume five `atlas_status` values.

---

## 4. Data model & types

### 4.1 Single table: `tasks`

All unified Atlas entities share **`public.tasks`**. Discrimination:

- **`unified_task_type = 'master'`** — top-level workspace; **`id` doubles as `projects.id`** and **`project_id`** on the same row after creation.
- **`unified_task_type = 'subtask'`** — Kanban card; `project_id` → master id; `group_id` → `task_groups`.
- **`unified_task_type = 'personal'`** — no master workspace; creator-scoped personal SOP-style tasks.

**Legacy parallel columns:** CRM **`status`** (`TaskStatus`: `pending` \| `completed` \| `overdue`) still exists; **`atlas_status`** is the primary workflow field for unified tasks.

### 4.2 `AtlasTaskStatus` (application + DB after migration 079)

| Value | Label (`ATLAS_TASK_STATUS_LABELS`) |
| --- | --- |
| `todo` | To Do |
| `in_progress` | In Progress |
| `done` | Done |
| `error` | Error |
| `cancelled` | Cancelled |

Constants: `ATLAS_TASK_STATUS_VALUES`, `ATLAS_TASK_STATUS_COLORS` in `lib/types/database.ts`.

### 4.3 `TaskPriority`

`critical` \| `urgent` \| `high` \| `medium` \| `low` — aligned with DB (072) and `TASK_PRIORITY_CONFIG` for UI.

### 4.4 Key structs (TypeScript)

| Concept | Type / table |
| --- | --- |
| Master workspace | `MasterTask`, `projects`, `project_members`, `task_groups` |
| Subtask | `SubTask` extends `ProjectTask` |
| Personal | `PersonalTask` |
| Timeline | `TaskRemark` / `task_remarks` |
| Import audit | `ImportBatch` / `import_batches` |
| Task Insights aggregates | `DepartmentTaskOverview`, `TaskIntelligenceAgentSummary`, `TaskIntelligencePersonalTaskRow`, `EmployeeDossierPayload`, etc. |

### 4.5 System identities

- **`ATLAS_SYSTEM_AUTHOR_ID`** — synthetic profile for `task_remarks` with `source: 'system'` (migration 071).
- **`ELIA_AUTHOR_ID`** — reserved for future Elia-authored remarks.

---

## 5. Validation (Zod)

**File:** `lib/schemas/tasks.ts` (imported by Server Actions).

Representative schemas: `CreateMasterTaskSchema`, `UpdateMasterTaskSchema`, `CreateTaskGroupSchema`, `CreateSubTaskSchema`, `UpdateSubTaskSchema`, `UpdateSubTaskStatusSchema`, `UpdateSubTaskProgressSchema`, `CreatePersonalTaskSchema`, `GetDepartmentDataSchema`, `GetAgentTasksSchema`, `CreateImportBatchSchema`, `getEmployeeDossierSchema`, daily personal task schemas where present.

---

## 6. Server Actions

**Pattern:** `"use server"` in `lib/actions/tasks.ts` and `lib/actions/task-intelligence.ts`. No separate REST API for these flows.

### 6.1 `revalidateAtlasTaskSurfaces(masterTaskId)`

Invalidates:

- `/` (agent dashboard widgets),
- `/tasks`,
- `/task-insights`,
- `/tasks/[masterTaskId]`.

### 6.2 `lib/actions/tasks.ts` (high level)

| Area | Examples |
| --- | --- |
| Master CRUD | `createMasterTask`, `getMasterTasks`, `getMasterTaskDetail`, `updateMasterTask`, `archiveMasterTask`, `deleteMasterTask` |
| Groups | `createTaskGroupForMaster`, `reorderTaskGroupsForMaster`, `renameTaskGroup`, `deleteTaskGroupForMaster` |
| Subtasks | `createSubTask`, `getSubTaskDetail`, `updateSubTask`, `updateSubTaskChecklist`, `updateSubTaskStatus`, `updateSubTaskProgress`, `assignSubTask`, `deleteSubTask`, `reorderSubTasks` |
| Personal | `createPersonalTask`, `getMyTasks`, `completePersonalTask`, `getMySubTasks`, daily roster helpers as implemented |
| Members / import / analytics | `addMasterTaskMember`, `removeMasterTaskMember`, `createImportBatch`, `getImportBatches`, `getMasterTaskAnalytics`, `searchProfilesForTasks` |
| System timeline | **`insertSystemLog`** — uses **service-role** Supabase client so `author_id = ATLAS_SYSTEM_AUTHOR_ID` satisfies RLS |
| Deprecated stubs | `getMyOverdueTaskCount` returns `{ count: 0 }` — see §12 |

**Authorization sketch:** `getAuthUser()` → role/domain/department from **`profiles`** (never JWT claims); master access via `project_members` / `isPrivilegedRole` patterns documented in code.

### 6.3 `lib/actions/task-intelligence.ts`

Read-focused actions for Task Insights: `getDepartmentTaskOverview`, `getDepartmentGroupTasks`, `getDepartmentIndividualTasks`, `getAgentPersonalTasks`, employee dossier fetchers, org summaries — all gated by **`assertTaskIntelligenceRole`** (`manager` **or** `isPrivilegedRole`).

---

## 7. Services & internal APIs

| Module | Role |
| --- | --- |
| `lib/services/taskContext.ts` | **`getTaskContext` / org summaries** — uses **service-role** client for cross-domain read models (Elia / server-only callers; do not expose raw output to browsers). |
| `lib/services/taskNotificationInsert.ts` | **`insertTaskNotification`** — service-role inserts into `task_notifications` (migration 077). Fire-and-forget from task mutations. |

---

## 8. UI map

### 8.1 `/tasks` shell

- **`TasksDashboardShell.tsx`** — tabs, Import, New Master Task (`CreateMasterTaskModal`).
- **`MyTasksDashboard.tsx`** — personal + assigned subtasks, `LuxuryCalendar`, buckets (IST), quick-add personal tasks.
- **`AtlasTasksListView.tsx`** — filters, `AtlasTasksCompletionOverview`, master accordions, bulk delete (privileged), `useMasterTasksIndexRealtime`.
- **`CreateMasterTaskModal.tsx`** — create/edit master; domain/department from `DOMAIN_CONFIG` / `DEPARTMENT_CONFIG` / `departmentsVisibleForDomain`.

### 8.2 `/tasks/[id]`

- **`MasterTaskDetail.tsx`** — board/list toggle, members panel, analytics sidebar, archive/delete.
- **`TaskBoard.tsx`**, **`TaskGroupColumn.tsx`**, **`TaskListView.tsx`**, **`SubTaskCard.tsx`** — DnD / columns / cards.
- **`SubTaskModal.tsx`**, **`TaskDetailSheet.tsx`** — detail UX; **`useSubtaskRealtime`** for remarks + row updates.
- **`TaskAnalyticsPanel.tsx`** — driven by `getMasterTaskAnalytics`; refreshes when **`boardVersion`** bumps from **`useAtlasTaskRealtime`**.

### 8.3 `/tasks/import`

- **`ImportWizardShell.tsx`**, **`ImportWizard.tsx`**, **`ImportColumnMapper.tsx`** — CSV pipeline.

### 8.4 `/task-insights`

(RSC gate: **`manager`**, **`founder`**, **`admin`**, **`super_admin`** — see `task-insights/page.tsx`.)

- **`TaskIntelligenceDashboard.tsx`** — department grid; **`useTaskIntelligenceRealtime`** for macro refresh.
- **`DepartmentHealthCard.tsx`**, **`DepartmentDetailModal.tsx`** — tabs for group vs individual.
- **`DepartmentGroupTasksView.tsx`** — **`useMasterBoardsRealtime`**; read-only `SubTaskModal` where configured.
- **`DepartmentIndividualTasksView.tsx`**, **`AgentTaskDetailPanel.tsx`**, **`EmployeeDossierModal.tsx`** — agent drill-down.

### 8.5 Dashboard widgets

- **`MyTasksWidget.tsx`** — home dashboard; depends on RSC data + `revalidateAtlasTaskSurfaces` for freshness after mutations.

---

## 9. Workflows & status rules

1. **Create master task** — Insert `tasks` (master) + `projects` + `project_members` (creator **owner**) + **three default groups**: “To do”, “In progress”, “Done”; then set `tasks.project_id` and `master_task_id` to the master id; `revalidateAtlasTaskSurfaces`.
2. **Create subtask** — Insert subtask with `group_id`; default assignee = current user if omitted; revalidation + realtime hooks refresh peers.
3. **Update subtask** — Field updates may emit **system** `task_remarks` where implemented; checklist stored in **`attachments`** JSON (checklist items).
4. **Log Update (Zone B)** — `updateSubTaskStatus` inserts **`task_remarks`** (`source: agent`) + updates task.
5. **Progress** — `updateSubTaskProgress` logs structured rows in **`task_progress_updates`** (project pattern).
6. **Personal complete** — `completePersonalTask` → `atlas_status: done`, `progress: 100` + cache invalidation via shared revalidation helper where wired.
7. **Archive master** — **Owner** only; `archiveMasterTask`; system log + `revalidateAtlasTaskSurfaces` in current implementation.
8. **Delete master** — **Admin / founder**; cascades depend on FK definitions.
9. **Transitions** — No strict server-side state machine; authorized users may set any **`atlas_status`** allowed by Zod/DB **within the five-value enum** (post-079).

---

## 10. Permissions, RLS, and navigation

| Capability | Rule (summary) |
| --- | --- |
| Task Insights route | **`manager` \| `founder` \| `admin` \| `super_admin`** (see `task-insights/page.tsx`) |
| Master list | Privileged: broad visibility; others: **`project_members`** |
| Create master | Domain/department rules; managers bounded by `departmentsVisibleForDomain` |
| Archive master | **Owner** |
| Delete master | **Admin / founder** |
| Assign subtask / privileged edits | Owner/manager membership or privileged role (`canAssignSubtask` pattern in UI) |
| Import page | Privileged roles and/or approved departments (see import page source for `canImport`) |

**Known drift:** `task-insights/page.tsx` allows **`super_admin`** through to the UI; **`assertTaskIntelligenceRole`** in `lib/actions/task-intelligence.ts` returns true only for **`manager`** or **`isPrivilegedRole`** (`admin` / `founder`). A `super_admin` session may load the page but Server Actions can return "Not authorized" until gates are unified.

---

## 11. Caching, revalidation & Realtime

### 11.1 Hooks (`lib/hooks/useTaskRealtime.ts`)

| Hook | Purpose |
| --- | --- |
| `useTaskRealtime` | Project-style **`task_comments`** + **`task_progress_updates`** + single-task **`tasks` UPDATE** (legacy project task detail). |
| `useAtlasTaskRealtime` | Per-master: **`task_remarks` INSERT** (when `subtaskId` set), **`tasks` UPDATE/INSERT** under `project_id`, **`task_groups` \***; exposes **`boardVersion`**. |
| `useMasterTasksIndexRealtime` | **`tasks` \*** filtered by `project_id` per listed master → **`router.refresh()`** on `/tasks` index. |
| `useMasterBoardsRealtime` | Task Insights modal — task + task_group bumps → refetch callback. |
| `useSubtaskRealtime` | Modal — remarks INSERT + task row UPDATE. |

### 11.2 Task Insights overview

- **`useTaskIntelligenceRealtime`** — listens to **`tasks`** `*` → bumps counter to refetch `getDepartmentTaskOverview`.
- **`useEmployeeDossierRealtime`** (`useTaskIntelligenceRealtime.ts`) — `created_by` filter for dossier refreshes.

### 11.3 Publication prerequisites

Realtime delivery requires tables in **`supabase_realtime`** publication — notably **`073`** (`task_remarks`), **`074`** (`task_groups`), **`046`**/`047` (`tasks`), **`077`** (`task_notifications`).

---

## 12. Notifications & alerts

### 12.1 `task_notifications`

Types (enum): `subtask_assigned`, `subtask_updated`, `group_task_added`. Inserted via **`insertTaskNotification`** (service role). Realtime-enabled (077).

### 12.2 `TaskAlertProvider`

- Subscribes to **`tasks`** `*` for the authenticated user and adjusts overdue **delta** from payloads using **`atlas_status`** when present (falls back to legacy **`status === 'pending'`**).
- Poll every 5m + `getMyOverdueTaskCount()` — **currently a stub returning `count: 0`**, so **initial load and poll do not raise the banner from the server**; Realtime-driven deltas dominate when events fire.

---

## 13. Technical audit notes (consolidated)

Historical audit items and resolutions (from former `TASKS_AUDIT.md`):

| Theme | Status |
| --- | --- |
| **`task_remarks` not in Realtime publication** | Addressed by migration **073** — verify publication on each env. |
| **System `task_remarks` with synthetic author via user client** | Resolved: **`insertSystemLog`** uses **service-role** insert. |
| **Duplicate `tasks` RLS (063 vs 069)** | Resolved: migration **075** drops legacy policies. |
| **`getTaskContext` / cross-domain reads** | Resolved: **service-role** + structured summary in `taskContext.ts`. |
| **Revalidation gaps** | Resolved: **`revalidateAtlasTaskSurfaces`** covers `/`, `/tasks`, `/task-insights`, detail. |
| **Analytics panel staleness** | Addressed: **`boardVersion` / `refreshSignal`** from realtime hooks. |
| **Index / board realtime** | Addressed: **`useMasterTasksIndexRealtime`**, **`useAtlasTaskRealtime`** INSERT + **`task_groups`**. |
| **Import pipeline audit trail** | System log on master + revalidation in `tasks.ts` (verify in code paths). |
| **`updateSubTask` priority in select** | Include **`priority`** for diff / logs — confirm in `tasks.ts` when auditing. |
| **Type drift** | **`AtlasTaskStatus`** — five values per **079**; **`TaskPriority`** includes **`critical`**; hand-written `database.ts` still requires care vs migrations. |

Remaining **environment** work: run migrations **073–079** (and **080** if using lead collaborators), execute §14 checklist after deploy.

---

## 14. Manual verification checklist

Use after deployments or when changing RLS/Realtime/publications. Sign in as the described role; prefer **no hard refresh** unless the step says otherwise.

1. **Subtask → Done → index completion** — Complete a subtask from modal; `/tasks` **`MasterTaskCard`** completion updates (realtime/refresh).
2. **Zone B remark** — Post Log Update; timeline shows agent row; no duplicate system line for same text.
3. **Reassign** — Admin/manager reassigns in Zone A; timeline shows **system** line; assignee’s **`/`** widget updates after navigation/revalidation.
4. **CSV import** — Import completes; rows under target group; `import_batches` row; master aggregate updates.
5. **Checklist** — Toggle checklist; close/reopen modal; state persists (`attachments`).
6. **Cross-tab timeline** — Two tabs same subtask modal; remark appears without refresh (**requires 073** applied).
7. **Dashboard widget** — Complete subtask from Atlas UI; **`/`** My Tasks reflects change (revalidation).
8. **Analytics panel** — Complete multiple subtasks; ring/breakdown updates without full reload (`boardVersion`).
9. **Archive master** — Archived master disappears from active list per filters (realtime/refresh).
10. **Second user new subtask** — User 1 creates subtask; User 2 sees it quickly (**`tasks` INSERT** subscription on board).

**Sign-off**

| Date | Tester | Environment | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| | | | | |

---

## 15. File index

| Area | Paths |
| --- | --- |
| Pages | `app/(dashboard)/tasks/`, `app/(dashboard)/task-insights/` |
| Atlas UI | `components/tasks/` |
| Task Insights UI | `components/task-intelligence/` |
| Actions | `lib/actions/tasks.ts`, `lib/actions/task-intelligence.ts` |
| Schemas | `lib/schemas/tasks.ts` |
| Types & constants | `lib/types/database.ts` |
| Hooks | `lib/hooks/useTaskRealtime.ts`, `lib/hooks/useTaskIntelligenceRealtime.ts` |
| Services | `lib/services/taskContext.ts`, `lib/services/taskNotificationInsert.ts` |
| Department routes | `lib/constants/departments.ts` (`DEPARTMENT_ROUTE_ACCESS`, etc.) |
| Redirects | `next.config.ts` |
| SQL | `supabase/migrations/` (especially **067–079**, **077** notifications, **080** collaborators) |

---

*End of `task_details.md`.*

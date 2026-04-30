# Atlas Task Management — System Documentation

Single source of truth for the **Atlas Tasks** (`/tasks`) and **Task Insights** (`/task-insights`) surfaces as implemented in this codebase (Next.js App Router + Supabase + Server Actions).

---

## Table of contents

1. [Routes & pages](#1-routes--pages)
2. [Data model](#2-data-model)
3. [Validation schemas (Zod)](#3-validation-schemas-zod)
4. [Server Actions API](#4-server-actions-api)
5. [UI surfaces — `/tasks`](#5-ui-surfaces--tasks)
6. [UI surfaces — `/tasks/[id]` workspace](#6-ui-surfaces--tasksid-workspace)
7. [UI surfaces — `/tasks/import`](#7-ui-surfaces--tasksimport)
8. [UI surfaces — `/task-insights`](#8-ui-surfaces--task-insights)
9. [Workflows & status transitions](#9-workflows--status-transitions)
10. [Integrations & linking](#10-integrations--linking)
11. [Permissions & roles](#11-permissions--roles)
12. [State management, caching, realtime](#12-state-management-caching-realtime)
13. [Constants & configuration](#13-constants--configuration)
14. [Related but out-of-scope in this doc](#14-related-but-out-of-scope-in-this-doc)

---

## 1. Routes & pages

| Route | File | Purpose |
| --- | --- | --- |
| `/tasks` | `app/(dashboard)/tasks/page.tsx` | Main task hub: **My Tasks** vs **Atlas Tasks** tabs; loads master tasks, personal tasks, assigned subtasks; renders `TasksDashboardShell`. `dynamic = "force-dynamic"`. |
| `/tasks?tab=my-tasks` | Same | Same page; `tab` query selects **My Tasks**. |
| `/tasks?tab=atlas-tasks` | Same | Same page; **Atlas Tasks** (default if `tab` invalid/missing). |
| `/tasks/[id]` | `app/(dashboard)/tasks/[id]/page.tsx` | **Master task workspace** — Kanban/list, analytics, archive/delete (role-dependent). `dynamic = "force-dynamic"`. |
| `/tasks/import` | `app/(dashboard)/tasks/import/page.tsx` | CSV import wizard for bulk subtasks (Google Sheets export). Gated by role/department. |
| `/task-insights` | `app/(dashboard)/task-insights/page.tsx` | **Task Insights** dashboard — department health cards; **manager**, **founder**, **admin** only (others redirected to `/`). `dynamic = "force-dynamic"`. |

**Loading UI:** `app/(dashboard)/task-insights/loading.tsx` wraps skeleton for Task Insights.

---

## 2. Data model

All unified Atlas entities live on PostgreSQL table **`tasks`** with discriminator **`unified_task_type`**: `'master' | 'subtask' | 'personal'` (`lib/types/database.ts`). Legacy CRM **`TaskStatus`** (`pending` \| `completed` \| `overdue`) still exists on the row alongside **`atlas_status`**.

### 2.1 `AtlasTaskStatus`

| Value | UI label (`ATLAS_TASK_STATUS_LABELS`) |
| --- | --- |
| `todo` | To Do |
| `in_progress` | In Progress |
| `in_review` | In Review |
| `done` | Done |
| `blocked` | Blocked |
| `error` | Error |
| `cancelled` | Cancelled |

### 2.2 `TaskPriority`

| Value | Notes |
| --- | --- |
| `critical` | Used in schema/UI; `TASK_PRIORITY_CONFIG` maps critical & urgent to similar visuals |
| `urgent` | In Zod `taskPrioritySchema`; some selects list only `critical, high, medium, low` |
| `high` | |
| `medium` | Default for new subtasks/personal tasks (schema default) |
| `low` | |

### 2.3 `MasterTask`

| Field | Type | Required | Source / notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Same as `projects.id` for this workspace |
| `title` | string | Yes | |
| `description` | string \| null | No | Often mirrored from `notes` in UI |
| `unified_task_type` | `'master'` | Yes | |
| `atlas_status` | `AtlasTaskStatus` | Yes | Created as `todo` |
| `domain` | string \| null | No | |
| `department` | string \| null | No | Creation rules enforce for agents/managers |
| `cover_color` | string \| null | No | `#RRGGBB` |
| `icon_key` | string \| null | No | Lucide icon name |
| `due_date` | string (ISO) \| null | No | |
| `archived_at` | string \| null | No | Set on archive |
| `archived_by` | string \| null | No | |
| `created_by` | string \| null | No | |
| `created_at` / `updated_at` | string | Yes | |
| `members` | `MasterTaskMember[]` | No | Join from `project_members` |
| `subtask_count` | number | No | Computed in actions |
| `completed_subtask_count` | number | No | Computed |

### 2.4 `MasterTaskMember` (`project_members`)

| Field | Type |
| --- | --- |
| `project_id` | UUID (= master task id) |
| `user_id` | UUID |
| `role` | `'owner' \| 'member' \| 'viewer'` |
| `added_by`, `added_at` | audit |
| `profile` | joined `profiles` |

### 2.5 `TaskGroup`

| Field | Type |
| --- | --- |
| `id` | UUID |
| `project_id` | UUID |
| `title` | string |
| `description` | string \| null |
| `status` | `TaskGroupStatus`: `not_started` \| `in_progress` \| `completed` \| `blocked` |
| `position` | number |
| `due_date` | string \| null |

### 2.6 `SubTask` (extends `ProjectTask`)

Key fields beyond project task base:

| Field | Type | Notes |
| --- | --- | --- |
| `unified_task_type` | `'subtask'` | |
| `atlas_status` | `AtlasTaskStatus` | Primary workflow status |
| `project_id` | string | Master workspace id |
| `group_id` | string \| null | Kanban column |
| `parent_task_id` | string \| null | Optional hierarchy (reserved) |
| `master_task_id` | string \| null | Usually same as project |
| `priority` | `TaskPriority` | |
| `notes` | string \| null | Description / brief |
| `attachments` | `TaskAttachment[]` | Checklist stored as structured items in this JSON (see checklist) |
| `assigned_to_users` | string[] | Up to 20 in schema updates |
| `imported_from`, `import_batch_id` | strings \| null | Import audit |
| `assigned_to_profiles` | profiles[] | Client enrichment |

Base `ProjectTask` also includes: `status` (legacy `TaskStatus`), `progress`, `due_date`, `tags`, `estimated_minutes`, `actual_minutes`, `position`, etc.

### 2.7 `PersonalTask`

| Field | Type | Notes |
| --- | --- | --- |
| `unified_task_type` | `'personal'` | |
| `title`, `notes` | | |
| `atlas_status` | | Created `todo`; complete → `done` |
| `priority` | `TaskPriority` | Default `medium` |
| `due_date` | string \| null | |
| `progress` | number | |
| `assigned_to_users` | string[] | Creator’s id |

### 2.8 `TaskRemark` (subtask timeline)

| Field | Type |
| --- | --- |
| `task_id` | UUID |
| `author_id` | UUID (`ATLAS_SYSTEM_AUTHOR_ID` for system rows) |
| `content` | string |
| `source` | `'agent' \| 'system' \| 'elia'` |
| `state_at_time` | `AtlasTaskStatus` |
| `previous_status` | `AtlasTaskStatus` \| null |
| `progress_at_time` | number \| null |

### 2.9 Task Insights types

**`DepartmentTaskOverview`** — one row per visible department:

| Field | Meaning |
| --- | --- |
| `departmentId` | `EmployeeDepartment` |
| `label`, `icon`, `accentColor` | From `DEPARTMENT_CONFIG` |
| `activeMasterTaskCount` | Non-archived masters in dept |
| `groupSubtaskCompletionPct` | % of non-archived subtasks under those masters that are `done` |
| `overdueSubtaskCount` | Active subtasks past `due_date` |
| `todaySopCompletionPct` | Personal tasks “today” (created or due in IST day) completion % |
| `activeAgentCount` | Profiles in dept: role not admin/founder, not `is_on_leave` |
| `healthSignal` | `healthy` \| `needs_attention` \| `critical` |

**`TaskIntelligenceAgentSummary`** — Individual tab strip:

| Field | Meaning |
| --- | --- |
| `personalTaskTotal`, `statusCounts`, `todaySopCompletionPct`, `overduePersonalCount` | From personal tasks for that agent |
| `is_on_leave` | Greys out card |

**`TaskIntelligencePersonalTaskRow`** — drill-down lists.

---

## 3. Validation schemas (Zod)

File: `lib/schemas/tasks.ts`.

| Schema | Purpose |
| --- | --- |
| `CreateMasterTaskSchema` | title 1–255; description ≤2000 optional; **domain** & **department** required (enum); `cover_color` `#RRGGBB`; `icon_key` ≤50; `due_date` ISO datetime optional; `initialMemberIds` UUID[] optional |
| `UpdateMasterTaskSchema` | Partial updates incl. nullable domain/department |
| `CreateTaskGroupSchema` | title 1–200; position optional |
| `CreateSubTaskSchema` | `master_task_id`, `group_id`, title; optional description, `assigned_to`, **priority default medium**, due_date, estimated_minutes, tags |
| `UpdateSubTaskSchema` | Partial; `assigned_to_users` optional array (clear with `[]`) |
| `UpdateSubTaskStatusSchema` | task_id, new_status, remark_content 1–1000; optional progress, checklist |
| `UpdateSubTaskProgressSchema` | task_id, new_progress 0–100, note optional |
| `CreatePersonalTaskSchema` | title; description optional; due_date optional; **priority default medium** |
| `GetDepartmentDataSchema` | `departmentId` enum |
| `GetAgentTasksSchema` | `agentId` UUID |

---

## 4. Server Actions API

**Pattern:** Next.js `"use server"` in `lib/actions/tasks.ts` and `lib/actions/task-intelligence.ts`. **No separate REST routes** for these flows — components call Server Actions directly.

### 4.1 Atlas task surfaces — shared revalidation

`revalidateAtlasTaskSurfaces(masterTaskId)` invalidates: `/`, `/tasks`, `/task-insights`, `/tasks/[id]`.

### 4.2 `lib/actions/tasks.ts` — exports used by Atlas UI

| Function | Params (conceptual) | Returns | Authorization highlights |
| --- | --- | --- | --- |
| `createMasterTask` | `CreateMasterTaskSchema` | `{ id }` | Agents/guests: dept/domain must match profile; managers: domain + dept in `departmentsVisibleForDomain`; inserts `tasks`, `projects`, `project_members`, default **3** `task_groups`, updates `tasks.project_id` |
| `getMasterTasks` | `{ archived?, department?, domain? }` | `MasterTask[]` | Non-privileged: only masters where user is in `project_members` |
| `getMasterTaskDetail` | `taskId` | master + grouped subtasks + members | Authenticated; listing enforced by RLS |
| `updateMasterTask` | `taskId`, `UpdateMasterTaskSchema` | success | owner/manager of workspace or privileged |
| `archiveMasterTask` | `taskId` | success | **Owner only**; sets `archived_at` |
| `deleteMasterTask` | `taskId` | success | **admin / founder only**; deletes task row + project row |
| `createTaskGroupForMaster` | master id, `{ title, position? }` | `{ id }` | project member |
| `reorderTaskGroupsForMaster` | Zod | success | |
| `renameTaskGroup` | group id, title | success | |
| `deleteTaskGroupForMaster` | group id | success | |
| `createSubTask` | `CreateSubTaskSchema` | `{ id }` | member; default assignee = current user if `assigned_to` omitted |
| `getSubTaskDetail` | task id | task, remarks, checklist, workspace members, `canAssignSubtask` | |
| `updateSubTask` | task id, partial | success | assignee/creator/manager/owner/privileged |
| `updateSubTaskChecklist` | task id, checklist array | success | |
| `updateSubTaskStatus` | remark + status (+optional checklist) | success | broad access for assignee/creator/managers |
| `updateSubTaskProgress` | progress + note | success | |
| `assignSubTask` | assignee uuid | success | privileged or owner/manager |
| `deleteSubTask` | task id | success | privileged or owner/manager |
| `reorderSubTasks` | group id, ordered ids | success | |
| `createPersonalTask` | personal schema | `{ id }` | |
| `getMyTasks` | — | `PersonalTask[]` | current user assignee, not cancelled |
| `getMySubTasks` | — | subtasks + `masterTaskTitle` | assigned, not done/cancelled |
| `completePersonalTask` | task id | success | personal + assignee must be user → `atlas_status: done`, `progress: 100` |
| `addMasterTaskMember` / `removeMasterTaskMember` | | | owner/manager or privileged |
| `createImportBatch` / `getImportBatches` | | | import pipeline |
| `getMasterTaskAnalytics` | master id | `MasterTaskAnalytics` | |
| `searchProfilesForTasks` | query string | profiles | active users, ilike name |

### 4.3 `lib/actions/task-intelligence.ts`

| Function | Purpose |
| --- | --- |
| `getDepartmentTaskOverview` | Builds `DepartmentTaskOverview[]` for caller’s visible departments (IST “today” for SOP metrics) |
| `getDepartmentGroupTasks` | `{ departmentId }` → `DepartmentGroupTaskBundle[]` (masters + groups + subtasks + members) |
| `getDepartmentIndividualTasks` | `{ departmentId }` → agent summaries |
| `getAgentPersonalTasks` | `{ agentId }` → `{ overdue, active, completedToday }` personal rows |

**Role gate:** `assertTaskIntelligenceRole` → `manager` **or** `isPrivilegedRole` (admin/founder). Managers get departments from `departmentsVisibleForDomain(domain)` with fallbacks.

---

## 5. UI surfaces — `/tasks`

### 5.1 Shell: `TasksDashboardShell.tsx`

| Control | Behavior |
| --- | --- |
| **Import** (`Upload`) | `router.push("/tasks/import")` |
| **New Master Task** (`Plus`) | Opens `CreateMasterTaskModal` |
| **Tab: My Tasks** | `switchTab("my-tasks")` → URL `?tab=my-tasks` |
| **Tab: Atlas Tasks** | `switchTab("atlas-tasks")` → URL `?tab=atlas-tasks` |
| Masthead subtitle | Department label from profile; **active task count** = non-done/non-cancelled personal + count of `subTasks` from server |

Child: `MyTasksDashboard` receives **`onRefresh={() => {}}`** (no-op from shell).

### 5.2 My Tasks — `MyTasksDashboard.tsx`

**Purpose:** Unified inbox of **personal** tasks + **assigned subtasks** (from Atlas workspaces).

| Area | Controls & behavior |
| --- | --- |
| **Calendar** (lg+) | `LuxuryCalendar`: `taskDates` from personal due dates; `atlasTaskDates` from subtask due dates; clicking a day toggles **filter** (same day again clears) |
| **Clear date filter** | Chip with `X` or “Show all” in banner |
| **Task buckets** | Overdue → Due Today → This Week → Upcoming → No Due Date (IST); excludes `done`/`cancelled` |
| **Task row — checkbox** | Calls `completePersonalTask` — **only removes personal tasks from local state**; subtasks use modal path |
| **Task row — row click** | Subtasks: opens `SubTaskModal`; personal: click does not open modal (only checkbox) |
| **Task row — overflow** (`MoreHorizontal`) | **No menu wired** — visual only |
| **Quick add** | Expands form: title, description, `LuxuryDatePicker`, priority pills (Critical/High/Medium/Low — maps to `urgent`, `high`, `medium`, `low`), **Add Task** → `createPersonalTask` → `getMyTasks` refresh |

### 5.3 Atlas Tasks — `AtlasTasksListView.tsx`

**Realtime:** `useMasterTasksIndexRealtime(masterIds)` → on `tasks` changes for each `project_id`, **`router.refresh()`**.

**Portfolio strip:** `AtlasTasksCompletionOverview` (see §5.4).

**Filter bar:**

| Control | Filters |
| --- | --- |
| Search input | Lowercases match against **subtask title** OR **master title** |
| Status | Multi-select all `AtlasTaskStatus` values via `ATLAS_TASK_STATUS_LABELS` |
| Priority | Multi-select `critical` … `low` |
| Assignee | Single-select from **derived** assignees on loaded subtasks; Clear |
| Archived | Checkbox: show only archived masters vs hide archived (default hide) |
| Clear | Resets all |

**Master accordion row:**

| Control | Behavior |
| --- | --- |
| Expand chevron | Toggle subtask list |
| **Workspace** link | Next.js `Link` → `/tasks/[id]` |
| Avatar stack | Up to 4 members |
| Progress | Done/total % |
| **Select** checkbox | Only if `canDeleteMaster` (admin/founder) |
| Subtask row | Opens `SubTaskModal`; Eye button opens same |
| **AddSubTaskInline** | First column’s `group_id`; `createSubTask` |

**Bulk bar** (admin/founder): count, **Select all visible**, **Clear**, **Delete** → confirm dialog → loop `deleteMasterTask` → `router.refresh()`.

**Department grouping:** If role is **admin, founder, or manager**, masters grouped under `DeptHeader` by `masterTask.department`.

### 5.4 `AtlasTasksCompletionOverview.tsx`

Aggregates **all** loaded workspaces’ subtasks:

| Metric | Calculation |
| --- | --- |
| Ring % | `done / total` subtasks (excluding masters with zero subtasks from denominator for ring segments — workspaces with subs counted separately) |
| Segmented bar | Count by `atlas_status` (stacked) |
| Mini stats | Done count; **Active** = in_progress + in_review + todo; **Overdue** = due_date &lt; now and not done/cancelled |
| Copy | “workspacesWithSubs / workspaceCount workspaces” |

### 5.5 `CreateMasterTaskModal.tsx` (create & edit)

**Actions:** `createMasterTask`, `updateMasterTask`, `addMasterTaskMember`, `searchProfilesForTasks`.

| Section | Elements |
| --- | --- |
| Title, description | Required title |
| Domain / Department | Selects from `DOMAIN_CONFIG` / `DEPARTMENT_CONFIG`; visibility reduced for non-privileged users via `departmentsVisibleForDomain` |
| Due date | `LuxuryDatePicker` |
| Cover color | Preset swatches |
| Icon | `IconPicker` — Lucide names in `PRESET_ICONS` + none |
| Members | `PeoplePicker` — debounced search, add/remove |
| Preview card | Static preview |

Submit runs create or update; router refresh on success patterns vary by call site.

### 5.6 `SubTaskModal.tsx` (subtask overlay)

Loaded via **`getSubTaskDetail(taskId)`**. **`useSubtaskRealtime`** merges remote **task_remarks** INSERT and **tasks** UPDATE.

| Control | When `readOnly={false}` (default) | When `readOnly={true}` (Task Insights group tab) |
| --- | --- | --- |
| **Backdrop / Escape** | Closes modal | Same |
| **Pencil** | Toggles **edit brief** mode (`editMode`) | Hidden |
| **More (⋯)** | Opens menu → **Delete subtask** → confirm → **`deleteSubTask`** → toast → **`router.refresh()`** → close | Hidden |
| **Save Brief / Cancel** (Zone A footer) | Visible in edit mode; **`updateSubTask`** | N/A |
| **Zone A fields** | Objective textarea; **TaskChecklist**; Deadline popover + Calendar; **Assigned Agent** `<select>` if `canAssignSubtask`; Status `<select>` (all 7 atlas statuses); Priority `<select>` (**critical, high, medium, low** — `urgent` omitted in UI) | Read-only text / badges |
| **Log Update / timeline** | **`LogUpdateForm`** + **`TimelineEvent`** feed; **`updateSubTaskStatus`** path | **Hidden** — no new remarks |
| Header badges | Status + priority always shown | Same |

**`canAssignSubtask`:** from server — `isPrivilegedOrManager(role)` **or** workspace **owner/manager** membership.

---

## 6. UI surfaces — `/tasks/[id]` workspace

### 6.1 `MasterTaskDetail.tsx`

| Control | Action |
| --- | --- |
| **Back** “Atlas Tasks” | `Link` → `/tasks` |
| **Team · N** | Toggles members slide-down panel (read-only list); close `X` |
| **Analytics** | Toggles `TaskAnalyticsPanel` sidebar; uses `boardVersion` from realtime |
| **Edit** | Opens `CreateMasterTaskModal` with `editTask` |
| **Archive** | `archiveMasterTask` → toast → `router.push("/tasks")` |
| **Delete** | Only if `canDeleteMaster` (RSC passes admin/founder) → dialog → `deleteMasterTask` |
| **Board / List tabs** | Switches `TaskBoard` vs `TaskListView` |

**Realtime:** `useAtlasTaskRealtime({ masterTaskId, onSubtaskChanged: () => router.refresh() })` — note board also bumps on task_groups changes.

### 6.2 `TaskBoard.tsx`

| Control | Action |
| --- | --- |
| **Add Group** | `createTaskGroupForMaster` title `"New Group"` |
| **Drag subtask** | HTML5 DnD between columns → optimistic UI → `reorderSubTasks` with new order in target group |

### 6.3 `TaskGroupColumn.tsx`

| Control | Action |
| --- | --- |
| Column menu | Rename (inline blur/Enter), Delete → `deleteTaskGroupForMaster` |
| **Add task** | `AddSubTaskInline` → `createSubTask` |
| Subtask card | Opens `SubTaskDetailSheet` / interactions per `SubTaskCard` |

### 6.4 `TaskAnalyticsPanel.tsx`

Data from **`getMasterTaskAnalytics`**.

| Widget | Data |
| --- | --- |
| Overdue alert | `overdue_count` |
| Completion ring | `completion_pct`, totals |
| By Status | `by_status` bars |
| By Assignee | `by_assignee` — done / in_progress / total per profile |
| Velocity | **30-day** area chart; counts **done** subtasks by `updated_at` day |

Collapsible sections; **Close** button calls `onClose`.

---

## 7. UI surfaces — `/tasks/import`

| Gate | Allowed: `admin`, `founder`, `manager`, `super_admin`, **or** `department` ∈ `{ tech, onboarding }` |
| --- | --- |
| Content | `ImportWizardShell` with master task dropdown + CSV mapping |

Uses `getMasterTasks({ archived: false })`, optional `?master_task_id=` preselect.

---

## 8. UI surfaces — `/task-insights`

### 8.1 Page — `task-insights/page.tsx`

- Loads profile; **role must be `manager`, `founder`, or `admin`** else `redirect("/")`.
- Calls **`getDepartmentTaskOverview()`** server-side.
- Renders `TaskIntelligenceDashboard` with `initialOverview`, `loadError`, `currentUser`.

### 8.2 `TaskIntelligenceDashboard.tsx`

| Element | Behavior |
| --- | --- |
| Header | Title **Task Insights**, date in **IST** |
| Legend | Healthy / Needs attention / Critical |
| **Error banner** | Shows `loadError` string |
| Empty scope message | If no rows and no error |
| Grid | `DepartmentHealthCard` per row; **click** → `DepartmentDetailModal` |
| **Realtime** | `useTaskIntelligenceRealtime()` listens to **any** `tasks` **UPDATE** → `getDepartmentTaskOverview()` again |

### 8.3 `DepartmentHealthCard.tsx`

**Click / Enter / Space:** opens modal.

Displays: health color strip, icon from `DEPARTMENT_CONFIG`, badge, metrics — **Group Tasks** (active masters), **Completion** % (subtasks), **Overdue**, **SOPs Today** %, **active agents** count; hover “View Details →”.

### 8.4 `DepartmentDetailModal.tsx`

| Header | Close `X`, backdrop click closes |
| --- | --- |
| Tabs | **Group Tasks** \| **Individual Tasks** (keyboard arrows Left/Right) |
| Load | On open, parallel `getDepartmentGroupTasks` + `getDepartmentIndividualTasks` |
| Body | Skeleton → `DepartmentGroupTasksView` or `DepartmentIndividualTasksView` |

### 8.5 `DepartmentGroupTasksView.tsx`

- **Realtime:** `useMasterBoardsRealtime(masterIds, refetch)` refetches `getDepartmentGroupTasks` on board activity.
- Read-only master rows + **Workspace** link; expand subtasks; subtask click → **`SubTaskModal` with `readOnly`** (brief/timeline not editable per modal props).

### 8.6 `DepartmentIndividualTasksView.tsx`

- Horizontal **AgentSelectorCard** strip; arrow keys move selection.
- **AgentTaskDetailPanel** loads **`getAgentPersonalTasks({ agentId })`** and shows **Overdue / Active / Completed Today** sections (read-only rows).

### 8.7 `AgentSelectorCard.tsx`

Avatar, first name, **On Leave** badge or **CompletionRing** for `todaySopCompletionPct`.

### 8.8 `CompletionRing.tsx` (task-intelligence)

SVG ring used in agent cards/panel (props: percentage, size, stroke).

---

## 9. Workflows & status transitions

### 9.1 Create master task

1. User opens **New Master Task**, fills form, optionally adds members.
2. **`createMasterTask`** validates → inserts **`tasks`** (`unified_task_type: master`, `atlas_status: todo`, legacy `status: pending`, etc.), **`projects`** row with same id, **`project_members`** (creator **owner** + initial members), **`task_groups`** rows **To do / In progress / Done**, updates **`tasks.project_id`** and **`master_task_id`** to self.
3. Revalidation runs; user lands on list or navigates to `/tasks/[id]`.

### 9.2 Create subtask

- From board/list: **`createSubTask`** with `group_id`; assignee defaults to creator if omitted.
- Inline add uses first column by sorted position.

### 9.3 Update subtask

- **Brief:** `updateSubTask` — may write **`task_remarks`** system lines for field changes.
- **Status + remark:** `updateSubTaskStatus` — inserts **`task_remarks`** row (`source: agent`) and updates task; optional checklist stored in **`attachments`**.
- **Progress:** `updateSubTaskProgress` — may auto-move toward **`done`** when progress = 100.

**Allowed `atlas_status` values** are all seven; **no** separate server-side state machine — any transition permitted if authorized.

### 9.4 Complete personal task

`completePersonalTask` sets **`atlas_status: done`**, **`progress: 100`**.

### 9.5 Archive master

**Owner only:** sets **`archived_at`**, system remark; navigates away.

### 9.6 Delete master

**Admin/founder:** hard delete master **`tasks`** row and **`projects`** row (cascading dependent on DB).

### 9.7 Delete subtask

**Privileged** or **owner/manager** of workspace.

---

## 10. Integrations & linking

| Integration | How |
| --- | --- |
| **Supabase Auth** | `createClient()` server/browser; `getAuthUser()` in every action |
| **PostgreSQL / RLS** | Reads/writes go through user-scoped client; service role for system remarks |
| **Supabase Realtime** | `tasks`, `task_groups`, `task_remarks`, `task_comments` (legacy project tasks) |
| **Profiles / org** | Members, assignees, Task Insights agents |
| **Projects table** | 1:1 with master task id for FK compatibility |
| **CRM legacy tasks** | Separate **`TaskDashboardClient`** / lead tasks — **not** the Atlas `/tasks` tab documented here (different UI entry points in codebase) |

**External HTTP APIs:** none for Atlas task CRUD — **Server Actions only**.

---

## 11. Permissions & roles

| Capability | Rule (summary) |
| --- | --- |
| Task Insights page | **`manager` \| `founder` \| `admin`** only |
| See master list | **Privileged:** all non-archived (filters); **others:** only **`project_members`** |
| Create master | Agents need department; domain/dept rules; managers bounded by domain departments |
| Archive master | **Owner** only |
| Delete master | **Admin / founder** |
| Bulk delete on Atlas list | Same as delete master |
| Workspace edit master | Owner/manager or privileged (`updateMasterTask`) |
| Assignee change on subtask | `canAssignSubtask`: privileged **or** owner/manager membership |
| Import page | Privileged roles **or** tech/onboarding dept |

**Navigation:** `Sidebar.tsx` — **Atlas Tasks** `/tasks` for agent/manager/founder/admin; **Task Insights** `/task-insights` for manager/founder/admin. **`DEPARTMENT_ROUTE_ACCESS`** also lists `/tasks` and `/task-insights` for relevant departments.

---

## 12. State management, caching, realtime

| Layer | Mechanism |
| --- | --- |
| Server lists | RSC fetch on `/tasks` / `[id]`; **`router.refresh()`** after mutations |
| URL state | `?tab=` for My vs Atlas |
| Local UI | `useState` in dashboards (filters, modals, selections) |
| My Tasks personal list | Local merge after complete; refresh personal via **`getMyTasks`** after quick add |
| Realtime hooks | See table below |

| Hook | File | Purpose |
| --- | --- | --- |
| `useMasterTasksIndexRealtime` | `useTaskRealtime.ts` | Atlas list: refresh on task rows under each master `project_id` |
| `useAtlasTaskRealtime` | same | Workspace: remarks + board bump |
| `useMasterBoardsRealtime` | same | Task Insights modal group view refetch |
| `useSubtaskRealtime` | same | Modal detail remark + row updates |
| `useTaskIntelligenceRealtime` | `useTaskIntelligenceRealtime.ts` | Any `tasks` UPDATE → refetch overview |

**No global Redux/Zustand** for tasks in these flows.

---

## 13. Constants & configuration

- **`DEPARTMENT_CONFIG`**, **`DEPARTMENT_ROUTE_ACCESS`**: `lib/constants/departments.ts`
- **Labels/colors:** `ATLAS_TASK_STATUS_LABELS`, `ATLAS_TASK_STATUS_COLORS`, `TASK_PRIORITY_CONFIG`
- **System author UUID:** `ATLAS_SYSTEM_AUTHOR_ID`

---

## 14. Related but out-of-scope in this doc

- **Shop workspace tasks** (`components/shop/tasks/*`, `app/(dashboard)/shop/workspace/tasks/*`)
- **Legacy agent dashboard** `TaskDashboardClient` (calendar + CRM `TaskWithLead` tasks + `completeTask` / `deleteTask`)
- **Project boards outside Atlas master** (`lib/actions/projects.ts` overlaps patterns)

---

*Generated from repository scan: pages under `app/(dashboard)/tasks`, `app/(dashboard)/task-insights`, components under `components/tasks`, `components/task-intelligence`, actions `lib/actions/tasks.ts`, `lib/actions/task-intelligence.ts`, schemas `lib/schemas/tasks.ts`, types `lib/types/database.ts`, hooks `lib/hooks/useTaskRealtime.ts`, `lib/hooks/useTaskIntelligenceRealtime.ts`.*

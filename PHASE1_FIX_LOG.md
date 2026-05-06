# Phase 1 Fix Log

Date: 2026-05-05

## Design token note (Fix 3)

`app/globals.css` defines **`--color-brand-gold: #5f5348`** (warm umber). The legacy hex **`#D4AF37`** is a **different, brighter gold**. Replacing literals with `*-brand-gold` utilities **intentionally shifts UI** to the documented design system — not just deduplication.

For `MasterTaskRow` in `AtlasTasksListView.tsx`, the default accent still uses **`#5f5348`** when `cover_color` is null so inline `backgroundColor: ${hex}20` alpha suffix remains valid (CSS variables cannot be concatenated with `20`).

---

## Fix 1 — CRM Lead Task Wiring

**Files changed**

- `lib/actions/tasks.ts` — added `createLeadTask()`, `completeLeadTask()`; imported `TaskType` and `ALL_TASK_TYPES` for safe `task_type` coercion; dual-wrote `lead_activities` with `actor_id`, `action_type`, `details`, and legacy `performed_by`, `type`, `payload` (aligned with existing `task_created` / `task_completed` usage elsewhere).
- `components/tasks/LeadTaskWidget.tsx` — imports and calls `createLeadTask` / `completeLeadTask` (this file lives under `components/tasks/`, not `components/leads/`).
- `components/leads/LeadFollowUpAccordion.tsx` — imports and calls `createLeadTask` (only creation; no `completeTask` usage here).

**Other files importing deprecated `createTask` / `completeTask` aliases (not changed this session)**

| File | Behavior |
|------|----------|
| `components/dashboard/MyTasksWidget.tsx` | `completeTask` — personal “My Tasks” completion (alias → `completePersonalTask`). |
| `components/tasks/DailyRoster.tsx` | `completeTask` — roster line completion. |
| `components/tasks/TaskDashboardClient.tsx` | `completeTask` — dashboard task completion. |
| `components/task-reminder/TaskReminderNotification.tsx` | `completeTask` — reminder snooze/complete. |
| `components/manager/StrategicTaskPanel.tsx` | `completeTask` — manager strategic task completion. |
| `components/tasks/AddTaskModal.tsx` | `createTask` — modal create path (still alias → `createPersonalTask`). |
| `components/tasks/AdminCreateTaskModal.tsx` | `createTask` with `leadId: null`, `assignedToUsers`, etc. — **payload does not match `CreatePersonalTaskSchema`**; likely broken or relies on stripped fields. **Flagged for a follow-up** (not in original audit list). |

**Remaining risk**

- `StrategicTaskPanel`, `DailyRoster`, and similar surfaces may complete **CRM lead tasks** via `completeTask`; those still hit `completePersonalTask` filters. If any of those tasks are lead-linked rows, completion may still no-op until they are migrated to `completeLeadTask` or a unified completion action.

---

## Fix 2 — `/projects` Navigation Links

**Files changed**

- `components/layout/Sidebar.tsx` — removed the redundant **Projects** nav item (`href: "/projects"`); **Tasks** (`/tasks`) is the canonical entry. Removed unused `FolderKanban` import.
- `components/projects/ProjectBoard.tsx` — back link `href="/projects"` → `href="/tasks"`; label “Projects” → “Tasks”.
- `components/projects/ProjectCard.tsx` — `Link` target `/projects/${id}` → `/tasks/${id}`.
- `components/projects/CreateProjectModal.tsx` — `router.push` → `/tasks/${id}`.

**Remaining `/projects` references**

- **String path only (no `href`):** imports from `@/lib/actions/projects`, folder name `components/projects/`, routes `app/(dashboard)/projects/*` (still 301-redirected by `next.config.ts`).
- **`lib/constants/departments.ts`** still lists `"/projects"` in some `DEPARTMENT_ROUTE_ACCESS` arrays (not updated — out of Fix 2 scope as written).

---

## Fix 3 — `#D4AF37` Token Pass (6 files)

**`--color-brand-gold` maps to:** `#5f5348`  
**Delta from `#D4AF37`:** **Different** — see note at top.

**Files changed (before → after occurrence count)**

| File | Before | After |
|------|--------|-------|
| `components/tasks/AtlasTasksListView.tsx` | 21 | 0 |
| `components/tasks/MyTasksDashboard.tsx` | 23 | 0 |
| `components/admin/CreateUserModal.tsx` | 19 | 0 |
| `components/chat/GlobalChatDrawer.tsx` | 16 | 0 |
| `components/task-intelligence/AssignTaskModal.tsx` | 11 | 0 |
| `components/concierge/ConciergeClient.tsx` | 16 | 0 |

**Remaining `#D4AF37` across `components/` + `app/` (approx.):** ~484 matches (Tailwind arbitrary colors, inline SVG, etc. outside this pass).

---

## Fix 4 — Verification Summary

| Check | Result |
|-------|--------|
| `createTask` / `completeTask` imports outside lead widgets | **7 files** — see table under Fix 1 (`MyTasksWidget`, `DailyRoster`, `TaskDashboardClient`, `TaskReminderNotification`, `StrategicTaskPanel`, `AddTaskModal`, `AdminCreateTaskModal`). |
| `href` / `router.push` to `/projects` in `components/` + `app/` | **0** (grep for `href="…projects` / `href: "/projects"` style patterns). |
| `#D4AF37` in the **6 processed files** | **0** |

**Typecheck:** `npx tsc --noEmit` — **pass** (exit 0).

---

## Issues Found (unexpected)

1. **`LeadTaskWidget.tsx` path:** `components/tasks/LeadTaskWidget.tsx` (not `components/leads/`).
2. **`AdminCreateTaskModal.tsx`:** calls `createTask` with fields that **`CreatePersonalTaskSchema` does not model** (`leadId: null`, `assignedToUsers`, etc.). Worth a dedicated fix (use `createPersonalTask` + correct schema or a dedicated admin action).
3. **Accent color concatenation:** default master-task accent cannot be `var(--color-brand-gold)` while appending `20` for hex alpha; defaulted to **`#5f5348`** instead.

---

## Ready for Phase 2

**Yes** — next migration-track item from the audit: align `onboarding_leads` RLS with profiles-based auth (replace JWT-only checks where inconsistent).

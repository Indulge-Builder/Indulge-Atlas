-- =============================================================================
-- INDULGE ATLAS — Backfill unified_task_type
-- Migration 068: Classify existing tasks, promote projects to master tasks
-- =============================================================================
--
-- STEP 1: Tag existing project sub-tasks as 'subtask'
-- STEP 2: Tag tasks with no project_id + an assigned user as 'personal'
-- STEP 3: Insert a master task row for each project (same UUID)
--         so project_id FKs continue to resolve on the tasks table.
-- STEP 4: Copy domain / department from the project row to the master task.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tag existing project-scoped tasks as 'subtask'
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.tasks
SET unified_task_type = 'subtask'
WHERE project_id IS NOT NULL
  AND unified_task_type = 'subtask';  -- already the default, explicit for clarity

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tag orphan assigned tasks as 'personal'
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.tasks
SET unified_task_type = 'personal'
WHERE project_id IS NULL
  AND cardinality(assigned_to_users) > 0
  AND unified_task_type = 'subtask';  -- only if not yet classified

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Create master task rows from projects
--    Use the project's id as the task id so existing FK references work.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.tasks (
  id,
  title,
  notes,
  status,
  atlas_status,
  unified_task_type,
  project_id,         -- self-reference: master task's "project" is itself
  created_by,
  domain,
  department,
  cover_color,
  icon_key,
  due_date,
  progress,
  progress_updates,
  task_type,
  assigned_to_users,
  tags,
  attachments,
  created_at,
  updated_at
)
SELECT
  p.id,
  p.title,
  p.description,
  'pending',        -- tasks.status (legacy CRM status)
  CASE p.status
    WHEN 'active'    THEN 'in_progress'
    WHEN 'on_hold'   THEN 'blocked'
    WHEN 'completed' THEN 'done'
    WHEN 'archived'  THEN 'cancelled'
    ELSE 'todo'
  END,              -- atlas_status
  'master',         -- unified_task_type
  p.id,             -- project_id = self (master task)
  p.owner_id,
  p.domain,
  p.department,
  p.color,
  p.icon,
  p.due_date,
  0,
  '[]'::jsonb,
  'general_follow_up',
  ARRAY[p.owner_id],
  '{}'::text[],
  '[]'::jsonb,
  p.created_at,
  p.updated_at
FROM public.projects p
WHERE NOT EXISTS (
  SELECT 1 FROM public.tasks t WHERE t.id = p.id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Set master_task_id on sub-tasks to point to the master task (= project_id)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.tasks
SET master_task_id = project_id
WHERE project_id IS NOT NULL
  AND unified_task_type = 'subtask'
  AND master_task_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Copy domain from projects to existing subtasks that lack one
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.tasks t
SET
  domain     = p.domain,
  department = p.department
FROM public.projects p
WHERE t.project_id = p.id
  AND t.unified_task_type = 'subtask'
  AND t.domain IS NULL;

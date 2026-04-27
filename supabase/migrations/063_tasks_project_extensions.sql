-- =============================================================================
-- INDULGE ATLAS — Project Task System: Extend tasks table
-- Migration 063: ALTER TABLE tasks only (no new tables per migration sequence rule)
-- =============================================================================
-- Adds project/group linkage, priority, progress, time tracking, ordering, tags,
-- attachments, and sub-task support as nullable columns with safe defaults.
-- All existing task functionality is preserved.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ALTER TABLE tasks — add project/group system columns
-- ─────────────────────────────────────────────────────────────────────────────

-- project_id: optional link to a project (NULL = legacy / personal task)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid
    REFERENCES public.projects(id) ON DELETE SET NULL;

-- group_id: optional link to a task group / epic (NULL = ungrouped)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS group_id uuid
    REFERENCES public.task_groups(id) ON DELETE SET NULL;

-- parent_task_id: for sub-tasks (NULL = top-level task)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_task_id uuid
    REFERENCES public.tasks(id) ON DELETE CASCADE;

-- priority: urgent > high > medium > low
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'
    CHECK (priority IN ('urgent', 'high', 'medium', 'low') OR priority IS NULL);

-- progress: 0–100 percent
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0
    CHECK (progress >= 0 AND progress <= 100);

-- estimated_minutes: pre-estimate for time tracking
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimated_minutes integer NULL
    CHECK (estimated_minutes IS NULL OR estimated_minutes > 0);

-- actual_minutes: time actually spent (filled on completion or manually)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS actual_minutes integer NULL
    CHECK (actual_minutes IS NULL OR actual_minutes > 0);

-- position: display order within a task group
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- tags: free-form string labels
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- attachments: [{name, url, uploaded_by, uploaded_at}]
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INDEXES for new columns
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS tasks_project_id_idx
  ON public.tasks (project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_group_id_idx
  ON public.tasks (group_id)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx
  ON public.tasks (parent_task_id)
  WHERE parent_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_project_position_idx
  ON public.tasks (project_id, position)
  WHERE project_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EXTEND tasks RLS — allow project members to access their project tasks
-- ─────────────────────────────────────────────────────────────────────────────
-- The existing policies from migration 056 covered assigned_to_users and lead domain.
-- Now project members also need SELECT/INSERT/UPDATE on project tasks.

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    -- Admins and founders see all tasks
    public.get_user_role() IN ('admin', 'founder')
    -- Managers see their assigned tasks, tasks linked to their domain leads, and project tasks
    OR (
      public.get_user_role() = 'manager'
      AND (
        auth.uid() = ANY(assigned_to_users)
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = lead_id AND l.domain::TEXT = public.get_user_domain()
        )
        OR (
          project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid()
          )
        )
      )
    )
    -- Agents see tasks they're assigned to, or are project members of
    OR (
      public.get_user_role() = 'agent'
      AND (
        auth.uid() = ANY(assigned_to_users)
        OR (
          project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid()
          )
        )
      )
    )
    -- Guests see tasks linked to leads in their domain
    OR (
      public.get_user_role() = 'guest'
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id AND l.domain::TEXT = public.get_user_domain()
      )
    )
  );

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND (
        auth.uid() = ANY(assigned_to_users)
        OR (
          project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid()
          )
        )
      )
    )
  );

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder', 'manager')
    OR (
      public.get_user_role() = 'agent'
      AND (
        auth.uid() = ANY(assigned_to_users)
        OR (
          project_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = tasks.project_id AND pm.user_id = auth.uid()
          )
        )
      )
    )
  );

CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (
    public.get_user_role() IN ('admin', 'founder')
    OR (
      project_id IS NOT NULL
      AND public.get_project_member_role(project_id) IN ('owner', 'manager')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. COMMENTS on new columns
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.tasks.project_id        IS 'Links task to a project. NULL = legacy/personal task.';
COMMENT ON COLUMN public.tasks.group_id          IS 'Links task to a task group / epic within a project.';
COMMENT ON COLUMN public.tasks.parent_task_id    IS 'Sub-task: references parent task ID. NULL = top-level.';
COMMENT ON COLUMN public.tasks.priority          IS 'urgent | high | medium | low (project tasks only).';
COMMENT ON COLUMN public.tasks.progress          IS '0–100 percent completion for project tasks.';
COMMENT ON COLUMN public.tasks.estimated_minutes IS 'Pre-estimate for time tracking.';
COMMENT ON COLUMN public.tasks.actual_minutes    IS 'Actual time spent on the task.';
COMMENT ON COLUMN public.tasks.position          IS 'Display order within a task group (0 = first).';
COMMENT ON COLUMN public.tasks.tags              IS 'Free-form labels: e.g. ["frontend", "urgent-client"].';
COMMENT ON COLUMN public.tasks.attachments       IS 'Array of {name, url, uploaded_by, uploaded_at} JSON objects.';

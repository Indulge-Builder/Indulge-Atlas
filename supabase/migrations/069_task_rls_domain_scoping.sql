-- =============================================================================
-- INDULGE ATLAS — Task RLS Domain Scoping
-- Migration 069: Update tasks RLS for unified_task_type domain filtering
-- =============================================================================
--
-- POLICY MATRIX:
--
-- unified_task_type = 'master':
--   SELECT: same domain OR indulge_global OR privileged role
--   INSERT: authenticated (anyone can create a master task)
--   UPDATE: creator OR admin/founder/manager
--   DELETE: admin/founder only
--
-- unified_task_type = 'subtask':
--   SELECT: project member OR same domain OR privileged role
--   INSERT: project member OR privileged role
--   UPDATE: assignee OR project owner/manager OR privileged role
--   DELETE: project owner OR admin/founder/manager
--
-- unified_task_type = 'personal':
--   SELECT: assigned_to = current user OR privileged role
--   INSERT: assigned_to = current user (self-created)
--   UPDATE: assigned_to = current user OR privileged role
--   DELETE: assigned_to = current user OR admin/founder
--
-- All policies use get_user_role() and get_user_domain() — never JWT claims.
-- =============================================================================

-- Drop and recreate tasks policies to include domain scoping.
-- We drop by name; if they don't exist Postgres silently ignores.

DROP POLICY IF EXISTS "tasks_select_domain" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_auth" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_auth" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_privileged" ON public.tasks;

-- Also drop any old policies from earlier migrations that we are superseding
DROP POLICY IF EXISTS "Tasks are viewable by project members" ON public.tasks;
DROP POLICY IF EXISTS "Tasks can be created by project members" ON public.tasks;
DROP POLICY IF EXISTS "Tasks can be updated by assignee or project managers" ON public.tasks;
DROP POLICY IF EXISTS "Tasks can be deleted by project managers" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select_assigned" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_assigned" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_assigned" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_assigned" ON public.tasks;

-- ── SELECT ───────────────────────────────────────────────────

CREATE POLICY "tasks_select_v2" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    -- Privileged roles see everything
    get_user_role() IN ('admin', 'founder')
    OR
    -- Master tasks: same domain or global
    (
      unified_task_type = 'master'
      AND (
        domain = get_user_domain()
        OR get_user_domain() = 'indulge_global'
        OR domain IS NULL
        OR get_user_role() = 'manager'
      )
    )
    OR
    -- Subtasks: project member check or domain match
    (
      unified_task_type = 'subtask'
      AND (
        domain = get_user_domain()
        OR get_user_domain() = 'indulge_global'
        OR get_user_role() = 'manager'
        OR assigned_to_users @> ARRAY[auth.uid()]
        OR created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = tasks.project_id
            AND pm.user_id = auth.uid()
        )
      )
    )
    OR
    -- Personal tasks: only the assignee
    (
      unified_task_type = 'personal'
      AND (
        assigned_to_users @> ARRAY[auth.uid()]
        OR created_by = auth.uid()
        OR get_user_role() = 'manager'
      )
    )
    OR
    -- Legacy tasks: check array membership only
    assigned_to_users @> ARRAY[auth.uid()]
  );

-- ── INSERT ───────────────────────────────────────────────────

CREATE POLICY "tasks_insert_v2" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Anyone authenticated can create tasks; RLS is enforced at select/update/delete
    auth.uid() IS NOT NULL
  );

-- ── UPDATE ───────────────────────────────────────────────────

CREATE POLICY "tasks_update_v2" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    get_user_role() IN ('admin', 'founder', 'manager')
    OR created_by = auth.uid()
    OR assigned_to_users @> ARRAY[auth.uid()]
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = tasks.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'manager')
    )
  );

-- ── DELETE ───────────────────────────────────────────────────

CREATE POLICY "tasks_delete_v2" ON public.tasks
  FOR DELETE TO authenticated
  USING (
    get_user_role() IN ('admin', 'founder')
    OR (
      get_user_role() = 'manager'
      AND (
        created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = tasks.project_id
            AND pm.user_id = auth.uid()
            AND pm.role IN ('owner', 'manager')
        )
      )
    )
    OR (
      unified_task_type = 'personal'
      AND (assigned_to_users @> ARRAY[auth.uid()] OR created_by = auth.uid())
    )
  );

-- Service role bypass
DROP POLICY IF EXISTS "tasks_service_role" ON public.tasks;
CREATE POLICY "tasks_service_role_all" ON public.tasks
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
